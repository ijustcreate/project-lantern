import { useEffect, useRef } from "react";
import { Crosshair, X } from "lucide-react";
import { rgbToHex } from "../backgroundRemoval";
import "./ChromaKeySampler.css";

export function ChromaKeySampler({
  stream,
  active,
  currentColor,
  onActiveChange,
  onSample
}: {
  stream: MediaStream | null;
  active: boolean;
  currentColor: string;
  onActiveChange: (active: boolean) => void;
  onSample: (color: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [stream, active]);

  const sample = (event: React.PointerEvent<HTMLVideoElement>) => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
    const bounds = video.getBoundingClientRect();
    const scale = Math.max(bounds.width / video.videoWidth, bounds.height / video.videoHeight);
    const renderedWidth = video.videoWidth * scale;
    const renderedHeight = video.videoHeight * scale;
    const offsetX = (renderedWidth - bounds.width) / 2;
    const offsetY = (renderedHeight - bounds.height) / 2;
    const sourceX = Math.max(0, Math.min(video.videoWidth - 1, (event.clientX - bounds.left + offsetX) / scale));
    const sourceY = Math.max(0, Math.min(video.videoHeight - 1, (event.clientY - bounds.top + offsetY) / scale));
    const radius = 2;
    const canvas = document.createElement("canvas");
    canvas.width = radius * 2 + 1;
    canvas.height = radius * 2 + 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.drawImage(video, Math.max(0, sourceX - radius), Math.max(0, sourceY - radius), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let samples = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 0) continue;
      red += pixels[index];
      green += pixels[index + 1];
      blue += pixels[index + 2];
      samples += 1;
    }
    if (!samples) return;
    onSample(rgbToHex(red / samples, green / samples, blue / samples));
    onActiveChange(false);
  };

  if (!active) {
    return <button type="button" className="command-button secondary compact chroma-sample-trigger" disabled={!stream} onClick={() => onActiveChange(true)} title={stream ? "Open a local video sampler" : "Connect a camera or shared window first"}><Crosshair size={15} /> Sample from preview</button>;
  }

  return <div className="chroma-key-sampler">
    <header><span><Crosshair size={15} /> Click the backdrop color in the live image</span><button type="button" className="icon-button" aria-label="Cancel color sampling" title="Cancel color sampling" onClick={() => onActiveChange(false)}><X size={15} /></button></header>
    {stream
      ? <div className="chroma-sampler-video"><video ref={videoRef} autoPlay muted playsInline onPointerDown={sample} aria-label="Click the video to sample the Chroma Key color" /><span className="chroma-sampler-crosshair" aria-hidden="true" /></div>
      : <p>Connect a camera or shared window before sampling a color.</p>}
    <footer><i style={{ background: currentColor }} /><span>Current key color</span><code>{currentColor.toUpperCase()}</code></footer>
  </div>;
}
