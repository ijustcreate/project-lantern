interface Env {
  BUGS_DB: D1Database;
  LANTERN_ASSETS: KVNamespace;
}

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
  evidence?: BugEvidence[];
  agentWork?: unknown[];
};

const allowedOrigins = new Set([
  "https://ijustcreate.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173"
]);
const maxEvidenceDataUrlLength = 1_500_000;
const maxReportBytes = 8 * 1024 * 1024;
const maxAssetBytes = 10 * 1024 * 1024;
const maxStateBytes = 1_500_000;

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": allowedOrigins.has(origin) ? origin : "https://ijustcreate.github.io",
    "access-control-allow-methods": "GET, PUT, POST, OPTIONS",
    "access-control-allow-headers": "accept, content-type",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
}

async function readSharedState(request: Request, env: Env) {
  const row = await env.BUGS_DB.prepare("SELECT state_json, updated_at FROM shared_state WHERE state_id = 'museum'")
    .first<{ state_json: string; updated_at: string }>();
  return json(request, row ? { state: JSON.parse(row.state_json), updatedAt: row.updated_at } : { state: null });
}

async function saveSharedState(request: Request, env: Env) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxStateBytes) return json(request, { error: "Project data is too large to save" }, 413);
  const input = await request.json() as { state?: unknown };
  if (!input.state || typeof input.state !== "object") return json(request, { error: "Project state is required" }, 400);
  const stateJson = JSON.stringify(input.state);
  if (stateJson.length > maxStateBytes) return json(request, { error: "Project data is too large to save" }, 413);
  const updatedAt = new Date().toISOString();
  await env.BUGS_DB.prepare(`
    INSERT INTO shared_state (state_id, updated_at, state_json)
    VALUES ('museum', ?, ?)
    ON CONFLICT(state_id) DO UPDATE SET updated_at = excluded.updated_at, state_json = excluded.state_json
  `).bind(updatedAt, stateJson).run();
  return json(request, { saved: true, updatedAt });
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

function json(request: Request, value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      ...corsHeaders(request),
      "cache-control": "no-store"
    }
  });
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
    ...input,
    bugId,
    summary: String(input.summary ?? "").trim().slice(0, 300),
    details: String(input.details ?? "").slice(0, 20000),
    fixTips: String(input.fixTips ?? "").slice(0, 10000),
    tags: Array.isArray(input.tags) ? input.tags.map(String).slice(0, 20) : [],
    status: String(input.status ?? "open").slice(0, 40),
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
    evidence: evidence.length ? evidence : (existing?.evidence ?? []),
    attachments: evidence.length ? evidence.map((item) => item.path ?? item.name) : (existing?.attachments ?? []),
    agentWork: Array.isArray(input.agentWork) ? input.agentWork : (existing?.agentWork ?? []),
    folder: `shared/${bugId}`
  };

  if (!saved.summary) return json(request, { error: "A brief description is required" }, 400);
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
      if (request.method === "GET" && pathname === "/state") return await readSharedState(request, env);
      if (request.method === "PUT" && pathname === "/state") return await saveSharedState(request, env);
      if (request.method === "POST" && pathname === "/assets") return await saveAsset(request, env);
      if (request.method === "GET" && pathname.startsWith("/assets/")) return await readAsset(request, env, pathname);
      if (request.method === "GET" && pathname.includes("/bugs/evidence/")) return await readEvidence(request, env, pathname);
      if (request.method === "GET" && /\/bugs\/?$/.test(pathname)) return await listBugs(request, env);
      if (request.method === "PUT" && /\/bugs\/?$/.test(pathname)) return await saveBug(request, env);
      return json(request, { error: "Not found" }, 404);
    } catch (error) {
      return json(request, { error: error instanceof Error ? error.message : String(error) }, 400);
    }
  }
} satisfies ExportedHandler<Env>;
