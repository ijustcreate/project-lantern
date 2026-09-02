import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(projectRoot, "scripts", "lantern-bugs.mjs");
const sandbox = await mkdtemp(path.join(tmpdir(), "lantern-bug-workflow-"));
const bugId = "BUG-9001";
const folder = path.join(sandbox, ".lantern", "bugs", bugId);
const original = {
  bugId, summary: "Camra dosnt show  ", details: "Keep thsi typo and spacing.\n", fixTips: "", enteredBy: "Museum tester", tags: [], status: "open",
  createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z", attachments: ["01-phone screenshot.png"],
  evidence: [{ name: "01-phone screenshot.png", path: "01-phone screenshot.png", mimeType: "image/png" }], folder: `.lantern/bugs/${bugId}`, agentWork: [], statusHistory: []
};
function run(...args) { const result = spawnSync(process.execPath, [cli, ...args], { cwd: sandbox, encoding: "utf8" }); assert.equal(result.status, 0, result.stderr || result.stdout); }
try {
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "catalog.json"), JSON.stringify(original, null, 2));
  run("status", bugId, "assigned-to-codex");
  for (const milestone of ["received", "work-started", "implementation-complete", "testing-started", "testing-finished", "ready-for-human"]) run("milestone", bugId, milestone);
  const saved = JSON.parse(await readFile(path.join(folder, "catalog.json"), "utf8"));
  assert.equal(saved.summary, original.summary); assert.equal(saved.details, original.details); assert.deepEqual(saved.evidence, original.evidence);
  assert.equal(saved.status, "ready-for-test"); assert.equal(saved.agentWork.length, 6);
  assert.deepEqual(saved.agentWork.map((entry) => entry.note), ["Received in morning scan.", "Work started.", "Implementation complete.", "Testing started.", "Testing finished.", "Ready for human to mark fixed."]);
  assert.ok(saved.statusHistory.some((entry) => entry.to === "assigned-to-codex")); assert.ok(saved.statusHistory.some((entry) => entry.to === "in-progress")); assert.ok(saved.statusHistory.some((entry) => entry.to === "ready-for-test"));
  assert.ok(!saved.statusHistory.some((entry) => entry.to === "verified" || entry.to === "closed"));
  console.log("Bug workflow status, milestones, report text, and screenshot preservation verified.");
} finally { await rm(sandbox, { recursive: true, force: true }); }
