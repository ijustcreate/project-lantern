interface Env {
  BUGS_DB: D1Database;
  LANTERN_ASSETS: KVNamespace;
  LIVE_ROOM: DurableObjectNamespace;
}

import {
  MISSING_SHARED_STATE_VERSION,
  nextSharedStateUpdatedAt,
  SHARED_STATE_VERSION_HEADER
} from "../src/stateAuthority";

type BugEvidence = { name: string; dataUrl?: string; path?: string; mimeType?: string };
type BugRecord = {
  bugId: string;
  summary: string;
  details: string;
  fixTips: string;
  tags: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
  attachments: string[];
  folder: string;
  enteredBy?: string;
  evidence?: BugEvidence[];
  agentWork?: unknown[];
  statusHistory?: unknown[];
};

const allowedBugStatuses = new Set(["open", "assigned-to-codex", "in-progress", "ready-for-test", "verified", "closed"]);

const allowedOrigins = new Set([
  "https://ijustcreate.github.io",
  "https://ijustcreate.github.io/toysoldierbrigade",
  "http://127.0.0.1:5173",
  "http://localhost:5173"
]);
const maxEvidenceDataUrlLength = 1_500_000;
const maxReportBytes = 8 * 1024 * 1024;
const maxAssetBytes = 10 * 1024 * 1024;
// Board-editor audit history can temporarily make the shared document larger
// than the old 1.5 MB ceiling. The Worker stores and returns this JSON without
// parsing it, so an 8 MB allowance is safe while clients compact legacy audit
// snapshots during their next successful save.
const maxStateBytes = 8 * 1024 * 1024;

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": allowedOrigins.has(origin) ? origin : "https://ijustcreate.github.io",
    "access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS",
    "access-control-allow-headers": `accept, content-type, ${SHARED_STATE_VERSION_HEADER.toLowerCase()}`,
    "access-control-expose-headers": SHARED_STATE_VERSION_HEADER,
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
}

async function readSharedState(request: Request, env: Env) {
  const row = await env.BUGS_DB.prepare("SELECT state_json, updated_at FROM shared_state WHERE state_id = 'museum'")
    .first<{ state_json: string; updated_at: string }>();
  if (!row) return json(request, { state: null }, 200, { [SHARED_STATE_VERSION_HEADER]: MISSING_SHARED_STATE_VERSION });

  // The museum state can approach the worker CPU limit once boards contain
  // many panels and embedded settings. It is already stored as valid JSON, so
  // do not parse and stringify the entire document again just to wrap it.
  return rawJson(request, `{"state":${row.state_json},"updatedAt":${JSON.stringify(row.updated_at)}}`, 200, {
    [SHARED_STATE_VERSION_HEADER]: row.updated_at
  });
}

export async function saveSharedState(request: Request, env: Env) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxStateBytes) return json(request, { error: "Project data is too large to save" }, 413);
  const expectedUpdatedAt = request.headers.get(SHARED_STATE_VERSION_HEADER);
  if (!expectedUpdatedAt) {
    return json(request, {
      error: "Reload the latest museum data before saving. This older page was prevented from replacing newer board edits."
    }, 428);
  }
  const body = await request.text();
  // The app sends one compact JSON envelope: {"state":{...}}. Extract its
  // already-serialized state instead of parsing and serializing a megabyte of
  // board data inside the Worker on every save.
  const prefix = '{"state":';
  if (!body.startsWith(prefix) || !body.endsWith("}")) return json(request, { error: "Project state is required" }, 400);
  const stateJson = body.slice(prefix.length, -1);
  if (!stateJson.startsWith("{") || !stateJson.endsWith("}")) return json(request, { error: "Project state is required" }, 400);
  if (stateJson.length > maxStateBytes) return json(request, { error: "Project data is too large to save" }, 413);
  const updatedAt = nextSharedStateUpdatedAt(expectedUpdatedAt === MISSING_SHARED_STATE_VERSION ? null : expectedUpdatedAt);
  const result = expectedUpdatedAt === MISSING_SHARED_STATE_VERSION
    ? await env.BUGS_DB.prepare(`
        INSERT INTO shared_state (state_id, updated_at, state_json)
        VALUES ('museum', ?, ?)
        ON CONFLICT(state_id) DO NOTHING
      `).bind(updatedAt, stateJson).run()
    : await env.BUGS_DB.prepare(`
        UPDATE shared_state
        SET updated_at = ?, state_json = ?
        WHERE state_id = 'museum' AND updated_at = ?
      `).bind(updatedAt, stateJson, expectedUpdatedAt).run();
  if (result.meta.changes !== 1) {
    const current = await env.BUGS_DB.prepare("SELECT updated_at FROM shared_state WHERE state_id = 'museum'")
      .first<{ updated_at: string }>();
    return json(request, {
      error: "Newer museum changes already exist. Reload them before saving so they are not overwritten.",
      updatedAt: current?.updated_at ?? null
    }, 409, { [SHARED_STATE_VERSION_HEADER]: current?.updated_at ?? MISSING_SHARED_STATE_VERSION });
  }
  return json(request, { saved: true, updatedAt }, 200, { [SHARED_STATE_VERSION_HEADER]: updatedAt });
}

