export type ScreenId = string;

export type TargetScreen = ScreenId | "all";

export type DisplayStatus = "offline" | "ready" | "live" | "warning";

export type QualityTier = "Baseline" | "Balanced" | "Showcase";

export type RendererMode = "WebGL2" | "Certified WebGPU";

export type DisplayStyle = "donor-wall" | "constellation" | "image";

export interface ImageCrop {
  scale: number;
  x: number;
  y: number;
  rotation?: number;
}

export interface Donor {
  id: string;
  name: string;
  tier: string;
  category: string;
  active: boolean;
  since: string;
  donationDate?: string;
  note: string;
  basicInfo?: string;
  expandedInfo?: string;
  subtext?: string;
  tags?: string[];
  groupId?: string;
  donationType?: "Cash" | "In-kind" | "Sponsorship" | "Legacy" | "Volunteer";
  amount?: number;
  donations?: DonationRecord[];
  displayIds?: ScreenId[];
  /** Boards whose donor rosters include this donor. Display placement is derived from the board. */
  boardIds?: string[];
  icon?: "none" | "star" | "heart" | "leaf" | "sparkle" | "diamond" | "crown" | "laurel" | "sun" | "hand";
  customIconImage?: string;
  fontOverride?: DisplayProfile["fontFamily"];
  nameColor?: string;
  accentColor?: string;
  highlight?: "none" | "underline" | "soft-box";
  animation?: "none" | "gentle-pulse" | "soft-glow" | "shimmer";
}

export interface DonationRecord {
  id: string;
  date: string;
  amount: number;
  type: "Cash" | "In-kind" | "Sponsorship" | "Legacy" | "Volunteer";
  note?: string;
}

export interface DonorGroup {
  id: string;
  name: string;
  color: string;
}

export interface LanternTheme {
  material: "Painted Maple" | "Walnut" | "Brushed Brass" | "Deep Navy Enamel";
  finish: "Satin" | "Matte" | "Soft Gloss";
  lettering: "Painted" | "Engraved" | "Raised Inlay";
  trim: "Brass" | "Teal" | "Graphite";
  warmth: number;
  grain: number;
  letteringDepth: number;
  shadowSoftness: number;
  motion: number;
}

export interface BoardContent {
  presetName: string;
  visualStyle: "chalkboard" | "chalkboard-minimal" | "gallery-plaque" | "museum";
  donorColumns: 1 | 2;
  portraitHeading: string;
  portraitSubtitle: string;
  portraitDescription: string;
  portraitFooter: string;
  landscapeHeadingPrimary: string;
  landscapeHeadingAccent: string;
  landscapeSubtitle: string;
  storyEyebrow: string;
  storyTitle: string;
  storyBody: string;
  storyImageUrl?: string;
  hoursLabel: string;
  hoursValue: string;
  impactLines: string[];
  theaterLabel: string;
  theaterValue: string;
  membershipLabel: string;
  membershipValue: string;
  socialLabel: string;
  socialValue: string;
  footerVisibility: {
    portraitHours: boolean;
    portraitImpact: boolean;
    landscapeTheater: boolean;
    landscapeHours: boolean;
    landscapeMembership: boolean;
    landscapeSocial: boolean;
  };
}

export interface DonorBoardProgram {
  id: string;
  name: string;
  orientation: DisplayProfile["orientation"];
  heading: string;
  subtitle: string;
  description: string;
  footer: string;
  columns: 1 | 2;
  donorIds: string[];
  active: boolean;
  panels?: BoardPanel[];
}

export type BoardPanelType = "heading" | "supporters-heading" | "donors" | "message" | "story" | "footer" | "image";

