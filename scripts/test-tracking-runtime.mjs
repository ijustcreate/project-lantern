import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function importTypeScript(relativePath) {
  const sourceUrl = new URL(relativePath, import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 }
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const runtime = await importTypeScript("../src/trackingRuntime.ts");
const effects = await importTypeScript("../src/trackingEffects.ts");

assert.equal(runtime.TRACKING_PERFORMANCE_TARGETS.reportedBaselineActivationMs, 8_000, "the handoff baseline must be labeled as reported, not measured locally");
assert.equal(runtime.TRACKING_PERFORMANCE_TARGETS.sixtyFpsFrameBudgetMs, 1_000 / 60);
assert.equal(runtime.TRACKING_PERFORMANCE_TARGETS.thirtyFpsFrameBudgetMs, 1_000 / 30);

const monitor = new runtime.TrackingPerformanceMonitor(0);
assert.equal(monitor.snapshot().phase, "warming");
monitor.markTrackerReady(920);
monitor.markFaceDetected(1_080);
monitor.recordInference(8.4);
for (let frame = 1; frame <= 125; frame += 1) monitor.recordRenderedFrame(frame * (1_000 / 60));
let status = monitor.snapshot();
assert.equal(status.initializationLatencyMs, 920);
assert.equal(status.firstDetectionLatencyMs, 1_080);
assert.equal(status.adaptiveFps, 30, "tracking starts at the stable 30 FPS cadence");

for (let sample = 0; sample < 12; sample += 1) monitor.recordInference(31);
let time = 2_100;
for (let window = 0; window < 2; window += 1) {
  for (let frame = 0; frame < 36; frame += 1) {
    time += 1_000 / 35;
    monitor.recordRenderedFrame(time);
  }
}
status = monitor.snapshot();
assert.equal(status.adaptiveFps, 30, "two stressed windows should select the stable 30 FPS cadence");
assert.equal(status.phase, "degraded");

assert.equal(runtime.shouldHoldFaceAnchors({
  nowMs: 300,
  lastFaceSeenAt: 100,
  lastOcclusionAt: 260,
  occlusionConfidence: 0.9,
  faceMotion: 0.01,
  poseHeadMotion: 0.01
}), true, "a recent, confident hand overlap should briefly hold a still face anchor");
assert.equal(runtime.shouldHoldFaceAnchors({
  nowMs: 300,
  lastFaceSeenAt: 100,
  lastOcclusionAt: 260,
  occlusionConfidence: 0.9,
  faceMotion: 0.01,
  poseHeadMotion: 0.08
}), false, "a moving head must cancel the occlusion hold");
assert.equal(runtime.shouldHoldFaceAnchors({
  nowMs: 700,
  lastFaceSeenAt: 100,
  lastOcclusionAt: 260,
  occlusionConfidence: 0.9,
  faceMotion: 0.01,
  poseHeadMotion: 0.01
}), false, "face anchors cannot be held indefinitely");

const face = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
const wink = runtime.deriveEyeOpenness(face, [
  { categoryName: "eyeBlinkLeft", score: 0.98 },
  { categoryName: "eyeBlinkRight", score: 0.02 }
]);
assert.ok(wink.leftEyeOpen < 0.05, "left eyelid state is independent");
assert.ok(wink.rightEyeOpen > 0.95, "right eye stays open during a left wink");

const hand = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.7, z: 0 }));
[[2, 3, 4], [6, 7, 8], [10, 11, 12], [14, 15, 16], [18, 19, 20]].forEach(([proximal, joint, tip], finger) => {
  const x = 0.34 + finger * 0.08;
  hand[proximal] = { x, y: 0.62, z: 0 };
  hand[joint] = { x, y: 0.5, z: 0 };
  hand[tip] = { x, y: 0.3, z: 0 };
});
const trackedHands = runtime.deriveTrackedHands([hand], [[{ categoryName: "Left", score: 0.87 }]]);
assert.equal(trackedHands[0].side, "left");
assert.equal(trackedHands[0].confidence, 0.87);
assert.equal(trackedHands[0].fingerCount, 5);
assert.equal(trackedHands[0].gesture, "open-palm");
assert.ok(Object.values(trackedHands[0].fingers).every((finger) => finger.direction === "up"));

const pose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
pose[11] = { x: 0.38, y: 0.62, z: 0, visibility: 0.92 };
pose[12] = { x: 0.62, y: 0.62, z: 0, visibility: 0.94 };
const body = runtime.deriveBodyFrame(pose, trackedHands);
assert.ok(body?.neck, "visible shoulders create a neck/chest anchor");
assert.equal(body?.leftArm?.inferred, true, "an offscreen elbow falls back to shoulder-to-hand inference");

face[13] = { x: 0.5, y: 0.43, z: 0 };
face[14] = { x: 0.5, y: 0.64, z: 0 };
face[61] = { x: 0.3, y: 0.53, z: 0 };
face[291] = { x: 0.7, y: 0.53, z: 0 };
const whitePixels = new Uint8ClampedArray(10 * 10 * 4);
for (let offset = 0; offset < whitePixels.length; offset += 4) {
  whitePixels[offset] = 245;
  whitePixels[offset + 1] = 245;
  whitePixels[offset + 2] = 245;
  whitePixels[offset + 3] = 255;
}
const mouth = runtime.analyzeExperimentalMouth({ data: whitePixels, width: 10, height: 10 }, face);
assert.equal(mouth.method, "experimental-color-contrast-v1");
assert.equal(mouth.status, "detected");
assert.ok(mouth.teeth?.confidence >= 0.55, "experimental regions need actual pixel evidence above threshold");
assert.equal(mouth.tongue, undefined, "the image pass must not fabricate unsupported tongue confidence");

