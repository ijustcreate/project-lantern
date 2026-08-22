import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [appSource, wallSource, styles] = await Promise.all([
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/display/BabylonDonorWall.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/styles.css", import.meta.url), "utf8")
]);

assert.match(appSource, /function prepareLivePreviewPopup\(popup: Window, sourceDocument: Document\)/);
assert.match(appSource, /popupDocument\.open\(\)/);
assert.match(appSource, /clone\.setAttribute\("href", node\.href\)/);
assert.match(appSource, /Array\.from\(sourceDocument\.styleSheets\)/);
assert.match(appSource, /fallbackStyle\.dataset\.lanternPopupStyles = "inline-fallback"/);
assert.match(appSource, /prepareLivePreviewPopup\(popup, document\)/);
assert.match(wallSource, /canvas\.ownerDocument\.defaultView \?\? window/);
assert.match(wallSource, /renderWindow\.addEventListener\("resize", resize\)/);
assert.match(wallSource, /new RenderResizeObserver\(resize\)/);
assert.match(styles, /\.direct-stage-board > \.wall-canvas/);
assert.match(styles, /\.live-popout-grid \.direct-live-stage-shell \{ width: 100%; height: 100%; max-height: 100%; \}/);

console.log("Broadcast pop-out layout fixture passed: board canvas owns its popup resize lifecycle and fills the shared stage.");
