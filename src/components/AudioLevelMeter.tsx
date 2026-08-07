import { useEffect, useId, useRef, useState } from "react";

export type AudioLevelStatus = "live" | "no-signal" | "muted";

export interface AudioLevelReading {
  level: number;
  status: AudioLevelStatus;
}

interface AudioLevelMeterProps {
  stream: MediaStream | null;
  muted?: boolean;
  gain?: number;
  className?: string;
  label?: string;
  noSignalThreshold?: number;
  onLevelChange?: (reading: AudioLevelReading) => void;
}

const STATUS_LABELS: Record<AudioLevelStatus, string> = {
  live: "Live signal",
  "no-signal": "No signal",
  muted: "Muted"
};

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function joinClassNames(...names: Array<string | undefined | false>) {
  return names.filter(Boolean).join(" ");
}

/**
 * Observes a MediaStream through an isolated Web Audio graph. Meter gain affects
 * only this analysis branch; the source stream and its tracks are never changed.
 */
export function AudioLevelMeter({
  stream,
  muted = false,
  gain = 1,
  className,
  label = "Audio level",
  noSignalThreshold = 0.008,
  onLevelChange
}: AudioLevelMeterProps) {
  const labelId = useId();
  const [reading, setReading] = useState<AudioLevelReading>({
    level: 0,
    status: muted ? "muted" : "no-signal"
  });
  const contextRef = useRef<AudioContext | null>(null);
  const meterGainRef = useRef<GainNode | null>(null);
  const mutedRef = useRef(muted);
  const thresholdRef = useRef(noSignalThreshold);
  const onLevelChangeRef = useRef(onLevelChange);

  mutedRef.current = muted;
  thresholdRef.current = clamp(noSignalThreshold, 0, 1);
  onLevelChangeRef.current = onLevelChange;

  useEffect(() => {
    const context = contextRef.current;
    const meterGain = meterGainRef.current;
    if (!context || !meterGain) return;
    meterGain.gain.setTargetAtTime(clamp(gain, 0, 2), context.currentTime, 0.01);
  }, [gain]);

  useEffect(() => {
    if (!muted && stream) return;
    const nextReading: AudioLevelReading = {
      level: muted ? reading.level : 0,
      status: muted ? "muted" : "no-signal"
    };
    setReading(nextReading);
    onLevelChangeRef.current?.(nextReading);
    // The animation loop owns all other reading updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted, stream]);

  useEffect(() => {
    if (!stream || typeof window === "undefined") return;

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) {
      const nextReading: AudioLevelReading = { level: 0, status: mutedRef.current ? "muted" : "no-signal" };
      setReading(nextReading);
      onLevelChangeRef.current?.(nextReading);
      return;
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    let context: AudioContext;
    let source: MediaStreamAudioSourceNode;
    let meterGain: GainNode;
    let analyser: AnalyserNode;
    let silentOutput: GainNode;

    try {
      context = new AudioContextConstructor();
      source = context.createMediaStreamSource(stream);
      meterGain = context.createGain();
      analyser = context.createAnalyser();
      silentOutput = context.createGain();

      meterGain.gain.value = clamp(gain, 0, 2);
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.72;
      silentOutput.gain.value = 0;

      source.connect(meterGain);
      meterGain.connect(analyser);
      analyser.connect(silentOutput);
      silentOutput.connect(context.destination);
    } catch {
      const nextReading: AudioLevelReading = { level: 0, status: mutedRef.current ? "muted" : "no-signal" };
      setReading(nextReading);
      onLevelChangeRef.current?.(nextReading);
      return;
    }

    contextRef.current = context;
    meterGainRef.current = meterGain;
    const samples = new Uint8Array(analyser.fftSize);
    let animationFrame = 0;
    let lastPublishedAt = 0;
    let lastSignalAt = -Infinity;
    let previousReading: AudioLevelReading = { level: 0, status: mutedRef.current ? "muted" : "no-signal" };

    if (context.state === "suspended") void context.resume().catch(() => undefined);

    const publish = (nextReading: AudioLevelReading, now: number) => {
      const changedEnough = Math.abs(nextReading.level - previousReading.level) >= 0.012;
      const statusChanged = nextReading.status !== previousReading.status;
      if (!statusChanged && !changedEnough && now - lastPublishedAt < 120) return;
      previousReading = nextReading;
      lastPublishedAt = now;
      setReading(nextReading);
      onLevelChangeRef.current?.(nextReading);
    };

    const sample = (now: number) => {
      analyser.getByteTimeDomainData(samples);
      let squareSum = 0;
      for (const value of samples) {
        const centered = (value - 128) / 128;
        squareSum += centered * centered;
      }

      const rms = Math.sqrt(squareSum / samples.length);
      const decibels = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
      const level = clamp((decibels + 60) / 60, 0, 1);
      const liveTracks = audioTracks.filter((track) => track.readyState === "live");
      const tracksMuted = liveTracks.length > 0 && liveTracks.every((track) => track.muted || !track.enabled);
      const isMuted = mutedRef.current || tracksMuted;

      if (rms >= thresholdRef.current && liveTracks.length) lastSignalAt = now;
      const hasSignal = liveTracks.length > 0 && now - lastSignalAt < 450;
      const status: AudioLevelStatus = isMuted ? "muted" : hasSignal ? "live" : "no-signal";
      publish({ level, status }, now);
      animationFrame = window.requestAnimationFrame(sample);
    };

    animationFrame = window.requestAnimationFrame(sample);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      source.disconnect();
      meterGain.disconnect();
      analyser.disconnect();
      silentOutput.disconnect();
      if (contextRef.current === context) contextRef.current = null;
      if (meterGainRef.current === meterGain) meterGainRef.current = null;
      if (context.state !== "closed") void context.close().catch(() => undefined);
    };
  }, [stream]);

  const percentage = Math.round(reading.level * 100);

  return (
    <div
      className={joinClassNames("audio-level-meter", `audio-level-meter--${reading.status}`, className)}
      data-status={reading.status}
    >
      <div className="audio-level-meter__heading">
        <span id={labelId} className="audio-level-meter__label">
          {label}
        </span>
        <span className="audio-level-meter__status" role="status" aria-live="polite">
          {STATUS_LABELS[reading.status]}
        </span>
      </div>
      <div
        className="audio-level-meter__track"
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
        aria-valuetext={`${STATUS_LABELS[reading.status]}, ${percentage} percent`}
      >
        <span className="audio-level-meter__fill" style={{ transform: `scaleX(${reading.level})` }} />
      </div>
      <output className="audio-level-meter__value" aria-hidden="true">
        {percentage}%
      </output>
    </div>
  );
}
