import { ImagePlus, RotateCcw } from "lucide-react";
import {
  BROADCAST_BACKGROUND_PRESETS,
  BROADCAST_FRAME_PRESETS,
  DEFAULT_BACKGROUND_GRADIENT,
  DEFAULT_BACKGROUND_IMAGE_TRANSFORM,
  backgroundPresetPatch,
  customFramePatch,
  framePresetPatch,
  normalizeBroadcastComposition,
  normalizeGradient,
  normalizeMediaTransform
} from "../broadcastComposition";
import type {
  BroadcastBackgroundPresetId,
  BroadcastFramePresetId,
  BroadcastGradientDirection,
  LivePresentation
} from "../types";

interface BroadcastCompositionControlsProps {
  live: LivePresentation;
  onPatch: (patch: Partial<LivePresentation>) => void;
}

const gradientDirectionLabels: Record<BroadcastGradientDirection, string> = {
  "left-to-right": "Left to right",
  "right-to-left": "Right to left",
  "top-to-bottom": "Top to bottom",
  "bottom-to-top": "Bottom to top",
  radial: "Radial"
};

function RangeField({ label, value, min, max, step = 1, suffix = "", onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return <label className="broadcast-range-field"><span>{label}<b>{Math.round(value * (step < 1 ? 100 : 1))}{suffix}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function BroadcastCompositionControls({ live, onPatch }: BroadcastCompositionControlsProps) {
  const normalized = normalizeBroadcastComposition(live);
  const frame = normalized.frameStyle!;
  const gradient = normalizeGradient(normalized.backgroundGradient);
  const imageTransform = normalizeMediaTransform(normalized.backgroundImageTransform);

  const patchGradient = (patch: Partial<typeof gradient>) => onPatch({
    backgroundMode: "gradient",
    backgroundPresetId: "wonder-gradient",
    backgroundGradient: normalizeGradient({ ...gradient, ...patch })
  });

  const setGradientColor = (index: number, value: string) => patchGradient({
    colors: gradient.colors.map((item, itemIndex) => itemIndex === index ? value : item)
  });

  const patchImageTransform = (patch: Partial<typeof imageTransform>) => onPatch({
    backgroundImageTransform: normalizeMediaTransform({ ...imageTransform, ...patch })
  });

  const uploadImage = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") return;
      onPatch({
        backgroundMode: "image",
        backgroundPresetId: "custom-image",
        backgroundImagePreset: "custom",
        backgroundImage: reader.result
      });
    }, { once: true });
    reader.readAsDataURL(file);
  };

  return <div className="broadcast-composition-controls">
    <section className="broadcast-style-section">
      <div className="broadcast-style-heading"><div><strong>Camera frame</strong><span>Saved museum-ready styles</span></div><select aria-label="Camera frame preset" value={frame.presetId} onChange={(event) => {
        const presetId = event.target.value as BroadcastFramePresetId;
        if (presetId !== "custom") onPatch(framePresetPatch(normalized, presetId));
      }}><option value="custom">Custom</option>{BROADCAST_FRAME_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></div>
      <div className="broadcast-frame-presets" role="list" aria-label="Camera frame presets">
        {BROADCAST_FRAME_PRESETS.map((preset) => <button
          type="button"
          key={preset.id}
          className={frame.presetId === preset.id ? "selected" : ""}
          title={preset.description}
          aria-pressed={frame.presetId === preset.id}
          onClick={() => onPatch(framePresetPatch(normalized, preset.id))}
        ><i style={{ background: preset.style.color, boxShadow: `inset 0 0 0 2px ${preset.style.innerOutlineColor}` }} /><span>{preset.label}</span></button>)}
      </div>
      <div className="broadcast-frame-detail-grid">
        <label className="field"><span>Frame color</span><input type="color" value={frame.color} onChange={(event) => onPatch(customFramePatch(normalized, { color: event.target.value }))} /></label>
        <RangeField label="Thickness" value={frame.thickness} min={0} max={24} suffix=" px" onChange={(thickness) => onPatch(customFramePatch(normalized, { thickness }))} />
      </div>
      <div className="broadcast-frame-toggles">
        <label><input type="checkbox" checked={frame.bevel} onChange={(event) => onPatch(customFramePatch(normalized, { bevel: event.target.checked }))} /> Bevel</label>
        <label><input type="checkbox" checked={frame.innerOutline} onChange={(event) => onPatch(customFramePatch(normalized, { innerOutline: event.target.checked }))} /> Inner outline</label>
        <label><input type="checkbox" checked={frame.outerOutline} onChange={(event) => onPatch(customFramePatch(normalized, { outerOutline: event.target.checked }))} /> Outer outline</label>
      </div>
      {(frame.innerOutline || frame.outerOutline) && <div className="broadcast-outline-colors">
        {frame.innerOutline && <label className="field"><span>Inner outline</span><input type="color" value={frame.innerOutlineColor} onChange={(event) => onPatch(customFramePatch(normalized, { innerOutlineColor: event.target.value }))} /></label>}
        {frame.outerOutline && <label className="field"><span>Outer outline</span><input type="color" value={frame.outerOutlineColor} onChange={(event) => onPatch(customFramePatch(normalized, { outerOutlineColor: event.target.value }))} /></label>}
      </div>}
    </section>

    <section className="broadcast-style-section broadcast-background-section">
      <div className="broadcast-style-heading"><div><strong>Canvas background</strong><span>Saved choices for every display</span></div></div>
      <div className="broadcast-background-presets" role="list" aria-label="Broadcast background presets">
        {BROADCAST_BACKGROUND_PRESETS.map((preset) => <button
          type="button"
          key={preset.id}
          className={normalized.backgroundPresetId === preset.id ? "selected" : ""}
          title={preset.description}
          aria-pressed={normalized.backgroundPresetId === preset.id}
          onClick={() => onPatch(backgroundPresetPatch(preset.id as BroadcastBackgroundPresetId))}
        ><i style={{ background: preset.swatch }} /><span>{preset.label}</span></button>)}
      </div>

      {normalized.backgroundMode === "color" && <label className="field broadcast-solid-color"><span>Solid color</span><input type="color" value={normalized.backgroundColor} onChange={(event) => onPatch({ backgroundColor: event.target.value, backgroundPresetId: "solid-midnight" })} /></label>}

      {normalized.backgroundMode === "gradient" && <div className="broadcast-gradient-editor">
        <label className="field"><span>Direction</span><select value={gradient.direction} onChange={(event) => patchGradient({ direction: event.target.value as BroadcastGradientDirection })}>{Object.entries(gradientDirectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="broadcast-gradient-colors">{gradient.colors.map((item, index) => <label key={`${index}-${item}`}><span>Color {index + 1}</span><input type="color" value={item} onChange={(event) => setGradientColor(index, event.target.value)} />{gradient.colors.length > 2 && <button type="button" aria-label={`Remove gradient color ${index + 1}`} onClick={() => patchGradient({ colors: gradient.colors.filter((_, itemIndex) => itemIndex !== index) })}>×</button>}</label>)}</div>
        <div className="broadcast-gradient-actions"><button type="button" disabled={gradient.colors.length >= 4} onClick={() => patchGradient({ colors: [...gradient.colors, gradient.colors[gradient.colors.length - 1] ?? "#ffffff"] })}>Add color</button><button type="button" onClick={() => patchGradient(DEFAULT_BACKGROUND_GRADIENT)}><RotateCcw size={13} /> Reset</button></div>
      </div>}

      {normalized.backgroundMode === "image" && <div className="broadcast-image-editor">
        <div className="broadcast-image-source-row">
          <button type="button" className={normalized.backgroundImagePreset === "museum-branded" ? "selected" : ""} onClick={() => onPatch({ backgroundImagePreset: "museum-branded", backgroundPresetId: "museum-branded" })}>Museum branded <small>Auto portrait / landscape</small></button>
          <label className={normalized.backgroundImagePreset === "custom" ? "selected image-upload" : "image-upload"}><ImagePlus size={15} /><span>{normalized.backgroundImage ? "Replace custom image" : "Choose custom image"}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => uploadImage(event.target.files?.[0])} /></label>
        </div>
        <div className="broadcast-image-fit" role="group" aria-label="Background image fit"><button type="button" className={imageTransform.fitMode === "fill" ? "selected" : ""} onClick={() => patchImageTransform({ fitMode: "fill" })}>Fill canvas</button><button type="button" className={imageTransform.fitMode === "fit" ? "selected" : ""} onClick={() => patchImageTransform({ fitMode: "fit" })}>Fit whole image</button></div>
        <div className="broadcast-image-transform-grid">
          <RangeField label="Zoom" value={imageTransform.scale} min={.5} max={3} step={.05} suffix="%" onChange={(scale) => patchImageTransform({ scale })} />
          <RangeField label="Position X" value={imageTransform.x} min={-100} max={100} suffix="%" onChange={(x) => patchImageTransform({ x })} />
          <RangeField label="Position Y" value={imageTransform.y} min={-100} max={100} suffix="%" onChange={(y) => patchImageTransform({ y })} />
          <RangeField label="Rotation" value={imageTransform.rotation} min={-180} max={180} suffix="°" onChange={(rotation) => patchImageTransform({ rotation })} />
        </div>
        <button type="button" className="broadcast-reset-transform" onClick={() => onPatch({ backgroundImageTransform: DEFAULT_BACKGROUND_IMAGE_TRANSFORM })}><RotateCcw size={13} /> Reset image placement</button>
      </div>}
    </section>
  </div>;
}
