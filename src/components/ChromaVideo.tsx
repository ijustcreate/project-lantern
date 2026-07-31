import { useEffect, useRef, useState } from "react";
import type { FaceLandmarker, HandLandmarker, ImageSegmenter, NormalizedLandmark, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { ChromaKeySettings, ImageCrop, LiveEffectsSettings } from "../types";

interface ChromaVideoProps {
  stream: MediaStream | null;
  chromaKey: ChromaKeySettings;
  effects: LiveEffectsSettings;
  crop: ImageCrop;
  className?: string;
}

interface PointTransform {
  width: number;
  height: number;
}

const OUTPUT_WIDTH = 640;
const OUTPUT_HEIGHT = 360;
// A little more source detail helps the selfie model preserve thin fingers and
// hair. Keep the working canvas small enough that segmentation remains realtime.
const INFERENCE_WIDTH = 384;
const INFERENCE_HEIGHT = 216;
const SEGMENT_INTERVAL_MS = 1000 / 10;
const FACE_INTERVAL_MS = 1000 / 30;
const VISION_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const SEGMENTATION_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

type VisionModule = typeof import("@mediapipe/tasks-vision");
type VisionFileset = Awaited<ReturnType<VisionModule["FilesetResolver"]["forVisionTasks"]>>;

let visionFilesetPromise: Promise<VisionFileset> | null = null;

function getVisionFileset() {
  if (!visionFilesetPromise) {
    visionFilesetPromise = import("@mediapipe/tasks-vision").then(({ FilesetResolver }) => FilesetResolver.forVisionTasks(VISION_WASM_URL));
  }
  return visionFilesetPromise;
}

function hexRgb(value: string) {
  const hex = value.replace("#", "");
  const normalized = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
}

export function ChromaVideo({ stream, chromaKey, effects, crop, className }: ChromaVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const settingsRef = useRef({ chromaKey, effects, crop });
  const replacementImageRef = useRef<HTMLImageElement | null>(null);
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  settingsRef.current = { chromaKey, effects, crop };

  const chromaActive = chromaKey.enabled;
  const aiBackgroundActive = !chromaActive && effects.background !== "original";
  const glassesEnabled = effects.glassesEnabled ?? effects.accessory === "glasses";
  const partyHatEnabled = effects.partyHatEnabled ?? effects.accessory === "party-hat";
  const faceEffectsActive = effects.faceTracking && (glassesEnabled || partyHatEnabled || effects.puppetPreview || effects.trackingDebug);
  const cropStyle = {
    objectFit: "cover" as const,
    transform: `translate(${-crop.x * crop.scale}%, ${-crop.y * crop.scale}%) scale(${crop.scale})`,
    transformOrigin: "center"
  };
  const processingActive = chromaActive || aiBackgroundActive || faceEffectsActive;

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
    if (!processingActive || !video || !canvas) return;
    setAiStatus(aiBackgroundActive ? "loading" : "idle");

    const context = canvas.getContext("2d");
    const source = document.createElement("canvas");
    source.width = OUTPUT_WIDTH;
    source.height = OUTPUT_HEIGHT;
    const sourceContext = source.getContext("2d", chromaActive ? { willReadFrequently: true } : undefined);

    const inference = document.createElement("canvas");
    inference.width = INFERENCE_WIDTH;
    inference.height = INFERENCE_HEIGHT;
    const inferenceContext = inference.getContext("2d");

    const foreground = document.createElement("canvas");
    foreground.width = OUTPUT_WIDTH;
    foreground.height = OUTPUT_HEIGHT;
    const foregroundContext = foreground.getContext("2d");

    const maskCanvas = document.createElement("canvas");
    const maskContext = maskCanvas.getContext("2d");
    if (!context || !sourceContext || !inferenceContext || !foregroundContext || !maskContext) return;

    let animationFrame = 0;
    let videoFrame = 0;
    let disposed = false;
    let segmenter: ImageSegmenter | null = null;
    let faceLandmarker: FaceLandmarker | null = null;
    let handLandmarker: HandLandmarker | null = null;
    let poseLandmarker: PoseLandmarker | null = null;
    let personMaskIndex = 15;
    let maskReady = false;
    let smoothedMask: Float32Array | null = null;
    let landmarks: NormalizedLandmark[] | null = null;
    let poseLandmarks: NormalizedLandmark[] | null = null;
    let handLandmarks: NormalizedLandmark[][] = [];
    let lastHandsSeenAt = -Infinity;
    let handsWereSeen = false;
    let lastSegmentAt = -Infinity;
    let lastFaceAt = -Infinity;
    let lastFaceSeenAt = -Infinity;

    const initializeVision = async () => {
      if (!aiBackgroundActive && !faceEffectsActive) return;
      try {
        const [{ ImageSegmenter, FaceLandmarker, HandLandmarker, PoseLandmarker }, vision] = await Promise.all([
          import("@mediapipe/tasks-vision"),
          getVisionFileset()
        ]);

        if (aiBackgroundActive) {
          let nextSegmenter: ImageSegmenter;
          try {
            nextSegmenter = await ImageSegmenter.createFromOptions(vision, {
              baseOptions: { modelAssetPath: SEGMENTATION_MODEL_URL, delegate: "GPU" },
              runningMode: "VIDEO",
              outputCategoryMask: false,
              outputConfidenceMasks: true
            });
          } catch {
            nextSegmenter = await ImageSegmenter.createFromOptions(vision, {
              baseOptions: { modelAssetPath: SEGMENTATION_MODEL_URL, delegate: "CPU" },
              runningMode: "VIDEO",
              outputCategoryMask: false,
              outputConfidenceMasks: true
            });
          }
          if (disposed) nextSegmenter.close();
          else {
            segmenter = nextSegmenter;
            const labels = nextSegmenter.getLabels().map((label) => label.toLowerCase());
            const detectedPersonIndex = labels.findIndex((label) => label.includes("person"));
            if (detectedPersonIndex >= 0) personMaskIndex = detectedPersonIndex;
            setAiStatus("ready");
          }
        }

        if (faceEffectsActive) {
          let nextLandmarker: FaceLandmarker;
          const faceOptions = {
            runningMode: "VIDEO" as const,
            numFaces: 1,
            minFaceDetectionConfidence: 0.62,
            minFacePresenceConfidence: 0.62,
            minTrackingConfidence: 0.68,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false
          };
          try {
            nextLandmarker = await FaceLandmarker.createFromOptions(vision, {
              ...faceOptions,
              baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "GPU" }
            });
          } catch {
            nextLandmarker = await FaceLandmarker.createFromOptions(vision, {
              ...faceOptions,
              baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "CPU" }
            });
          }
          if (disposed) nextLandmarker.close();
          else faceLandmarker = nextLandmarker;

          if (settingsRef.current.effects.trackingDebug) {
            const common = { runningMode: "VIDEO" as const, minTrackingConfidence: 0.55 };
            const createTracker = async <T,>(gpu: () => Promise<T>, cpu: () => Promise<T>) => { try { return await gpu(); } catch { return cpu(); } };
            const nextHands = await createTracker(
              () => HandLandmarker.createFromOptions(vision, { ...common, baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "GPU" }, numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5 }),
              () => HandLandmarker.createFromOptions(vision, { ...common, baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "CPU" }, numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5 })
            );
            const nextPose = await createTracker(
              () => PoseLandmarker.createFromOptions(vision, { ...common, baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" }, numPoses: 1, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5 }),
              () => PoseLandmarker.createFromOptions(vision, { ...common, baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "CPU" }, numPoses: 1, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5 })
            );
            if (disposed) { nextHands.close(); nextPose.close(); }
            else { handLandmarker = nextHands; poseLandmarker = nextPose; }
          }
        }
      } catch (error) {
        console.error("Background removal could not start.", error);
        segmenter?.close();
        faceLandmarker?.close();
        handLandmarker?.close();
        poseLandmarker?.close();
        segmenter = null;
        faceLandmarker = null;
        if (aiBackgroundActive && !disposed) setAiStatus("error");
      }
    };
    void initializeVision();

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
        const { crop: currentCrop, effects: currentEffects, chromaKey: currentChroma } = settingsRef.current;
        const scale = Math.max(1, currentCrop.scale);
        const sourceWidth = video.videoWidth / scale;
        const sourceHeight = video.videoHeight / scale;
        const sourceX = Math.max(0, Math.min(video.videoWidth - sourceWidth, (video.videoWidth - sourceWidth) / 2 + (currentCrop.x / 100) * video.videoWidth));
        const sourceY = Math.max(0, Math.min(video.videoHeight - sourceHeight, (video.videoHeight - sourceHeight) / 2 + (currentCrop.y / 100) * video.videoHeight));

        sourceContext.globalCompositeOperation = "source-over";
        sourceContext.filter = "none";
        sourceContext.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
        sourceContext.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

        const shouldSegment = segmenter && now - lastSegmentAt >= SEGMENT_INTERVAL_MS;
        const shouldTrackFace = faceLandmarker && now - lastFaceAt >= FACE_INTERVAL_MS;
        if (shouldSegment || shouldTrackFace) {
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

        if (shouldTrackFace && faceLandmarker) {
          lastFaceAt = now;
          const detected = faceLandmarker.detectForVideo(inference, now).faceLandmarks[0] ?? null;
          if (detected) {
            landmarks = smoothLandmarks(landmarks, detected);
            lastFaceSeenAt = now;
          } else if (now - lastFaceSeenAt > 140) {
            landmarks = null;
          }
          if (currentEffects.trackingDebug) {
            poseLandmarks = poseLandmarker?.detectForVideo(inference, now).landmarks[0] ?? null;
            const detectedHands = handLandmarker?.detectForVideo(inference, now).landmarks ?? [];
            if (detectedHands.length) {
              handLandmarks = detectedHands.map((hand, index) => smoothLandmarks(handLandmarks[index] ?? null, hand));
              lastHandsSeenAt = now;
              handsWereSeen = true;
            } else if (now - lastHandsSeenAt > 180) handLandmarks = [];
          }
        }

        context.globalCompositeOperation = "source-over";
        context.filter = "none";
        context.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

        if (currentEffects.trackingDebug) {
          context.fillStyle = "#050914";
          context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
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
        if (landmarks && currentEffects.faceTracking && !currentEffects.trackingDebug) {
          const showGlasses = currentEffects.glassesEnabled ?? currentEffects.accessory === "glasses";
          const showPartyHat = currentEffects.partyHatEnabled ?? currentEffects.accessory === "party-hat";
          if (showGlasses) drawAccessory(context, landmarks, transform, "glasses");
          if (showPartyHat) drawAccessory(context, landmarks, transform, "party-hat");
        }
        if (landmarks && currentEffects.faceTracking && currentEffects.puppetPreview && !currentEffects.trackingDebug) {
          drawPuppetPreview(context, landmarks, transform);
        }
        if (currentEffects.trackingDebug) drawTrackingNodes(context, landmarks, poseLandmarks, handLandmarks, transform, handsWereSeen ? (handLandmarks.length ? "detected" : now - lastHandsSeenAt <= 180 ? "briefly lost" : "off camera") : "not detected");
      } else {
        context.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      }

      if (typeof video.requestVideoFrameCallback === "function") {
        videoFrame = video.requestVideoFrameCallback((timestamp) => render(timestamp));
      } else {
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    if (typeof video.requestVideoFrameCallback === "function") {
      videoFrame = video.requestVideoFrameCallback((timestamp) => render(timestamp));
    } else {
      animationFrame = window.requestAnimationFrame(render);
    }

    return () => {
      disposed = true;
      if (videoFrame && typeof video.cancelVideoFrameCallback === "function") video.cancelVideoFrameCallback(videoFrame);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      segmenter?.close();
      faceLandmarker?.close();
      handLandmarker?.close();
      poseLandmarker?.close();
    };
  }, [stream, chromaActive, aiBackgroundActive, faceEffectsActive, processingActive]);

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

