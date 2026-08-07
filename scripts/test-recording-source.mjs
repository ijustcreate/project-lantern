import assert from "node:assert/strict";
import { createRecordingSourcePlayback } from "../src/recordingSource.ts";

const videoTrack = { kind: "video" };
const stream = { getVideoTracks: () => [videoTrack] };
const playback = {
  src: "",
  loop: false,
  muted: false,
  playsInline: false,
  preload: "",
  playCalls: 0,
  pauseCalls: 0,
  addEventListener(type, listener) { if (type === "loadeddata") queueMicrotask(listener); },
  async play() { this.playCalls += 1; },
  pause() { this.pauseCalls += 1; },
  captureStream() { return stream; }
};
const revoked = [];
const recording = { id: "recording-1", title: "Museum welcome", blob: new Blob(["video"]) };
const result = await createRecordingSourcePlayback(recording, {
  createObjectUrl: () => "blob:recording-1",
  revokeObjectUrl: (url) => revoked.push(url),
  createVideo: () => playback
});

assert.equal(result.stream, stream);
assert.equal(result.objectUrl, "blob:recording-1");
assert.equal(playback.src, "blob:recording-1");
assert.equal(playback.loop, true);
assert.equal(playback.muted, true);
assert.equal(playback.playsInline, true);
assert.equal(playback.playCalls, 1);
assert.deepEqual(revoked, []);

const unsupportedPlayback = {
  ...playback,
  addEventListener(type, listener) { if (type === "loadeddata") queueMicrotask(listener); },
  captureStream: undefined,
  mozCaptureStream: undefined,
  pauseCalls: 0,
  pause() { this.pauseCalls += 1; }
};
await assert.rejects(() => createRecordingSourcePlayback(recording, {
  createObjectUrl: () => "blob:unsupported",
  revokeObjectUrl: (url) => revoked.push(url),
  createVideo: () => unsupportedPlayback
}), /cannot use saved video/);
assert.equal(unsupportedPlayback.pauseCalls, 1);
assert.deepEqual(revoked, ["blob:unsupported"]);

console.log("Recording source fixture passed: selected Blob playback, looping MediaStream capture, and failure cleanup.");
