import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [wallSource, styles] = await Promise.all([
  readFile(new URL("../src/display/BabylonDonorWall.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/styles.css", import.meta.url), "utf8")
]);

assert.match(wallSource, /canvas\.ownerDocument\.defaultView \?\? window/);
assert.match(wallSource, /renderWindow\.addEventListener\("resize", resize\)/);
assert.match(wallSource, /new RenderResizeObserver\(resize\)/);
assert.match(styles, /\.direct-stage-board > \.wall-canvas/);
assert.match(styles, /\.live-popout-grid \.direct-live-stage-shell \{ width: 100%; height: 100%; max-height: 100%; \}/);

console.log("Broadcast pop-out layout fixture passed: board canvas owns its popup resize lifecycle and fills the shared stage.");
