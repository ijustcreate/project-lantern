import type { VisitorMessage, VisitorMessageRotation } from "./visitorMessages";

export type ScreenId = string;

export type TargetScreen = ScreenId | "all";

export type DisplayStatus = "offline" | "ready" | "live" | "warning";

export type QualityTier = "Baseline" | "Balanced" | "Showcase";

export type RendererMode = "WebGL2" | "Certified WebGPU";

export type PortalAppearance = "dark" | "light" | "ocean" | "warm" | "contrast" | "sparkle" | "children";

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
  /** The historical donor's gift amount was not recorded. */
  amountUnknown?: boolean;
  donations?: DonationRecord[];
  displayIds?: ScreenId[];
  /** Boards whose donor rosters include this donor. Display placement is derived from the board. */
  boardIds?: string[];
  /** Optional pledge society membership. Kept separate from received-gift history. */
  givingProgramId?: string;
  givingLevelId?: string;
  pledgeAnnualAmount?: number;
  pledgeYears?: number;
  pledgeOneTime?: boolean;
  pledgeStartYear?: string;
  pledgeStatus?: "Pledged" | "Active" | "Fulfilled" | "Paused";
  recognitionOrder?: number;
}

export interface GivingLevel {
  id: string;
  name: string;
  annualPledge: number;
  years: number;
  description: string;
  color: string;
  minAmount?: number;
  maxAmount?: number;
  displayOrder?: number;
  active?: boolean;
}

export interface GivingProgram {
  id: string;
  name: string;
  classLabel: string;
  classYear: string;
  description: string;
  fundDesignation: string;
  invitation: string;
  impactStatement: string;
  goodDeedPrompt: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  website: string;
  address: string;
  levels: GivingLevel[];
  spotlightDonorId?: string;
  displayOrder?: number;
  active?: boolean;
  allowOneTimeQualification?: boolean;
}

export interface LanternUser {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Local demo users are passwordless and must not be mistaken for authenticated accounts. */
  accessMode: "local-demo" | "authenticated";
  authProvider?: string;
  authSubject?: string;
}

export interface FloatingWindowLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LanternUserPreferences {
  userId: string;
  theme: PortalAppearance;
  donorSort: "manual" | "az" | "za";
  lastDisplayId?: ScreenId;
  lastScheduleDisplay?: TargetScreen;
  lastBoardId?: string;
  roomWindows: Record<ScreenId, FloatingWindowLayout>;
  roomMirrorByDisplay: Record<ScreenId, boolean>;
  editor: {
    scheduleView?: "week" | "day" | "month" | "agenda";
    liveTab?: "setup" | "frame" | "effects";
    directMode?: "frame" | "crop";
  };
}

export interface AuditRecord {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  entityType: string;
  entityId: string;
  action: "create" | "update" | "delete" | "reorder" | "publish" | "run";
  summary: string;
  before?: unknown;
  after?: unknown;
}

export interface BroadcastReminderAcknowledgement {
  occurrenceKey: string;
  scheduleId: string;
  status: "prompted" | "dismissed" | "acknowledged" | "cleared";
  updatedAt: string;
  userId?: string;
  snoozedUntil?: string;
}

