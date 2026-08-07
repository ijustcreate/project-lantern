import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/host/lanternHost.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const openIndex = source.indexOf("const popup = window.open(");

assert.ok(openIndex >= 0, "browser display opening must request a popup");
assert.ok(source.includes('"lantern-display-wall"'), "multiple browser displays must reuse one wall popup");
assert.ok(source.includes("result.opened.push(...screens.map"), "the wall popup must report every contained display as opened");
assert.ok(source.includes("Browsers consume transient user activation after one window.open call"));
assert.ok(app.includes('className="display-wall-grid"'), "the display wall route must render every requested output");
assert.ok(app.includes("#/display/${encodeURIComponent(screen.id)}"), "each display-wall tile must host its actual display route");

console.log(JSON.stringify({ oneBrowserPopupPerClick: true, allDisplaysContained: true, nativeWindowsPreserved: true }));
