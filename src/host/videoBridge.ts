import { createHostChannel, getLanternDeviceId, targetIncludes } from "./lanternHost";
import type { HostMessage, LiveSource, ScreenId, TargetScreen } from "../types";

type DirectorStatus = "idle" | "camera" | "demo" | "connecting" | "live" | "ended";
type StatusListener = (status: DirectorStatus, detail?: string) => void;
type StreamListener = (stream: MediaStream | null) => void;

export function displayDeviceName() {
  const userAgent = navigator.userAgent;
  if (/SMART-TV|SmartTV|Tizen|Web0S|NetCast|HbbTV/i.test(userAgent)) return "Smart TV browser";
  if (/Android TV|GoogleTV/i.test(userAgent)) return "TV browser";
  if (/iPad|Tablet/i.test(userAgent)) return "Tablet browser";
  if (/Mobi|iPhone|Android/i.test(userAgent)) return "Mobile browser";
  if (/Edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/Chrome\//i.test(userAgent)) return "Google Chrome";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return "Display browser";
}

interface DemoStream extends MediaStream {
  __cleanup?: () => void;
}

export const iceServers: RTCIceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
  ...(import.meta.env.VITE_LANTERN_TURN_URL
    ? [{
        urls: import.meta.env.VITE_LANTERN_TURN_URL,
        username: import.meta.env.VITE_LANTERN_TURN_USERNAME,
        credential: import.meta.env.VITE_LANTERN_TURN_CREDENTIAL
      }]
    : [])
];

export class DirectorVideoBridge {
  private channel = createHostChannel((message) => { void this.handleMessage(message); });
  private stream: DemoStream | null = null;
  private peers = new Map<ScreenId, RTCPeerConnection>();
  private pendingRemoteCandidates = new Map<ScreenId, RTCIceCandidateInit[]>();
  private reconnectTimers = new Map<ScreenId, number>();
  private activeTarget: TargetScreen = "display-2";
  private activeTargets: ScreenId[] | undefined;
  private sourceSession = 0;
  private mobilePresenter = false;

  constructor(private onStatus: StatusListener) {
  }

  async start(target: TargetScreen, source: LiveSource = "demo", videoDeviceId?: string, audioDeviceId?: string, targets?: ScreenId[]) {
    this.clearMedia();
    this.mobilePresenter = false;
    this.activeTarget = target;
    this.activeTargets = targets?.length ? targets : undefined;
    this.onStatus("connecting", "Preparing local video.");
    this.stream = source === "camera"
      ? await getCameraOrDemoStream((status) => this.onStatus(status), videoDeviceId, audioDeviceId)
      : source === "screen"
        ? await getScreenOrDemoStream((status, detail) => this.onStatus(status, detail), audioDeviceId)
        : createDemoVideoStream();
    this.watchSourceTracks();
    this.announceMediaState("available", this.stream.__cleanup ? "Generated video is ready." : "Camera video is ready.");
    this.onStatus(this.stream.__cleanup ? "demo" : "camera", this.stream.__cleanup ? "Using generated test video." : "Using camera.");
  }

  async startMediaStream(target: TargetScreen, stream: MediaStream, detail = "Using recorded video.", targets?: ScreenId[]) {
    this.clearMedia();
    this.mobilePresenter = isMobilePresenter();
    this.activeTarget = target;
    this.activeTargets = targets?.length ? targets : undefined;
    // Desktop webcams can expose a hardware-native track that a smart TV
    // accepts at the WebRTC layer but never turns into visible frames. Repaint
    // those desktop sources through a canvas capture before negotiating them.
    // iPhone camera tracks must stay direct: iOS can negotiate a canvas
    // capture successfully while delivering no frames to the display.
    this.stream = isMobilePresenter() ? stream as DemoStream : createTvSafeBroadcastStream(stream);
    this.watchSourceTracks();
    this.announceMediaState("available", detail);
    this.onStatus("camera", detail);
  }

