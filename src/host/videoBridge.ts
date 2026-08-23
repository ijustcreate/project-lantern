import { createHostChannel, targetIncludes } from "./lanternHost";
import type { HostMessage, LiveSource, ScreenId, TargetScreen } from "../types";

type DirectorStatus = "idle" | "camera" | "demo" | "connecting" | "live" | "ended";
type StatusListener = (status: DirectorStatus, detail?: string) => void;
type StreamListener = (stream: MediaStream | null) => void;

interface DemoStream extends MediaStream {
  __cleanup?: () => void;
}

const iceServers: RTCIceServer[] = [
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

  constructor(private onStatus: StatusListener) {
  }

  async start(target: TargetScreen, source: LiveSource = "demo", videoDeviceId?: string, audioDeviceId?: string) {
    this.clearMedia();
    this.activeTarget = target;
    this.onStatus("connecting", "Preparing local video.");
    this.stream = source === "camera"
      ? await getCameraOrDemoStream((status) => this.onStatus(status), videoDeviceId, audioDeviceId)
      : source === "screen"
        ? await getScreenOrDemoStream((status, detail) => this.onStatus(status, detail), audioDeviceId)
        : createDemoVideoStream();
    this.onStatus(this.stream.__cleanup ? "demo" : "camera", this.stream.__cleanup ? "Using generated test video." : "Using camera.");
  }

  async startMediaStream(target: TargetScreen, stream: MediaStream, detail = "Using recorded video.") {
    this.clearMedia();
    this.activeTarget = target;
    this.stream = stream as DemoStream;
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
    if (!this.stream || !targetIncludes(this.activeTarget, screenId)) {
      return;
    }

    const peer = new RTCPeerConnection({ iceServers });
    this.peers.set(screenId, peer);
    this.pendingRemoteCandidates.set(screenId, []);
    this.stream.getTracks().forEach((track) => {
      if (this.stream) {
        const sender = peer.addTrack(track, this.stream);
        if (track.kind === "video") {
          void sender.setParameters({ ...sender.getParameters(), degradationPreference: "maintain-framerate" }).catch(() => undefined);
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
      if (this.peers.get(screenId) !== peer) return;
      this.channel.post({
        type: "webrtc-offer",
        target: screenId,
        source: "control",
        sdp: offer
      } satisfies HostMessage);
    } catch {
      if (this.peers.get(screenId) === peer) this.peers.delete(screenId);
      this.pendingRemoteCandidates.delete(screenId);
      peer.close();
      this.onStatus("connecting", `${labelFor(screenId)} video is reconnecting.`);
    }
  }

  stop(target: TargetScreen = "all") {
    this.channel.post({ type: "live-stop", target } satisfies HostMessage);
    this.clearMedia();
    this.onStatus("ended", "Live video ended.");
  }

  private clearMedia() {
    this.reconnectTimers.forEach((timer) => window.clearTimeout(timer));
    this.reconnectTimers.clear();
    this.peers.forEach((peer) => peer.close());
    this.peers.clear();
    this.pendingRemoteCandidates.clear();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream?.__cleanup?.();
    this.stream = null;
  }

  close() {
    // Component teardown (navigation, refresh, StrictMode, or HMR) is not an
    // operator request to end the museum broadcast. Only stop() sends live-stop.
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

export function attachDisplayVideoReceiver(screenId: ScreenId, onStream: StreamListener) {
  let peer: RTCPeerConnection | null = null;
  let activeOfferKey = "";
  let pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  let channel: ReturnType<typeof createHostChannel>;

  const announcePresence = () => {
    channel.post({
      type: "display-presence",
      screenId,
      timestamp: new Date().toISOString()
    } satisfies HostMessage);
  };

  channel = createHostChannel((message) => {
    if (message.type === "webrtc-offer" && message.target === screenId) {
      const offerKey = `${message.sdp.type ?? "offer"}:${message.sdp.sdp ?? ""}`;
      if (offerKey === activeOfferKey && peer && peer.signalingState !== "closed") return;
      activeOfferKey = offerKey;
      void (async () => {
        const previousPeer = peer;
        const nextPeer = new RTCPeerConnection({ iceServers });
        peer = nextPeer;
        previousPeer?.close();
        const report = (status: "connecting" | "receiving" | "reconnecting" | "unavailable", detail?: string, fps?: number, bitrateKbps?: number) => channel.post({
          type: "display-video-status", screenId, status, detail, fps, bitrateKbps, timestamp: new Date().toISOString()
        } satisfies HostMessage);
        report("connecting", "Connecting to the broadcast source.");
        nextPeer.addEventListener("track", (trackEvent) => {
          if (peer !== nextPeer) return;
          onStream(trackEvent.streams[0] ?? null);
          report("receiving", "Display is receiving video.");
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
          if (nextPeer.connectionState === "connected") report("receiving", "Display is receiving video.");
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
          if (peer !== nextPeer) return;
          channel.post({
            type: "webrtc-answer",
            target: "control",
            source: screenId,
            sdp: answer
          } satisfies HostMessage);
        } catch {
          if (peer !== nextPeer) return;
          nextPeer.close();
          peer = null;
          activeOfferKey = "";
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
      onStream(null);
    }
  });
  const presenceTimer = window.setInterval(announcePresence, 1800);
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
  }, 2500);
  announcePresence();

  return () => {
    window.clearInterval(presenceTimer);
    window.clearInterval(telemetryTimer);
    peer?.close();
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

async function getCameraOrDemoStream(onStatus: (status: DirectorStatus) => void, videoDeviceId?: string, audioDeviceId?: string): Promise<DemoStream> {
  if (navigator.mediaDevices?.getUserMedia) {
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, max: 60 } },
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true
      });
      return cameraStream as DemoStream;
    } catch {
      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, max: 60 } },
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

function labelFor(screenId: ScreenId) {
  const match = screenId.match(/^display-(\d+)$/);
  return match ? `Display ${match[1]}` : screenId;
}
