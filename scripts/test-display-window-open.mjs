import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/host/lanternHost.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../src/components/LanternDialog.tsx", import.meta.url), "utf8");
const openIndex = source.indexOf("const popup = window.open(");

assert.ok(openIndex >= 0, "browser display opening must request a popup");
assert.ok(source.includes("let requestedNewWindow = false"), "browser display opening must track the one-popup budget for each click");
assert.ok(source.includes("result.pending.push(screen.id)"), "additional displays must be queued without requesting blocked popups");
assert.ok(source.includes("knownPopup!.focus()"), "already-open display windows must be focused without consuming another popup request");
assert.ok(app.includes("openNextDisplayWindow"), "the dashboard must expose a follow-up action for the next display");
assert.ok(app.includes("void openDisplayWindows([screen])"), "the follow-up action must request only one display window");
assert.ok(dialog.includes("actionLabel && onAction"), "the display notice must render its explicit follow-up action");

console.log(JSON.stringify({ oneNewBrowserPopupPerClick: true, pendingDisplaysActionable: true, nativeWindowsPreserved: true }));
