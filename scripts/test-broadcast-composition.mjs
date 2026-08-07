import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const sourceUrl = new URL("../src/broadcastComposition.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 }
}).outputText;
const composition = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const legacyLive = {
  active: false,
  target: "display-1",
  title: "Legacy title",
  lowerThird: "Legacy caption",
  titlePosition: { x: 20, y: 20 },
  lowerThirdPosition: { x: 20, y: 80 },
  backgroundMode: "image",
  backgroundColor: "#07111e",
  backgroundImage: "data:image/png;base64,legacy",
  panelColor: "#050d17",
  frameBorderColor: "#123456",
  frameBorderWidth: 6,
  usingCamera: true,
  source: "camera",
  frame: {
    x: 12,
    y: 10,
    width: 70,
    height: 75,
    crop: { scale: 1.4, x: 6, y: -12 }
  },
  chromaKey: { enabled: false, color: "#18a558", similarity: .34, smoothness: .12, spill: .18 },
  effects: {
    background: "original",
    blur: 18,
    segmentationThreshold: .42,
    segmentationFeather: .18,
    accessory: "none",
    faceTracking: false,
    puppetPreview: false
  }
};

const normalized = composition.normalizeBroadcastComposition(legacyLive);
assert.equal(composition.BROADCAST_FRAME_PRESETS.length, 7, "all seven requested frame presets remain available");
assert.deepEqual(composition.BROADCAST_FRAME_PRESETS.map((preset) => preset.id), ["museum-sketch", "dark-gold", "brass", "gold", "black", "white", "matte-plastic"]);
assert.equal(composition.BROADCAST_BACKGROUND_PRESETS.length, 6);
assert.equal(normalized.frameStyle.presetId, "custom", "legacy borders normalize without silently selecting a new style");
assert.equal(normalized.frameStyle.color, "#123456");
assert.equal(normalized.frameStyle.thickness, 6);
assert.equal(normalized.backgroundImage, legacyLive.backgroundImage, "legacy custom images survive normalization");
assert.equal(normalized.backgroundImagePreset, "custom");
assert.deepEqual(normalized.frame.cropEdges, { top: 0, right: 0, bottom: 0, left: 0 });

const cropped = composition.normalizeCropEdges({ top: 12, right: 18, bottom: 7, left: 21 });
assert.deepEqual(cropped, { top: 12, right: 18, bottom: 7, left: 21 }, "all four crop edges remain independent");
assert.deepEqual(composition.normalizeCropEdges({ left: 80, right: 80 }), { top: 0, right: 45, bottom: 0, left: 45 }, "invalid edge totals are bounded");

const darkGold = composition.framePresetPatch(normalized, "dark-gold");
assert.equal(darkGold.frameStyle.presetId, "dark-gold");
assert.equal(darkGold.frameBorderColor, darkGold.frameStyle.color, "new frame state keeps legacy color synchronized");
assert.equal(darkGold.frameBorderWidth, darkGold.frameStyle.thickness, "new frame state keeps legacy width synchronized");

assert.match(composition.gradientCss({ colors: ["#000000", "#ffffff"], direction: "right-to-left" }), /^linear-gradient\(270deg/);
assert.match(composition.gradientCss({ colors: ["#000000", "#ffffff"], direction: "radial" }), /^radial-gradient/);
assert.equal(composition.museumBackgroundAsset("Portrait"), "assets/broadcast/cms-portrait.svg");
assert.equal(composition.museumBackgroundAsset("Landscape"), "assets/broadcast/cms-landscape.svg");

assert.equal(composition.resolveBroadcastAssetUrl("assets/broadcast/cms-portrait.svg", "/lantern/"), "/lantern/assets/broadcast/cms-portrait.svg");
assert.equal(composition.resolveBroadcastAssetUrl("data:image/png;base64,abc", "/lantern/"), "data:image/png;base64,abc");
assert.equal(composition.resolveBroadcastAssetUrl("blob:https://example.test/123", "/lantern/"), "blob:https://example.test/123");
assert.equal(composition.resolveBroadcastAssetUrl("https://cdn.example.test/background.webp", "/lantern/"), "https://cdn.example.test/background.webp");
assert.equal(composition.resolveBroadcastAssetUrl("/api/media/background", "/lantern/"), "/api/media/background");

console.log(JSON.stringify({
  framePresets: composition.BROADCAST_FRAME_PRESETS.length,
  backgroundPresets: composition.BROADCAST_BACKGROUND_PRESETS.length,
  legacyPreserved: true,
  cropEdges: cropped,
  customUrlsPreserved: true
}));
