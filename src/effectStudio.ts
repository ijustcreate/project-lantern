import type {
  CalibrationPose,
  CostumeArtPiece,
  CostumeDefinition,
  EffectRigBone,
  EffectStudioState,
  LanternUser,
  LiveEffectsSettings,
  TrackingAnchorPoint,
  TrackingCalibrationProfile
} from "./types";

export const PHASE4_CONTENT_VERSION = 8;
export const EFFECT_STUDIO_SEED_TIMESTAMP = "2026-08-06T00:00:00.000Z";

export const CALIBRATION_POSES: Array<{ id: CalibrationPose; label: string; instruction: string }> = [
  { id: "center", label: "Face centered", instruction: "Look straight at the camera and align the selected point." },
  { id: "left", label: "Turn left", instruction: "Turn comfortably to your left, then correct the point." },
  { id: "right", label: "Turn right", instruction: "Turn comfortably to your right, then correct the point." },
  { id: "up", label: "Look up", instruction: "Lift your gaze and gently align the point." },
  { id: "down", label: "Look down", instruction: "Lower your gaze and gently align the point." }
];

export const TRACKING_ANCHORS: Array<{ id: TrackingAnchorPoint; label: string; group: string }> = [
  { id: "left-eye", label: "Left eye", group: "Face" },
  { id: "right-eye", label: "Right eye", group: "Face" },
  { id: "nose", label: "Nose", group: "Face" },
  { id: "mouth-upper", label: "Upper mouth", group: "Face" },
  { id: "mouth-lower", label: "Lower mouth", group: "Face" },
  { id: "left-ear", label: "Full left ear", group: "Head" },
  { id: "right-ear", label: "Full right ear", group: "Head" },
  { id: "head-left", label: "Left side of head", group: "Head" },
  { id: "head-right", label: "Right side of head", group: "Head" },
  { id: "head-top", label: "Top of head", group: "Head" },
  { id: "chin", label: "Under chin", group: "Head" },
  { id: "neck", label: "Neck", group: "Body" },
  { id: "chest", label: "Chest", group: "Body" },
  { id: "left-shoulder", label: "Left shoulder", group: "Body" },
  { id: "right-shoulder", label: "Right shoulder", group: "Body" },
  { id: "left-hand", label: "Left hand", group: "Hands" },
  { id: "right-hand", label: "Right hand", group: "Hands" }
];

function bone(
  id: string,
  name: string,
  anchor: TrackingAnchorPoint,
  parentId?: string,
  joint: EffectRigBone["joint"] = "spring",
  weight = 1,
  springiness = 0.42,
  damping = 0.68
): EffectRigBone {
  return { id, name, anchor, parentId, joint, weight, springiness, damping };
}

function piece(
  id: string,
  name: string,
  role: CostumeArtPiece["role"],
  anchor: TrackingAnchorPoint,
  options: Partial<CostumeArtPiece> = {}
): CostumeArtPiece {
  return {
    id,
    name,
    role,
    anchor,
    color: "#b67843",
    accentColor: "#f0c28e",
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    zIndex: 10,
    visible: true,
    ...options
  };
}

