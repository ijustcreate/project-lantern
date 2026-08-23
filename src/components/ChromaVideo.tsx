import { useEffect, useRef, useState } from "react";
import type { FaceLandmarker, HandLandmarker, ImageSegmenter, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { ChromaKeySettings, ImageCrop, LiveEffectsSettings } from "../types";
import {
  HandMotionTracker,
  TrackingPerformanceMonitor,
  analyzeExperimentalMouth,
  deriveEyeOpenness,
  deriveTrackedHands,
  faceOcclusionConfidence,
  landmarkMotion,
  makeTrackingRenderFrame,
  shouldHoldFaceAnchors,
  shouldRenderTrackingFrame,
  smoothTrackingPoints,
  translateTrackingPoints,
  type ExperimentalMouthDetail,
  type TrackingOverlayRenderer,
  type TrackingPoint,
  type TrackingRenderFrame,
  type TrackingRuntimePhase,
  type TrackingRuntimeStatus
} from "../trackingRuntime";
import { createWizardHatRig, drawTrackedGlasses, drawTrackedHandProp, drawTrackedHat } from "../trackingEffects";
import { getVisionFileset, getVisionModule, visionBaseOptions, warmVisionResources } from "../visionResources";

export interface ChromaVideoProps {
  stream: MediaStream | null;
  chromaKey: ChromaKeySettings;
  effects: LiveEffectsSettings;
  crop: ImageCrop;
  fitMode?: "fit" | "fill";
  className?: string;
  onTrackingStatus?: (status: TrackingRuntimeStatus) => void;
  /** Exposes the exact rendered media surface for a texture-backed preview. */
  onMediaSurfaceChange?: (surface: HTMLCanvasElement | HTMLVideoElement | null) => void;
  /** Costume/effect-studio hook. Receives normalized landmarks after stabilization. */
  renderTrackedOverlay?: TrackingOverlayRenderer;
}

interface PointTransform {
  width: number;
  height: number;
}

type RuntimeEffectsSettings = LiveEffectsSettings & {
  glassesStyle?: "classic" | "playful";
  hatEnabled?: boolean;
  hatStyle?: "party" | "wizard";
  wizardSpringiness?: number;
  wizardDamping?: number;
  trackedPointsOverlay?: boolean;
  trackingCameraUnderlay?: boolean;
  costumeEnabled?: boolean;
};

const OUTPUT_WIDTH = 640;
const OUTPUT_HEIGHT = 360;
// A little more source detail helps the selfie model preserve thin fingers and
// hair. Keep the working canvas small enough that segmentation remains realtime.
const INFERENCE_WIDTH = 320;
const INFERENCE_HEIGHT = 180;
const SEGMENT_INTERVAL_MS = 1000 / 10;
const BODY_INTERVAL_MS = 1000 / 15;
const MOUTH_ANALYSIS_INTERVAL_MS = 1000 / 10;
const STABLE_FACE_INTERVAL_MS = 1000 / 12;
const IDLE_FACE_SCAN_INTERVAL_MS = 850;
const STABLE_BODY_INTERVAL_MS = 1000 / 4;
const IDLE_BODY_SCAN_INTERVAL_MS = 1_500;

function hexRgb(value: string) {
  const hex = value.replace("#", "");
  const normalized = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
}

function drawScreenlessGradient(context: CanvasRenderingContext2D, width: number, height: number, start: string, end: string) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, start);
  gradient.addColorStop(1, end);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

