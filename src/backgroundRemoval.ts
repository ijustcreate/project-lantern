import type { LanternState } from "./types";

export type BackgroundRemovalMethod = "chroma" | "screenless";

export const CHROMA_KEY_PRESETS = [
  { id: "green", label: "Green", color: "#18a558" },
  { id: "blue", label: "Blue", color: "#1769c2" }
] as const;

export const SCREENLESS_REMOVAL_TECHNOLOGY = {
  name: "MediaPipe Image Segmenter",
  execution: "in-browser",
  model: "Selfie Segmenter"
} as const;

export function resolveBackgroundRemoval(live: LanternState["live"]): { enabled: boolean; method: BackgroundRemovalMethod } {
  if (live.chromaKey.enabled) return { enabled: true, method: "chroma" };
  if (live.effects.background !== "original") return { enabled: true, method: "screenless" };
  return { enabled: false, method: "screenless" };
}

export function createBackgroundRemovalPatch(
  live: LanternState["live"],
  enabled: boolean,
  method: BackgroundRemovalMethod
): Pick<LanternState["live"], "chromaKey" | "effects"> {
  return {
    chromaKey: { ...live.chromaKey, enabled: enabled && method === "chroma" },
    effects: {
      ...live.effects,
      background: enabled && method === "screenless"
        ? (live.effects.background === "original" ? "remove" : live.effects.background)
        : "original"
    }
  };
}

export function rgbToHex(red: number, green: number, blue: number) {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}