  async connect(screenId: ScreenId) {
    const existingPeer = this.peers.get(screenId);
    if (existingPeer && existingPeer.connectionState !== "failed" && existingPeer.connectionState !== "closed") {
      return;
    }
    if (existingPeer) {
      existingPeer.close();
      this.peers.delete(screenId);
    }
    if (!this.stream || !(this.activeTargets?.includes(screenId) ?? targetIncludes(this.activeTarget, screenId))) {
      return;
    }

    const peer = new RTCPeerConnection({ iceServers });
    this.peers.set(screenId, peer);
    this.pendingRemoteCandidates.set(screenId, []);
    this.stream.getTracks().forEach((track) => {
      if (this.stream) {
        const sender = peer.addTrack(track, this.stream);
        if (track.kind === "video") {
          if (!this.mobilePresenter) preferTvSafeVideoCodec(peer, sender);
          // Keep desktop webcams within the range of embedded TV hardware
          // decoders. Phone cameras normally choose this kind of tier on their
          // own; a C310/desktop browser can otherwise offer a much heavier
          // stream even with H.264 negotiated.
          const parameters = sender.getParameters();
          const encoding = parameters.encodings[0] ?? {};
          void sender.setParameters({
            ...parameters,
            encodings: [{ ...encoding, maxBitrate: 750_000, maxFramerate: 30 }],
            degradationPreference: "maintain-framerate"
          }).catch(() => undefined);
        }
      }
    });
    peer.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
      this.channel.post({
          type: "webrtc-candidate",
          target: screenId,
          source: "control",
          candidate: event.candidate.toJSON()
        } satisfies HostMessage);
      }
    });
    peer.addEventListener("connectionstatechange", () => {
      if (peer.connectionState === "connected") {
        const reconnectTimer = this.reconnectTimers.get(screenId);
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        this.reconnectTimers.delete(screenId);
        this.onStatus("live", `${labelFor(screenId)} video connected at up to 30 fps.`);
      } else if (peer.connectionState === "disconnected") {
        const previousTimer = this.reconnectTimers.get(screenId);
        if (previousTimer) window.clearTimeout(previousTimer);
        this.reconnectTimers.set(screenId, window.setTimeout(() => {
          if (this.peers.get(screenId) !== peer || peer.connectionState !== "disconnected") return;
          peer.close();
          this.peers.delete(screenId);
          this.pendingRemoteCandidates.delete(screenId);
          void this.connect(screenId);
        }, 1200));
      } else if (peer.connectionState === "failed") {
        if (this.peers.get(screenId) === peer) this.peers.delete(screenId);
        this.pendingRemoteCandidates.delete(screenId);
        peer.close();
        void this.connect(screenId);
      }
    });

    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      // Several embedded TV browsers are unreliable when an offer arrives
      // before its host/STUN candidates. Give ICE a short head start, then
      // send the current local description (which includes gathered SDP).
      await waitForIceGathering(peer);
      if (this.peers.get(screenId) !== peer) return;
      this.channel.post({
        type: "webrtc-offer",
        target: screenId,
        source: "control",
        sdp: peer.localDescription?.toJSON() ?? offer
      } satisfies HostMessage);
      // A lost offer/answer can otherwise leave this peer in "connecting"
      // forever. Display presence heartbeats continue, so retry negotiation
      // after a short grace period while preserving healthy connections.
      const negotiationTimer = window.setTimeout(() => {
        if (this.peers.get(screenId) !== peer || peer.connectionState === "connected") return;
        peer.close();
        this.peers.delete(screenId);
        this.pendingRemoteCandidates.delete(screenId);
        void this.connect(screenId);
      }, 6_000);
      this.reconnectTimers.set(screenId, negotiationTimer);
    } catch {
      if (this.peers.get(screenId) === peer) this.peers.delete(screenId);
      this.pendingRemoteCandidates.delete(screenId);
      peer.close();
      this.onStatus("connecting", `${labelFor(screenId)} video is reconnecting.`);
    }
  }

  retarget(target: TargetScreen, targets?: ScreenId[]) {
    this.activeTarget = target;
    this.activeTargets = targets?.length ? targets : undefined;
    this.peers.forEach((peer, screenId) => {
      if (this.activeTargets?.includes(screenId) ?? targetIncludes(this.activeTarget, screenId)) return;
      peer.close();
      this.peers.delete(screenId);
      this.pendingRemoteCandidates.delete(screenId);
    });
    if (!this.stream) return;
    // Initial connections are made by the presenter with its authoritative
    // display list. On a retarget we only need to negotiate newly selected,
    // explicit destinations; presence heartbeats cover legacy `all` routing.
    const destinations = this.activeTargets ?? (target === "all" ? [] : [target]);
    destinations.forEach((screenId) => void this.connect(screenId));
  }

  stop(target: TargetScreen = "all") {
    this.channel.post({ type: "live-stop", target } satisfies HostMessage);
    this.clearMedia();
    this.onStatus("ended", "Live video ended.");
  }

  private clearMedia() {
    this.sourceSession += 1;
    this.reconnectTimers.forEach((timer) => window.clearTimeout(timer));
    this.reconnectTimers.clear();
    this.peers.forEach((peer) => peer.close());
    this.peers.clear();
    this.pendingRemoteCandidates.clear();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream?.__cleanup?.();
    this.stream = null;
    this.activeTargets = undefined;
  }

  private announceMediaState(state: "available" | "paused" | "unavailable", detail: string) {
    this.channel.post({ type: "live-media-state", target: this.activeTarget, state, detail } satisfies HostMessage);
  }

  private watchSourceTracks() {
    const stream = this.stream;
    if (!stream) return;
    const session = this.sourceSession;
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (this.sourceSession !== session || this.stream !== stream) return;
        this.clearMedia();
        this.announceMediaState("unavailable", "Camera video ended. Keep the presenter page open, then tap Resume camera.");
        this.onStatus("ended", "Camera video ended. Resume camera to restore the live picture.");
      }, { once: true });
      track.addEventListener("mute", () => {
        if (this.sourceSession !== session || this.stream !== stream) return;
        this.announceMediaState("paused", "Camera video is paused. Keep the presenter page open, or tap Resume camera if it does not return.");
        this.onStatus("connecting", "Camera video is paused.");
      });
      track.addEventListener("unmute", () => {
        if (this.sourceSession !== session || this.stream !== stream) return;
        this.announceMediaState("available", "Camera video resumed.");
        this.onStatus("camera", "Camera video resumed.");
      });
    });
  }

  close() {
    // Component teardown (navigation, refresh, StrictMode, or HMR) is not an
    // operator request to end the museum broadcast. Only stop() sends live-stop.
    if (this.stream) this.announceMediaState("unavailable", "Presenter connection closed. Reopen it and tap Resume camera to restore video.");
    this.clearMedia();
    this.channel.close();
  }

  private async handleMessage(message: HostMessage) {
    if (message.type === "display-presence" && this.stream) {
      await this.connect(message.screenId);
    }

    if (message.type === "webrtc-answer" && message.target === "control") {
      const peer = this.peers.get(message.source);
      if (peer && peer.signalingState !== "closed" && !peer.remoteDescription) {
        try {
          await peer.setRemoteDescription(message.sdp);
          const pending = this.pendingRemoteCandidates.get(message.source) ?? [];
          this.pendingRemoteCandidates.set(message.source, []);
          await Promise.all(pending.map((candidate) => addIceCandidateSafely(peer, candidate)));
        } catch {
          if (this.peers.get(message.source) === peer) this.peers.delete(message.source);
          this.pendingRemoteCandidates.delete(message.source);
          peer.close();
          void this.connect(message.source);
        }
      }
    }

    if (message.type === "webrtc-candidate" && message.target === "control") {
      const source = message.source === "control" ? undefined : message.source;
      const peer = source ? this.peers.get(source) : undefined;
      if (peer) {
        if (peer.remoteDescription) await addIceCandidateSafely(peer, message.candidate);
        else this.pendingRemoteCandidates.set(source!, [...(this.pendingRemoteCandidates.get(source!) ?? []), message.candidate]);
      }
    }
  }
}