function smoothLandmarks(previous: NormalizedLandmark[] | null, detected: NormalizedLandmark[]) {
  if (!previous || previous.length !== detected.length) return detected.map((landmark) => ({ ...landmark }));
  return detected.map((landmark, index) => {
    const old = previous[index];
    const movement = Math.hypot(landmark.x - old.x, landmark.y - old.y);
    const response = Math.max(0.42, Math.min(0.86, 0.42 + movement * 12));
    return {
      ...landmark,
      x: old.x + (landmark.x - old.x) * response,
      y: old.y + (landmark.y - old.y) * response,
      z: old.z + (landmark.z - old.z) * response
    };
  });
}

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function point(landmarks: NormalizedLandmark[], index: number, transform: PointTransform) {
  return { x: landmarks[index].x * transform.width, y: landmarks[index].y * transform.height };
}

function drawAccessory(context: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], transform: PointTransform, accessory: LiveEffectsSettings["accessory"]) {
  const left = point(landmarks, 33, transform);
  const right = point(landmarks, 263, transform);
  const centerX = (left.x + right.x) / 2;
  const eyeWidth = Math.hypot(right.x - left.x, right.y - left.y);
  const angle = Math.atan2(right.y - left.y, right.x - left.x);
  context.save();
  context.translate(centerX, (left.y + right.y) / 2);
  context.rotate(angle);
  if (accessory === "glasses") {
    context.strokeStyle = "#111820";
    context.lineWidth = Math.max(4, eyeWidth * 0.045);
    context.fillStyle = "rgba(85, 199, 191, 0.18)";
    [-0.29, 0.29].forEach((offset) => { context.beginPath(); context.ellipse(eyeWidth * offset, 0, eyeWidth * 0.28, eyeWidth * 0.16, 0, 0, Math.PI * 2); context.fill(); context.stroke(); });
    context.beginPath(); context.moveTo(-eyeWidth * 0.03, 0); context.lineTo(eyeWidth * 0.03, 0); context.stroke();
  } else {
    const top = point(landmarks, 10, transform);
    context.translate(0, top.y - (left.y + right.y) / 2 - eyeWidth * 0.28);
    context.fillStyle = "#f2c46d";
    context.strokeStyle = "#f07b5f";
    context.lineWidth = Math.max(3, eyeWidth * 0.025);
    context.beginPath(); context.moveTo(-eyeWidth * 0.48, 0); context.lineTo(0, -eyeWidth * 0.95); context.lineTo(eyeWidth * 0.48, 0); context.closePath(); context.fill(); context.stroke();
    context.fillStyle = "#55c7bf"; context.beginPath(); context.arc(0, -eyeWidth, eyeWidth * 0.11, 0, Math.PI * 2); context.fill();
  }
  context.restore();
}

function drawPuppetPreview(context: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], transform: PointTransform) {
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
  face: NormalizedLandmark[] | null,
  pose: NormalizedLandmark[] | null,
  hands: NormalizedLandmark[][],
  transform: PointTransform,
  handStatus: "detected" | "briefly lost" | "off camera" | "not detected"
) {
  const dot = (landmark: NormalizedLandmark, color: string, radius = 1.5) => {
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

  context.font = "600 12px system-ui, sans-serif";
  context.fillStyle = handStatus === "detected" ? "#38e8d1" : handStatus === "briefly lost" ? "#ffcf33" : "#ff7085";
  context.fillText(`Hands: ${handStatus}${hands.length ? ` (${hands.length})` : ""}`, 12, transform.height - 14);
}