export function ChromaVideo({ stream, chromaKey, effects, crop, fitMode = "fill", className, onTrackingStatus, onMediaSurfaceChange, renderTrackedOverlay }: ChromaVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const settingsRef = useRef({ chromaKey, effects, crop });
  const replacementImageRef = useRef<HTMLImageElement | null>(null);
  const trackingStatusCallbackRef = useRef(onTrackingStatus);
  const trackedOverlayRendererRef = useRef(renderTrackedOverlay);
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [trackingPhase, setTrackingPhase] = useState<TrackingRuntimePhase>("idle");
  settingsRef.current = { chromaKey, effects, crop };
  trackingStatusCallbackRef.current = onTrackingStatus;
  trackedOverlayRendererRef.current = renderTrackedOverlay;

  const runtimeEffects = effects as RuntimeEffectsSettings;
  const chromaActive = chromaKey.enabled;
  const aiBackgroundActive = !chromaActive && effects.background !== "original";
  const faceEffectsActive = effects.faceTracking || Boolean(runtimeEffects.costumeEnabled);
  // Ordinary hats and glasses need only a face mesh. Hand/pose inference is
  // opt-in for costumes and the diagnostic overlay, avoiding a three-model
  // CPU workload that can collapse a camera preview to single-digit FPS.
  const bodyTrackingRequested = Boolean(runtimeEffects.costumeEnabled || (runtimeEffects.handProp && runtimeEffects.handProp !== "none") || runtimeEffects.trackedPointsOverlay || effects.trackingDebug);
  const cropStyle = {
    objectFit: fitMode === "fit" ? "contain" as const : "cover" as const,
    transform: `translate(${-crop.x * crop.scale}%, ${-crop.y * crop.scale}%) scale(${crop.scale})`,
    transformOrigin: "center"
  };
  const processingActive = chromaActive || aiBackgroundActive || faceEffectsActive;

  useEffect(() => {
    const surface = processingActive ? canvasRef.current : videoRef.current;
    onMediaSurfaceChange?.(surface);
    return () => onMediaSurfaceChange?.(null);
  }, [onMediaSurfaceChange, processingActive]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) {
      const play = () => void video.play().catch(() => undefined);
      video.addEventListener("loadedmetadata", play, { once: true });
      play();
      return () => {
        video.removeEventListener("loadedmetadata", play);
        video.srcObject = null;
      };
    }
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    if (!stream || faceEffectsActive) return;
    // Warm the module, WASM, and face model after camera startup. This uses the
    // browser HTTP cache and never blocks the normal camera preview.
    const timer = window.setTimeout(() => void warmVisionResources(["face"]), 700);
    return () => window.clearTimeout(timer);
  }, [stream, faceEffectsActive]);

  useEffect(() => {
    if (!effects.backgroundImage) {
      replacementImageRef.current = null;
      return;
    }
    const image = new Image();
    image.decoding = "async";
    image.src = effects.backgroundImage;
    replacementImageRef.current = image;
    return () => {
      if (replacementImageRef.current === image) replacementImageRef.current = null;
    };
  }, [effects.backgroundImage]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!processingActive || !video || !canvas) {
      setTrackingPhase("idle");
      trackingStatusCallbackRef.current?.({ phase: "idle", renderedFps: 0, targetFps: 60, adaptiveFps: 60, faceAnchorHeld: false });
      return;
    }
    setAiStatus(aiBackgroundActive ? "loading" : "idle");
    if (faceEffectsActive) setTrackingPhase("detecting");

    // This canvas is also sampled by the 3D board texture. Explicit alpha is
    // essential: the "Remove" result must leave the donor board visible.
    const context = canvas.getContext("2d", { alpha: true });
    const source = document.createElement("canvas");
    source.width = OUTPUT_WIDTH;
    source.height = OUTPUT_HEIGHT;
    const sourceContext = source.getContext("2d", chromaActive ? { willReadFrequently: true } : undefined);

    const inference = document.createElement("canvas");
    inference.width = INFERENCE_WIDTH;
    inference.height = INFERENCE_HEIGHT;
    const inferenceContext = inference.getContext("2d", { willReadFrequently: true });

    const foreground = document.createElement("canvas");
    foreground.width = OUTPUT_WIDTH;
    foreground.height = OUTPUT_HEIGHT;
    const foregroundContext = foreground.getContext("2d");

    const maskCanvas = document.createElement("canvas");
    const maskContext = maskCanvas.getContext("2d");
    if (!context || !sourceContext || !inferenceContext || !foregroundContext || !maskContext) return;

    let animationFrame = 0;
    let disposed = false;
    let segmenter: ImageSegmenter | null = null;
    let faceLandmarker: FaceLandmarker | null = null;
    let handLandmarker: HandLandmarker | null = null;
    let poseLandmarker: PoseLandmarker | null = null;
    let personMaskIndex = 15;
    let maskReady = false;
    let smoothedMask: Float32Array | null = null;
    let landmarks: TrackingPoint[] | null = null;
    let poseLandmarks: TrackingPoint[] | null = null;
    let handLandmarks: TrackingPoint[][] = [];
    let trackedHands = deriveTrackedHands([]);
    let experimentalMouth: ExperimentalMouthDetail | undefined;
    let eyeState = { leftEyeOpen: 1, rightEyeOpen: 1 };
    let faceHeld = false;
    let lastHandsSeenAt = -Infinity;
    let handsWereSeen = false;
    let lastSegmentAt = -Infinity;
    let lastFaceAt = -Infinity;
    let lastBodyAt = -Infinity;
    let lastMouthAnalysisAt = -Infinity;
    let lastFaceSeenAt = -Infinity;
    let lastOcclusionAt = -Infinity;
    let lastOcclusionConfidence = 0;
    let recentFaceMotion = 0;
    let poseHeadMotion = 0;
    let lastPoseNose: TrackingPoint | undefined;
    let poseTranslation = { x: 0, y: 0 };
    let lastRenderedAt = -Infinity;
    let lastVideoTime = -1;
    let lastStatusEmittedAt = -Infinity;
    let lastEmittedPhase: TrackingRuntimePhase | undefined;
    const performanceMonitor = new TrackingPerformanceMonitor(performance.now());
    const handMotionTracker = new HandMotionTracker();
    const wizardHatRig = createWizardHatRig();

    const emitTrackingStatus = (nowMs: number, force = false) => {
      if (!faceEffectsActive) return;
      const status = performanceMonitor.snapshot();
      if (!force && status.phase === lastEmittedPhase && nowMs - lastStatusEmittedAt < 400) return;
      lastStatusEmittedAt = nowMs;
      lastEmittedPhase = status.phase;
      setTrackingPhase(status.phase);
      trackingStatusCallbackRef.current?.(status);
    };
    if (faceEffectsActive) emitTrackingStatus(performance.now(), true);

    const createWithFallback = async <T extends { close: () => void }>(
      kind: "face" | "hand" | "pose" | "segmentation",
      create: (baseOptions: Awaited<ReturnType<typeof visionBaseOptions>>) => Promise<T>
    ) => {
      try {
        return await create(await visionBaseOptions(kind, "GPU"));
      } catch {
        return create(await visionBaseOptions(kind, "CPU"));
      }
    };

    const initializeFaceTracking = async () => {
      if (!faceEffectsActive) return;
      try {
        const [visionModule, vision] = await Promise.all([getVisionModule(), getVisionFileset()]);
        const faceOptions = {
          runningMode: "VIDEO" as const,
          numFaces: 1,
          minFaceDetectionConfidence: 0.4,
          minFacePresenceConfidence: 0.42,
          minTrackingConfidence: 0.45,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false
        };
        const nextFace = await createWithFallback("face", (baseOptions) => visionModule.FaceLandmarker.createFromOptions(vision, { ...faceOptions, baseOptions }));
        if (disposed) {
          nextFace.close();
          return;
        }
        faceLandmarker = nextFace;
        performanceMonitor.markTrackerReady(performance.now());
        emitTrackingStatus(performance.now(), true);

        // Face detection becomes usable first. Hands and pose warm in parallel
        // afterward so occlusion/body support cannot delay the first face.
        const common = { runningMode: "VIDEO" as const, minTrackingConfidence: 0.5 };
        if (!bodyTrackingRequested) return;
        const [handsResult, poseResult] = await Promise.allSettled([
          createWithFallback("hand", (baseOptions) => visionModule.HandLandmarker.createFromOptions(vision, {
            ...common,
            baseOptions,
            numHands: 2,
            minHandDetectionConfidence: 0.48,
            minHandPresenceConfidence: 0.48
          })),
          createWithFallback("pose", (baseOptions) => visionModule.PoseLandmarker.createFromOptions(vision, {
            ...common,
            baseOptions,
            numPoses: 1,
            minPoseDetectionConfidence: 0.48,
            minPosePresenceConfidence: 0.48
          }))
        ]);
        if (disposed) {
          if (handsResult.status === "fulfilled") handsResult.value.close();
          if (poseResult.status === "fulfilled") poseResult.value.close();
          return;
        }
        if (handsResult.status === "fulfilled") handLandmarker = handsResult.value;
        if (poseResult.status === "fulfilled") poseLandmarker = poseResult.value;
      } catch (error) {
        console.error("Face tracking could not start.", error);
        if (!disposed) {
          performanceMonitor.markError("Face tracking unavailable");
          emitTrackingStatus(performance.now(), true);
        }
      }
    };

    const initializeSegmentation = async () => {
      if (!aiBackgroundActive) return;
      try {
        const [visionModule, vision] = await Promise.all([getVisionModule(), getVisionFileset()]);
        const nextSegmenter = await createWithFallback("segmentation", (baseOptions) => visionModule.ImageSegmenter.createFromOptions(vision, {
          baseOptions,
          runningMode: "VIDEO",
          outputCategoryMask: false,
          outputConfidenceMasks: true
        }));
        if (disposed) {
          nextSegmenter.close();
          return;
        }
        segmenter = nextSegmenter;
        const labels = nextSegmenter.getLabels().map((label) => label.toLowerCase());
        const detectedPersonIndex = labels.findIndex((label) => label.includes("person"));
        if (detectedPersonIndex >= 0) personMaskIndex = detectedPersonIndex;
        setAiStatus("ready");
      } catch (error) {
        console.error("Screenless background removal could not start.", error);
        if (!disposed) setAiStatus("error");
      }
    };
    void initializeFaceTracking();
    void initializeSegmentation();

    const updatePersonMask = (confidence: Float32Array, width: number, height: number) => {
      if (maskCanvas.width !== width || maskCanvas.height !== height) {
        maskCanvas.width = width;
        maskCanvas.height = height;
        smoothedMask = null;
      }
      if (!smoothedMask || smoothedMask.length !== confidence.length) {
        smoothedMask = new Float32Array(confidence);
      }

      const { segmentationThreshold, segmentationFeather } = settingsRef.current.effects;
      const lower = Math.max(0.02, segmentationThreshold - segmentationFeather / 2);
      const upper = Math.min(0.98, segmentationThreshold + segmentationFeather / 2);
      const range = Math.max(0.01, upper - lower);
      const image = maskContext.createImageData(width, height);
      for (let index = 0; index < confidence.length; index += 1) {
        const previous = smoothedMask[index];
        // Let large changes (hands/fingers moving) catch up quickly, while
        // retaining stronger smoothing for nearly-static pixels. A fixed
        // response makes moving fingers visibly trail behind the source frame.
        const delta = Math.abs(confidence[index] - previous);
        const response = delta > 0.08 ? 0.82 : 0.58;
        const next = previous + (confidence[index] - previous) * response;
        smoothedMask[index] = next;
        const normalized = Math.max(0, Math.min(1, (next - lower) / range));
        const alpha = normalized * normalized * (3 - 2 * normalized);
        const offset = index * 4;
        image.data[offset] = 255;
        image.data[offset + 1] = 255;
        image.data[offset + 2] = 255;
        image.data[offset + 3] = Math.round(alpha * 255);
      }
      maskContext.putImageData(image, 0, 0);
      maskReady = true;
    };

    const render = (now: number) => {
      if (disposed) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        const { effects: currentEffects, chromaKey: currentChroma } = settingsRef.current;
        const currentRuntimeEffects = currentEffects as RuntimeEffectsSettings;

        sourceContext.globalCompositeOperation = "source-over";
        sourceContext.filter = "none";
        sourceContext.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
        // Framing belongs to the shared CSS transform applied to both the raw
        // video and processed canvas below. Cropping here as well made effects
        // square the zoom and double the pan whenever processing was enabled.
        sourceContext.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

        const adaptiveFps = performanceMonitor.getAdaptiveFps();
        const faceNearEdge = Boolean(landmarks && [1, 10, 152, 234, 454].some((index) => {
          const point = landmarks![index];
          return point && (point.x < .12 || point.x > .88 || point.y < .1 || point.y > .9);
        }));
        const stableFace = Boolean(landmarks && !faceHeld && !faceNearEdge && recentFaceMotion < .006 && poseHeadMotion < .006 && now - lastFaceSeenAt < 220);
        const freshVideoFrame = Math.abs(video.currentTime - lastVideoTime) > .0005;
        if (freshVideoFrame) lastVideoTime = video.currentTime;
        const shouldSegment = segmenter && freshVideoFrame && now - lastSegmentAt >= SEGMENT_INTERVAL_MS;
        // Rendering stays smooth, while the models run only for new camera
        // frames. Centered, settled faces use a lighter cadence; an empty view
        // is rescanned within a second so a new guest is found promptly.
        const faceInterval = !landmarks ? IDLE_FACE_SCAN_INTERVAL_MS : stableFace ? STABLE_FACE_INTERVAL_MS : 1_000 / adaptiveFps;
        const bodyInterval = !landmarks ? IDLE_BODY_SCAN_INTERVAL_MS : trackedHands.length ? BODY_INTERVAL_MS : stableFace ? STABLE_BODY_INTERVAL_MS : BODY_INTERVAL_MS;
        const shouldTrackFace = faceLandmarker && freshVideoFrame && now - lastFaceAt >= faceInterval;
        const shouldTrackBody = bodyTrackingRequested && freshVideoFrame && (handLandmarker || poseLandmarker) && now - lastBodyAt >= bodyInterval;
        if (shouldSegment || shouldTrackFace || shouldTrackBody) {
          inferenceContext.clearRect(0, 0, INFERENCE_WIDTH, INFERENCE_HEIGHT);
          inferenceContext.drawImage(source, 0, 0, INFERENCE_WIDTH, INFERENCE_HEIGHT);
        }

        if (shouldSegment && segmenter) {
          lastSegmentAt = now;
          segmenter.segmentForVideo(inference, now, (result) => {
            const masks = result.confidenceMasks;
            if (!masks?.length) return;
            const mask = masks[Math.min(personMaskIndex, masks.length - 1)];
            updatePersonMask(mask.getAsFloat32Array(), mask.width, mask.height);
          });
        }

        if (shouldTrackFace || shouldTrackBody) {
          const inferenceStartedAt = performance.now();
          try {
            if (shouldTrackBody) {
              lastBodyAt = now;
              if (handLandmarker) {
                const handResult = handLandmarker.detectForVideo(inference, now);
                if (handResult.landmarks.length) {
                  handLandmarks = handResult.landmarks.map((hand, index) => smoothTrackingPoints(handLandmarks[index] ?? null, hand));
                  trackedHands = handMotionTracker.update(deriveTrackedHands(handLandmarks, handResult.handedness), now);
                  lastHandsSeenAt = now;
                  handsWereSeen = true;
                } else if (now - lastHandsSeenAt > 180) {
                  handLandmarks = [];
                  trackedHands = [];
                }
              }
              if (poseLandmarker) {
                const detectedPose = poseLandmarker.detectForVideo(inference, now).landmarks[0] ?? null;
                if (detectedPose) {
                  const nextPose = smoothTrackingPoints(poseLandmarks, detectedPose);
                  const nextNose = nextPose[0];
                  if (lastPoseNose && nextNose) {
                    poseTranslation = { x: nextNose.x - lastPoseNose.x, y: nextNose.y - lastPoseNose.y };
                    poseHeadMotion = Math.hypot(poseTranslation.x, poseTranslation.y);
                  } else {
                    poseTranslation = { x: 0, y: 0 };
                    poseHeadMotion = 0;
                  }
                  lastPoseNose = nextNose;
                  poseLandmarks = nextPose;
                } else {
                  poseLandmarks = null;
                  poseHeadMotion = 0;
                  poseTranslation = { x: 0, y: 0 };
                }
              }
            }

            if (shouldTrackFace && faceLandmarker) {
              lastFaceAt = now;
              const result = faceLandmarker.detectForVideo(inference, now);
              const detected = result.faceLandmarks[0] ?? null;
              if (detected) {
                recentFaceMotion = landmarkMotion(landmarks, detected);
                landmarks = smoothTrackingPoints(landmarks, detected, faceHeld ? 0.82 : 1);
                eyeState = deriveEyeOpenness(landmarks, result.faceBlendshapes[0]?.categories, eyeState);
                lastFaceSeenAt = now;
                faceHeld = false;
                const overlapConfidence = faceOcclusionConfidence(trackedHands, landmarks);
                if (overlapConfidence > 0) {
                  lastOcclusionAt = now;
                  lastOcclusionConfidence = overlapConfidence;
                }
                const mouthInterval = stableFace ? MOUTH_ANALYSIS_INTERVAL_MS * 3 : MOUTH_ANALYSIS_INTERVAL_MS;
                if (currentRuntimeEffects.costumeEnabled && now - lastMouthAnalysisAt >= mouthInterval) {
                  experimentalMouth = analyzeExperimentalMouth(inferenceContext.getImageData(0, 0, INFERENCE_WIDTH, INFERENCE_HEIGHT), landmarks);
                  lastMouthAnalysisAt = now;
                }
                performanceMonitor.markFaceDetected(now);
              } else if (landmarks) {
                const overlapConfidence = faceOcclusionConfidence(trackedHands, landmarks);
                if (overlapConfidence > 0) {
                  lastOcclusionAt = now;
                  lastOcclusionConfidence = overlapConfidence;
                }
                faceHeld = shouldHoldFaceAnchors({
                  nowMs: now,
                  lastFaceSeenAt,
                  lastOcclusionAt,
                  occlusionConfidence: lastOcclusionConfidence,
                  faceMotion: recentFaceMotion,
                  poseHeadMotion
                });
                if (faceHeld && poseHeadMotion > 0 && poseHeadMotion <= 0.04) {
                  landmarks = translateTrackingPoints(landmarks, poseTranslation.x, poseTranslation.y);
                } else if (!faceHeld) {
                  landmarks = null;
                  experimentalMouth = undefined;
                  performanceMonitor.markFaceLost();
                }
              } else {
                performanceMonitor.markFaceLost();
              }
              performanceMonitor.setFaceAnchorHeld(faceHeld);
            }
          } catch (error) {
            console.warn("A tracking frame was skipped.", error);
            performanceMonitor.markDegraded("Tracking is recovering…");
          }
          performanceMonitor.recordInference(performance.now() - inferenceStartedAt);
        }

        context.globalCompositeOperation = "source-over";
        context.filter = "none";
        context.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

        const trackedPointsOverlay = currentRuntimeEffects.trackedPointsOverlay ?? currentEffects.trackingDebug ?? false;
        const showCameraUnderLandmarks = currentRuntimeEffects.trackingCameraUnderlay ?? false;
        if (trackedPointsOverlay) {
          if (showCameraUnderLandmarks) context.drawImage(source, 0, 0);
          else {
            context.fillStyle = "#050914";
            context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
          }
        } else if (aiBackgroundActive && currentEffects.background === "blur" && !maskReady) {
          const overscan = Math.max(12, currentEffects.blur * 2);
          context.save();
          context.filter = `blur(${currentEffects.blur}px)`;
          context.drawImage(source, -overscan, -overscan, OUTPUT_WIDTH + overscan * 2, OUTPUT_HEIGHT + overscan * 2);
          context.restore();
        } else if (aiBackgroundActive && maskReady) {
          if (currentEffects.background === "blur") {
            const overscan = Math.max(12, currentEffects.blur * 2);
            context.save();
            context.filter = `blur(${currentEffects.blur}px)`;
            context.drawImage(source, -overscan, -overscan, OUTPUT_WIDTH + overscan * 2, OUTPUT_HEIGHT + overscan * 2);
            context.restore();
          } else if (currentEffects.background === "solid") {
            context.fillStyle = currentEffects.backgroundColor ?? "#173f5f";
            context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
          } else if (currentEffects.background === "gradient") {
            drawScreenlessGradient(
              context,
              OUTPUT_WIDTH,
              OUTPUT_HEIGHT,
              currentEffects.backgroundGradientStart ?? "#0f4c5c",
              currentEffects.backgroundGradientEnd ?? "#7439a8"
            );
          } else if (currentEffects.background === "image") {
            const replacement = replacementImageRef.current;
            if (replacement?.complete && replacement.naturalWidth > 0) drawCover(context, replacement, OUTPUT_WIDTH, OUTPUT_HEIGHT);
          }

          foregroundContext.globalCompositeOperation = "source-over";
          foregroundContext.filter = "none";
          foregroundContext.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
          foregroundContext.drawImage(source, 0, 0);
          foregroundContext.globalCompositeOperation = "destination-in";
          foregroundContext.drawImage(maskCanvas, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
          foregroundContext.globalCompositeOperation = "source-over";
          context.drawImage(foreground, 0, 0);
        } else {
          if (chromaActive) applyChromaKey(sourceContext, OUTPUT_WIDTH, OUTPUT_HEIGHT, currentChroma);
          context.drawImage(source, 0, 0);
        }

        const transform = { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT };
        const trackingFrame = makeTrackingRenderFrame({
          nowMs: now,
          width: OUTPUT_WIDTH,
          height: OUTPUT_HEIGHT,
          faceLandmarks: landmarks,
          eyeState,
          faceHeld,
          hands: trackedHands,
          poseLandmarks,
          experimentalMouth
        });
        // Costume pieces render first; wearable accessories are the top-most
        // layer so glasses and hats sit over the costume rather than behind it.
        trackedOverlayRendererRef.current?.(context, trackingFrame);
        if (trackingFrame.face && faceEffectsActive) {
          const showGlasses = currentEffects.glassesEnabled ?? currentEffects.accessory === "glasses";
          const showHat = currentRuntimeEffects.hatEnabled ?? currentEffects.partyHatEnabled ?? currentEffects.accessory === "party-hat";
          if (showGlasses) drawTrackedGlasses(context, trackingFrame, currentRuntimeEffects.glassesStyle ?? "classic");
          if (showHat) drawTrackedHat(context, trackingFrame, currentRuntimeEffects.hatStyle ?? "party", wizardHatRig, {
            springiness: currentRuntimeEffects.wizardSpringiness ?? 0.62,
            damping: currentRuntimeEffects.wizardDamping ?? 0.68
          });
          if (currentRuntimeEffects.handProp && currentRuntimeEffects.handProp !== "none") {
            drawTrackedHandProp(context, trackingFrame, currentRuntimeEffects.handProp, currentRuntimeEffects.handPropHand ?? "right");
          }
        }
        if (landmarks && faceEffectsActive && currentEffects.puppetPreview && !trackedPointsOverlay) {
          drawPuppetPreview(context, landmarks, transform);
        }
        if (trackedPointsOverlay) drawTrackingNodes(context, landmarks, poseLandmarks, handLandmarks, transform, handsWereSeen ? (handLandmarks.length ? "detected" : now - lastHandsSeenAt <= 180 ? "briefly lost" : "off camera") : "not detected", trackingFrame);
      } else {
        context.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      }
      performanceMonitor.recordRenderedFrame(now);
      emitTrackingStatus(now);
    };

    const tick = (now: number) => {
      if (disposed) return;
      if (shouldRenderTrackingFrame(now, lastRenderedAt, performanceMonitor.getAdaptiveFps())) {
        lastRenderedAt = now;
        render(now);
      }
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      segmenter?.close();
      faceLandmarker?.close();
      handLandmarker?.close();
      poseLandmarker?.close();
      if (faceEffectsActive) trackingStatusCallbackRef.current?.({ phase: "idle", renderedFps: 0, targetFps: 60, adaptiveFps: 60, faceAnchorHeld: false });
    };
  }, [stream, chromaActive, aiBackgroundActive, faceEffectsActive, bodyTrackingRequested, processingActive]);

  return <><video
    ref={videoRef}
    autoPlay
    playsInline
    muted
    className={processingActive ? "chroma-source" : className ?? "chroma-video"}
    style={processingActive ? undefined : cropStyle}
  />{processingActive && <canvas ref={canvasRef} width={OUTPUT_WIDTH} height={OUTPUT_HEIGHT} className={className ?? "chroma-video"} style={cropStyle} />}
  {aiBackgroundActive && aiStatus !== "ready" && <span className={`ai-background-status ${aiStatus}`}>
    {aiStatus === "error" ? "Background effect unavailable" : "Preparing background effect…"}
  </span>}
  {faceEffectsActive && (trackingPhase === "warming" || trackingPhase === "detecting" || trackingPhase === "error") && <span className={`ai-background-status face-tracking-status ${trackingPhase}`} style={aiBackgroundActive && aiStatus !== "ready" ? { bottom: 40 } : undefined} role="status" aria-live="polite">
    {trackingPhase === "error" ? "Face tracking unavailable" : "Detecting face…"}
  </span>}</>;
}

