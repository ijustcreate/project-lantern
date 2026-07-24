import { LANTERN_CHANNEL, targetIncludes } from "./lanternHost";
import type { HostMessage, LiveSource, ScreenId, TargetScreen } from "../types";

type DirectorStatus = "idle" | "camera" | "demo" | "connecting" | "live" | "ended";
type StatusListener = (status: DirectorStatus, detail?: string) => void;
type StreamListener = (stream: MediaStream | null) => void;

interface DemoStream extends MediaStream {
  __cleanup?: () => void;
}

export class DirectorVideoBridge {
  private channel = new BroadcastChannel(LANTERN_CHANNEL);
  private stream: DemoStream | null = null;
  private peers = new Map<ScreenId, RTCPeerConnection>();
  private activeTarget: TargetScreen = "display-2";

  constructor(private onStatus: StatusListener) {
    this.channel.addEventListener("message", (event: MessageEvent<HostMessage>) => {
      void this.handleMessage(event.data);
    });
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
    if (!this.stream || !targetIncludes(this.activeTarget, screenId) || this.peers.has(screenId)) {
      return;
    }

    const peer = new RTCPeerConnection({ iceServers: [] });
    this.peers.set(screenId, peer);
    this.stream.getTracks().forEach((track) => {
      if (this.stream) {
        peer.addTrack(track, this.stream);
      }
    });
    peer.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        this.channel.postMessage({
          type: "webrtc-candidate",
          target: screenId,
          source: "control",
          candidate: event.candidate.toJSON()
        } satisfies HostMessage);
      }
    });
    peer.addEventListener("connectionstatechange", () => {
      if (peer.connectionState === "connected") {
        this.onStatus("live", `${labelFor(screenId)} video connected.`);
      }
    });

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    this.channel.postMessage({
      type: "webrtc-offer",
      target: screenId,
      source: "control",
      sdp: offer
    } satisfies HostMessage);
  }

  stop(target: TargetScreen = "all") {
    this.channel.postMessage({ type: "live-stop", target } satisfies HostMessage);
    this.clearMedia();
    this.onStatus("ended", "Live video ended.");
  }

  private clearMedia() {
    this.peers.forEach((peer) => peer.close());
    this.peers.clear();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream?.__cleanup?.();
    this.stream = null;
  }

  close() {
    this.stop("all");
    this.channel.close();
  }

  private async handleMessage(message: HostMessage) {
    if (message.type === "display-presence" && this.stream) {
      await this.connect(message.screenId);
    }

    if (message.type === "webrtc-answer" && message.target === "control") {
      const peer = this.peers.get(message.source);
      if (peer) {
        await peer.setRemoteDescription(message.sdp);
      }
    }

    if (message.type === "webrtc-candidate" && message.target === "control") {
      const source = message.source === "control" ? undefined : message.source;
      const peer = source ? this.peers.get(source) : undefined;
      if (peer) {
        await peer.addIceCandidate(message.candidate);
      }
    }
  }
}

export function attachDisplayVideoReceiver(screenId: ScreenId, onStream: StreamListener) {
  const channel = new BroadcastChannel(LANTERN_CHANNEL);
  let peer: RTCPeerConnection | null = null;

  const announcePresence = () => {
    channel.postMessage({
      type: "display-presence",
      screenId,
      timestamp: new Date().toISOString()
    } satisfies HostMessage);
  };

  const presenceTimer = window.setInterval(announcePresence, 1800);
  announcePresence();

  channel.addEventListener("message", (event: MessageEvent<HostMessage>) => {
    const message = event.data;

    if (message.type === "webrtc-offer" && message.target === screenId) {
      void (async () => {
        peer?.close();
        peer = new RTCPeerConnection({ iceServers: [] });
        peer.addEventListener("track", (trackEvent) => {
          onStream(trackEvent.streams[0] ?? null);
        });
        peer.addEventListener("icecandidate", (candidateEvent) => {
          if (candidateEvent.candidate) {
            channel.postMessage({
              type: "webrtc-candidate",
              target: "control",
              source: screenId,
              candidate: candidateEvent.candidate.toJSON()
            } satisfies HostMessage);
          }
        });
        await peer.setRemoteDescription(message.sdp);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        channel.postMessage({
          type: "webrtc-answer",
          target: "control",
          source: screenId,
          sdp: answer
        } satisfies HostMessage);
      })();
    }

    if (message.type === "webrtc-candidate" && message.target === screenId && peer) {
      void peer.addIceCandidate(message.candidate);
    }

    if (message.type === "live-stop" && targetIncludes(message.target, screenId)) {
      peer?.close();
      peer = null;
      onStream(null);
    }
  });

  return () => {
    window.clearInterval(presenceTimer);
    peer?.close();
    channel.close();
  };
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
