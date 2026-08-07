import {
  backgroundImageAsset,
  backgroundLayerStyle,
  backgroundMediaStyle,
  resolveBroadcastAssetUrl
} from "../broadcastComposition";
import type { LivePresentation } from "../types";

export function BroadcastBackgroundLayer({ live, orientation, className = "broadcast-background-layer" }: {
  live: LivePresentation;
  orientation: "Portrait" | "Landscape";
  className?: string;
}) {
  if (live.backgroundMode === "board") return null;
  const image = live.backgroundMode === "image" ? backgroundImageAsset(live, orientation) : undefined;
  return <div className={`${className} mode-${live.backgroundMode}`} style={backgroundLayerStyle(live)} aria-hidden="true">
    {image && <img src={resolveBroadcastAssetUrl(image, import.meta.env.BASE_URL)} alt="" style={backgroundMediaStyle(live)} />}
  </div>;
}
