export type MediaInputKind = "video" | "audio";

export type MediaDeviceErrorCode =
  | "unsupported"
  | "insecure-context"
  | "permission-denied"
  | "device-not-found"
  | "device-in-use"
  | "constraints-unsatisfied"
  | "request-superseded"
  | "manager-closed"
  | "invalid-request"
  | "acquisition-failed";

export interface MediaTrackAcquisitionRequest {
  /** The persisted device id to request. Omit it to use the browser default. */
  deviceId?: string | null;
  /** Track preferences other than deviceId, which is managed separately. */
  constraints?: Omit<MediaTrackConstraints, "deviceId">;
  /** Retry with the browser default only when an exact device is missing. Defaults to true. */
  fallbackToDefault?: boolean;
  /** Fail the whole request if this track kind cannot be acquired. Defaults to true. */
  required?: boolean;
}

export type MediaTrackSelection = boolean | MediaTrackAcquisitionRequest;

export interface MediaAcquisitionRequest {
  video?: MediaTrackSelection;
  audio?: MediaTrackSelection;
}

export interface MediaDeviceFallback {
  kind: MediaInputKind;
  requestedDeviceId: string;
  actualDeviceId?: string;
  reason: "device-missing";
}

export interface MediaAcquisitionIssue {
  kind: MediaInputKind;
  error: MediaDeviceError;
}

export interface MediaDeviceLease {
  readonly consumerId: string;
  readonly stream: MediaStream;
  readonly deviceIds: Readonly<Partial<Record<MediaInputKind, string>>>;
  readonly fallbacks: readonly MediaDeviceFallback[];
  readonly issues: readonly MediaAcquisitionIssue[];
  readonly released: boolean;
  release(): void;
}

type MediaDevicesWithCapture = Pick<MediaDevices, "getUserMedia">;

export interface MediaDeviceManagerOptions {
  /** Dependency hooks keep the manager testable without touching browser globals. */
  getMediaDevices?: () => MediaDevicesWithCapture | undefined;
  createMediaStream?: (tracks: MediaStreamTrack[]) => MediaStream;
  isSecureContext?: () => boolean;
}

interface NormalizedTrackRequest {
  kind: MediaInputKind;
  deviceId?: string;
  constraints: Omit<MediaTrackConstraints, "deviceId">;
  fallbackToDefault: boolean;
  required: boolean;
}

interface SharedSource {
  key: string;
  kind: MediaInputKind;
  track: MediaStreamTrack;
  actualDeviceId?: string;
  references: number;
  stopped: boolean;
  handleEnded: () => void;
}

interface SourceReservation {
  source: SharedSource;
  fallback?: MediaDeviceFallback;
}

interface LeaseTrack {
  clone: MediaStreamTrack;
  source: SharedSource;
  released: boolean;
}

interface InternalLease {
  consumerId: string;
  stream: MediaStream;
  tracks: LeaseTrack[];
  fallbacks: readonly MediaDeviceFallback[];
  issues: readonly MediaAcquisitionIssue[];
  deviceIds: Readonly<Partial<Record<MediaInputKind, string>>>;
  released: boolean;
  publicLease?: MediaDeviceLease;
}

export interface MediaDeviceErrorContext {
  kind?: MediaInputKind;
  deviceId?: string;
}

export class MediaDeviceError extends Error {
  readonly code: MediaDeviceErrorCode;
  readonly kind?: MediaInputKind;
  readonly deviceId?: string;
  readonly cause?: unknown;

  constructor(code: MediaDeviceErrorCode, context: MediaDeviceErrorContext = {}, cause?: unknown) {
    super(messageForDeviceError(code, context.kind, Boolean(context.deviceId)));
    this.name = "MediaDeviceError";
    this.code = code;
    this.kind = context.kind;
    this.deviceId = context.deviceId;
    this.cause = cause;
    Object.setPrototypeOf(this, MediaDeviceError.prototype);
  }
}

/**
 * Convert browser-specific capture failures into concise recovery guidance for UI surfaces.
 */
export function formatMediaDeviceError(error: unknown, context: MediaDeviceErrorContext = {}): string {
  const deviceError = error instanceof MediaDeviceError
    ? error
    : normalizeDeviceError(error, context.kind, context.deviceId);
  return messageForDeviceError(deviceError.code, deviceError.kind, Boolean(deviceError.deviceId));
}

/**
 * One manager instance should be shared by room and broadcast callers in a window.
 * Re-acquiring for the same consumer is atomic: the old lease is released only after
 * every required replacement track has been acquired and cloned successfully.
 */
export class MediaDeviceManager {
  private readonly sources = new Map<string, SharedSource>();
  private readonly pendingSources = new Map<string, Promise<SharedSource>>();
  private readonly consumers = new Map<string, InternalLease>();
  private readonly consumerVersions = new Map<string, number>();
  private readonly options: MediaDeviceManagerOptions;
  private disposed = false;