export interface BoardPanel {
  id: string;
  type: BoardPanelType;
  eyebrow?: string;
  title: string;
  body?: string;
  size: "compact" | "standard" | "feature";
  columns?: 1 | 2 | 3 | 4;
  rows?: number;
  footerIconPlacement?: "left" | "both";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  imageUrl?: string;
  imageFit?: "cover" | "contain";
  fontFamily?: DisplayProfile["fontFamily"];
  fontSize?: number;
  textColor?: string;
  /** Preserved only to migrate boards created before the supporters heading was its own panel. */
  donorHeadingSize?: number;
  /** Preserved only to migrate boards created before the donor list used the panel font size. */
  donorNameSize?: number;
  donorDividerColor?: string;
  donorDividerThickness?: number;
  donorDividerOpacity?: number;
}

export interface ScheduleEntry {
  id: string;
  name: string;
  target: TargetScreen;
  boardId: string;
  contentType?: "board" | "announcement" | "broadcast";
  announcementId?: string;
  days: number[];
  recurrence?: "once" | "weekly";
  scheduleDate?: string;
  scheduleEndDate?: string;
  startTime: string;
  endTime: string;
  message?: string;
  color?: string;
  active: boolean;
}

export interface RecognitionSettings {
  tiers: string[];
  categories: string[];
  tags: string[];
  appearance: "dark" | "light" | "ocean" | "warm" | "contrast" | "sparkle";
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  details?: string;
  textColor?: string;
  backgroundColor?: string;
  imageUrl?: string;
  imageX?: number;
  imageY?: number;
  imageWidth?: number;
  layoutX?: number;
  layoutY?: number;
  layoutWidth?: number;
  timerX?: number;
  timerY?: number;
  targets?: ScreenId[];
  target: TargetScreen;
  priority: "Normal" | "Elevated" | "Urgent";
  style: "Ribbon" | "Temporary Card" | "Lower Third";
  active: boolean;
  startedAt?: string;
  durationMinutes: number;
  timerStyle: "off" | "digital" | "progress" | "circular";
  timerPosition: "announcement-right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  timerAccentColor: string;
  timerTrackColor: string;
  finishSfx: "off" | "ding" | "chime";
  sfxVolume: number;
  character: "off" | "inspector" | "custom";
  characterAssetUrl?: string;
  characterAssetName?: string;
  characterAssetKind?: "image" | "model";
  characterPlayAnimation?: boolean;
  characterStartX?: number;
  characterStopX?: number;
  characterWalkSeconds?: number;
  characterWaitSeconds?: number;
  startSoundUrl?: string;
  endSoundUrl?: string;
}

export type SavedAnnouncement = Omit<Announcement, "active" | "startedAt">;

export type LiveSource = "demo" | "camera" | "screen";

export interface LiveVideoFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  crop: ImageCrop;
  rotation?: number;
  mirrorX?: boolean;
  mirrorY?: boolean;
  maskShape?: "rectangle" | "square" | "circle" | "polygon";
  polygonPoints?: Array<{ x: number; y: number }>;
}

export interface ChromaKeySettings {
  enabled: boolean;
  color: string;
  similarity: number;
  smoothness: number;
  spill: number;
}

export interface LiveEffectsSettings {
  background: "original" | "remove" | "blur" | "image";
  backgroundImage?: string;
  blur: number;
  segmentationThreshold: number;
  segmentationFeather: number;
  accessory: "none" | "glasses" | "party-hat";
  faceTracking: boolean;
  puppetPreview: boolean;
}

export interface LivePresentation {
  active: boolean;
  target: TargetScreen;
  title: string;
  lowerThird: string;
  titlePosition: { x: number; y: number };
  lowerThirdPosition: { x: number; y: number };
  backgroundMode: "board" | "color" | "image";
  backgroundColor: string;
  backgroundImage?: string;
  panelColor: string;
  frameBorderColor: string;
  frameBorderWidth: number;
  usingCamera: boolean;
  source: LiveSource;
  frame: LiveVideoFrame;
  chromaKey: ChromaKeySettings;
  effects: LiveEffectsSettings;
  videoDeviceId?: string;
  audioDeviceId?: string;
}