function safeAssetKey(value: string) {
  if (!/^[a-z0-9][a-z0-9._-]{5,180}$/i.test(value)) throw new Error("Invalid asset key");
  return value;
}

async function saveAsset(request: Request, env: Env) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!length || length > maxAssetBytes) return json(request, { error: "Images must be smaller than 10 MB" }, 413);
  const mimeType = request.headers.get("content-type") ?? "";
  if (!/^image\/(png|jpeg|webp|gif)$/i.test(mimeType)) return json(request, { error: "Use a PNG, JPG, WebP, or GIF image" }, 415);
  const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" } as Record<string, string>)[mimeType.toLowerCase()];
  const key = `${crypto.randomUUID()}.${extension}`;
  await env.LANTERN_ASSETS.put(key, request.body, { metadata: { contentType: mimeType, uploadedAt: new Date().toISOString() } });
  const url = new URL(request.url);
  return json(request, { key, url: `${url.origin}/assets/${key}` }, 201);
}

async function readAsset(request: Request, env: Env, pathname: string) {
  const key = safeAssetKey(decodeURIComponent(pathname.slice("/assets/".length)));
  const object = await env.LANTERN_ASSETS.getWithMetadata<{ contentType?: string }>(key, "arrayBuffer");
  if (!object.value) return json(request, { error: "Image not found" }, 404);
  const headers = new Headers(corsHeaders(request));
  headers.set("content-type", object.metadata?.contentType ?? "application/octet-stream");
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.value, { headers });
}

function json(request: Request, value: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(value, {
    status,
    headers: {
      ...corsHeaders(request),
      ...extraHeaders,
      "cache-control": "no-store"
    }
  });
}

function rawJson(request: Request, value: string, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(value, {
    status,
    headers: {
      ...corsHeaders(request),
      ...extraHeaders,
      "cache-control": "no-store",
      "content-type": "application/json; charset=UTF-8"
    }
  });
}

type DisplaySessionAttachment = {
  networkAddress?: string;
  userAgent?: string;
  connectedAt: string;
  screenId?: string;
  deviceId?: string;
  deviceName?: string;
  lastStatus?: "opened" | "closed" | "offline" | "online";
  statusUpdatedAt?: number;
};

/** A hibernating, metadata-only WebSocket room. WebRTC media never passes through it. */
export class MuseumLiveRoom {
  constructor(private state: DurableObjectState) {}