export interface DonationRecord {
  id: string;
  /** Date the museum actually received the contribution. */
  date: string;
  amount: number;
  /** Legacy contribution classification retained for existing records and reporting. */
  type?: "Cash" | "In-kind" | "Sponsorship" | "Legacy" | "Volunteer";
  paymentMethod?: "Cash" | "Check" | "Credit card" | "ACH" | "Wire" | "In-kind" | "Other";
  transactionReference?: string;
  checkNumber?: string;
  receiptNote?: string;
  internalNotes?: string;
  enteredByUserId?: string;
  updatedByUserId?: string;
  enteredAt?: string;
  updatedAt?: string;
  /** Stable marker used to make data migrations idempotent. */
  migrationKey?: "brigade-opening-payment-v1";
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

export type RecognitionIcon = "none" | "star" | "heart" | "leaf" | "sparkle" | "diamond" | "crown" | "laurel" | "sun";

export type BoardDonorHighlight = "none" | "fine-underline" | "soft-underline" | "soft-highlight";

export type BoardDonorAnimation = "none" | "grow-shrink" | "slow-shimmer" | "letter-wave";

/** Visitor-facing name styling owned by one board, never by the donor profile. */
export interface BoardDonorPresentation {
  fontFamily?: DisplayProfile["fontFamily"];
  nameColor?: string;
  accentColor?: string;
  highlight?: BoardDonorHighlight;
  recognitionIcon?: RecognitionIcon;
  recognitionIconImage?: string;
  animation?: BoardDonorAnimation;
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
  fontFamily?: DisplayProfile["fontFamily"];
  /** Defaults for every donor name on this board. */
  donorPresentation?: BoardDonorPresentation;
  /** Optional board-local overrides keyed by donor id. */
  donorStyles?: Record<string, BoardDonorPresentation>;
  nameSize?: number;
  donorScrollEnabled?: boolean;
  donorScrollSpeed?: number;
  donorScrollDirection?: "vertical" | "horizontal";
  showIcons?: boolean;
  showSubtext?: boolean;
  backgroundMode?: "board" | "image";
  backgroundImage?: string;
  backgroundMediaId?: string;
  backgroundCrop?: ImageCrop;
  showFrame?: boolean;
  textFinish?: "flat" | "cut-brass";
  textShadowEnabled?: boolean;
  textShadowStrength?: number;
  textShadowAngle?: number;
  textShadowDistance?: number;
  givingProgramId?: string;
  templatePurpose?: "roster" | "level" | "story" | "invitation" | "good-deeds";
  palette?: "classic" | "brigade-blue" | "brigade-red" | "brigade-sunshine" | "brigade-cream" | "legacy-navy" | "legacy-sky";
}

/** Text, donor lists, and images are the only board content types exposed in the editor. Legacy values remain readable so saved boards can migrate in place. */
export type BoardPanelType = "text" | "donors" | "image" | "heading" | "supporters-heading" | "message" | "story" | "footer" | "donor-star";

export interface BoardPanel {
  id: string;
  type: BoardPanelType;
  eyebrow?: string;
  title: string;
  body?: string;
  size: "compact" | "standard" | "feature";
  columns?: 1 | 2 | 3 | 4;
  rows?: number;
  donorIds?: string[];
  /** One donor positioned on an image-backed recognition star. */
  donorId?: string;
  /** Dynamically includes matching tiers from the board roster as membership changes. */
  donorTierFilter?: string[];
  footerIconPlacement?: "left" | "both";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  imageUrl?: string;
  imageFit?: "cover" | "contain";
  /** Panels with the same group move together in the board editor. */
  groupId?: string;
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
export interface BoardWidget { id: string; name: string; panels: BoardPanel[]; defaultImageUrl?: string; }

export interface ScheduleEntry {
  id: string;
  name: string;
  target: TargetScreen;
  boardId: string;
  contentType?: "board" | "announcement" | "blip" | "broadcast";
  broadcastMode?: "recorded" | "live";
  broadcastVideoUrl?: string;
  broadcastVideoName?: string;
  presenterName?: string;
  announcementId?: string;
  blipId?: string;
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
  appearance: PortalAppearance;
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
  style: "Ribbon" | "Temporary Card" | "Lower Third" | "News Ticker";
  tickerSpeed?: "slow" | "standard" | "fast";
  tickerDirection?: "left" | "right";
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

export type BlipKind = "joke" | "quiz" | "celebration";
export type BlipSfx = "off" | "bell" | "applause" | "level-up" | "ba-dum-tss" | "laughter";

export interface Blip {
  id: string;
  name: string;
  kind: BlipKind;
  headline: string;
  prompt: string;
  answer?: string;
  subtext?: string;
  imageUrl?: string;
  target: TargetScreen;
  targets?: ScreenId[];
  active: boolean;
  startedAt?: string;
  durationMinutes: number;
  countdownSeconds: number;
  showCountdown: boolean;
  ticking: boolean;
  startSfx: BlipSfx;
  revealSfx: BlipSfx;
  startSoundUrl?: string;
  revealSoundUrl?: string;
  sfxVolume: number;
  backgroundColor: string;
  accentColor: string;
  motion: "slide" | "pop" | "gentle";
}

export type SavedBlip = Omit<Blip, "active" | "startedAt" | "targets">;

export type LiveSource = "demo" | "camera" | "screen" | "recording";

export interface LiveVideoFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  crop: ImageCrop;
  /** Fit keeps the whole source visible; fill covers the camera panel. */
  fitMode?: "fit" | "fill";
  /** Independent, non-destructive edge crops expressed as panel percentages. */
  cropEdges?: BroadcastCropEdges;
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
  glassesEnabled?: boolean;
  glassesStyle?: "classic" | "playful";
  partyHatEnabled?: boolean;
  hatEnabled?: boolean;
  hatStyle?: "party" | "wizard";
  wizardSpringiness?: number;
  wizardDamping?: number;
  faceTracking: boolean;
  puppetPreview: boolean;
  trackingDebug?: boolean;
  trackedPointsOverlay?: boolean;
  trackingCameraUnderlay?: boolean;
  costumeEnabled?: boolean;
  costumeId?: string;
  calibrationProfileId?: string;
}

export type TrackingAnchorPoint =
  | "left-eye"
  | "right-eye"
  | "nose"
  | "mouth-upper"
  | "mouth-lower"
  | "left-ear"
  | "right-ear"
  | "head-left"
  | "head-right"
  | "head-top"
  | "chin"
  | "neck"
  | "chest"
  | "left-shoulder"
  | "right-shoulder"
  | "left-hand"
  | "right-hand";

export type CalibrationPose = "center" | "left" | "right" | "up" | "down";

export interface LandmarkCalibrationOffset {
  x: number;
  y: number;
  updatedAt: string;
}

export interface CalibrationPoseSample {
  pose: CalibrationPose;
  completedAt: string;
  offsets: Partial<Record<TrackingAnchorPoint, LandmarkCalibrationOffset>>;
}

export interface TrackingCalibrationProfile {
  id: string;
  name: string;
  userId: string;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
  landmarkOffsets: Partial<Record<TrackingAnchorPoint, LandmarkCalibrationOffset>>;
  poseSamples: Partial<Record<CalibrationPose, CalibrationPoseSample>>;
}

export type EffectRigJoint = "fixed" | "hinge" | "ball" | "spring";

export interface EffectRigBone {
  id: string;
  name: string;
  parentId?: string;
  joint: EffectRigJoint;
  anchor: TrackingAnchorPoint;
  weight: number;
  springiness: number;
  damping: number;
}

export type CostumePieceRole =
  | "head-backplate"
  | "cheek"
  | "nose"
  | "upper-mouth"
  | "lower-mouth"
  | "chin"
  | "ear"
  | "eyebrow"
  | "eye"
  | "upper-eyelid"
  | "lower-eyelid"
  | "muzzle"
  | "hand"
  | "palm"
  | "forearm"
  | "body"
  | "hat"
  | "glasses"
  | "custom";

export interface CostumeArtPiece {
  id: string;
  name: string;
  role: CostumePieceRole;
  anchor: TrackingAnchorPoint;
  boneId?: string;
  side?: "left" | "right" | "center";
  color: string;
  accentColor?: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  zIndex: number;
  visible: boolean;
  inferred?: boolean;
}

export interface CostumeDefinition {
  id: string;
  name: string;
  description: string;
  starter?: "teddy" | "skeleton";
  createdAt: string;
  updatedAt: string;
  bones: EffectRigBone[];
  pieces: CostumeArtPiece[];
}

export interface EffectStudioState {
  costumes: CostumeDefinition[];
  calibrationProfiles: TrackingCalibrationProfile[];
  activeCalibrationByUserDevice: Record<string, string>;
}

export interface BroadcastCropEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type BroadcastFramePresetId =
  | "custom"
  | "museum-sketch"
  | "dark-gold"
  | "brass"
  | "gold"
  | "black"
  | "white"
  | "matte-plastic";

export interface BroadcastFrameStyle {
  presetId: BroadcastFramePresetId;
  thickness: number;
  color: string;
  bevel: boolean;
  innerOutline: boolean;
  innerOutlineColor: string;
  outerOutline: boolean;
  outerOutlineColor: string;
}

export type BroadcastBackgroundMode = "board" | "color" | "gradient" | "image" | "none";

export type BroadcastGradientDirection =
  | "left-to-right"
  | "right-to-left"
  | "top-to-bottom"
  | "bottom-to-top"
  | "radial";

export interface BroadcastGradientSettings {
  colors: string[];
  direction: BroadcastGradientDirection;
}

export type BroadcastBackgroundPresetId =
  | "board"
  | "solid-midnight"
  | "wonder-gradient"
  | "museum-branded"
  | "custom-image"
  | "none";

export interface BroadcastMediaTransform {
  fitMode: "fit" | "fill";
  scale: number;
  x: number;
  y: number;
  rotation: number;
}

export interface LivePresentation {
  active: boolean;
  target: TargetScreen;
  title: string;
  lowerThird: string;
  titlePosition: { x: number; y: number };
  lowerThirdPosition: { x: number; y: number };
  backgroundMode: BroadcastBackgroundMode;
  backgroundColor: string;
  backgroundImage?: string;
  backgroundPresetId?: BroadcastBackgroundPresetId;
  backgroundImagePreset?: "museum-branded" | "custom";
  backgroundGradient?: BroadcastGradientSettings;
  backgroundImageTransform?: BroadcastMediaTransform;
  panelColor: string;
  frameBorderColor: string;
  frameBorderWidth: number;
  frameStyle?: BroadcastFrameStyle;
  usingCamera: boolean;
  source: LiveSource;
  /** Saved local recording used when source is `recording`. */
  recordingId?: string;
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
  roomAudioGain?: number;
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
  contentVersion: number;
  revision: number;
  publishedAt: string;
  nextScheduledEvent: string;
  lastBackup: string;
  donors: Donor[];
  users: LanternUser[];
  userPreferences: LanternUserPreferences[];
  auditHistory: AuditRecord[];
  broadcastReminderAcknowledgements: BroadcastReminderAcknowledgement[];
  visitorMessages: VisitorMessage[];
  visitorMessageRotation: VisitorMessageRotation;
  givingPrograms: GivingProgram[];
  donorGroups: DonorGroup[];
  recognitionSettings: RecognitionSettings;
  theme: LanternTheme;
  board: BoardContent;
  boardPrograms: DonorBoardProgram[];
  widgets?: BoardWidget[];
  schedules: ScheduleEntry[];
  savedAnnouncements: SavedAnnouncement[];
  announcement: Announcement;
  savedBlips: SavedBlip[];
  activeBlip: Blip;
  live: LivePresentation;
  effectStudio: EffectStudioState;
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