  constructor(options: MediaDeviceManagerOptions = {}) {
    this.options = options;
  }

  get activeConsumerCount() {
    return this.consumers.size;
  }

  async acquire(consumerId: string, request: MediaAcquisitionRequest): Promise<MediaDeviceLease> {
    const normalizedConsumerId = consumerId.trim();
    if (!normalizedConsumerId) {
      throw new MediaDeviceError("invalid-request");
    }
    if (this.disposed) {
      throw new MediaDeviceError("manager-closed");
    }

    const trackRequests = normalizeRequest(request);
    if (trackRequests.length === 0) {
      throw new MediaDeviceError("invalid-request");
    }

    const requestVersion = (this.consumerVersions.get(normalizedConsumerId) ?? 0) + 1;
    this.consumerVersions.set(normalizedConsumerId, requestVersion);

    const results = await Promise.allSettled(
      trackRequests.map((trackRequest) => this.reserveWithFallback(trackRequest))
    );

    const reservations: SourceReservation[] = [];
    const issues: MediaAcquisitionIssue[] = [];
    let requiredFailure: MediaDeviceError | undefined;

    results.forEach((result, index) => {
      const trackRequest = trackRequests[index];
      if (result.status === "fulfilled") {
        reservations.push(result.value);
        return;
      }

      const error = result.reason instanceof MediaDeviceError
        ? result.reason
        : normalizeDeviceError(result.reason, trackRequest.kind, trackRequest.deviceId);
      if (trackRequest.required && !requiredFailure) {
        requiredFailure = error;
      } else {
        issues.push({ kind: trackRequest.kind, error });
      }
    });

    if (requiredFailure) {
      reservations.forEach(({ source }) => this.releaseSource(source));
      throw requiredFailure;
    }

    let candidate: InternalLease;
    try {
      candidate = this.createLease(normalizedConsumerId, reservations, issues);
    } catch (error) {
      reservations.forEach(({ source }) => this.releaseSource(source));
      throw error instanceof MediaDeviceError
        ? error
        : normalizeDeviceError(error);
    }

    if (this.disposed || this.consumerVersions.get(normalizedConsumerId) !== requestVersion) {
      this.releaseLease(candidate);
      throw new MediaDeviceError(this.disposed ? "manager-closed" : "request-superseded");
    }

    const previous = this.consumers.get(normalizedConsumerId);
    this.consumers.set(normalizedConsumerId, candidate);
    if (previous) {
      this.releaseLease(previous);
    }
    return this.toPublicLease(candidate);
  }

  /** Release one room/broadcast consumer and invalidate any capture still pending for it. */
  release(consumerId: string) {
    const normalizedConsumerId = consumerId.trim();
    this.consumerVersions.set(
      normalizedConsumerId,
      (this.consumerVersions.get(normalizedConsumerId) ?? 0) + 1
    );
    const lease = this.consumers.get(normalizedConsumerId);
    if (lease) {
      this.consumers.delete(normalizedConsumerId);
      this.releaseLease(lease);
    }
  }

  /** Stop every cloned consumer track and every now-unreferenced physical source. */
  releaseAll() {
    this.consumerVersions.forEach((version, consumerId) => {
      this.consumerVersions.set(consumerId, version + 1);
    });
    this.consumers.forEach((lease) => this.releaseLease(lease));
    this.consumers.clear();
    this.sources.forEach((source) => {
      if (source.references === 0) {
        this.stopSource(source);
      }
    });
  }