  private async appendDisplayHistory(event: {
    screenId: string;
    deviceName: string;
    status: "opened" | "closed" | "offline" | "online";
    at: number;
  }) {
    const history = (await this.state.storage.get<Array<Record<string, unknown>>>("display-history")) ?? [];
    history.push(event);
    if (history.length > 100) history.splice(0, history.length - 100);
    await this.state.storage.put("display-history", history);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
      const history = (await this.state.storage.get<unknown[]>("display-history")) ?? [];
      const now = Date.now();

      // Presence is ephemeral. The open hibernating WebSockets are the source
      // of truth; persisting a session row for every heartbeat previously
      // generated two Durable Object writes per heartbeat and exhausted the
      // free-tier rows_written allowance every day.
      const active = this.state.getWebSockets().flatMap((socket) => {
        const attachment = socket.deserializeAttachment() as DisplaySessionAttachment | null;
        if (!attachment?.screenId || !attachment.deviceId) return [];
        if (attachment.lastStatus === "offline" || attachment.lastStatus === "closed") return [];
        return [{
          screenId: attachment.screenId,
          deviceId: attachment.deviceId,
          deviceName: attachment.deviceName ?? "Display browser",
          serverSeenAt: now,
          online: true
        }];
      });

      return Response.json({ sessions: active, history: history.slice(-100) });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({
      networkAddress: request.headers.get("CF-Connecting-IP") ?? undefined,
      userAgent: request.headers.get("User-Agent") ?? undefined,
      connectedAt: new Date().toISOString()
    } satisfies DisplaySessionAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(sender: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > 250_000) return;
    try {
      const envelope = JSON.parse(message) as { sender?: string; message?: { type?: string; screenId?: string; deviceId?: string; deviceName?: string; userAgent?: string; timestamp?: string; status?: "closed" | "offline" | "online" } };
      const presence = envelope.message;
      if ((presence?.type === "display-presence" || presence?.type === "display-session-status") && presence.screenId && presence.deviceId) {
        const previous = (sender.deserializeAttachment() as DisplaySessionAttachment | null) ?? { connectedAt: new Date().toISOString() };
        const now = Date.now();
        const screenChanged = previous.screenId !== presence.screenId || previous.deviceId !== presence.deviceId;
        const deviceName = String(presence.deviceName ?? previous.deviceName ?? "Display browser").slice(0, 120);
        const userAgent = String(presence.userAgent ?? previous.userAgent ?? "").slice(0, 500);
        const nextStatus: DisplaySessionAttachment["lastStatus"] = presence.type === "display-session-status"
          ? presence.status
          : screenChanged || !previous.lastStatus
            ? "opened"
            : previous.lastStatus === "offline"
              ? "online"
              : previous.lastStatus;
        const statusChanged = nextStatus !== previous.lastStatus;
        const metadataChanged = screenChanged || deviceName !== previous.deviceName || userAgent !== previous.userAgent;

        // serializeAttachment persists only when identity/status changes. A
        // routine display-presence heartbeat now performs zero storage writes.
        if (metadataChanged || statusChanged) {
          sender.serializeAttachment({
            ...previous,
            screenId: presence.screenId,
            deviceId: presence.deviceId,
            deviceName,
            userAgent,
            lastStatus: nextStatus,
            statusUpdatedAt: now
          } satisfies DisplaySessionAttachment);
        }

        if (screenChanged || statusChanged) {
          await this.appendDisplayHistory({
            screenId: presence.screenId,
            deviceName,
            status: nextStatus ?? "opened",
            at: now
          });
        }
      }
    } catch {
      // Signaling can be relayed without telemetry if a client sends a legacy payload.
    }
    // SDP and ICE candidates are tiny; relay only signaling, never camera media.
    for (const socket of this.state.getWebSockets()) if (socket !== sender) socket.send(message);
  }

  async webSocketClose(sender: WebSocket): Promise<void> {
    try {
      const attachment = sender.deserializeAttachment() as DisplaySessionAttachment | null;
      if (!attachment?.screenId || !attachment.deviceId || attachment.lastStatus === "closed") return;
      await this.appendDisplayHistory({
        screenId: attachment.screenId,
        deviceName: attachment.deviceName ?? "Display browser",
        status: "closed",
        at: Date.now()
      });
    } catch {
      // Presence history is diagnostic only; a closing socket must not fail cleanup.
    }
  }
}

function safeBugId(value: unknown) {
  const bugId = String(value ?? "").toUpperCase();
  if (!/^BUG-\d{4,}$/.test(bugId)) throw new Error("Invalid bug id");
  return bugId;
}

function safeFileName(value: string, index: number) {
  const name = value.split(/[\\/]/).pop()?.replace(/[^a-z0-9._ -]/gi, "_") || "evidence";
  return `${String(index + 1).padStart(2, "0")}-${name}`;
}

function inspectDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s);
  if (!match) throw new Error("Invalid evidence data");
  if (dataUrl.length > maxEvidenceDataUrlLength) throw new Error("An attachment is larger than the 1 MB testing limit");
  return { mimeType: match[1], base64: match[2] };
}

function decodeBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function readExisting(env: Env, bugId: string) {
  const row = await env.BUGS_DB.prepare("SELECT record_json FROM bug_reports WHERE bug_id = ?")
    .bind(bugId)
    .first<{ record_json: string }>();
  return row ? JSON.parse(row.record_json) as BugRecord : null;
}

async function saveBug(request: Request, env: Env) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxReportBytes) return json(request, { error: "The report and attachments are larger than 12 MB" }, 413);

  const input = await request.json() as BugRecord;
  const bugId = safeBugId(input.bugId);
  const existing = await readExisting(env, bugId);
  const evidence: BugEvidence[] = [];

  for (const [index, item] of (input.evidence ?? []).entries()) {
    if (item.dataUrl?.startsWith("data:")) {
      const { mimeType } = inspectDataUrl(item.dataUrl);
      const name = safeFileName(item.name, index);
      await env.BUGS_DB.prepare(`
        INSERT INTO bug_evidence (bug_id, file_name, mime_type, data_url, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(bug_id, file_name) DO UPDATE SET
          mime_type = excluded.mime_type,
          data_url = excluded.data_url
      `).bind(bugId, name, mimeType, item.dataUrl, new Date().toISOString()).run();
      evidence.push({ name, path: name, mimeType });
    } else if (item.path || item.name) {
      evidence.push({ name: item.name, path: item.path ?? item.name, mimeType: item.mimeType });
    }
  }

  const now = new Date().toISOString();
  const saved: BugRecord = {
    ...existing,
    ...input,
    bugId,
    // Submitted report copy is evidence. Keep spelling and whitespace exactly as
    // entered when workflow metadata changes; only enforce the storage ceiling.
    summary: String(input.summary ?? "").slice(0, 300),
    details: String(input.details ?? "").slice(0, 20000),
    fixTips: String(input.fixTips ?? "").slice(0, 10000),
    tags: Array.isArray(input.tags) ? input.tags.map(String).slice(0, 20) : [],
    status: allowedBugStatuses.has(String(input.status)) ? String(input.status) : (existing?.status ?? "open"),
    enteredBy: String(input.enteredBy ?? existing?.enteredBy ?? "Unattributed").trim().slice(0, 80) || "Unattributed",
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
    evidence: evidence.length ? evidence : (existing?.evidence ?? []),
    attachments: evidence.length ? evidence.map((item) => item.path ?? item.name) : (existing?.attachments ?? []),
    agentWork: Array.isArray(input.agentWork) ? input.agentWork : (existing?.agentWork ?? []),
    statusHistory: Array.isArray(input.statusHistory) ? input.statusHistory : (existing?.statusHistory ?? []),
    folder: `shared/${bugId}`
  };

  if (!saved.summary.trim()) return json(request, { error: "A brief description is required" }, 400);
  await env.BUGS_DB.prepare(`
    INSERT INTO bug_reports (bug_id, summary, status, created_at, updated_at, record_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(bug_id) DO UPDATE SET
      summary = excluded.summary,
      status = excluded.status,
      updated_at = excluded.updated_at,
      record_json = excluded.record_json
  `).bind(saved.bugId, saved.summary, saved.status, saved.createdAt, saved.updatedAt, JSON.stringify(saved)).run();
  return json(request, saved);
}