export const seededCostumes: CostumeDefinition[] = [
  {
    id: "costume-talking-teddy",
    name: "Talking Teddy",
    description: "A warm, storybook bear whose eyes, mouth, ears, and paws follow the performer.",
    starter: "teddy",
    createdAt: EFFECT_STUDIO_SEED_TIMESTAMP,
    updatedAt: EFFECT_STUDIO_SEED_TIMESTAMP,
    bones: [
      bone("teddy-head", "Head", "nose", undefined, "ball", 1, 0.2, 0.82),
      bone("teddy-left-ear", "Left ear", "left-ear", "teddy-head", "spring", 0.72, 0.55, 0.66),
      bone("teddy-right-ear", "Right ear", "right-ear", "teddy-head", "spring", 0.72, 0.55, 0.66),
      bone("teddy-jaw", "Talking jaw", "mouth-lower", "teddy-head", "hinge", 1, 0.34, 0.78),
      bone("teddy-left-paw", "Left paw", "left-hand", undefined, "ball", 1, 0.46, 0.7),
      bone("teddy-right-paw", "Right paw", "right-hand", undefined, "ball", 1, 0.46, 0.7)
    ],
    pieces: [
      piece("teddy-head-backplate", "Head backplate", "head-backplate", "nose", { boneId: "teddy-head", color: "#a96b3c", accentColor: "#6e3e23", zIndex: 1, scale: 1.16 }),
      piece("teddy-left-ear", "Left outer ear", "ear", "left-ear", { boneId: "teddy-left-ear", side: "left", color: "#a96b3c", accentColor: "#efb87e", x: -0.24, y: -0.5, zIndex: 2, scale: 1.22 }),
      piece("teddy-right-ear", "Right outer ear", "ear", "right-ear", { boneId: "teddy-right-ear", side: "right", color: "#a96b3c", accentColor: "#efb87e", x: 0.24, y: -0.5, zIndex: 2, scale: 1.22 }),
      piece("teddy-left-cheek", "Left cheek", "cheek", "left-eye", { side: "left", color: "#dc8b72", accentColor: "#f5b49d", x: -0.14, y: 0.22, zIndex: 5, scale: 0.78 }),
      piece("teddy-right-cheek", "Right cheek", "cheek", "right-eye", { side: "right", color: "#dc8b72", accentColor: "#f5b49d", x: 0.14, y: 0.22, zIndex: 5, scale: 0.78 }),
      piece("teddy-muzzle", "Muzzle patch", "muzzle", "nose", { color: "#efc18f", accentColor: "#fff1d7", y: 0.2, zIndex: 4, scale: 1.05 }),
      piece("teddy-nose", "Nose", "nose", "nose", { color: "#3d241b", accentColor: "#8d6150", zIndex: 8, scale: 0.82 }),
      piece("teddy-upper-mouth", "Upper mouth", "upper-mouth", "mouth-upper", { color: "#4b2b22", accentColor: "#7e4637", boneId: "teddy-head", zIndex: 9 }),
      piece("teddy-lower-mouth", "Lower mouth", "lower-mouth", "mouth-lower", { color: "#4b2b22", accentColor: "#e78376", boneId: "teddy-jaw", zIndex: 9 }),
      piece("teddy-chin", "Chin", "chin", "chin", { color: "#efc18f", boneId: "teddy-jaw", y: -0.08, zIndex: 7, scale: 0.75 }),
      piece("teddy-left-brow", "Left eyebrow", "eyebrow", "left-eye", { side: "left", color: "#5d3625", y: -0.28, zIndex: 9 }),
      piece("teddy-right-brow", "Right eyebrow", "eyebrow", "right-eye", { side: "right", color: "#5d3625", y: -0.28, zIndex: 9 }),
      piece("teddy-left-eye", "Left eye", "eye", "left-eye", { side: "left", color: "#fff8e9", accentColor: "#24323c", zIndex: 8 }),
      piece("teddy-right-eye", "Right eye", "eye", "right-eye", { side: "right", color: "#fff8e9", accentColor: "#24323c", zIndex: 8 }),
      piece("teddy-left-upper-lid", "Left upper eyelid", "upper-eyelid", "left-eye", { side: "left", color: "#8b5634", zIndex: 10 }),
      piece("teddy-right-upper-lid", "Right upper eyelid", "upper-eyelid", "right-eye", { side: "right", color: "#8b5634", zIndex: 10 }),
      piece("teddy-left-lower-lid", "Left lower eyelid", "lower-eyelid", "left-eye", { side: "left", color: "#b8794d", zIndex: 10 }),
      piece("teddy-right-lower-lid", "Right lower eyelid", "lower-eyelid", "right-eye", { side: "right", color: "#b8794d", zIndex: 10 }),
      piece("teddy-left-hand", "Left paw", "hand", "left-hand", { side: "left", color: "#a96b3c", accentColor: "#efc18f", boneId: "teddy-left-paw", zIndex: 30, scale: 1.08 }),
      piece("teddy-right-hand", "Right paw", "hand", "right-hand", { side: "right", color: "#a96b3c", accentColor: "#efc18f", boneId: "teddy-right-paw", zIndex: 30, scale: 1.08 }),
      piece("teddy-left-palm", "Left paw pad", "palm", "left-hand", { side: "left", color: "#edb27e", accentColor: "#f6cfaa", boneId: "teddy-left-paw", zIndex: 31, scale: 0.62 }),
      piece("teddy-right-palm", "Right paw pad", "palm", "right-hand", { side: "right", color: "#edb27e", accentColor: "#f6cfaa", boneId: "teddy-right-paw", zIndex: 31, scale: 0.62 }),
      piece("teddy-chest", "Teddy chest", "body", "chest", { color: "#a96b3c", accentColor: "#efb87e", y: 0.5, zIndex: 0, scale: 1.7 }),
      piece("teddy-left-arm", "Left upper arm", "forearm", "left-shoulder", { side: "left", color: "#a96b3c", accentColor: "#6e3e23", zIndex: 12, scale: 1 }),
      piece("teddy-right-arm", "Right upper arm", "forearm", "right-shoulder", { side: "right", color: "#a96b3c", accentColor: "#6e3e23", zIndex: 12, scale: 1 })
    ]
  },
  {
    id: "costume-playful-skeleton",
    name: "Playful Skeleton",
    description: "A friendly Halloween skeleton with a lively skull, hands, and optional inferred arm bones.",
    starter: "skeleton",
    createdAt: EFFECT_STUDIO_SEED_TIMESTAMP,
    updatedAt: EFFECT_STUDIO_SEED_TIMESTAMP,
    bones: [
      bone("skeleton-head", "Skull", "nose", undefined, "ball", 1, 0.18, 0.84),
      bone("skeleton-jaw", "Jaw", "mouth-lower", "skeleton-head", "hinge", 1, 0.3, 0.78),
      bone("skeleton-left-hand", "Left hand", "left-hand", undefined, "ball", 1, 0.38, 0.74),
      bone("skeleton-right-hand", "Right hand", "right-hand", undefined, "ball", 1, 0.38, 0.74),
      bone("skeleton-left-arm", "Left inferred arm", "left-shoulder", undefined, "hinge", 0.65, 0.28, 0.76),
      bone("skeleton-right-arm", "Right inferred arm", "right-shoulder", undefined, "hinge", 0.65, 0.28, 0.76)
    ],
    pieces: [
      piece("skeleton-skull", "Skull", "head-backplate", "nose", { boneId: "skeleton-head", color: "#f4ead2", accentColor: "#9fb6b7", zIndex: 1, scale: 1.12 }),
      piece("skeleton-left-eye", "Left eye socket", "eye", "left-eye", { side: "left", color: "#26343d", accentColor: "#77d1c6", zIndex: 7, scale: 1.12 }),
      piece("skeleton-right-eye", "Right eye socket", "eye", "right-eye", { side: "right", color: "#26343d", accentColor: "#77d1c6", zIndex: 7, scale: 1.12 }),
      piece("skeleton-nose", "Nose opening", "nose", "nose", { color: "#384750", accentColor: "#54656b", zIndex: 8, scale: 0.62 }),
      piece("skeleton-upper-teeth", "Upper smile", "upper-mouth", "mouth-upper", { color: "#fdf6e5", accentColor: "#39474e", zIndex: 9 }),
      piece("skeleton-lower-jaw", "Lower jaw", "lower-mouth", "mouth-lower", { color: "#eee1c6", accentColor: "#39474e", boneId: "skeleton-jaw", zIndex: 9, scale: 1.08 }),
      piece("skeleton-chin", "Jaw point", "chin", "chin", { color: "#eee1c6", boneId: "skeleton-jaw", zIndex: 8 }),
      piece("skeleton-left-hand-piece", "Left skeleton hand", "hand", "left-hand", { side: "left", color: "#f4ead2", accentColor: "#273841", boneId: "skeleton-left-hand", zIndex: 30 }),
      piece("skeleton-right-hand-piece", "Right skeleton hand", "hand", "right-hand", { side: "right", color: "#f4ead2", accentColor: "#273841", boneId: "skeleton-right-hand", zIndex: 30 }),
      piece("skeleton-left-palm", "Left skeleton palm", "palm", "left-hand", { side: "left", color: "#d4c9b1", accentColor: "#273841", boneId: "skeleton-left-hand", zIndex: 31, scale: 0.58 }),
      piece("skeleton-right-palm", "Right skeleton palm", "palm", "right-hand", { side: "right", color: "#d4c9b1", accentColor: "#273841", boneId: "skeleton-right-hand", zIndex: 31, scale: 0.58 }),
      piece("skeleton-left-forearm", "Left inferred forearm", "forearm", "left-shoulder", { side: "left", color: "#f4ead2", accentColor: "#273841", boneId: "skeleton-left-arm", zIndex: 20, inferred: true }),
      piece("skeleton-right-forearm", "Right inferred forearm", "forearm", "right-shoulder", { side: "right", color: "#f4ead2", accentColor: "#273841", boneId: "skeleton-right-arm", zIndex: 20, inferred: true })
    ]
  }
];