/**
 * Older smart-TV WebRTC implementations can advertise VP8, then fail to
 * decode Chrome's desktop-camera stream after negotiation. H.264 baseline is
 * broadly hardware-decoded on those displays and works for both camera and
 * phone presenters. Limit the offer to baseline variants when the browser
 * exposes codec selection; leave legacy browsers untouched.
 */
function preferTvSafeVideoCodec(peer: RTCPeerConnection, sender: RTCRtpSender) {
  if (typeof RTCRtpSender === "undefined" || !RTCRtpSender.getCapabilities) return;
  const capabilities = RTCRtpSender.getCapabilities("video");
  const h264 = capabilities?.codecs.filter((codec) => codec.mimeType.toLowerCase() === "video/h264") ?? [];
  if (!h264.length) return;
  const baseline = h264.filter((codec) => /profile-level-id=42/i.test(codec.sdpFmtpLine ?? ""));
  const transceiver = peer.getTransceivers().find((candidate) => candidate.sender === sender);
  try {
    transceiver?.setCodecPreferences(baseline.length ? baseline : h264);
  } catch {
    // Codec preferences are an interoperability enhancement. The default
    // browser codec order remains available where this API is partial.
  }
}

export function attachDisplayVideoReceiver(screenId: ScreenId, onStream: StreamListener) {
  let peer: RTCPeerConnection | null = null;
  let activeOfferKey = "";
  let pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  let remoteStream: MediaStream | null = null;
  let channel: ReturnType<typeof createHostChannel>;

  const announcePresence = () => {
    channel.post({
      type: "display-presence",
      screenId,
      timestamp: new Date().toISOString(),
      deviceId: getLanternDeviceId(),
      deviceName: displayDeviceName(),
      userAgent: navigator.userAgent
    } satisfies HostMessage);
  };
  const announceSessionStatus = (status: "closed" | "offline" | "online") => channel.post({
    type: "display-session-status",
    screenId,
    timestamp: new Date().toISOString(),
    deviceId: getLanternDeviceId(),
    deviceName: displayDeviceName(),
    userAgent: navigator.userAgent,
    status
  } satisfies HostMessage);

  channel = createHostChannel((message) => {
    if (message.type === "webrtc-offer" && message.target === screenId) {
      const offerKey = `${message.sdp.type ?? "offer"}:${message.sdp.sdp ?? ""}`;
      if (offerKey === activeOfferKey && peer && peer.signalingState !== "closed") return;
      activeOfferKey = offerKey;
      void (async () => {
        const previousPeer = peer;
        const nextPeer = new RTCPeerConnection({ iceServers });
        peer = nextPeer;
        remoteStream = null;
        previousPeer?.close();
        const report = (status: "connecting" | "receiving" | "reconnecting" | "unavailable", detail?: string, fps?: number, bitrateKbps?: number) => channel.post({
          type: "display-video-status", screenId, status, detail, fps, bitrateKbps, timestamp: new Date().toISOString()
        } satisfies HostMessage);
        report("connecting", "Connecting to the broadcast source.");
        nextPeer.addEventListener("track", (trackEvent) => {
          if (peer !== nextPeer) return;
          // Prefer the stream created by the browser itself; some TV engines
          // bind its decoder only to that object. Safari can omit it, so build
          // a fallback stream only in that case.
          remoteStream ??= trackEvent.streams[0] ?? new MediaStream();
          if (!remoteStream.getTracks().some((track) => track.id === trackEvent.track.id)) {
            try { remoteStream.addTrack(trackEvent.track); } catch { /* already attached by this browser */ }
          }
          onStream(remoteStream);
          if (trackEvent.track.kind === "video") report("receiving", "Display is receiving video.");
        });
        nextPeer.addEventListener("icecandidate", (candidateEvent) => {
          if (candidateEvent.candidate) {
            channel.post({
              type: "webrtc-candidate",
              target: "control",
              source: screenId,
              candidate: candidateEvent.candidate.toJSON()
            } satisfies HostMessage);
          }
        });
        nextPeer.addEventListener("connectionstatechange", () => {
          if (peer !== nextPeer) return;
          // Connection alone only proves ICE/DTLS. Wait for a video track
          // before telling the presenter that the picture is on the display.
          if (nextPeer.connectionState === "connected" && remoteStream?.getVideoTracks().length) report("receiving", "Display is receiving video.");
          if (nextPeer.connectionState === "disconnected") report("reconnecting", "Connection was interrupted; retrying.");
          if (nextPeer.connectionState === "failed") {
            report("unavailable", "Display could not receive the broadcast.");
            onStream(null);
          }
        });
        try {
          await nextPeer.setRemoteDescription(message.sdp);
          if (peer !== nextPeer) return;
          const pending = pendingRemoteCandidates;
          pendingRemoteCandidates = [];
          await Promise.all(pending.map((candidate) => addIceCandidateSafely(nextPeer, candidate)));
          if (peer !== nextPeer) return;
          const answer = await nextPeer.createAnswer();
          await nextPeer.setLocalDescription(answer);
          await waitForIceGathering(nextPeer);
          if (peer !== nextPeer) return;
          channel.post({
            type: "webrtc-answer",
            target: "control",
            source: screenId,
            sdp: nextPeer.localDescription?.toJSON() ?? answer
          } satisfies HostMessage);
        } catch {
          if (peer !== nextPeer) return;
          nextPeer.close();
          peer = null;
          activeOfferKey = "";
          remoteStream = null;
          onStream(null);
          announcePresence();
        }
      })();
    }

    if (message.type === "webrtc-candidate" && message.target === screenId) {
      if (peer?.remoteDescription) void addIceCandidateSafely(peer, message.candidate);
      else pendingRemoteCandidates.push(message.candidate);
    }

    if (message.type === "live-stop" && targetIncludes(message.target, screenId)) {
      peer?.close();
      peer = null;
      activeOfferKey = "";
      pendingRemoteCandidates = [];
      remoteStream = null;
      onStream(null);
    }

    if (message.type === "live-media-state" && targetIncludes(message.target, screenId) && message.state === "unavailable") {
      peer?.close();
      peer = null;
      activeOfferKey = "";
      pendingRemoteCandidates = [];
      onStream(null);
    }
  });
  const presenceTimer = window.setInterval(announcePresence, 15_000);
  const telemetryTimer = window.setInterval(() => {
    if (!peer || peer.connectionState !== "connected") return;
    void peer.getStats().then((stats) => {
      let fps: number | undefined;
      let bitrateKbps: number | undefined;
      stats.forEach((report) => {
        if (report.type === "inbound-rtp" && report.kind === "video") {
          fps = typeof report.framesPerSecond === "number" ? report.framesPerSecond : undefined;
          bitrateKbps = typeof report.bytesReceived === "number" && typeof report.timestamp === "number"
            ? undefined : bitrateKbps;
        }
      });
      channel.post({ type: "display-video-status", screenId, status: "receiving", timestamp: new Date().toISOString(), detail: "Display is receiving video.", fps, bitrateKbps } satisfies HostMessage);
    }).catch(() => undefined);
  }, 10_000);
  announcePresence();
  const announceOnline = () => { announceSessionStatus("online"); announcePresence(); };
  const announceOffline = () => announceSessionStatus("offline");
  const announceClosed = () => announceSessionStatus("closed");
  window.addEventListener("online", announceOnline);
  window.addEventListener("offline", announceOffline);
  window.addEventListener("pagehide", announceClosed);

  return () => {
    window.clearInterval(presenceTimer);
    window.clearInterval(telemetryTimer);
    peer?.close();
    remoteStream = null;
    window.removeEventListener("online", announceOnline);
    window.removeEventListener("offline", announceOffline);
    window.removeEventListener("pagehide", announceClosed);
    channel.close();
  };
}