async function listBugs(request: Request, env: Env) {
  const result = await env.BUGS_DB.prepare("SELECT record_json FROM bug_reports ORDER BY created_at DESC").all<{ record_json: string }>();
  return json(request, result.results.map((row) => JSON.parse(row.record_json) as BugRecord));
}

async function deleteBug(request: Request, env: Env, pathname: string) {
  const match = pathname.match(/\/bugs\/(BUG-\d{4,})\/?$/i);
  if (!match) return json(request, { error: "Bug report not found" }, 404);
  const bugId = safeBugId(match[1]);
  const existing = await readExisting(env, bugId);
  if (!existing) return json(request, { error: "Bug report not found" }, 404);
  await env.BUGS_DB.batch([
    env.BUGS_DB.prepare("DELETE FROM bug_evidence WHERE bug_id = ?").bind(bugId),
    env.BUGS_DB.prepare("DELETE FROM bug_reports WHERE bug_id = ?").bind(bugId)
  ]);
  return json(request, { deleted: true, bugId });
}

async function readEvidence(request: Request, env: Env, pathname: string) {
  const match = pathname.match(/\/bugs\/evidence\/(BUG-\d{4,})\/([^/]+)$/i);
  if (!match) return json(request, { error: "Evidence not found" }, 404);
  const bugId = safeBugId(match[1]);
  const name = decodeURIComponent(match[2]).split(/[\\/]/).pop() ?? "";
  const row = await env.BUGS_DB.prepare(`
    SELECT mime_type, data_url FROM bug_evidence WHERE bug_id = ? AND file_name = ?
  `).bind(bugId, name).first<{ mime_type: string; data_url: string }>();
  if (!row) return json(request, { error: "Evidence not found" }, 404);
  const matchData = row.data_url.match(/^data:[^;,]+(?:;[^,]*)?;base64,(.+)$/s);
  if (!matchData) return json(request, { error: "Evidence is invalid" }, 500);
  const headers = new Headers(corsHeaders(request));
  headers.set("content-type", row.mime_type);
  headers.set("cache-control", "private, max-age=300");
  return new Response(decodeBase64(matchData[1]), { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
      const pathname = new URL(request.url).pathname;
      if (request.method === "GET" && pathname === "/live") {
        const room = env.LIVE_ROOM.get(env.LIVE_ROOM.idFromName("museum"));
        return room.fetch(request);
      }
      if (request.method === "GET" && pathname === "/live/sessions") {
        const room = env.LIVE_ROOM.get(env.LIVE_ROOM.idFromName("museum"));
        const upstream = await room.fetch(new Request("https://live-room.internal/sessions"));
        const headers = new Headers(upstream.headers);
        Object.entries(corsHeaders(request)).forEach(([key, value]) => headers.set(key, value));
        return new Response(upstream.body, { status: upstream.status, headers });
      }
      if (request.method === "GET" && pathname === "/state") return await readSharedState(request, env);
      if (request.method === "PUT" && pathname === "/state") return await saveSharedState(request, env);
      if (request.method === "POST" && pathname === "/assets") return await saveAsset(request, env);
      if (request.method === "GET" && pathname.startsWith("/assets/")) return await readAsset(request, env, pathname);
      if (request.method === "GET" && pathname.includes("/bugs/evidence/")) return await readEvidence(request, env, pathname);
      if (request.method === "GET" && /\/bugs\/?$/.test(pathname)) return await listBugs(request, env);
      if (request.method === "PUT" && /\/bugs\/?$/.test(pathname)) return await saveBug(request, env);
      if (request.method === "DELETE" && /\/bugs\/BUG-\d{4,}\/?$/i.test(pathname)) return await deleteBug(request, env, pathname);
      return json(request, { error: "Not found" }, 404);
    } catch (error) {
      return json(request, { error: error instanceof Error ? error.message : String(error) }, 400);
    }
  }
} satisfies ExportedHandler<Env>;