export interface DisplayProfile {
  id: ScreenId;
  label: string;
  orientation: "Portrait" | "Landscape";
  resolution: string;
  assignment: string;
  style: DisplayStyle;
  /** Selects the source behind the board without changing its layout or renderer. */
  backgroundMode?: "board" | "image";
  backgroundImage?: string;
  backgroundMediaId?: string;
  backgroundMediaType?: "image" | "video";
  backgroundMediaName?: string;
  backgroundMediaAnimated?: boolean;
  backgroundCrop: ImageCrop;
  layoutScale: number;
  brightness: number;
  currentRevision: number;
  renderer: RendererMode;
  quality: QualityTier;
  fps: number;
  status: DisplayStatus;
  lastHeartbeat?: string;
  enabled?: boolean;
  boardProgramId?: string;
  donorIds?: string[];
  donorRosterConfigured?: boolean;
  donorSubtextVisibility?: Record<string, boolean>;
  customHeading?: string;
  customSubheading?: string;
  fontFamily?: "Inter" | "Georgia" | "Avenir" | "Montserrat" | "Playfair Display" | "Cormorant Garamond" | "Cinzel" | "Libre Baskerville" | "Merriweather" | "Raleway" | "Nunito" | "Quicksand" | "Fredoka" | "Cabin Sketch" | "DM Sans" | "Lora" | "Oswald" | "Poppins" | "Roboto Slab" | "Source Serif 4";
  nameSize?: number;
  columns?: 1 | 2;
  donorScrollEnabled?: boolean;
  donorScrollSpeed?: number;
  particleAnimationEnabled?: boolean;
  particleDriftDirection?: "natural" | "left" | "right" | "up" | "down" | "wander";
  particleDriftSpeed?: number;
  particleGravity?: number;
  particleColorStyle?: "warm" | "primary";
  particleCount?: number;
  particleSize?: number;
  particleSpread?: number;
  particleWander?: number;
  particleLifetime?: number;
  particleLifetimeRange?: number;
  showFrame?: boolean;
  textFinish?: "flat" | "cut-brass";
  textShadowEnabled?: boolean;
  textShadowStrength?: number;
  textShadowAngle?: number;
  textShadowDistance?: number;
  showIcons?: boolean;
  donorIconStyle?: "circle" | "diamond" | "dash";
  donorIconPlacement?: "left" | "both";
  /** Legacy default used when a donor has no per-display visibility setting. */
  showSubtext?: boolean;
  roomVideoDeviceId?: string;
  roomAudioDeviceId?: string;
  roomAudioEnabled?: boolean;
}

export interface RevisionRecord {
  id: number;
  note: string;
  author: string;
  publishedAt: string;
  portraitReady: boolean;
  landscapeReady: boolean;
}

export interface LanternState {
  revision: number;
  publishedAt: string;
  nextScheduledEvent: string;
  lastBackup: string;
  donors: Donor[];
  donorGroups: DonorGroup[];
  recognitionSettings: RecognitionSettings;
  theme: LanternTheme;
  board: BoardContent;
  boardPrograms: DonorBoardProgram[];
  schedules: ScheduleEntry[];
  savedAnnouncements: SavedAnnouncement[];
  announcement: Announcement;
  live: LivePresentation;
  screens: Record<ScreenId, DisplayProfile>;
  revisions: RevisionRecord[];
}

export interface DisplayHeartbeat {
  type: "display-heartbeat";
  screenId: ScreenId;
  fps: number;
  status: DisplayStatus;
  timestamp: string;
}

export type HostMessage =
  | { type: "state-update"; state: LanternState }
  | DisplayHeartbeat
  | { type: "identify-screen"; screenId: ScreenId }
  | { type: "live-stop"; target: TargetScreen }
  | { type: "display-presence"; screenId: ScreenId; timestamp: string }
  | { type: "webrtc-offer"; target: ScreenId; source: "control"; sdp: RTCSessionDescriptionInit }
  | { type: "webrtc-answer"; target: "control"; source: ScreenId; sdp: RTCSessionDescriptionInit }
  | { type: "webrtc-candidate"; target: ScreenId | "control"; source: ScreenId | "control"; candidate: RTCIceCandidateInit };
