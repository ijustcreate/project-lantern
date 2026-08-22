import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/auditHistory.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 }
}).outputText;
const audit = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const panel = {
  id: "star-1",
  type: "image",
  imageUrl: `data:image/png;base64,${"x".repeat(30_000)}`,
  x: 10,
  y: 20,
  width: 12,
  height: 14
};
const board = {
  id: "board-stars",
  name: "Legacy Donor Star Wall · Landscape",
  orientation: "Landscape",
  templatePurpose: "roster",
  donorIds: ["donor-1", "donor-2"],
  panels: Array.from({ length: 40 }, (_, index) => ({ ...panel, id: `star-${index}` }))
};
const record = {
  id: "audit-1",
  timestamp: "2026-08-22T00:00:00.000Z",
  userId: "felix",
  userName: "Felix",
  entityType: "board",
  entityId: board.id,
  action: "update",
  summary: "Updated board",
  before: board,
  after: { ...board, panels: [...board.panels, { ...panel, id: "star-40" }] }
};

const compact = audit.compactAuditRecord(record);
assert.deepEqual(compact.before, {
  id: board.id,
  name: board.name,
  orientation: board.orientation,
  templatePurpose: board.templatePurpose,
  panelCount: 40,
  donorCount: 2
});
assert.equal(compact.after.panelCount, 41);
assert.ok(JSON.stringify(compact).length < 1_000, "a board drag audit stays compact");
assert.ok(JSON.stringify(record).length > 1_000_000, "fixture represents the previous repeated-board bloat");

console.log(JSON.stringify({ compactBytes: JSON.stringify(compact).length, originalBytes: JSON.stringify(record).length }));