async function addIceCandidateSafely(peer: RTCPeerConnection, candidate: RTCIceCandidateInit) {
  if (peer.signalingState === "closed") return;
  try {
    await peer.addIceCandidate(candidate);
  } catch {
    // A peer can be replaced while ICE is still in flight. Its next presence
    // heartbeat starts a clean negotiation without surfacing an unhandled error.
  }
}

function waitForIceGathering(peer: RTCPeerConnection, timeoutMs = 1_500) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(finish, timeoutMs);
    function finish() {
      window.clearTimeout(timer);
      peer.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    }
    function onChange() {
      if (peer.iceGatheringState === "complete") finish();
    }
    peer.addEventListener("icegatheringstatechange", onChange);
  });
}

async function getCameraOrDemoStream(onStatus: (status: DirectorStatus) => void, videoDeviceId?: string, audioDeviceId?: string): Promise<DemoStream> {
  if (navigator.mediaDevices?.getUserMedia) {
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined, width: { ideal: 640, max: 640 }, height: { ideal: 480, max: 480 }, frameRate: { ideal: 30, max: 30 } },
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true
      });
      return cameraStream as DemoStream;
    } catch {
      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined, width: { ideal: 640, max: 640 }, height: { ideal: 480, max: 480 }, frameRate: { ideal: 30, max: 30 } },
          audio: false
        });
        return cameraStream as DemoStream;
      } catch {
        onStatus("demo");
      }
    }
  }

  return createDemoVideoStream();
}

