import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/stateAuthority.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 }
}).outputText;
const authority = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

assert.equal(authority.localStateIsNewer("2026-08-22T02:05:12.000Z", "2026-08-22T02:05:11.000Z"), true);
assert.equal(authority.localStateIsNewer("2026-08-22T02:05:10.000Z", "2026-08-22T02:05:11.000Z"), false);
assert.equal(authority.localStateIsNewer(null, "2026-08-22T02:05:11.000Z"), false);
assert.equal(authority.localStateIsNewer("2026-08-22T02:05:12.000Z", null), true);
assert.equal(authority.localStateIsNewer("not-a-date", "2026-08-22T02:05:11.000Z"), false);

console.log("State authority timestamp checks passed.");
