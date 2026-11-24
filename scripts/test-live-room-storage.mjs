import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "lantern-live-room-test-"));
const bundledWorker = path.join(temporaryDirectory, "worker.mjs");

class FakeStorage {
  values = new Map();
  writes = [];

  async get(key) { return this.values.get(key); }
  async put(key, value) {
    this.writes.push(key);
    this.values.set(key, value);
  }
}

class FakeSocket {
  attachment;
  serialized = 0;
  sent = [];

  constructor(attachment = {}) { this.attachment = attachment; }
  deserializeAttachment() { return this.attachment; }
  serializeAttachment(value) {
    this.attachment = value;
    this.serialized += 1;
  }
  send(message) { this.sent.push(message); }
}

function envelope(message) {
  return JSON.stringify({ sender: "fixture", message });
}

function presence(overrides = {}) {
  return {
    type: "display-presence",
    screenId: "display-1",
    deviceId: "device-1",
    deviceName: "Museum TV",
    userAgent: "Fixture Browser",
    timestamp: new Date().toISOString(),
    ...overrides
  };
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

  const storage = new FakeStorage();
  const socket = new FakeSocket({ connectedAt: new Date().toISOString() });
  const state = {
    storage,
    getWebSockets: () => [socket],
    acceptWebSocket: () => undefined
  };
  const room = new MuseumLiveRoom(state);

  await room.webSocketMessage(socket, envelope(presence()));
  assert.equal(storage.writes.filter((key) => key === "display-history").length, 1, "opening a display records one lifecycle event");
  assert.equal(socket.serialized, 1, "the first presence attaches display metadata");

  for (let index = 0; index < 100; index += 1) {
    await room.webSocketMessage(socket, envelope(presence({ timestamp: new Date(Date.now() + index).toISOString() })));
  }
  assert.equal(storage.writes.filter((key) => key === "display-history").length, 1, "routine heartbeats must not write Durable Object storage");
  assert.equal(socket.serialized, 1, "routine heartbeats must not rewrite hibernation attachments");

  let response = await room.fetch(new Request("https://live-room.internal/sessions"));
  let snapshot = await response.json();
  assert.equal(snapshot.sessions.length, 1, "a connected display socket is listed as active");
  assert.equal(snapshot.sessions[0].deviceId, "device-1");

  await room.webSocketMessage(socket, envelope({
    ...presence(),
    type: "display-session-status",
    status: "offline"
  }));
  assert.equal(storage.writes.filter((key) => key === "display-history").length, 2, "offline is recorded once");
  response = await room.fetch(new Request("https://live-room.internal/sessions"));
  snapshot = await response.json();
  assert.equal(snapshot.sessions.length, 0, "offline displays are excluded from active sessions");

  await room.webSocketMessage(socket, envelope({
    ...presence(),
    type: "display-session-status",
    status: "online"
  }));
  assert.equal(storage.writes.filter((key) => key === "display-history").length, 3, "online recovery is recorded once");
  response = await room.fetch(new Request("https://live-room.internal/sessions"));
  snapshot = await response.json();
  assert.equal(snapshot.sessions.length, 1, "online recovery restores the active session");

  console.log("Live-room heartbeat storage checks passed.");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
