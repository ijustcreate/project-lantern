/**
 * Pure tracking-domain helpers shared by the live renderer and costume studio.
 * Points remain normalized (0..1) so renderers can target any output size.
 */

export interface TrackingPoint {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
}

export interface TrackingCategory {
  categoryName?: string;
  displayName?: string;
  score?: number;
}

export interface FingerPose {
  extension: number;
  direction: "up" | "down" | "side";
}

export interface TrackedHandFrame {
  side: "left" | "right" | "unknown";
  landmarks: TrackingPoint[];
  palm: TrackingPoint;
  fingertips: TrackingPoint[];
  fingers: {
    thumb: FingerPose;
    index: FingerPose;
    middle: FingerPose;
    ring: FingerPose;
    pinky: FingerPose;
  };
  fingerCount: number;
  gesture: "fist" | "one" | "two" | "three" | "four" | "open-palm" | "waving" | "partial";
  /** MediaPipe handedness score. Undefined when the tracker does not report one. */
  confidence?: number;
}

export interface TrackedArmFrame {
  shoulder: TrackingPoint;
  elbow?: TrackingPoint;
  hand?: TrackingPoint;
  direction: { x: number; y: number };
  inferred: boolean;
  /** Minimum of the actual source visibility/handedness scores used. */
  confidence?: number;
}

export interface TrackedBodyFrame {
  leftShoulder?: TrackingPoint;
  rightShoulder?: TrackingPoint;
  neck?: TrackingPoint;
  leftArm?: TrackedArmFrame;
  rightArm?: TrackedArmFrame;
}

export interface ExperimentalMouthRegion {
  confidence: number;
  pixelShare: number;
}

export interface ExperimentalMouthDetail {
  method: "experimental-color-contrast-v1";
  status: "detected" | "low-confidence" | "not-evaluated";
  teeth?: ExperimentalMouthRegion;
  tongue?: ExperimentalMouthRegion;
  deepMouth?: ExperimentalMouthRegion;
}

export interface TrackingExtensionAnchors {
  /** Face-mesh estimates; the current task does not expose per-anchor confidence. */
  leftEar?: TrackingPoint;
  rightEar?: TrackingPoint;
  headLeft?: TrackingPoint;
  headRight?: TrackingPoint;
  headTop?: TrackingPoint;
  chin?: TrackingPoint;
  neck?: TrackingPoint;
  experimentalMouth?: ExperimentalMouthDetail;
  /** Reserved for a future rear-head model; intentionally absent today. */
  backOfHead?: TrackingPoint;
}

export interface TrackedFaceFrame {
  landmarks: TrackingPoint[];
  leftEyeOpen: number;
  rightEyeOpen: number;
  /** FaceLandmarker does not expose a face-level confidence value. */
  confidence?: number;
  held: boolean;
}

export interface TrackingRenderFrame {
  nowMs: number;
  width: number;
  height: number;
  face?: TrackedFaceFrame;
  hands: TrackedHandFrame[];
  body?: TrackedBodyFrame;
  extensionAnchors: TrackingExtensionAnchors;
}

export type TrackingOverlayRenderer = (context: CanvasRenderingContext2D, frame: TrackingRenderFrame) => void;

export type TrackingRuntimePhase = "idle" | "warming" | "detecting" | "tracking" | "degraded" | "error";

export interface TrackingRuntimeStatus {
  phase: TrackingRuntimePhase;
  initializationLatencyMs?: number;
  firstDetectionLatencyMs?: number;
  inferenceLatencyMs?: number;
  renderedFps: number;
  targetFps: 60 | 30;
  adaptiveFps: 60 | 30;
  /** Intentionally undefined until the selected tracker provides a real score. */
  faceConfidence?: number;
  faceAnchorHeld: boolean;
  message?: string;
}

