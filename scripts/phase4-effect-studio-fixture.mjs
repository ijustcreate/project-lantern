import assert from "node:assert/strict";
import {
  PHASE4_CONTENT_VERSION,
  TRACKING_ANCHORS,
  normalizeEffectStudioState,
  normalizePhase4LiveEffects,
  seededCostumes
} from "../src/effectStudio.ts";

const users = [{ id: "user-edward", name: "Edward", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", accessMode: "local-demo" }];
const existingTeddy = {
  id: "costume-talking-teddy",
  name: "Edward's Blue Teddy",
  description: "Customized before the v9 migration.",
  starter: "teddy",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z",
  bones: [{ id: "custom-head", name: "Custom head", joint: "ball", anchor: "nose", weight: .84, springiness: .21, damping: .91 }],
  pieces: [{ id: "blue-head", name: "Blue head", role: "head-backplate", anchor: "nose", boneId: "custom-head", color: "#2455aa", accentColor: "#f0c28e", x: .03, y: -.02, scale: 1.2, rotation: 2, zIndex: 1, visible: true }]
};
const customCostume = {
  ...structuredClone(existingTeddy),
  id: "costume-curator-owl",
  name: "Curator Owl",
  starter: undefined,
  pieces: [{ ...existingTeddy.pieces[0], id: "owl-head", color: "#663399" }]
};
const calibration = {
  id: "calibration-edward-camera-a",
  name: "Edward at welcome desk",
  userId: "user-edward",
  deviceId: "camera-a",
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z",
  landmarkOffsets: { "head-top": { x: .035, y: -.018, updatedAt: "2026-07-03T00:00:00.000Z" } },
  poseSamples: { center: { pose: "center", completedAt: "2026-07-03T00:00:00.000Z", offsets: { "head-top": { x: .035, y: -.018, updatedAt: "2026-07-03T00:00:00.000Z" } } } }
};
const v6Studio = {
  costumes: [existingTeddy, customCostume],
  calibrationProfiles: [calibration],
  activeCalibrationByUserDevice: { "user-edward::camera-a": calibration.id }
};
const v6Effects = {
  background: "remove",
  blur: 21,
  segmentationThreshold: .47,
  segmentationFeather: .22,
  accessory: "glasses",
  glassesEnabled: true,
  partyHatEnabled: true,
  faceTracking: true,
  puppetPreview: false,
  trackingDebug: true,
  costumeEnabled: true,
  costumeId: customCostume.id,
  calibrationProfileId: calibration.id
};
const defaults = {
  ...v6Effects,
  blur: 18,
  glassesEnabled: false,
  partyHatEnabled: false,
  trackingDebug: false,
  trackedPointsOverlay: false,
  trackingCameraUnderlay: true,
  glassesStyle: "classic",
  hatStyle: "party",
  wizardSpringiness: .56,
  wizardDamping: .7
};

const firstPass = normalizeEffectStudioState(v6Studio, users, true);
assert.equal(PHASE4_CONTENT_VERSION, 9);
assert.equal(firstPass.costumes.find((item) => item.id === existingTeddy.id)?.name, existingTeddy.name, "customized starter must not be overwritten");
assert.equal(firstPass.costumes.find((item) => item.id === customCostume.id)?.pieces[0]?.color, "#663399", "custom costume art must survive");
assert.ok(firstPass.costumes.some((item) => item.id === "costume-playful-skeleton"), "missing v7 skeleton starter should be appended");
assert.ok(firstPass.costumes.some((item) => item.id === "costume-friendly-zombie"), "missing v9 zombie starter should be appended");
assert.equal(firstPass.calibrationProfiles[0]?.landmarkOffsets["head-top"]?.x, .035, "calibration offsets must survive");
assert.equal(firstPass.activeCalibrationByUserDevice["user-edward::camera-a"], calibration.id, "active profile selection must survive");

const migratedEffects = normalizePhase4LiveEffects(v6Effects, defaults, firstPass);
assert.equal(migratedEffects.blur, 21, "existing background/effect settings must survive");
assert.equal(migratedEffects.glassesEnabled, true, "existing glasses toggle must survive");
assert.equal(migratedEffects.hatEnabled, true, "legacy party-hat toggle must migrate to the general hat toggle");
assert.equal(migratedEffects.trackedPointsOverlay, true, "legacy tracking debug toggle must migrate to tracked-points overlay");
assert.equal(migratedEffects.costumeId, customCostume.id, "valid selected costume must survive");
assert.equal(migratedEffects.calibrationProfileId, calibration.id, "valid calibration selection must survive");

const secondPass = normalizeEffectStudioState(firstPass, users, false);
assert.deepEqual(secondPass, firstPass, "v9 studio normalization must be idempotent");
assert.equal(new Set(secondPass.costumes.map((item) => item.id)).size, secondPass.costumes.length, "migration must not duplicate costume IDs");
assert.equal(new Set(secondPass.calibrationProfiles.map((item) => item.id)).size, secondPass.calibrationProfiles.length, "migration must not duplicate calibration profiles");
const seededTeddy = seededCostumes.find((item) => item.starter === "teddy");
const seededSkeleton = seededCostumes.find((item) => item.starter === "skeleton");
const seededZombie = seededCostumes.find((item) => item.starter === "zombie");
assert.ok(seededTeddy, "talking teddy starter must exist");
assert.ok(seededSkeleton, "skeleton starter must exist");
assert.ok(seededZombie?.conceptArt, "zombie starter must expose generated concept art");
for (const role of ["head-backplate", "cheek", "nose", "upper-mouth", "lower-mouth", "chin", "ear", "eyebrow", "eye", "upper-eyelid", "lower-eyelid", "muzzle", "hand", "palm"]) {
  assert.ok(seededTeddy.pieces.some((item) => item.role === role), `talking teddy must model ${role} independently`);
}
assert.ok(seededSkeleton.pieces.some((item) => item.role === "forearm" && item.inferred), "skeleton must expose optional inferred forearms");
assert.ok(seededCostumes.every((costume) => costume.bones.every((bone) => typeof bone.weight === "number" && typeof bone.springiness === "number" && typeof bone.damping === "number" && bone.anchor)), "starter rigs must expose authorable physics and anchors");
for (const requiredAnchor of ["left-ear", "right-ear", "head-left", "head-right", "head-top", "chin", "neck", "chest", "left-shoulder", "right-shoulder"]) {
  assert.ok(TRACKING_ANCHORS.some((item) => item.id === requiredAnchor), `tracking studio must expose ${requiredAnchor}`);
}

console.log(JSON.stringify({
  contentVersion: PHASE4_CONTENT_VERSION,
  customizedStarterPreserved: true,
  customCostumePreserved: true,
  calibrationPreserved: true,
  legacyTogglesMigrated: true,
  teddyIndependentPieces: seededTeddy.pieces.length,
  skeletonInferredArms: true,
  starterCostumes: secondPass.costumes.filter((item) => item.starter).map((item) => item.name),
  secondPassStable: true
}, null, 2));