const rig = effects.createWizardHatRig();
const base = { x: 100, y: 100 };
effects.updateWizardHatRig(rig, base, 0, 90, 0, { springiness: 0.65, damping: 0.7 });
effects.updateWizardHatRig(rig, { x: 112, y: 96 }, 0.08, 90, 16, { springiness: 0.65, damping: 0.7 });
assert.equal(rig.points.length, 3, "wizard hat uses three linked segments");
const chain = [{ x: 112, y: 96 }, ...rig.points];
for (let index = 1; index < chain.length; index += 1) {
  assert.ok(Math.abs(Math.hypot(chain[index].x - chain[index - 1].x, chain[index].y - chain[index - 1].y) - 90 * 0.34) < 0.001, "wizard-hat bone lengths remain constrained");
}

const glassesFace = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
const setFacePoint = (index, x, y) => { glassesFace[index] = { x, y, z: 0 }; };
setFacePoint(33, .31, .41); setFacePoint(133, .44, .41);
setFacePoint(159, .375, .39); setFacePoint(145, .375, .43);
setFacePoint(160, .36, .392); setFacePoint(144, .36, .428);
setFacePoint(362, .56, .43); setFacePoint(263, .69, .43);
setFacePoint(386, .625, .41); setFacePoint(374, .625, .45);
setFacePoint(385, .64, .412); setFacePoint(380, .64, .448);
for (const [index, x, y] of [[468, .385, .41], [469, .38, .405], [470, .39, .405], [471, .39, .415], [472, .38, .415], [473, .615, .43], [474, .61, .425], [475, .62, .425], [476, .62, .435], [477, .61, .435]]) setFacePoint(index, x, y);
setFacePoint(168, .5, .445); setFacePoint(234, .23, .43); setFacePoint(454, .77, .45);
setFacePoint(127, .22, .42); setFacePoint(356, .78, .46);
const glassesFrame = {
  nowMs: 0,
  width: 640,
  height: 360,
  face: { landmarks: glassesFace, leftEyeOpen: 1, rightEyeOpen: 1, held: false },
  hands: [],
  extensionAnchors: {}
};
const glasses = effects.deriveTrackedGlassesGeometry(glassesFrame, "classic");
assert.ok(glasses, "complete eye contours produce glasses geometry");
assert.ok(glasses.angle > 0.04 && glasses.angle < 0.2, "frames follow the shared iris line when the head tilts");
assert.ok(glasses.lenses[0].x < 0 && glasses.lenses[1].x > 0, "each lens is centered on its own eye");
assert.ok(glasses.lenses[0].width > 1.35 * Math.abs((.44 - .31) * 640), "lenses include a wearable margin around the eye contour");
assert.ok(glasses.lenses[0].x + glasses.lenses[0].width / 2 < glasses.lenses[1].x - glasses.lenses[1].width / 2, "lens sizing always leaves a real bridge gap");
assert.ok(glasses.temples[0].x < glasses.lenses[0].x - glasses.lenses[0].width / 2, "left arm reaches toward the face edge");
assert.ok(glasses.temples[1].x > glasses.lenses[1].x + glasses.lenses[1].width / 2, "right arm reaches toward the face edge");
assert.ok(glasses.nosePadY <= (glasses.lenses[0].height + glasses.lenses[1].height) / 2 * .26, "nose pads stay attached to the bridge area");

const rendererSource = await readFile(new URL("../src/components/ChromaVideo.tsx", import.meta.url), "utf8");
assert.match(rendererSource, /Detecting face…/);
assert.match(rendererSource, /outputFaceBlendshapes: true/);
assert.match(rendererSource, /trackingCameraUnderlay/);
assert.match(rendererSource, /renderTrackedOverlay/);
assert.match(rendererSource, /warmVisionResources/);

console.log(JSON.stringify({
  reportedBefore: {
    activationLatencyMs: runtime.TRACKING_PERFORMANCE_TARGETS.reportedBaselineActivationMs,
    source: "authoritative handoff; not reproduced on this machine"
  },
  implementedTargets: runtime.TRACKING_PERFORMANCE_TARGETS,
  deterministicSimulation: {
    initializationLatencyMs: 920,
    firstDetectionLatencyMs: 1_080,
    lightLoadCadence: 30,
    stressedCadence: status.adaptiveFps
  },
  hardwareAfter: "Not measured by this fixture. ChromaVideo.onTrackingStatus reports live initialization latency, first-detection latency, inference latency, rendered FPS, and adaptive cadence on real hardware.",
  rendererContract: true,
  independentBlink: true,
  occlusionHoldBounded: true,
  handAndBodyInference: true,
  experimentalMouthFailsClosed: true,
  wizardBones: rig.points.length,
  fittedGlasses: true
}, null, 2));