function applyChromaKey(context: CanvasRenderingContext2D, width: number, height: number, chromaKey: ChromaKeySettings) {
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  const [keyR, keyG, keyB] = hexRgb(chromaKey.color);
  const keyCb = -0.168736 * keyR - 0.331264 * keyG + 0.5 * keyB;
  const keyCr = 0.5 * keyR - 0.418688 * keyG - 0.081312 * keyB;
  const threshold = Math.max(0.015, chromaKey.similarity * 0.5);
  const feather = Math.max(0.008, chromaKey.smoothness * 0.45);
  const thresholdSquared = threshold * threshold;
  const outerSquared = (threshold + feather) * (threshold + feather);
  const distanceRange = Math.max(0.0001, outerSquared - thresholdSquared);

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] / 255;
    const green = pixels[index + 1] / 255;
    const blue = pixels[index + 2] / 255;
    const cb = -0.168736 * red - 0.331264 * green + 0.5 * blue;
    const cr = 0.5 * red - 0.418688 * green - 0.081312 * blue;
    const deltaCb = cb - keyCb;
    const deltaCr = cr - keyCr;
    const distanceSquared = deltaCb * deltaCb + deltaCr * deltaCr;
    const normalized = Math.max(0, Math.min(1, (distanceSquared - thresholdSquared) / distanceRange));
    const alpha = normalized * normalized * (3 - 2 * normalized);
    pixels[index + 3] = Math.round(pixels[index + 3] * alpha);
    if (chromaKey.spill > 0 && alpha < 1) {
      const spill = (1 - alpha) * chromaKey.spill;
      pixels[index + 1] = Math.round(pixels[index + 1] * (1 - spill) + ((pixels[index] + pixels[index + 2]) / 2) * spill);
    }
  }
  context.putImageData(image, 0, 0);
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function point(landmarks: TrackingPoint[], index: number, transform: PointTransform) {
  return { x: landmarks[index].x * transform.width, y: landmarks[index].y * transform.height };
}

