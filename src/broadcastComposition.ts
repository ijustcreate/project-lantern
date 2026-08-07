import type {
  BroadcastBackgroundMode,
  BroadcastBackgroundPresetId,
  BroadcastCropEdges,
  BroadcastFramePresetId,
  BroadcastFrameStyle,
  BroadcastGradientDirection,
  BroadcastGradientSettings,
  BroadcastMediaTransform,
  LivePresentation
} from "./types";
import type { CSSProperties } from "react";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export interface BroadcastFramePreset {
  id: Exclude<BroadcastFramePresetId, "custom">;
  label: string;
  description: string;
  panelColor: string;
  style: Omit<BroadcastFrameStyle, "presetId">;
}

export interface BroadcastBackgroundPreset {
  id: BroadcastBackgroundPresetId;
  label: string;
  description: string;
  swatch: string;
}

export const DEFAULT_CROP_EDGES: BroadcastCropEdges = { top: 0, right: 0, bottom: 0, left: 0 };

export const DEFAULT_BACKGROUND_GRADIENT: BroadcastGradientSettings = {
  colors: ["#0a3151", "#d64f3d", "#f2c65f"],
  direction: "left-to-right"
};

export const DEFAULT_BACKGROUND_IMAGE_TRANSFORM: BroadcastMediaTransform = {
  fitMode: "fill",
  scale: 1,
  x: 0,
  y: 0,
  rotation: 0
};

export const BROADCAST_FRAME_PRESETS: BroadcastFramePreset[] = [
  {
    id: "museum-sketch",
    label: "Museum sketch",
    description: "Child-drawn red, blue, and sunny-yellow double line.",
    panelColor: "#fff8e7",
    style: { thickness: 8, color: "#e45745", bevel: false, innerOutline: true, innerOutlineColor: "#f2c65f", outerOutline: true, outerOutlineColor: "#1f7295" }
  },
  {
    id: "dark-gold",
    label: "Dark & gold",
    description: "Museum-black panel with a restrained warm-gold edge.",
    panelColor: "#07111e",
    style: { thickness: 9, color: "#c89b45", bevel: true, innerOutline: true, innerOutlineColor: "#f1d48b", outerOutline: false, outerOutlineColor: "#513918" }
  },
  {
    id: "brass",
    label: "Brass",
    description: "A softly beveled antique-brass presentation frame.",
    panelColor: "#14120e",
    style: { thickness: 10, color: "#a67c3c", bevel: true, innerOutline: true, innerOutlineColor: "#d6b66f", outerOutline: true, outerOutlineColor: "#49341c" }
  },
  {
    id: "gold",
    label: "Gold",
    description: "Bright recognition gold with a fine inner detail.",
    panelColor: "#120f09",
    style: { thickness: 8, color: "#e1b64e", bevel: true, innerOutline: true, innerOutlineColor: "#fff0ad", outerOutline: false, outerOutlineColor: "#6a4b11" }
  },
  {
    id: "black",
    label: "Black",
    description: "Quiet gallery black for high-contrast compositions.",
    panelColor: "#05070a",
    style: { thickness: 7, color: "#101318", bevel: true, innerOutline: true, innerOutlineColor: "#353b43", outerOutline: false, outerOutlineColor: "#000000" }
  },
  {
    id: "white",
    label: "White",
    description: "Clean white with a subtle cool-gray outline.",
    panelColor: "#eef3f5",
    style: { thickness: 7, color: "#f8faf9", bevel: true, innerOutline: true, innerOutlineColor: "#c9d3d8", outerOutline: true, outerOutlineColor: "#78858c" }
  },
  {
    id: "matte-plastic",
    label: "Matte plastic",
    description: "Soft museum-fixture blue with minimal sheen.",
    panelColor: "#0a1820",
    style: { thickness: 10, color: "#315866", bevel: true, innerOutline: false, innerOutlineColor: "#7e9ca7", outerOutline: true, outerOutlineColor: "#102d38" }
  }
];

