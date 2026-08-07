import type { FilesetResolver } from "@mediapipe/tasks-vision";

export type VisionModelKind = "face" | "hand" | "pose" | "segmentation";

export const VISION_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
export const VISION_MODEL_URLS: Record<VisionModelKind, string> = {
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
  hand: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
  pose: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
  segmentation: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite"
};

type VisionModule = typeof import("@mediapipe/tasks-vision");
export type VisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

let visionModulePromise: Promise<VisionModule> | null = null;
let visionFilesetPromise: Promise<VisionFileset> | null = null;
const modelAssetPromises = new Map<VisionModelKind, Promise<Uint8Array | null>>();

export function getVisionModule() {
  visionModulePromise ??= import("@mediapipe/tasks-vision");
  return visionModulePromise;
}

export function getVisionFileset() {
  if (!visionFilesetPromise) {
    visionFilesetPromise = getVisionModule().then(({ FilesetResolver: Resolver }) => Resolver.forVisionTasks(VISION_WASM_URL));
  }
  return visionFilesetPromise;
}

/**
 * Fetch once, then clone the bytes into each task. A failed preload falls back
 * to MediaPipe's URL loader, so an eager cache miss never prevents tracking.
 */
export function getVisionModelAsset(kind: VisionModelKind) {
  const existing = modelAssetPromises.get(kind);
  if (existing) return existing;
  const promise = typeof fetch === "undefined"
    ? Promise.resolve(null)
    : fetch(VISION_MODEL_URLS[kind], { cache: "force-cache" })
      .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`Model request returned ${response.status}`)))
      .then((buffer) => new Uint8Array(buffer))
      .catch(() => null);
  modelAssetPromises.set(kind, promise);
  return promise;
}

export async function visionBaseOptions(kind: VisionModelKind, delegate: "GPU" | "CPU") {
  const asset = await getVisionModelAsset(kind);
  return asset
    ? { modelAssetBuffer: asset.slice(), delegate }
    : { modelAssetPath: VISION_MODEL_URLS[kind], delegate };
}

export async function warmVisionResources(kinds: VisionModelKind[]) {
  await Promise.allSettled([getVisionFileset(), getVisionModule(), ...kinds.map((kind) => getVisionModelAsset(kind))]);
}