export const TRACKING_PERFORMANCE_TARGETS = Object.freeze({
  /** The handoff's observed activation delay; this is a reported baseline, not a local measurement. */
  reportedBaselineActivationMs: 8_000,
  detectingStatusBudgetMs: 100,
  warmInitializationBudgetMs: 2_500,
  firstDetectionBudgetMs: 3_000,
  sixtyFpsFrameBudgetMs: 1_000 / 60,
  thirtyFpsFrameBudgetMs: 1_000 / 30,
  fallbackInferenceThresholdMs: 20,
  recoveryInferenceThresholdMs: 12
});

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export class TrackingPerformanceMonitor {
  private phase: TrackingRuntimePhase = "warming";
  private readonly activatedAt: number;
  private initializationLatencyMs: number | undefined;
  private firstDetectionLatencyMs: number | undefined;
  private inferenceLatencyMs: number | undefined;
  private renderedFps = 0;
  private adaptiveFps: 60 | 30 = 60;
  private frameWindowStartedAt: number;
  private framesInWindow = 0;
  private stressedWindows = 0;
  private healthyWindows = 0;
  private faceAnchorHeld = false;
  private message: string | undefined;

  constructor(activatedAt: number) {
    this.activatedAt = activatedAt;
    this.frameWindowStartedAt = activatedAt;
  }

  markTrackerReady(nowMs: number) {
    this.initializationLatencyMs ??= Math.max(0, nowMs - this.activatedAt);
    if (this.phase !== "error") this.phase = "detecting";
  }

  markFaceDetected(nowMs: number) {
    this.firstDetectionLatencyMs ??= Math.max(0, nowMs - this.activatedAt);
    if (this.phase !== "error") {
      this.phase = this.adaptiveFps === 30 ? "degraded" : "tracking";
      this.message = this.adaptiveFps === 30 ? "Using a steadier 30 FPS tracking mode" : undefined;
    }
  }

  markFaceLost(message = "Detecting face…") {
    if (this.phase !== "error") this.phase = "detecting";
    this.message = message;
  }

  markDegraded(message: string) {
    if (this.phase !== "error") this.phase = "degraded";
    this.message = message;
  }

  markError(message: string) {
    this.phase = "error";
    this.message = message;
  }

  setFaceAnchorHeld(held: boolean) {
    this.faceAnchorHeld = held;
  }

  recordInference(durationMs: number) {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    this.inferenceLatencyMs = this.inferenceLatencyMs === undefined
      ? durationMs
      : this.inferenceLatencyMs + (durationMs - this.inferenceLatencyMs) * 0.2;
  }

  recordRenderedFrame(nowMs: number) {
    this.framesInWindow += 1;
    const elapsed = nowMs - this.frameWindowStartedAt;
    if (elapsed < 1_000) return;
    this.renderedFps = this.framesInWindow * 1_000 / Math.max(1, elapsed);
    this.framesInWindow = 0;
    this.frameWindowStartedAt = nowMs;
    this.updateAdaptiveCadence();
  }

  getAdaptiveFps() {
    return this.adaptiveFps;
  }

  snapshot(): TrackingRuntimeStatus {
    return {
      phase: this.phase,
      initializationLatencyMs: this.initializationLatencyMs,
      firstDetectionLatencyMs: this.firstDetectionLatencyMs,
      inferenceLatencyMs: this.inferenceLatencyMs,
      renderedFps: this.renderedFps,
      targetFps: 60,
      adaptiveFps: this.adaptiveFps,
      faceAnchorHeld: this.faceAnchorHeld,
      message: this.message
    };
  }

  private updateAdaptiveCadence() {
    const inference = this.inferenceLatencyMs ?? 0;
    if (this.adaptiveFps === 60) {
      const stressed = inference > TRACKING_PERFORMANCE_TARGETS.fallbackInferenceThresholdMs || (this.renderedFps > 0 && this.renderedFps < 45);
      this.stressedWindows = stressed ? this.stressedWindows + 1 : 0;
      this.healthyWindows = 0;
      if (this.stressedWindows >= 2) {
        this.adaptiveFps = 30;
        this.stressedWindows = 0;
        if (this.phase === "tracking") this.phase = "degraded";
        this.message = "Using a steadier 30 FPS tracking mode";
      }
      return;
    }

    const healthy = inference > 0 && inference < TRACKING_PERFORMANCE_TARGETS.recoveryInferenceThresholdMs;
    this.healthyWindows = healthy ? this.healthyWindows + 1 : 0;
    if (this.healthyWindows >= 6) {
      this.adaptiveFps = 60;
      this.healthyWindows = 0;
      if (this.phase === "degraded") this.phase = "tracking";
      this.message = undefined;
    }
  }
}