export const BROADCAST_BACKGROUND_PRESETS: BroadcastBackgroundPreset[] = [
  { id: "board", label: "Board", description: "Keep the assigned recognition board visible.", swatch: "linear-gradient(135deg,#122440,#b48642)" },
  { id: "solid-midnight", label: "Solid", description: "A calm solid canvas behind the source.", swatch: "#07111e" },
  { id: "wonder-gradient", label: "Gradient", description: "Editable museum colors and direction.", swatch: "linear-gradient(90deg,#0a3151,#d64f3d,#f2c65f)" },
  { id: "museum-branded", label: "Museum", description: "Built-in branded art matched to each orientation.", swatch: "linear-gradient(135deg,#fff5d9,#4fa7b3 58%,#d64f3d)" },
  { id: "custom-image", label: "Custom image", description: "Upload and position a saved image.", swatch: "linear-gradient(135deg,#293a56,#72548e)" },
  { id: "none", label: "None", description: "Transparent canvas when the output supports alpha.", swatch: "repeating-conic-gradient(#d9dee3 0 25%,#f7f8f9 0 50%) 50% / 10px 10px" }
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const color = (value: string | undefined, fallback: string) => value && HEX_COLOR.test(value) ? value : fallback;

export function normalizeCropEdges(value?: Partial<BroadcastCropEdges>): BroadcastCropEdges {
  const normalized = {
    top: clamp(value?.top ?? 0, 0, 45),
    right: clamp(value?.right ?? 0, 0, 45),
    bottom: clamp(value?.bottom ?? 0, 0, 45),
    left: clamp(value?.left ?? 0, 0, 45)
  };
  if (normalized.left + normalized.right > 90) normalized.right = 90 - normalized.left;
  if (normalized.top + normalized.bottom > 90) normalized.bottom = 90 - normalized.top;
  return normalized;
}

export function normalizeGradient(value?: Partial<BroadcastGradientSettings>): BroadcastGradientSettings {
  const validDirections: BroadcastGradientDirection[] = ["left-to-right", "right-to-left", "top-to-bottom", "bottom-to-top", "radial"];
  const colors = (value?.colors ?? []).filter((item) => HEX_COLOR.test(item)).slice(0, 4);
  while (colors.length < 2) colors.push(DEFAULT_BACKGROUND_GRADIENT.colors[colors.length]);
  return {
    colors,
    direction: validDirections.includes(value?.direction as BroadcastGradientDirection)
      ? value!.direction as BroadcastGradientDirection
      : DEFAULT_BACKGROUND_GRADIENT.direction
  };
}

export function normalizeMediaTransform(value?: Partial<BroadcastMediaTransform>): BroadcastMediaTransform {
  return {
    fitMode: value?.fitMode === "fit" ? "fit" : "fill",
    scale: clamp(value?.scale ?? 1, .5, 3),
    x: clamp(value?.x ?? 0, -100, 100),
    y: clamp(value?.y ?? 0, -100, 100),
    rotation: clamp(value?.rotation ?? 0, -180, 180)
  };
}

export function normalizeFrameStyle(live: Pick<LivePresentation, "frameStyle" | "frameBorderColor" | "frameBorderWidth">): BroadcastFrameStyle {
  const fallback: BroadcastFrameStyle = {
    presetId: "custom",
    thickness: clamp(live.frameBorderWidth, 0, 24),
    color: color(live.frameBorderColor, "#f4c45d"),
    bevel: false,
    innerOutline: false,
    innerOutlineColor: "#f8e3a8",
    outerOutline: false,
    outerOutlineColor: "#2f2414"
  };
  if (!live.frameStyle) return fallback;
  const ids: BroadcastFramePresetId[] = ["custom", ...BROADCAST_FRAME_PRESETS.map((preset) => preset.id)];
  return {
    presetId: ids.includes(live.frameStyle.presetId) ? live.frameStyle.presetId : "custom",
    thickness: clamp(live.frameStyle.thickness, 0, 24),
    color: color(live.frameStyle.color, fallback.color),
    bevel: Boolean(live.frameStyle.bevel),
    innerOutline: Boolean(live.frameStyle.innerOutline),
    innerOutlineColor: color(live.frameStyle.innerOutlineColor, fallback.innerOutlineColor),
    outerOutline: Boolean(live.frameStyle.outerOutline),
    outerOutlineColor: color(live.frameStyle.outerOutlineColor, fallback.outerOutlineColor)
  };
}

export function normalizeBroadcastComposition(live: LivePresentation): LivePresentation {
  const backgroundModes: BroadcastBackgroundMode[] = ["board", "color", "gradient", "image", "none"];
  const backgroundPresetIds = BROADCAST_BACKGROUND_PRESETS.map((preset) => preset.id);
  const frameStyle = normalizeFrameStyle(live);
  return {
    ...live,
    backgroundMode: backgroundModes.includes(live.backgroundMode) ? live.backgroundMode : "board",
    backgroundColor: color(live.backgroundColor, "#07111e"),
    backgroundPresetId: backgroundPresetIds.includes(live.backgroundPresetId as BroadcastBackgroundPresetId)
      ? live.backgroundPresetId
      : live.backgroundMode === "image" && live.backgroundImage ? "custom-image" : live.backgroundMode === "color" ? "solid-midnight" : "board",
    backgroundImagePreset: live.backgroundImagePreset === "museum-branded" ? "museum-branded" : "custom",
    backgroundGradient: normalizeGradient(live.backgroundGradient),
    backgroundImageTransform: normalizeMediaTransform(live.backgroundImageTransform),
    frameStyle,
    // Legacy fields remain synchronized so pre-refinement render paths retain the same appearance.
    frameBorderColor: frameStyle.color,
    frameBorderWidth: frameStyle.thickness,
    frame: {
      ...live.frame,
      fitMode: live.frame.fitMode === "fit" ? "fit" : "fill",
      cropEdges: normalizeCropEdges(live.frame.cropEdges)
    }
  };
}

export function framePresetPatch(live: LivePresentation, presetId: Exclude<BroadcastFramePresetId, "custom">): Partial<LivePresentation> {
  const preset = BROADCAST_FRAME_PRESETS.find((item) => item.id === presetId);
  if (!preset) return {};
  const frameStyle: BroadcastFrameStyle = { presetId, ...preset.style };
  return {
    frameStyle,
    frameBorderColor: frameStyle.color,
    frameBorderWidth: frameStyle.thickness,
    panelColor: preset.panelColor
  };
}

export function customFramePatch(live: LivePresentation, patch: Partial<Omit<BroadcastFrameStyle, "presetId">>): Partial<LivePresentation> {
  const frameStyle = { ...normalizeFrameStyle(live), ...patch, presetId: "custom" as const };
  return {
    frameStyle,
    frameBorderColor: frameStyle.color,
    frameBorderWidth: frameStyle.thickness
  };
}

export function backgroundPresetPatch(presetId: BroadcastBackgroundPresetId): Partial<LivePresentation> {
  if (presetId === "board") return { backgroundMode: "board", backgroundPresetId: presetId };
  if (presetId === "solid-midnight") return { backgroundMode: "color", backgroundColor: "#07111e", backgroundPresetId: presetId };
  if (presetId === "wonder-gradient") return { backgroundMode: "gradient", backgroundGradient: DEFAULT_BACKGROUND_GRADIENT, backgroundPresetId: presetId };
  if (presetId === "museum-branded") return { backgroundMode: "image", backgroundImagePreset: "museum-branded", backgroundPresetId: presetId };
  if (presetId === "custom-image") return { backgroundMode: "image", backgroundImagePreset: "custom", backgroundPresetId: presetId };
  return { backgroundMode: "none", backgroundPresetId: "none" };
}

export function gradientCss(gradient: BroadcastGradientSettings): string {
  const normalized = normalizeGradient(gradient);
  if (normalized.direction === "radial") return `radial-gradient(circle at center, ${normalized.colors.join(", ")})`;
  const angle = normalized.direction === "right-to-left" ? "270deg"
    : normalized.direction === "top-to-bottom" ? "180deg"
      : normalized.direction === "bottom-to-top" ? "0deg"
        : "90deg";
  return `linear-gradient(${angle}, ${normalized.colors.join(", ")})`;
}

export function museumBackgroundAsset(orientation: "Portrait" | "Landscape"): string {
  return orientation === "Portrait" ? "assets/broadcast/cms-portrait.svg" : "assets/broadcast/cms-landscape.svg";
}

export function backgroundImageAsset(live: LivePresentation, orientation: "Portrait" | "Landscape"): string | undefined {
  return live.backgroundImagePreset === "museum-branded" ? museumBackgroundAsset(orientation) : live.backgroundImage;
}

export function resolveBroadcastAssetUrl(source: string, baseUrl = "/"): string {
  if (/^(?:data:|blob:|https?:\/\/)/i.test(source) || source.startsWith("/")) return source;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${source.replace(/^\.\//, "")}`;
}

export function frameSurfaceStyle(live: LivePresentation): CSSProperties {
  const frame = normalizeFrameStyle(live);
  const shadows: string[] = [];
  if (frame.innerOutline) shadows.push(`inset 0 0 0 2px ${frame.innerOutlineColor}`);
  if (frame.outerOutline) shadows.push(`0 0 0 2px ${frame.outerOutlineColor}`);
  if (frame.bevel) shadows.push("inset 2px 2px 0 rgba(255,255,255,.28)", "inset -2px -2px 0 rgba(0,0,0,.3)");
  return {
    backgroundColor: live.panelColor,
    border: frame.thickness > 0 ? `${frame.thickness}px solid ${frame.color}` : "none",
    boxSizing: "border-box",
    boxShadow: shadows.length ? shadows.join(", ") : "none"
  };
}

export function backgroundLayerStyle(live: LivePresentation): CSSProperties {
  if (live.backgroundMode === "gradient") return { backgroundImage: gradientCss(live.backgroundGradient ?? DEFAULT_BACKGROUND_GRADIENT) };
  if (live.backgroundMode === "color") return { backgroundColor: live.backgroundColor };
  return {};
}

export function backgroundMediaStyle(live: LivePresentation): CSSProperties {
  const transform = normalizeMediaTransform(live.backgroundImageTransform);
  return {
    objectFit: transform.fitMode === "fit" ? "contain" : "cover",
    transform: `translate(${transform.x}%, ${transform.y}%) rotate(${transform.rotation}deg) scale(${transform.scale})`
  };
}
