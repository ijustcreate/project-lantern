import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const source = await readFile(new URL("../src/concurrentStateMerge.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { mergeConcurrentState } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
// Execute the actual editor relay effect with a delayed save acknowledgement.
const start = app.indexOf("    if (incomingSavedSnapshot === observedSavedSnapshot.current) return;");
assert.ok(start >= 0);
const end = app.indexOf("  }, [hasUnsavedChanges, incomingSavedSnapshot, savedState]);", start);
assert.ok(end > start);
const effect = app.slice(start, end);
const submitted = { boardPrograms: [{ id: "board", panels: [{ id: "donors", donorIds: ["a"], fontSize: 30 }] }] };
const newer = structuredClone(submitted);
newer.boardPrograms[0].panels[0].donorIds.push("b");
newer.boardPrograms[0].panels[0].fontSize = 42;
for (const draft of [submitted, newer]) {
  let rendered;
  let savedSnapshot;
  const context = {
    incomingSavedSnapshot: JSON.stringify(submitted),
    observedSavedSnapshot: { current: "old" },
    pendingSavedBoardSnapshot: { current: { snapshot: JSON.stringify(submitted), state: submitted } },
    draftStateRef: { current: structuredClone(draft) },
    savedState: structuredClone(submitted),
    hasUnsavedChanges: true,
    mergeConcurrentState, structuredClone,
    setDraftState: (value) => { rendered = value; },
    setSavedDraftSnapshot: (value) => { savedSnapshot = value; }
  };
  vm.runInNewContext(`(() => { ${effect} })()`, context);
  assert.deepEqual(rendered, draft, "save acknowledgement must preserve post-submit membership and formatting edits");
  assert.equal(savedSnapshot, JSON.stringify(submitted), "only the submitted version is marked saved");
  assert.equal(context.pendingSavedBoardSnapshot.current, null);
  assert.deepEqual(context.draftStateRef.current, draft);
}
console.log("Board save handoff checks passed: later donor edits survive a delayed acknowledgement.");
