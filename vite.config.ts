import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const bugRoot = path.resolve(".lantern", "bugs");

async function listBugs() {
  await mkdir(bugRoot, { recursive: true });
  const entries = await readdir(bugRoot, { withFileTypes: true });
  const records = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try { return JSON.parse(await readFile(path.join(bugRoot, entry.name, "catalog.json"), "utf8")); }
    catch { return null; }
  }));
  return records.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function saveBug(bug: any) {
  if (!/^BUG-\d{4,}$/i.test(bug.bugId)) throw new Error("Invalid bug id");
  const bugId = bug.bugId.toUpperCase();
  const folder = path.join(bugRoot, bugId);
  await mkdir(folder, { recursive: true });
  let existing: any = null;
  try { existing = JSON.parse(await readFile(path.join(folder, "catalog.json"), "utf8")); }
  catch { /* A new report has no catalogue entry yet. */ }
  const evidenceFolder = path.join(folder, "evidence");
  await mkdir(evidenceFolder, { recursive: true });
  const savedEvidence = [];
  for (const [index, item] of (bug.evidence ?? []).entries()) {
    if (!item?.dataUrl?.startsWith("data:")) continue;
    const match = item.dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s);
    if (!match) continue;
    const safeName = `${String(index + 1).padStart(2, "0")}-${path.basename(item.name || "evidence").replace(/[^a-z0-9._ -]/gi, "_")}`;
    await writeFile(path.join(evidenceFolder, safeName), Buffer.from(match[2], "base64"));
    savedEvidence.push({ name: safeName, path: path.relative(folder, path.join(evidenceFolder, safeName)), mimeType: match[1] });
  }
  const updated = {
    ...existing,
    ...bug,
    bugId,
    evidence: savedEvidence.length ? savedEvidence : (bug.evidence ?? existing?.evidence ?? []),
    attachments: savedEvidence.length ? savedEvidence.map((item) => item.path) : (bug.attachments ?? existing?.attachments ?? []),
    agentWork: bug.agentWork ?? existing?.agentWork ?? [],
    statusHistory: bug.statusHistory ?? existing?.statusHistory ?? [],
    folder: path.relative(process.cwd(), folder),
    updatedAt: bug.updatedAt || new Date().toISOString()
  };
  await writeFile(path.join(folder, "catalog.json"), JSON.stringify(updated, null, 2));
  await writeFile(path.join(folder, "report.md"), `# ${bugId}: ${updated.summary}\n\nStatus: ${updated.status}\nCreated: ${updated.createdAt}\nUpdated: ${updated.updatedAt}\nTags: ${updated.tags.join(", ")}\n\n## Details\n\n${updated.details}\n\n## Fix / test notes\n\n${updated.fixTips}\n`);
  return updated;
}

function lanternBugApi(): Plugin {
  return { name: "lantern-bug-api", configureServer(server) {
    server.middlewares.use("/__lantern/evidence", async (req, res) => {
      try {
        const parts = decodeURIComponent((req.url ?? "").split("?")[0]).split("/").filter(Boolean);
        const bugId = parts.shift()?.toUpperCase();
        if (!bugId || !/^BUG-\d{4,}$/.test(bugId) || !parts.length) throw new Error("Invalid evidence path");
        const target = path.resolve(bugRoot, bugId, "evidence", ...parts);
        const evidenceRoot = path.resolve(bugRoot, bugId, "evidence");
        if (!target.startsWith(`${evidenceRoot}${path.sep}`)) throw new Error("Invalid evidence path");
        const extension = path.extname(target).toLowerCase();
        const mimeTypes: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime", ".mpeg": "video/mpeg", ".mpg": "video/mpeg", ".webm": "video/webm" };
        res.setHeader("Content-Type", mimeTypes[extension] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        res.end(await readFile(target));
      } catch (error) {
        res.statusCode = 404;
        res.end(String(error));
      }
    });
    server.middlewares.use("/__lantern/bugs", async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      try {
        if (req.method === "GET") { res.end(JSON.stringify(await listBugs())); return; }
        if (req.method === "POST" || req.method === "PUT") {
          let body = "";
          for await (const chunk of req) body += chunk;
          res.end(JSON.stringify(await saveBug(JSON.parse(body))));
          return;
        }
        res.statusCode = 405; res.end(JSON.stringify({ error: "Method not allowed" }));
      } catch (error) {
        res.statusCode = 400; res.end(JSON.stringify({ error: String(error) }));
      }
    });
  }};
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/project-lantern/" : "/",
  plugins: [react(), lanternBugApi()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: false
  },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1800
  }
});