  /** Permanently close this manager. Use releaseAll when the instance will be reused. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseAll();
  }

  private async reserveWithFallback(request: NormalizedTrackRequest): Promise<SourceReservation> {
    try {
      return { source: await this.reserveSource(request) };
    } catch (error) {
      const normalized = error instanceof MediaDeviceError
        ? error
        : normalizeDeviceError(error, request.kind, request.deviceId);
      if (!request.deviceId || !request.fallbackToDefault || normalized.code !== "device-not-found") {
        throw normalized;
      }

      const fallbackRequest: NormalizedTrackRequest = {
        ...request,
        deviceId: undefined,
        fallbackToDefault: false
      };
      const source = await this.reserveSource(fallbackRequest);
      return {
        source,
        fallback: {
          kind: request.kind,
          requestedDeviceId: request.deviceId,
          actualDeviceId: source.actualDeviceId,
          reason: "device-missing"
        }
      };
    }
  }

  private async reserveSource(request: NormalizedTrackRequest): Promise<SharedSource> {
    const reusable = this.findReusableSource(request);
    if (reusable) {
      reusable.references += 1;
      return reusable;
    }

    const key = sourceKey(request.kind, request.deviceId);
    let pending = this.pendingSources.get(key);
    if (!pending) {
      pending = this.captureSource(key, request);
      this.pendingSources.set(key, pending);
    }

    let source: SharedSource;
    try {
      source = await pending;
    } finally {
      if (this.pendingSources.get(key) === pending) {
        this.pendingSources.delete(key);
      }
    }

    if (source.stopped || source.track.readyState === "ended") {
      this.stopSource(source);
      return this.reserveSource(request);
    }
    source.references += 1;
    return source;
  }

  private findReusableSource(request: NormalizedTrackRequest) {
    const direct = this.sources.get(sourceKey(request.kind, request.deviceId));
    if (isLiveSource(direct)) return direct;

    if (!request.deviceId) return undefined;
    for (const source of this.sources.values()) {
      if (isLiveSource(source) && source.kind === request.kind && source.actualDeviceId === request.deviceId) {
        return source;
      }
    }
    return undefined;
  }

  private async captureSource(key: string, request: NormalizedTrackRequest): Promise<SharedSource> {
    if (!this.isSecureContext()) {
      throw new MediaDeviceError("insecure-context", request);
    }
    const mediaDevices = this.getMediaDevices();
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
      throw new MediaDeviceError("unsupported", request);
    }

    const trackConstraints: MediaTrackConstraints = { ...request.constraints };
    delete trackConstraints.deviceId;
    if (request.deviceId) {
      trackConstraints.deviceId = { exact: request.deviceId };
    }
    const constraints: MediaStreamConstraints = request.kind === "video"
      ? { video: trackConstraints, audio: false }
      : { video: false, audio: trackConstraints };

    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia(constraints);
    } catch (error) {
      throw normalizeDeviceError(error, request.kind, request.deviceId);
    }

    const tracks = request.kind === "video" ? stream.getVideoTracks() : stream.getAudioTracks();
    const track = tracks[0];
    if (!track) {
      stream.getTracks().forEach((unexpectedTrack) => unexpectedTrack.stop());
      throw new MediaDeviceError("acquisition-failed", request);
    }
    stream.getTracks().forEach((unexpectedTrack) => {
      if (unexpectedTrack !== track) unexpectedTrack.stop();
    });

    let source: SharedSource;
    const handleEnded = () => {
      source.stopped = true;
      if (this.sources.get(source.key) === source) {
        this.sources.delete(source.key);
      }
    };
    source = {
      key,
      kind: request.kind,
      track,
      actualDeviceId: track.getSettings().deviceId || request.deviceId,
      references: 0,
      stopped: false,
      handleEnded
    };
    track.addEventListener("ended", handleEnded);
    this.sources.set(key, source);
    return source;
  }

  private createLease(
    consumerId: string,
    reservations: SourceReservation[],
    issues: MediaAcquisitionIssue[]
  ): InternalLease {
    const tracks: LeaseTrack[] = [];
    try {
      reservations.forEach(({ source }) => {
        tracks.push({ clone: source.track.clone(), source, released: false });
      });
      const stream = this.createMediaStream(tracks.map(({ clone }) => clone));
      const deviceIds: Partial<Record<MediaInputKind, string>> = {};
      reservations.forEach(({ source }) => {
        if (source.actualDeviceId) deviceIds[source.kind] = source.actualDeviceId;
      });
      return {
        consumerId,
        stream,
        tracks,
        fallbacks: reservations.flatMap(({ fallback }) => fallback ? [fallback] : []),
        issues,
        deviceIds,
        released: false
      };
    } catch (error) {
      tracks.forEach(({ clone }) => clone.stop());
      throw error;
    }
  }

  private toPublicLease(lease: InternalLease): MediaDeviceLease {
    if (lease.publicLease) return lease.publicLease;
    const manager = this;
    lease.publicLease = {
      consumerId: lease.consumerId,
      stream: lease.stream,
      deviceIds: lease.deviceIds,
      fallbacks: lease.fallbacks,
      issues: lease.issues,
      get released() {
        return lease.released;
      },
      release() {
        if (manager.consumers.get(lease.consumerId) === lease) {
          manager.release(lease.consumerId);
        } else {
          manager.releaseLease(lease);
        }
      }
    };
    return lease.publicLease;
  }

  private releaseLease(lease: InternalLease) {
    if (lease.released) return;
    lease.released = true;
    lease.tracks.forEach((leaseTrack) => {
      if (leaseTrack.released) return;
      leaseTrack.released = true;
      leaseTrack.clone.stop();
      this.releaseSource(leaseTrack.source);
    });
  }

  private releaseSource(source: SharedSource) {
    source.references = Math.max(0, source.references - 1);
    if (source.references === 0) {
      this.stopSource(source);
    }
  }

  private stopSource(source: SharedSource) {
    if (this.sources.get(source.key) === source) {
      this.sources.delete(source.key);
    }
    source.track.removeEventListener("ended", source.handleEnded);
    if (!source.stopped) {
      source.stopped = true;
      source.track.stop();
    }
  }

  private getMediaDevices() {
    if (this.options.getMediaDevices) return this.options.getMediaDevices();
    return typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  }

  private createMediaStream(tracks: MediaStreamTrack[]) {
    if (this.options.createMediaStream) return this.options.createMediaStream(tracks);
    if (typeof MediaStream === "undefined") {
      throw new MediaDeviceError("unsupported");
    }
    return new MediaStream(tracks);
  }

  private isSecureContext() {
    if (this.options.isSecureContext) return this.options.isSecureContext();
    if (typeof window === "undefined") return true;
    return window.isSecureContext;
  }
}

/** Shared singleton for the room view and Broadcast UI in this browser window. */
export const mediaDeviceManager = new MediaDeviceManager();

function normalizeRequest(request: MediaAcquisitionRequest): NormalizedTrackRequest[] {
  const normalized: NormalizedTrackRequest[] = [];
  const append = (kind: MediaInputKind, selection: MediaTrackSelection | undefined) => {
    if (!selection) return;
    const settings = selection === true ? {} : selection;
    const deviceId = settings.deviceId?.trim() || undefined;
    normalized.push({
      kind,
      deviceId,
      constraints: { ...(settings.constraints ?? {}) },
      fallbackToDefault: settings.fallbackToDefault !== false,
      required: settings.required !== false
    });
  };
  append("video", request.video);
  append("audio", request.audio);
  return normalized;
}

function sourceKey(kind: MediaInputKind, deviceId?: string) {
  return `${kind}:${deviceId ? `device:${deviceId}` : "default"}`;
}

function isLiveSource(source: SharedSource | undefined): source is SharedSource {
  return Boolean(source && !source.stopped && source.track.readyState !== "ended");
}

function normalizeDeviceError(error: unknown, kind?: MediaInputKind, deviceId?: string): MediaDeviceError {
  if (error instanceof MediaDeviceError) return error;
  const name = readErrorString(error, "name");
  const constraint = readErrorString(error, "constraint");

  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) {
    return new MediaDeviceError("permission-denied", { kind, deviceId }, error);
  }
  if (["NotFoundError", "DevicesNotFoundError"].includes(name)) {
    return new MediaDeviceError("device-not-found", { kind, deviceId }, error);
  }
  if (["NotReadableError", "TrackStartError", "AbortError"].includes(name)) {
    return new MediaDeviceError("device-in-use", { kind, deviceId }, error);
  }
  if (["OverconstrainedError", "ConstraintNotSatisfiedError"].includes(name)) {
    const code = constraint === "deviceId" && deviceId
      ? "device-not-found"
      : "constraints-unsatisfied";
    return new MediaDeviceError(code, { kind, deviceId }, error);
  }
  return new MediaDeviceError("acquisition-failed", { kind, deviceId }, error);
}