export function shouldRenderTrackingFrame(nowMs: number, previousFrameAt: number, targetFps: 60 | 30) {
  return nowMs - previousFrameAt >= (1_000 / targetFps) - 1;
}

export function smoothTrackingPoints(previous: TrackingPoint[] | null, detected: TrackingPoint[], responseScale = 1) {
  if (!previous || previous.length !== detected.length) return detected.map((landmark) => ({ ...landmark }));
  return detected.map((landmark, index) => {
    const old = previous[index];
    const movement = Math.hypot(landmark.x - old.x, landmark.y - old.y);
    const response = Math.max(0.34, Math.min(0.9, (0.4 + movement * 13) * responseScale));
    return {
      ...landmark,
      x: old.x + (landmark.x - old.x) * response,
      y: old.y + (landmark.y - old.y) * response,
      z: old.z + (landmark.z - old.z) * response
    };
  });
}

export function landmarkMotion(previous: TrackingPoint[] | null, detected: TrackingPoint[]) {
  if (!previous || previous.length !== detected.length) return 0;
  const sample = [1, 10, 33, 152, 263].filter((index) => detected[index] && previous[index]);
  if (!sample.length) return 0;
  return sample.reduce((total, index) => total + Math.hypot(detected[index].x - previous[index].x, detected[index].y - previous[index].y), 0) / sample.length;
}

export function translateTrackingPoints(points: TrackingPoint[], deltaX: number, deltaY: number, response = 0.35) {
  return points.map((point) => ({ ...point, x: point.x + deltaX * response, y: point.y + deltaY * response }));
}

export function deriveEyeOpenness(
  landmarks: TrackingPoint[],
  blendshapes: TrackingCategory[] | undefined,
  previous?: { leftEyeOpen: number; rightEyeOpen: number }
) {
  const categoryScore = (name: string) => blendshapes?.find((category) => (category.categoryName || category.displayName) === name)?.score;
  const leftBlink = categoryScore("eyeBlinkLeft");
  const rightBlink = categoryScore("eyeBlinkRight");
  const detected = {
    leftEyeOpen: leftBlink === undefined ? eyeAspectOpenness(landmarks, [33, 160, 158, 133, 153, 144]) : clamp01(1 - leftBlink),
    rightEyeOpen: rightBlink === undefined ? eyeAspectOpenness(landmarks, [362, 385, 387, 263, 373, 380]) : clamp01(1 - rightBlink)
  };
  if (!previous) return detected;
  // Smooth each eyelid independently so a wink never destabilizes the other eye or face anchor.
  return {
    leftEyeOpen: previous.leftEyeOpen + (detected.leftEyeOpen - previous.leftEyeOpen) * (detected.leftEyeOpen < previous.leftEyeOpen ? 0.78 : 0.48),
    rightEyeOpen: previous.rightEyeOpen + (detected.rightEyeOpen - previous.rightEyeOpen) * (detected.rightEyeOpen < previous.rightEyeOpen ? 0.78 : 0.48)
  };
}

export function makeTrackingRenderFrame({
  nowMs,
  width,
  height,
  faceLandmarks,
  eyeState,
  faceHeld,
  hands,
  poseLandmarks,
  experimentalMouth
}: {
  nowMs: number;
  width: number;
  height: number;
  faceLandmarks: TrackingPoint[] | null;
  eyeState: { leftEyeOpen: number; rightEyeOpen: number };
  faceHeld: boolean;
  hands: TrackedHandFrame[];
  poseLandmarks: TrackingPoint[] | null;
  experimentalMouth?: ExperimentalMouthDetail;
}): TrackingRenderFrame {
  const body = deriveBodyFrame(poseLandmarks, hands);
  return {
    nowMs,
    width,
    height,
    face: faceLandmarks ? {
      landmarks: faceLandmarks,
      leftEyeOpen: eyeState.leftEyeOpen,
      rightEyeOpen: eyeState.rightEyeOpen,
      held: faceHeld
    } : undefined,
    hands,
    body,
    extensionAnchors: {
      ...(faceLandmarks ? deriveFaceExtensionAnchors(faceLandmarks) : {}),
      neck: body?.neck,
      experimentalMouth
    }
  };
}

