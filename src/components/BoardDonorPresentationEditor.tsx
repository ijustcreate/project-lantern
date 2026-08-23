import { useEffect, useMemo, useState } from "react";
import type {
  BoardDonorAnimation,
  BoardDonorHighlight,
  BoardDonorPresentation,
  Donor,
  DisplayProfile,
  RecognitionIcon
} from "../types";
import { resolveBoardDonorPresentation, type BoardPresentationFallbacks, type DonorPresentationScope } from "../boardPresentation";

type FontFamily = NonNullable<DisplayProfile["fontFamily"]>;

interface BoardDonorPresentationEditorProps {
  scope: DonorPresentationScope;
  donors: Donor[];
  fallbacks: BoardPresentationFallbacks;
  fontOptions: FontFamily[];
  fontLabels: Record<FontFamily, string>;
  iconsVisible: boolean;
  onIconsVisibleChange: (visible: boolean) => void;
  onPatchDefaults: (patch: Partial<BoardDonorPresentation>) => void;
  onPatchDonor: (donorId: string, patch: Partial<BoardDonorPresentation>) => void;
  onClearDefaults: () => void;
  onClearDonor: (donorId: string) => void;
}

const highlightLabels: Record<BoardDonorHighlight, string> = {
  none: "None",
  "fine-underline": "Fine underline",
  "soft-underline": "Soft underline",
  "soft-highlight": "Soft highlight"
};

const animationLabels: Record<BoardDonorAnimation, string> = {
  none: "None",
  "grow-shrink": "Grow / Shrink",
  "slow-shimmer": "Slow Shimmer",
  "letter-wave": "Letter Wave"
};

const iconLabels: Record<RecognitionIcon, string> = {
  none: "None",
  star: "Star",
  heart: "Heart",
  leaf: "Leaf",
  sparkle: "Sparkle",
  diamond: "Diamond",
  crown: "Crown",
  laurel: "Laurel",
  sun: "Sun"
};

export function recognitionIconGlyph(icon: RecognitionIcon) {
  return ({
    none: "",
    star: "★",
    heart: "♥",
    leaf: "◆",
    sparkle: "✦",
    diamond: "◇",
    crown: "♛",
    laurel: "❧",
    sun: "☀"
  } satisfies Record<RecognitionIcon, string>)[icon];
}

export function AnimatedDonorName({ name, animation }: { name: string; animation: BoardDonorAnimation }) {
  if (animation !== "letter-wave") return <span className="board-donor-name-text">{name}</span>;
  return <span className="board-donor-name-text board-letter-wave" aria-label={name}>{Array.from(name).map((letter, index) => <span aria-hidden="true" style={{ "--letter-index": index } as React.CSSProperties} key={`${letter}-${index}`}>{letter === " " ? "\u00a0" : letter}</span>)}</span>;
}

export function BoardDonorPresentationEditor({
  scope,
  donors,
  fallbacks,
  fontOptions,
  fontLabels,
  iconsVisible,
  onIconsVisibleChange,
  onPatchDefaults,
  onPatchDonor,
  onClearDefaults,
  onClearDonor
}: BoardDonorPresentationEditorProps) {
  const [selectedDonorId, setSelectedDonorId] = useState("");
  useEffect(() => {
    if (selectedDonorId && !donors.some((donor) => donor.id === selectedDonorId)) setSelectedDonorId("");
  }, [donors, selectedDonorId]);

  const selectedDonor = donors.find((donor) => donor.id === selectedDonorId);
  const presentation = useMemo(
    () => resolveBoardDonorPresentation(scope, selectedDonorId, fallbacks),
    [fallbacks, scope, selectedDonorId]
  );
  const explicit = selectedDonorId ? scope.donorStyles?.[selectedDonorId] : scope.donorPresentation;
  const patch = (value: Partial<BoardDonorPresentation>) => selectedDonorId
    ? onPatchDonor(selectedDonorId, value)
    : onPatchDefaults(value);
  const reset = () => selectedDonorId ? onClearDonor(selectedDonorId) : onClearDefaults();
  const previewName = selectedDonor?.name ?? "Board donor name";

  return <div className="board-donor-presentation-editor">
    <label className="field">
      <span>Style scope</span>
      <select value={selectedDonorId} onChange={(event) => setSelectedDonorId(event.target.value)}>
        <option value="">Panel default · all names</option>
        {donors.map((donor) => <option value={donor.id} key={donor.id}>{donor.name}</option>)}
      </select>
      <small>{selectedDonor ? `Overrides only ${selectedDonor.name} in this donor list.` : "Sets the starting presentation for every name in this donor list."}</small>
    </label>

    <div
      className={`board-donor-style-preview board-highlight-${presentation.highlight} board-animation-${presentation.animation}`}
      style={{
        "--board-donor-name": presentation.nameColor,
        "--board-donor-accent": presentation.accentColor,
        fontFamily: presentation.fontFamily
      } as React.CSSProperties}
      aria-label={`${previewName} presentation preview`}
    >
      {iconsVisible && presentation.recognitionIcon !== "none" && (presentation.recognitionIconImage
        ? <img src={presentation.recognitionIconImage} alt="" />
        : <span className="board-donor-preview-icon" aria-hidden="true">{recognitionIconGlyph(presentation.recognitionIcon)}</span>)}
      <AnimatedDonorName name={previewName} animation={presentation.animation} />
    </div>

    <label className="field">
      <span>Display font</span>
      <select value={presentation.fontFamily} onChange={(event) => patch({ fontFamily: event.target.value as FontFamily })}>
        {fontOptions.map((font) => <option value={font} key={font}>{fontLabels[font]}</option>)}
      </select>
    </label>

    <div className="board-donor-color-grid">
      <label className="field"><span>Name color</span><input type="color" value={presentation.nameColor} onChange={(event) => patch({ nameColor: event.target.value })} /></label>
      <label className="field"><span>Accent color</span><input type="color" value={presentation.accentColor} onChange={(event) => patch({ accentColor: event.target.value })} /></label>
    </div>

    <label className="field">
      <span>Underline / highlight</span>
      <select value={presentation.highlight} onChange={(event) => patch({ highlight: event.target.value as BoardDonorHighlight })}>
        {(Object.keys(highlightLabels) as BoardDonorHighlight[]).map((value) => <option value={value} key={value}>{highlightLabels[value]}</option>)}
      </select>
    </label>

    <label className="field">
      <span>Recognition icon</span>
      <select value={presentation.recognitionIcon} onChange={(event) => patch({ recognitionIcon: event.target.value as RecognitionIcon })}>
        {(Object.keys(iconLabels) as RecognitionIcon[]).map((value) => <option value={value} key={value}>{iconLabels[value]}</option>)}
      </select>
    </label>
    <label className="switch-row"><input type="checkbox" checked={iconsVisible} onChange={(event) => onIconsVisibleChange(event.target.checked)} /><span>Show recognition icons in this donor list</span></label>

    <label className="field">
      <span>Animation</span>
      <select value={presentation.animation} onChange={(event) => patch({ animation: event.target.value as BoardDonorAnimation })}>
        {(Object.keys(animationLabels) as BoardDonorAnimation[]).map((value) => <option value={value} key={value}>{animationLabels[value]}</option>)}
      </select>
      <small>Slow Shimmer is clipped to the letters. Letter Wave enlarges one letter at a time.</small>
    </label>

    <button type="button" className="command-button secondary compact" disabled={!explicit || !Object.values(explicit).some((value) => value != null)} onClick={reset}>
      {selectedDonor ? "Use panel defaults" : "Use panel font and palette defaults"}
    </button>
  </div>;
}