function drawPuppetPreview(context: CanvasRenderingContext2D, landmarks: TrackingPoint[], transform: PointTransform) {
  const mouthTop = point(landmarks, 13, transform);
  const mouthBottom = point(landmarks, 14, transform);
  const left = point(landmarks, 33, transform);
  const right = point(landmarks, 263, transform);
  const eyeWidth = Math.max(1, Math.hypot(right.x - left.x, right.y - left.y));
  const openness = Math.min(1, Math.hypot(mouthBottom.x - mouthTop.x, mouthBottom.y - mouthTop.y) / (eyeWidth * 0.22));
  const radius = Math.min(transform.width, transform.height) * 0.1;
  const x = transform.width - radius * 1.35;
  const y = transform.height - radius * 1.35;
  context.fillStyle = "rgba(7, 17, 29, 0.78)"; context.beginPath(); context.arc(x, y, radius * 1.18, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#f2c46d"; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#07111e"; context.beginPath(); context.arc(x - radius * 0.32, y - radius * 0.22, radius * 0.08, 0, Math.PI * 2); context.arc(x + radius * 0.32, y - radius * 0.22, radius * 0.08, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.ellipse(x, y + radius * 0.3, radius * 0.34, radius * (0.05 + openness * 0.28), 0, 0, Math.PI * 2); context.fill();
}

const FACE_MOUTH = new Set([0, 11, 12, 13, 14, 15, 16, 17, 37, 39, 40, 61, 78, 80, 81, 82, 84, 87, 88, 91, 95, 146, 178, 181, 185, 191, 267, 269, 270, 291, 308, 310, 311, 312, 314, 317, 318, 321, 324, 375, 402, 405, 409, 415]);
const FACE_BROWS = new Set([46, 52, 53, 55, 63, 65, 66, 70, 105, 107, 276, 282, 283, 285, 293, 295, 296, 300, 334, 336]);
const FACE_IRISES = new Set([468, 469, 470, 471, 472, 473, 474, 475, 476, 477]);
const FACE_EARS = new Set([93, 127, 132, 234, 323, 356, 361, 454]);
const FACE_CHIN = new Set([148, 149, 150, 152, 176, 377, 378, 379]);
const FACE_NOSE = new Set([1, 2, 4, 5, 6, 19, 94, 168, 195, 197]);
const HAND_TIPS = new Set([4, 8, 12, 16, 20]);
const HAND_PALM = new Set([0, 1, 2, 5, 9, 13, 17]);

function drawTrackingNodes(
  context: CanvasRenderingContext2D,
  face: TrackingPoint[] | null,
  pose: TrackingPoint[] | null,
  hands: TrackingPoint[][],
  transform: PointTransform,
  handStatus: "detected" | "briefly lost" | "off camera" | "not detected",
  frame: TrackingRenderFrame
) {
  const dot = (landmark: TrackingPoint, color: string, radius = 1.5) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(landmark.x * transform.width, landmark.y * transform.height, radius, 0, Math.PI * 2);
    context.fill();
  };

  face?.forEach((landmark, index) => {
    let color = "#36d6ff"; // side of head and general face mesh
    let radius = 1.25;
    if (FACE_MOUTH.has(index)) { color = index === 13 || index === 14 ? "#ffffff" : "#ff4f91"; radius = 2; }
    else if (FACE_BROWS.has(index)) color = "#ffb43b";
    else if (FACE_IRISES.has(index)) { color = "#8aff66"; radius = 2.2; }
    else if (FACE_EARS.has(index)) { color = "#ad7cff"; radius = 2.4; }
    else if (FACE_CHIN.has(index)) { color = "#ff704d"; radius = 2; }
    else if (FACE_NOSE.has(index)) { color = "#fff06a"; radius = index === 1 ? 2.8 : 1.8; }
    dot(landmark, color, radius);
  });

  pose?.forEach((landmark, index) => dot(landmark, index === 11 || index === 12 ? "#00f0b5" : "#3188ff", index === 11 || index === 12 ? 4 : 2));
  hands.forEach((hand, handIndex) => hand.forEach((landmark, index) => {
    const sideColor = handIndex === 0 ? "#ffcf33" : "#ff7b33";
    dot(landmark, HAND_TIPS.has(index) ? "#ff3b3b" : HAND_PALM.has(index) ? "#38e8d1" : sideColor, HAND_TIPS.has(index) ? 3.2 : HAND_PALM.has(index) ? 2.6 : 2);
  }));

  context.save();
  context.lineCap = "round";
  context.lineWidth = 3;
  context.strokeStyle = "rgba(0, 240, 181, 0.78)";
  [frame.body?.leftArm, frame.body?.rightArm].forEach((arm) => {
    if (!arm) return;
    context.setLineDash(arm.inferred ? [7, 5] : []);
    context.beginPath();
    context.moveTo(arm.shoulder.x * transform.width, arm.shoulder.y * transform.height);
    if (arm.elbow) context.lineTo(arm.elbow.x * transform.width, arm.elbow.y * transform.height);
    if (arm.hand) context.lineTo(arm.hand.x * transform.width, arm.hand.y * transform.height);
    else context.lineTo((arm.shoulder.x + arm.direction.x * 0.16) * transform.width, (arm.shoulder.y + arm.direction.y * 0.16) * transform.height);
    context.stroke();
  });
  context.setLineDash([]);

  context.font = "600 10px system-ui, sans-serif";
  context.textAlign = "center";
  frame.hands.forEach((hand) => {
    context.fillStyle = hand.side === "left" ? "#ffcf33" : "#ff8b52";
    context.fillText(`${hand.side} · ${hand.gesture} · ${hand.fingerCount}`, hand.palm.x * transform.width, hand.palm.y * transform.height + 18);
  });
  const labelAnchor = (label: string, landmark: TrackingPoint | undefined, color: string) => {
    if (!landmark) return;
    context.fillStyle = color;
    context.fillText(label, landmark.x * transform.width, landmark.y * transform.height - 7);
  };
  labelAnchor("L ear", frame.extensionAnchors.leftEar, "#d3adff");
  labelAnchor("R ear", frame.extensionAnchors.rightEar, "#d3adff");
  labelAnchor("Head top", frame.extensionAnchors.headTop, "#8ee9ff");
  labelAnchor("Chin", frame.extensionAnchors.chin, "#ff9a80");
  labelAnchor("Neck", frame.extensionAnchors.neck, "#58f5c4");
  context.restore();

  context.font = "600 12px system-ui, sans-serif";
  context.textAlign = "left";
  context.fillStyle = handStatus === "detected" ? "#38e8d1" : handStatus === "briefly lost" ? "#ffcf33" : "#ff7085";
  context.fillText(`Hands: ${handStatus}${hands.length ? ` (${hands.length})` : ""}`, 12, transform.height - 14);
  if (frame.face) {
    context.fillStyle = "#f5f7ff";
    context.fillText(`Eyes: L ${Math.round(frame.face.leftEyeOpen * 100)}% · R ${Math.round(frame.face.rightEyeOpen * 100)}%${frame.face.held ? " · anchors held" : ""}`, 12, 18);
  }
  if (frame.extensionAnchors.experimentalMouth) {
    const detail = frame.extensionAnchors.experimentalMouth;
    context.fillStyle = detail.status === "detected" ? "#ff8db7" : "#b9c3d7";
    context.fillText(`Mouth detail (experimental image analysis): ${detail.status}`, 12, 34);
  }
}