export function deriveTrackedHands(landmarkSets: TrackingPoint[][], handedness: TrackingCategory[][] = []) {
  return landmarkSets.map((landmarks, index): TrackedHandFrame => {
    const category = handedness[index]?.[0];
    const sideName = (category?.categoryName || category?.displayName || "").toLowerCase();
    const side: TrackedHandFrame["side"] = sideName.includes("left") ? "left" : sideName.includes("right") ? "right" : "unknown";
    const fingers = {
      thumb: fingerPose(landmarks, 2, 3, 4),
      index: fingerPose(landmarks, 6, 7, 8),
      middle: fingerPose(landmarks, 10, 11, 12),
      ring: fingerPose(landmarks, 14, 15, 16),
      pinky: fingerPose(landmarks, 18, 19, 20)
    };
    const fingerCount = Object.values(fingers).filter((finger) => finger.extension >= 0.58).length;
    return {
      side,
      landmarks,
      palm: averagePoint([landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]].filter(Boolean)),
      fingertips: [4, 8, 12, 16, 20].map((pointIndex) => landmarks[pointIndex]).filter(Boolean),
      fingers,
      fingerCount,
      gesture: fingerCount === 0 ? "fist" : fingerCount === 5 ? "open-palm" : fingerCount >= 1 && fingerCount <= 4 ? (["one", "two", "three", "four"] as const)[fingerCount - 1] : "partial",
      confidence: finiteConfidence(category?.score)
    };
  });
}

export class HandMotionTracker {
  private readonly histories = new Map<string, Array<{ at: number; x: number; direction: number }>>();

  update(hands: TrackedHandFrame[], nowMs: number) {
    return hands.map((hand, index) => {
      const key = hand.side === "unknown" ? `unknown-${index}` : hand.side;
      const history = (this.histories.get(key) ?? []).filter((sample) => nowMs - sample.at <= 900);
      const prior = history.length ? history[history.length - 1] : undefined;
      const delta = prior ? hand.palm.x - prior.x : 0;
      const direction = Math.abs(delta) >= 0.008 ? Math.sign(delta) : prior?.direction ?? 0;
      history.push({ at: nowMs, x: hand.palm.x, direction });
      this.histories.set(key, history);
      const directionChanges = history.reduce((count, sample, sampleIndex) => sampleIndex > 0 && sample.direction && history[sampleIndex - 1].direction && sample.direction !== history[sampleIndex - 1].direction ? count + 1 : count, 0);
      const travel = history.length > 1 ? Math.max(...history.map((sample) => sample.x)) - Math.min(...history.map((sample) => sample.x)) : 0;
      return directionChanges >= 2 && travel >= 0.07 && hand.fingerCount >= 3 ? { ...hand, gesture: "waving" as const } : hand;
    });
  }
}

export function faceOcclusionConfidence(hands: TrackedHandFrame[], faceLandmarks: TrackingPoint[] | null) {
  if (!faceLandmarks) return 0;
  const bounds = faceBounds(faceLandmarks);
  if (!bounds) return 0;
  const marginX = (bounds.right - bounds.left) * 0.08;
  const marginY = (bounds.bottom - bounds.top) * 0.08;
  let best = 0;
  hands.forEach((hand) => {
    const inside = hand.landmarks.filter((landmark) => landmark.x >= bounds.left - marginX && landmark.x <= bounds.right + marginX && landmark.y >= bounds.top - marginY && landmark.y <= bounds.bottom + marginY).length;
    const overlap = inside / Math.max(1, hand.landmarks.length);
    if (overlap >= 0.18) best = Math.max(best, overlap * (hand.confidence ?? 0.55));
  });
  return clamp01(best);
}

