import type {
  BoardDonorPresentation,
  DonorBoardProgram,
  DisplayProfile,
  RecognitionIcon
} from "./types";

export interface BoardPresentationFallbacks {
  fontFamily: NonNullable<DisplayProfile["fontFamily"]>;
  nameColor: string;
  accentColor: string;
}

export interface ResolvedBoardDonorPresentation {
  fontFamily: NonNullable<DisplayProfile["fontFamily"]>;
  nameColor: string;
  accentColor: string;
  highlight: NonNullable<BoardDonorPresentation["highlight"]>;
  recognitionIcon: RecognitionIcon;
  recognitionIconImage?: string;
  animation: NonNullable<BoardDonorPresentation["animation"]>;
}

export function resolveBoardDonorPresentation(
  program: DonorBoardProgram,
  donorId: string,
  fallbacks: BoardPresentationFallbacks
): ResolvedBoardDonorPresentation {
  const boardStyle = program.donorPresentation ?? {};
  const donorStyle = program.donorStyles?.[donorId] ?? {};
  return {
    fontFamily: donorStyle.fontFamily ?? boardStyle.fontFamily ?? program.fontFamily ?? fallbacks.fontFamily,
    nameColor: donorStyle.nameColor ?? boardStyle.nameColor ?? fallbacks.nameColor,
    accentColor: donorStyle.accentColor ?? boardStyle.accentColor ?? fallbacks.accentColor,
    highlight: donorStyle.highlight ?? boardStyle.highlight ?? "none",
    recognitionIcon: donorStyle.recognitionIcon ?? boardStyle.recognitionIcon ?? "star",
    recognitionIconImage: donorStyle.recognitionIconImage ?? boardStyle.recognitionIconImage,
    animation: donorStyle.animation ?? boardStyle.animation ?? "none"
  };
}

export function patchBoardDonorStyle(
  program: DonorBoardProgram,
  donorId: string,
  patch: Partial<BoardDonorPresentation>
): DonorBoardProgram["donorStyles"] {
  const current = program.donorStyles?.[donorId] ?? {};
  return {
    ...(program.donorStyles ?? {}),
    [donorId]: { ...current, ...patch }
  };
}

export function clearBoardDonorStyle(program: DonorBoardProgram, donorId: string): DonorBoardProgram["donorStyles"] {
  const donorStyles = { ...(program.donorStyles ?? {}) };
  delete donorStyles[donorId];
  return Object.keys(donorStyles).length ? donorStyles : undefined;
}

export function boardUsesDonorAnimation(program?: DonorBoardProgram) {
  if (!program) return false;
  if (program.donorPresentation?.animation && program.donorPresentation.animation !== "none") return true;
  return Object.values(program.donorStyles ?? {}).some((style) => style.animation && style.animation !== "none");
}