async function getScreenOrDemoStream(onStatus: (status: DirectorStatus, detail?: string) => void, audioDeviceId?: string): Promise<DemoStream> {
  if (navigator.mediaDevices?.getDisplayMedia) {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: true
      });
      displayStream.getVideoTracks()[0]?.addEventListener("ended", () => onStatus("ended", "Screen share ended."));
      return displayStream as DemoStream;
    } catch {
      onStatus("demo", "Screen share was cancelled; using generated test feed.");
    }
  }
  return createDemoVideoStream();
}

function createDemoVideoStream(): DemoStream {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  let frame = 0;

  const draw = () => {
    if (!context) {
      return;
    }

    frame += 1;
    const pulse = (Math.sin(frame / 24) + 1) / 2;
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#10283a");
    gradient.addColorStop(0.48, pulse > 0.5 ? "#1f706e" : "#24606d");
    gradient.addColorStop(1, "#f2b84a");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "rgba(5, 16, 27, 0.62)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "#f5e6c9";
    context.font = "700 72px Inter, Segoe UI, sans-serif";
    context.fillText("DIRECTOR LIVE", 88, 140);
    context.font = "400 34px Inter, Segoe UI, sans-serif";
    context.fillText("Generated local test feed", 94, 202);

    for (let index = 0; index < 22; index += 1) {
      const x = 120 + index * 52;
      const y = 370 + Math.sin(frame / 12 + index) * 58;
      context.fillStyle = index % 3 === 0 ? "#f07b5f" : index % 3 === 1 ? "#55c7bf" : "#f2c46d";
      context.beginPath();
      context.arc(x, y, 10 + Math.sin(frame / 18 + index) * 3, 0, Math.PI * 2);
      context.fill();
    }

    context.fillStyle = "rgba(245, 230, 201, 0.84)";
    context.fillRect(88, 565, 760, 76);
    context.fillStyle = "#10283a";
    context.font = "700 36px Inter, Segoe UI, sans-serif";
    context.fillText(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }), 120, 615);
  };

  draw();
  const timer = window.setInterval(draw, 33);
  const stream = canvas.captureStream(30) as DemoStream;
  stream.__cleanup = () => window.clearInterval(timer);
  return stream;
}