export function shouldHoldFaceAnchors({
  nowMs,
  lastFaceSeenAt,
  lastOcclusionAt,
  occlusionConfidence,
  faceMotion,
  poseHeadMotion
}: {
  nowMs: number;
  lastFaceSeenAt: number;
  lastOcclusionAt: number;
  occlusionConfidence: number;
  faceMotion: number;
  poseHeadMotion: number;
}) {
  const missingFor = nowMs - lastFaceSeenAt;
  // Preserve a tiny general dropout grace period. Longer holds require recent,
  // actually observed hand overlap and a head that remained nearly stationary.
  if (missingFor <= 100) return true;
  if (faceMotion > 0.03 || poseHeadMotion > 0.04 || nowMs - lastOcclusionAt > 150 || occlusionConfidence <= 0) return false;
  const confidenceWindow = 140 + clamp01(occlusionConfidence) * 300;
  return missingFor <= confidenceWindow;
}

export function deriveBodyFrame(pose: TrackingPoint[] | null, hands: TrackedHandFrame[]): TrackedBodyFrame | undefined {
  if (!pose?.length) return undefined;
  const leftShoulder = visiblePoint(pose[11]);
  const rightShoulder = visiblePoint(pose[12]);
  if (!leftShoulder && !rightShoulder) return undefined;
  const leftHand = hands.find((hand) => hand.side === "left");
  const rightHand = hands.find((hand) => hand.side === "right");
  return {
    leftShoulder,
    rightShoulder,
    neck: leftShoulder && rightShoulder ? averagePoint([leftShoulder, rightShoulder]) : leftShoulder ?? rightShoulder,
    leftArm: leftShoulder ? deriveArm(leftShoulder, visiblePoint(pose[13]), visiblePoint(pose[15]), leftHand) : undefined,
    rightArm: rightShoulder ? deriveArm(rightShoulder, visiblePoint(pose[14]), visiblePoint(pose[16]), rightHand) : undefined
  };
}

export function analyzeExperimentalMouth(pixels: { data: Uint8ClampedArray; width: number; height: number }, landmarks: TrackingPoint[]): ExperimentalMouthDetail {
  const upper = landmarks[13];
  const lower = landmarks[14];
  const left = landmarks[61];
  const right = landmarks[291];
  if (!upper || !lower || !left || !right) return { method: "experimental-color-contrast-v1", status: "not-evaluated" };
  const mouthWidth = Math.max(0.001, Math.hypot(right.x - left.x, right.y - left.y));
  const openness = Math.hypot(lower.x - upper.x, lower.y - upper.y) / mouthWidth;
  if (openness < 0.16) return { method: "experimental-color-contrast-v1", status: "not-evaluated" };

  const minX = Math.max(0, Math.floor(Math.min(left.x, right.x) * pixels.width));
  const maxX = Math.min(pixels.width - 1, Math.ceil(Math.max(left.x, right.x) * pixels.width));
  const centerY = (upper.y + lower.y) / 2;
  const halfHeight = Math.max(2 / pixels.height, Math.abs(lower.y - upper.y) * 0.8);
  const minY = Math.max(0, Math.floor((centerY - halfHeight) * pixels.height));
  const maxY = Math.min(pixels.height - 1, Math.ceil((centerY + halfHeight) * pixels.height));
  let sampled = 0;
  let teeth = 0;
  let tongue = 0;
  let deep = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const offset = (y * pixels.width + x) * 4;
      const red = pixels.data[offset] / 255;
      const green = pixels.data[offset + 1] / 255;
      const blue = pixels.data[offset + 2] / 255;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const saturation = max <= 0 ? 0 : (max - min) / max;
      if (luminance > 0.68 && saturation < 0.24) teeth += 1;
      if (red > green * 1.15 && red > blue * 1.08 && luminance > 0.22 && luminance < 0.68) tongue += 1;
      if (luminance < 0.16) deep += 1;
      sampled += 1;
    }
  }
  if (!sampled) return { method: "experimental-color-contrast-v1", status: "not-evaluated" };

  const evidence = (count: number, start: number, span: number): ExperimentalMouthRegion | undefined => {
    const pixelShare = count / sampled;
    const confidence = clamp01((pixelShare - start) / span) * clamp01((openness - 0.12) / 0.28);
    return confidence >= 0.55 ? { confidence, pixelShare } : undefined;
  };
  const detail: ExperimentalMouthDetail = {
    method: "experimental-color-contrast-v1",
    status: "low-confidence",
    teeth: evidence(teeth, 0.02, 0.12),
    tongue: evidence(tongue, 0.025, 0.16),
    deepMouth: evidence(deep, 0.08, 0.3)
  };
  if (detail.teeth || detail.tongue || detail.deepMouth) detail.status = "detected";
  return detail;
}

