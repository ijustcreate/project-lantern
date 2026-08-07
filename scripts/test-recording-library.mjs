import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/recordingLibrary.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 }
}).outputText;
const library = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const store = new library.RecordingLibraryStore({ getIndexedDB: () => undefined });
const base = {
  title: "  Lantern   Live demo  ",
  durationSeconds: 3,
  mimeType: "video/webm",
  sizeBytes: 4,
  source: "demo",
  sourceLabel: "Generated test feed",
  target: "display-1",
  targetLabel: "Welcome Gallery",
  screenIds: ["display-1"],
  timings: library.recordingTimingMetrics(100, 106.4, 352.1),
  blob: new Blob(["demo"], { type: "video/webm" })
};

const older = await store.save({ ...base, id: "recording-older", title: library.normalizeRecordingTitle(base.title), createdAt: "2026-08-06T18:00:00.000Z" });
const newer = await store.save({ ...base, id: "recording-newer", title: "Newer capture", createdAt: "2026-08-06T19:00:00.000Z" });

assert.equal(older.storage, "memory", "missing IndexedDB falls back without losing the capture");
assert.equal(newer.storage, "memory");
assert.equal(older.title, "Lantern Live demo");
assert.deepEqual(older.timings, { clickToRecorderStartMs: 6, clickToFirstDataMs: 252 });

const firstList = await store.list();
assert.deepEqual(firstList.map((item) => item.id), ["recording-newer", "recording-older"], "library sorts newest first");
assert.equal(await firstList[0].blob.text(), "demo", "blob data remains available with metadata");

const renamed = await store.rename("recording-older", "  Museum   morning welcome  ");
assert.equal(renamed.title, "Museum morning welcome");
assert.equal((await store.list()).find((item) => item.id === "recording-older").title, "Museum morning welcome");

await store.delete("recording-newer");
assert.deepEqual((await store.list()).map((item) => item.id), ["recording-older"]);
assert.equal(library.normalizeRecordingTitle("   ", "Fallback"), "Fallback");

console.log(JSON.stringify({
  fallback: older.storage,
  persistedBlobBytes: older.blob.size,
  timingMetrics: older.timings,
  rename: renamed.title,
  remaining: (await store.list()).length
}));