/**
 * Re-encodes a presenter's locally decoded video through a canvas capture.
 * This avoids vendor-specific webcam packets and yields a conventional 640x480
 * 30fps browser track that embedded TV WebRTC implementations can decode.
 */
function createTvSafeBroadcastStream(sourceStream: MediaStream): DemoStream {
  const sourceVideo = sourceStream.getVideoTracks()[0];
  if (!sourceVideo || typeof document === "undefined") return sourceStream as DemoStream;

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = new MediaStream([sourceVideo]);

  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const context = canvas.getContext("2d", { alpha: false });
  const captureStream = canvas.captureStream?.(30);
  const captureTrack = captureStream?.getVideoTracks()[0];
  if (!context || !captureTrack) return sourceStream as DemoStream;

  let animationFrame = 0;
  let disposed = false;
  const render = () => {
    if (disposed) return;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
      const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
      const width = video.videoWidth * scale;
      const height = video.videoHeight * scale;
      context.fillStyle = "#000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    }
    animationFrame = window.requestAnimationFrame(render);
  };
  void video.play().catch(() => undefined);
  animationFrame = window.requestAnimationFrame(render);

  const stream = new MediaStream([captureTrack, ...sourceStream.getAudioTracks()]) as DemoStream;
  stream.__cleanup = () => {
    disposed = true;
    window.cancelAnimationFrame(animationFrame);
    captureTrack.stop();
    video.pause();
    video.srcObject = null;
    sourceVideo.stop();
  };
  return stream;
}

function isMobilePresenter() {
  return /Mobi|iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function labelFor(screenId: ScreenId) {
  const match = screenId.match(/^display-(\d+)$/);
  return match ? `Display ${match[1]}` : screenId;
}
