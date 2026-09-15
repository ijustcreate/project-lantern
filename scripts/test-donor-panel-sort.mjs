import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/donorName.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
const { sortPanelDonors } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const donors = [
  { id: "z", name: "Old name", firstName: "Zoe", lastName: "Adams" },
  { id: "b", name: "Ben Young" },
  { id: "a", name: "Amy and Carl Zane" }
];
const original = structuredClone(donors);
const ids = (mode) => sortPanelDonors(donors, { donorSort: mode }).map((donor) => donor.id);
assert.deepEqual(ids("first-name"), ["a", "b", "z"]);
assert.deepEqual(ids("first-name-desc"), ["z", "b", "a"]);
assert.deepEqual(ids("last-name"), ["z", "b", "a"]);
assert.deepEqual(ids("last-name-desc"), ["a", "b", "z"]);
assert.deepEqual(ids("manual"), ["z", "b", "a"]);
assert.deepEqual(sortPanelDonors(donors, { donorIds: ["b", "a", "z"] }).map((donor) => donor.id), ["b", "a", "z"]);
assert.equal(sortPanelDonors(donors, { donorSort: "first-name" }).slice(0, 1)[0].id, "a", "Sort before limiting grid capacity");
assert.deepEqual(donors, original, "Sorting must preserve stored donors and membership");
for (const file of ["../src/App.tsx", "../src/display/BabylonDonorWall.tsx"]) {
  const renderer = await readFile(new URL(file, import.meta.url), "utf8");
  assert.match(renderer, /panelDonors = (?:\(panel: BoardPanel\) => )?sortPanelDonors\(donors\.filter/, `${file} must apply selected order before rendering`);
}
console.log("Donor panel sorting regression checks passed.");
