import type { RecordingLibraryRecord } from "./recordingLibrary";

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export interface RecordingSourceDependencies {
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  createVideo: () => CapturableVideo;
}

export interface RecordingSourcePlayback {
  playback: HTMLVideoElement;
  objectUrl: string;
  stream: MediaStream;
}

const browserDependencies = (): RecordingSourceDependencies => ({
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  createVideo: () => document.createElement("video") as CapturableVideo
});

export async function createRecordingSourcePlayback(
  recording: RecordingLibraryRecord,
  dependencies: RecordingSourceDependencies = browserDependencies()
): Promise<RecordingSourcePlayback> {
  const objectUrl = dependencies.createObjectUrl(recording.blob);
  const playback = dependencies.createVideo();
  playback.src = objectUrl;
  playback.loop = true;
  playback.muted = true;
  playback.playsInline = true;
  playback.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      playback.addEventListener("loadeddata", () => resolve(), { once: true });
      playback.addEventListener("error", () => reject(new Error("The selected recording could not be decoded by this browser.")), { once: true });
    });
    await playback.play();
    const capture = playback.captureStream ?? playback.mozCaptureStream;
    if (!capture) throw new Error("This browser cannot use saved video as a live preview source.");
    const stream = capture.call(playback);
    if (!stream.getVideoTracks().length) throw new Error("The selected recording did not expose a playable video track.");
    return { playback, objectUrl, stream };
  } catch (error) {
    playback.pause();
    dependencies.revokeObjectUrl(objectUrl);
    throw error;
  }
}