const anchorIds = new Set(TRACKING_ANCHORS.map((anchor) => anchor.id));
const jointIds = new Set<EffectRigBone["joint"]>(["fixed", "hinge", "ball", "spring"]);

function finite(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeBone(candidate: EffectRigBone, fallbackAnchor: TrackingAnchorPoint = "nose"): EffectRigBone | null {
  if (!candidate || typeof candidate.id !== "string" || !candidate.id.trim()) return null;
  return {
    id: candidate.id.trim(),
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : "Rig bone",
    parentId: typeof candidate.parentId === "string" && candidate.parentId.trim() && candidate.parentId !== candidate.id ? candidate.parentId.trim() : undefined,
    joint: jointIds.has(candidate.joint) ? candidate.joint : "spring",
    anchor: anchorIds.has(candidate.anchor) ? candidate.anchor : fallbackAnchor,
    weight: finite(candidate.weight, 1, 0, 1),
    springiness: finite(candidate.springiness, 0.42, 0, 1),
    damping: finite(candidate.damping, 0.68, 0, 1)
  };
}

function normalizeCostume(candidate: CostumeDefinition | null | undefined): CostumeDefinition | null {
  if (!candidate || typeof candidate.id !== "string" || !candidate.id.trim()) return null;
  const now = candidate.updatedAt || candidate.createdAt || EFFECT_STUDIO_SEED_TIMESTAMP;
  const bones = (Array.isArray(candidate.bones) ? candidate.bones : []).map((item) => normalizeBone(item)).filter((item): item is EffectRigBone => Boolean(item));
  const boneIds = new Set(bones.map((item) => item.id));
  return {
    ...candidate,
    id: candidate.id.trim(),
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : "Untitled costume",
    description: typeof candidate.description === "string" ? candidate.description : "",
    starter: candidate.starter === "teddy" || candidate.starter === "skeleton" ? candidate.starter : undefined,
    createdAt: candidate.createdAt || now,
    updatedAt: now,
    bones,
    pieces: (Array.isArray(candidate.pieces) ? candidate.pieces : []).filter((item) => item && typeof item.id === "string" && item.id.trim()).map((item) => ({
      ...item,
      id: item.id.trim(),
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Costume piece",
      anchor: anchorIds.has(item.anchor) ? item.anchor : "nose",
      boneId: item.boneId && boneIds.has(item.boneId) ? item.boneId : undefined,
      color: /^#[0-9a-f]{6}$/i.test(item.color ?? "") ? item.color : "#b67843",
      accentColor: item.accentColor && /^#[0-9a-f]{6}$/i.test(item.accentColor) ? item.accentColor : undefined,
      x: finite(item.x, 0, -2, 2),
      y: finite(item.y, 0, -2, 2),
      scale: finite(item.scale, 1, 0.1, 4),
      rotation: finite(item.rotation, 0, -180, 180),
      zIndex: Math.round(finite(item.zIndex, 10, -100, 100)),
      visible: item.visible !== false,
      inferred: Boolean(item.inferred)
    }))
  };
}

function normalizeCalibrationProfile(candidate: TrackingCalibrationProfile, users: LanternUser[]): TrackingCalibrationProfile | null {
  if (!candidate || typeof candidate.id !== "string" || !candidate.id.trim() || typeof candidate.userId !== "string" || !candidate.userId.trim()) return null;
  const knownUser = users.some((user) => user.id === candidate.userId);
  if (!knownUser && users.length) return null;
  const deviceId = typeof candidate.deviceId === "string" && candidate.deviceId.trim() ? candidate.deviceId.trim() : "default-camera";
  const updatedAt = candidate.updatedAt || candidate.createdAt || EFFECT_STUDIO_SEED_TIMESTAMP;
  const normalizeOffsets = (offsets: TrackingCalibrationProfile["landmarkOffsets"]) => Object.fromEntries(Object.entries(offsets ?? {}).filter(([id]) => anchorIds.has(id as TrackingAnchorPoint)).map(([id, offset]) => [id, {
    x: finite(offset?.x, 0, -0.35, 0.35),
    y: finite(offset?.y, 0, -0.35, 0.35),
    updatedAt: offset?.updatedAt || updatedAt
  }])) as TrackingCalibrationProfile["landmarkOffsets"];
  const poseSamples = Object.fromEntries(Object.entries(candidate.poseSamples ?? {}).filter(([pose]) => CALIBRATION_POSES.some((item) => item.id === pose)).map(([pose, sample]) => [pose, {
    pose: pose as CalibrationPose,
    completedAt: sample?.completedAt || updatedAt,
    offsets: normalizeOffsets(sample?.offsets ?? {})
  }])) as TrackingCalibrationProfile["poseSamples"];
  return {
    id: candidate.id.trim(),
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : "Camera calibration",
    userId: candidate.userId.trim(),
    deviceId,
    createdAt: candidate.createdAt || updatedAt,
    updatedAt,
    landmarkOffsets: normalizeOffsets(candidate.landmarkOffsets),
    poseSamples
  };
}

export function userDeviceCalibrationKey(userId: string, deviceId?: string) {
  return `${userId || "local-user"}::${deviceId || "default-camera"}`;
}

export function createCalibrationProfile(userId: string, deviceId?: string, name = "Camera calibration", now = new Date().toISOString()): TrackingCalibrationProfile {
  const resolvedDeviceId = deviceId || "default-camera";
  return {
    id: `calibration-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    userId,
    deviceId: resolvedDeviceId,
    createdAt: now,
    updatedAt: now,
    landmarkOffsets: {},
    poseSamples: {}
  };
}

export function normalizeEffectStudioState(
  incoming: EffectStudioState | null | undefined,
  users: LanternUser[],
  seedStarters: boolean
): EffectStudioState {
  const normalizedCostumes = (Array.isArray(incoming?.costumes) ? incoming.costumes : [])
    .map(normalizeCostume)
    .filter((item): item is CostumeDefinition => Boolean(item));
  const costumeIds = new Set(normalizedCostumes.map((costume) => costume.id));
  if (seedStarters || !incoming) {
    seededCostumes.forEach((seed) => {
      if (!costumeIds.has(seed.id)) {
        const normalizedSeed = normalizeCostume(structuredClone(seed));
        if (normalizedSeed) {
          normalizedCostumes.push(normalizedSeed);
          costumeIds.add(seed.id);
        }
      }
    });
  }
  const calibrationProfiles = (Array.isArray(incoming?.calibrationProfiles) ? incoming.calibrationProfiles : [])
    .map((profile) => normalizeCalibrationProfile(profile, users))
    .filter((profile): profile is TrackingCalibrationProfile => Boolean(profile));
  const profileIds = new Set(calibrationProfiles.map((profile) => profile.id));
  const activeCalibrationByUserDevice = Object.fromEntries(
    Object.entries(incoming?.activeCalibrationByUserDevice ?? {}).filter(([, profileId]) => profileIds.has(profileId))
  );
  return { costumes: normalizedCostumes, calibrationProfiles, activeCalibrationByUserDevice };
}

export function normalizePhase4LiveEffects(
  incoming: Partial<LiveEffectsSettings> | null | undefined,
  defaults: LiveEffectsSettings,
  studio?: EffectStudioState
): LiveEffectsSettings {
  const effects: LiveEffectsSettings = { ...defaults, ...incoming };
  effects.hatEnabled = incoming?.hatEnabled ?? incoming?.partyHatEnabled ?? false;
  effects.hatStyle = incoming?.hatStyle ?? (incoming?.partyHatEnabled ? "party" : defaults.hatStyle ?? "party");
  effects.glassesStyle = incoming?.glassesStyle ?? defaults.glassesStyle ?? "classic";
  effects.wizardSpringiness = finite(incoming?.wizardSpringiness, defaults.wizardSpringiness ?? .56, 0, 1);
  effects.wizardDamping = finite(incoming?.wizardDamping, defaults.wizardDamping ?? .7, 0, 1);
  effects.trackedPointsOverlay = incoming?.trackedPointsOverlay ?? incoming?.trackingDebug ?? false;
  effects.trackingDebug = effects.trackedPointsOverlay;
  effects.trackingCameraUnderlay = incoming?.trackingCameraUnderlay ?? true;
  if (studio) {
    const activeCostumeExists = studio.costumes.some((costume) => costume.id === effects.costumeId);
    if (!activeCostumeExists) {
      effects.costumeId = studio.costumes[0]?.id;
      effects.costumeEnabled = false;
    }
    if (effects.calibrationProfileId && !studio.calibrationProfiles.some((profile) => profile.id === effects.calibrationProfileId)) {
      effects.calibrationProfileId = undefined;
    }
  }
  return effects;
}

export function resolveCalibrationProfile(
  studio: EffectStudioState,
  userId: string,
  deviceId?: string,
  explicitProfileId?: string
) {
  const resolvedDeviceId = deviceId || "default-camera";
  const explicit = studio.calibrationProfiles.find((profile) => profile.id === explicitProfileId && profile.userId === userId && profile.deviceId === resolvedDeviceId);
  if (explicit) return explicit;
  const profileId = studio.activeCalibrationByUserDevice[userDeviceCalibrationKey(userId, resolvedDeviceId)];
  return studio.calibrationProfiles.find((profile) => profile.id === profileId && profile.userId === userId && profile.deviceId === resolvedDeviceId);
}

export function duplicateCostume(source: CostumeDefinition, name = `${source.name} Copy`, now = new Date().toISOString()): CostumeDefinition {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const boneIds = new Map(source.bones.map((item) => [item.id, `${item.id}-${suffix}`]));
  return {
    ...structuredClone(source),
    id: `costume-${suffix}`,
    name,
    starter: undefined,
    createdAt: now,
    updatedAt: now,
    bones: source.bones.map((item) => ({ ...item, id: boneIds.get(item.id)!, parentId: item.parentId ? boneIds.get(item.parentId) : undefined })),
    pieces: source.pieces.map((item) => ({ ...item, id: `${item.id}-${suffix}`, boneId: item.boneId ? boneIds.get(item.boneId) : undefined }))
  };
}

export function parseImportedCostume(value: unknown): CostumeDefinition | null {
  const candidate = value && typeof value === "object" && "costume" in value
    ? (value as { costume?: CostumeDefinition }).costume
    : value as CostumeDefinition;
  const normalized = normalizeCostume(candidate);
  if (!normalized) return null;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return { ...normalized, id: `costume-imported-${suffix}`, starter: undefined, name: `${normalized.name} (Imported)`, updatedAt: new Date().toISOString() };
}
