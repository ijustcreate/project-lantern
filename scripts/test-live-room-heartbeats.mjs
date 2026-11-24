import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "lantern-live-room-test-"));
const bundledWorker = path.join(temporaryDirectory, "worker.mjs");

class MockStorage {
  constructor() {
    this.values = new Map();
    this.putCalls = [];
  }

  async get(key) {
    return this.values.get(key);
  }

  async put(key, value) {
    this.values.set(key, structuredClone(value));
    this.putCalls.push({ key, value: structuredClone(value) });
  }
}

class MockSocket {
  constructor(attachment = null) {
    this.attachment = attachment;
    this.attachmentWrites = 0;
    this.sent = [];
  }

  deserializeAttachment() {
    return this.attachment;
  }

  serializeAttachment(value) {
    this.attachment = structuredClone(value);
    this.attachmentWrites += 1;
  }

  send(value) {
    this.sent.push(value);
  }
}

class MockDurableObjectState {
  constructor(sockets) {
    this.storage = new MockStorage();
    this.sockets = sockets;
  }

  getWebSockets() {
    return this.sockets;
  }
}

function presenceMessage(overrides = {}) {
  return JSON.stringify({
    sender: "display-client",
    message: {
      type: "display-presence",
      screenId: "display-1",
      deviceId: "device-1",
      deviceName: "Lobby TV",
      userAgent: "Lantern test display",
      timestamp: new Date().toISOString(),
      ...overrides
    }
  });
}

function statusMessage(status) {
  return JSON.stringify({
    sender: "display-client",
    message: {
      type: "display-session-status",
      screenId: "display-1",
      deviceId: "device-1",
      deviceName: "Lobby TV",
      userAgent: "Lantern test display",
      timestamp: new Date().toISOString(),
      status
    }
  });
}

try {
  await build({
    entryPoints: [path.resolve("worker/bugs.ts")],
    outfile: bundledWorker,
    bundle: true,
    platform: "node",
    format: "esm",
    logLevel: "silent"
  });
  const { MuseumLiveRoom } = await import(`${pathToFileURL(bundledWorker).href}?${Date.now()}`);

  const display = new MockSocket({
    connectedAt: "2026-11-23T00:00:00.000Z",
    userAgent: "Lantern test display"
  });
  const dashboard = new MockSocket({
    connectedAt: "2026-11-23T00:00:00.000Z",
    userAgent: "Lantern test dashboard"
  });
  const state = new MockDurableObjectState([display, dashboard]);
  const room = new MuseumLiveRoom(state);

  await room.webSocketMessage(display, presenceMessage());
  assert.equal(state.storage.putCalls.length, 1, "first display presence should write only one history transition");
  assert.equal(state.storage.putCalls[0].key, "display-history");
  assert.equal(display.attachmentWrites, 1, "first presence should attach display identity to the socket");
  assert.equal(state.storage.putCalls.some((call) => call.key === "display-sessions"), false, "live sessions must not be persisted");

  const firstHistoryWrites = state.storage.putCalls.length;
  const firstAttachmentWrites = display.attachmentWrites;
  for (let index = 0; index < 20; index += 1) {
    await room.webSocketMessage(display, presenceMessage());
  }
  assert.equal(state.storage.putCalls.length, firstHistoryWrites, "routine presence heartbeats must perform zero Durable Object storage writes");
  assert.equal(display.attachmentWrites, firstAttachmentWrites, "routine presence heartbeats must not rewrite socket attachments");

  const activeResponse = await room.fetch(new Request("https://worker.example/live/sessions"));
  const activeBody = await activeResponse.json();
  assert.equal(activeBody.sessions.length, 1, "active sessions should be derived from connected WebSockets");
  assert.equal(activeBody.sessions[0].screenId, "display-1");
  assert.equal(activeBody.sessions[0].deviceId, "device-1");
  assert.equal(activeBody.sessions[0].deviceName, "Lobby TV");
  assert.equal(state.storage.putCalls.length, firstHistoryWrites, "reading live sessions must not write Durable Object storage");

  await room.webSocketMessage(display, statusMessage("offline"));
  assert.equal(state.storage.putCalls.length, firstHistoryWrites + 1, "a real offline transition should append one history write");
  assert.equal(display.attachment.lastStatus, "offline");

  await room.webSocketMessage(display, statusMessage("offline"));
  assert.equal(state.storage.putCalls.length, firstHistoryWrites + 1, "repeated identical status must not add history writes");

  const offlineResponse = await room.fetch(new Request("https://worker.example/live/sessions"));
  const offlineBody = await offlineResponse.json();
  assert.equal(offlineBody.sessions.length, 0, "offline sockets should not appear as active displays");

  await room.webSocketMessage(display, statusMessage("online"));
  assert.equal(state.storage.putCalls.length, firstHistoryWrites + 2, "online recovery should append one history write");

  const onlineResponse = await room.fetch(new Request("https://worker.example/live/sessions"));
  const onlineBody = await onlineResponse.json();
  assert.equal(onlineBody.sessions.length, 1, "online recovery should make the connected socket active again");

  await room.webSocketClose(display);
  assert.equal(state.storage.putCalls.length, firstHistoryWrites + 3, "socket close should append one final lifecycle history write");
  assert.equal(state.storage.putCalls.every((call) => call.key === "display-history"), true, "the live room should never persist heartbeat session snapshots");

  console.log("Live-room heartbeat write-amplification checks passed.");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