function readErrorString(error: unknown, property: string) {
  if (!error || typeof error !== "object") return "";
  const value = (error as Record<string, unknown>)[property];
  return typeof value === "string" ? value : "";
}

function messageForDeviceError(code: MediaDeviceErrorCode, kind?: MediaInputKind, selected = false) {
  const device = kind === "video" ? "camera" : kind === "audio" ? "microphone" : "camera or microphone";
  const capitalizedDevice = `${device.charAt(0).toUpperCase()}${device.slice(1)}`;
  switch (code) {
    case "unsupported":
      return `${capitalizedDevice} access is unavailable in this browser.`;
    case "insecure-context":
      return `${capitalizedDevice} access requires HTTPS or the installed local app.`;
    case "permission-denied":
      return `${capitalizedDevice} permission was denied. Allow access in browser and system settings, then try again.`;
    case "device-not-found":
      return selected
        ? `The selected ${device} is unavailable. Reconnect it or choose another ${device}.`
        : `No available ${device} was found. Connect one and try again.`;
    case "device-in-use":
      return `The selected ${device} is already in use by another app or window. Close it there, then try again.`;
    case "constraints-unsatisfied":
      return `The selected ${device} cannot provide the requested format. Choose another setting and try again.`;
    case "request-superseded":
      return "A newer camera or microphone selection replaced this request.";
    case "manager-closed":
      return "Media-device access has already been closed.";
    case "invalid-request":
      return "Choose a camera or microphone before starting media capture.";
    default:
      return `${capitalizedDevice} could not be started. Reconnect it or choose another device, then try again.`;
  }
}