function eyeAspectOpenness(landmarks: TrackingPoint[], indices: [number, number, number, number, number, number]) {
  const [outer, topOuter, topInner, inner, bottomInner, bottomOuter] = indices.map((index) => landmarks[index]);
  if (!outer || !topOuter || !topInner || !inner || !bottomInner || !bottomOuter) return 1;
  const horizontal = Math.max(0.001, distance(outer, inner));
  const vertical = (distance(topOuter, bottomOuter) + distance(topInner, bottomInner)) / 2;
  return clamp01((vertical / horizontal - 0.08) / 0.2);
}

function fingerPose(landmarks: TrackingPoint[], proximalIndex: number, jointIndex: number, tipIndex: number): FingerPose {
  const proximal = landmarks[proximalIndex];
  const joint = landmarks[jointIndex];
  const tip = landmarks[tipIndex];
  if (!proximal || !joint || !tip) return { extension: 0, direction: "side" };
  const first = { x: proximal.x - joint.x, y: proximal.y - joint.y };
  const second = { x: tip.x - joint.x, y: tip.y - joint.y };
  const denominator = Math.max(0.000001, Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y));
  const angle = Math.acos(Math.max(-1, Math.min(1, (first.x * second.x + first.y * second.y) / denominator))) * 180 / Math.PI;
  const extension = clamp01((angle - 80) / 95);
  const verticalDelta = tip.y - joint.y;
  return { extension, direction: verticalDelta < -0.018 ? "up" : verticalDelta > 0.018 ? "down" : "side" };
}

function deriveFaceExtensionAnchors(landmarks: TrackingPoint[]): TrackingExtensionAnchors {
  return {
    leftEar: averagePoint([93, 127, 132, 234].map((index) => landmarks[index]).filter(Boolean)),
    rightEar: averagePoint([323, 356, 361, 454].map((index) => landmarks[index]).filter(Boolean)),
    headLeft: landmarks[234],
    headRight: landmarks[454],
    headTop: landmarks[10],
    chin: landmarks[152]
  };
}

function deriveArm(shoulder: TrackingPoint, elbow: TrackingPoint | undefined, wrist: TrackingPoint | undefined, trackedHand: TrackedHandFrame | undefined): TrackedArmFrame | undefined {
  const destination = wrist ?? trackedHand?.palm;
  if (!destination && !elbow) return undefined;
  const target = destination ?? elbow!;
  const length = Math.max(0.0001, distance(shoulder, target));
  const confidenceValues = [finiteConfidence(shoulder.visibility), finiteConfidence(elbow?.visibility), finiteConfidence(wrist?.visibility), trackedHand?.confidence].filter((value): value is number => value !== undefined);
  return {
    shoulder,
    elbow,
    hand: destination,
    direction: { x: (target.x - shoulder.x) / length, y: (target.y - shoulder.y) / length },
    inferred: !elbow || !wrist,
    confidence: confidenceValues.length ? Math.min(...confidenceValues) : undefined
  };
}

function visiblePoint(point: TrackingPoint | undefined, minimum = 0.35) {
  if (!point) return undefined;
  const confidence = point.visibility ?? point.presence;
  return confidence === undefined || confidence >= minimum ? point : undefined;
}

function faceBounds(landmarks: TrackingPoint[]) {
  const edge = [10, 152, 234, 454].map((index) => landmarks[index]).filter(Boolean);
  if (edge.length < 4) return undefined;
  return {
    left: Math.min(...edge.map((point) => point.x)),
    right: Math.max(...edge.map((point) => point.x)),
    top: Math.min(...edge.map((point) => point.y)),
    bottom: Math.max(...edge.map((point) => point.y))
  };
}

function averagePoint(points: TrackingPoint[]): TrackingPoint {
  if (!points.length) return { x: 0, y: 0, z: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length
  };
}

function distance(left: TrackingPoint, right: TrackingPoint) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function finiteConfidence(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) ? clamp01(value) : undefined;
}
