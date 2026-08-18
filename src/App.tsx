import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  Box,
  Bug,
  Camera,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Eye,
  ExternalLink,
  Folder,
  GripVertical,
  Move,
  Move3d,
  Glasses,
  Circle,
  ClipboardCopy,
  Download,
  Eraser,
  History,
  Image as ImageIcon,
  ImagePlus,
  Info,
  LayoutDashboard,
  Lock,
  Maximize2,
  MessageSquare,
  Megaphone,
  Mic,
  Minimize2,
  Minus,
  Moon,
  Monitor,
  Music2,
  Palette,
  Paintbrush,
  Pencil,
  PictureInPicture2,
  Play,
  Power,
  Plus,
  Radio,
  RefreshCcw,
  RotateCcw,
  Rotate3d,
  Save,
  Search,
  ScanFace,
  Send,
  Settings,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Square,
  ArrowUpRight,
  Star,
  Smartphone,
  Sun,
  PartyPopper,
  Trash2,
  Upload,
  Unlock,
  Users,
  Video,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { BabylonDonorWall } from "./display/BabylonDonorWall";
import { ChromaVideo } from "./components/ChromaVideo";
import { EffectStudio } from "./components/EffectStudio";
import { ChromaKeySampler } from "./components/ChromaKeySampler";
import { AuditHistoryPanel } from "./components/AuditHistoryPanel";
import { AudioLevelMeter } from "./components/AudioLevelMeter";
import { BroadcastBackgroundLayer } from "./components/BroadcastBackgroundLayer";
import { BroadcastCompositionControls } from "./components/BroadcastCompositionControls";
import { RecordingLibrary } from "./components/RecordingLibrary";
import { BrigadeView as BrigadeLandingPageView } from "./components/BrigadeView";
import { VisitorMessageFooter } from "./components/VisitorMessageFooter";
import { VisitorMessageManager } from "./components/VisitorMessageManager";
import { LanternConfirmDialog, LanternNotice, LanternTextPromptDialog } from "./components/LanternDialog";
import { parseCurrencyAmount } from "./donorDomain";
import { buildDonorNameGridLayout, splitDonorNameLines } from "./donorNameLayout";
import { AnimatedDonorName, BoardDonorPresentationEditor, recognitionIconGlyph } from "./components/BoardDonorPresentationEditor";
import { clearBoardDonorStyle, patchBoardDonorStyle, resolveBoardDonorPresentation } from "./boardPresentation";
import { formatMediaDeviceError, mediaDeviceManager, type MediaDeviceLease } from "./host/mediaDeviceManager";
import { openRoomCameraPopout, ROOM_CAMERA_POPOUT_ROOT_ID } from "./roomCameraPopout";
import {
  defaultUserPreferences,
  reminderMayPrompt,
  scheduleOccurrenceKey,
  updateReminderAcknowledgement,
  withAuditHistory
} from "./stateManagement";
import {
  canWriteSharedLanternState,
  createHostChannel,
  deleteLanternMedia,
  enableSharedStatePersistence,
  fitWarnings,
  hydrateLanternMedia,
  loadIndexedDbLanternState,
  loadLanternState,
  loadSharedLanternState,
  mergeSharedLanternState,
  openDisplayWindows,
  publishState,
  saveLanternStateDurably,
  saveSharedLanternState,
  shareLanternImages,
  storeLanternMedia,
  targetIncludes,
  uploadLanternAsset
} from "./host/lanternHost";
import { attachDisplayVideoReceiver, DirectorVideoBridge } from "./host/videoBridge";
import type {
  DisplayHeartbeat,
  DisplayProfile,
  DisplayStyle,
  BoardPanel,
  BoardDonorPresentation,
  BoardWidget,
  BoardPanelType,
  Donor,
  DonorBoardProgram,
  DonationRecord,
  GivingLevel,
  GivingProgram,
  HostMessage,
  LanternUser,
  LanternState,
  LanternTheme,
  SavedBlip,
  ScreenId,
  TargetScreen,
  ScheduleEntry
} from "./types";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import codeChangelog from "./changelog.json";
import { nextVisitorMessage, normalizeVisitorMessageRotation } from "./visitorMessages";
import { CHROMA_KEY_PRESETS, createBackgroundRemovalPatch, resolveBackgroundRemoval, SCREENLESS_REMOVAL_TECHNOLOGY, type BackgroundRemovalMethod } from "./backgroundRemoval";
import { frameSurfaceStyle, normalizeBroadcastComposition, normalizeCropEdges } from "./broadcastComposition";
import { renderCostumeOverlay } from "./costumeRenderer";
import { resolveCalibrationProfile } from "./effectStudio";
import type { TrackingRuntimeStatus } from "./trackingRuntime";
import {
  captureRecordingThumbnail,
  createDemoRecordingCapture,
  normalizeRecordingTitle,
  recordingLibraryStore,
  recordingTimingMetrics,
  sortRecordingLibrary,
  type DemoRecordingCapture,
  type RecordingLibraryRecord
} from "./recordingLibrary";
import { createRecordingSourcePlayback } from "./recordingSource";

type View = "dashboard" | "brigade" | "donors" | "theme" | "schedule" | "announcements" | "live" | "revisions" | "bugs" | "settings";

const navItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "brigade", label: "Toy Soldier Brigade", icon: Star },
  { id: "donors", label: "Donors", icon: Users },
  { id: "theme", label: "Board Editor", icon: Palette },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "announcements", label: "Announcements", icon: Megaphone },
  { id: "live", label: "Broadcast / Stream", icon: Radio },
  { id: "revisions", label: "Revisions", icon: History },
  { id: "bugs", label: "Bugs", icon: Bug },
  { id: "settings", label: "Settings", icon: Settings2 }
];

const styleOptions: Array<[DisplayStyle, string]> = [
  ["donor-wall", "Donor wall"],
  ["image", "Image"]
];

type BoardFontFamily = NonNullable<DisplayProfile["fontFamily"]>;

const boardFontOptions: BoardFontFamily[] = [
  "Inter",
  "Georgia",
  "Avenir",
  "Montserrat",
  "Playfair Display",
  "Cormorant Garamond",
  "Cinzel",
  "Libre Baskerville",
  "Merriweather",
  "Raleway",
  "Nunito",
  "Quicksand",
  "Fredoka",
  "Cabin Sketch",
  "DM Sans",
  "Lora",
  "Oswald",
  "Poppins",
  "Roboto Slab",
  "Source Serif 4"
];

const boardFontLabels: Record<BoardFontFamily, string> = {
  Inter: "Inter — Clear & modern",
  Georgia: "Georgia — Traditional",
  Avenir: "Avenir — Refined sans serif",
  Montserrat: "Montserrat — Modern plaque",
  "Playfair Display": "Playfair Display — Elegant",
  "Cormorant Garamond": "Cormorant Garamond — Formal",
  Cinzel: "Cinzel — Ceremonial",
  "Libre Baskerville": "Libre Baskerville — Classic",
  Merriweather: "Merriweather — Highly readable",
  Raleway: "Raleway — Contemporary",
  Nunito: "Nunito — Friendly",
  Quicksand: "Quicksand — Rounded & playful",
  Fredoka: "Fredoka — Children’s museum",
  "Cabin Sketch": "Cabin Sketch — Crayon style",
  "DM Sans": "DM Sans — Clean & versatile",
  Lora: "Lora — Warm editorial serif",
  Oswald: "Oswald — Condensed signage",
  Poppins: "Poppins — Geometric & friendly",
  "Roboto Slab": "Roboto Slab — Strong slab serif",
  "Source Serif 4": "Source Serif 4 — Formal & readable"
};

const announcementSfxSources = {
  ding: "/assets/sfx/announcement-ding.wav",
  chime: "/assets/sfx/announcement-chime.ogg"
} as const;

export function App() {
  const announcementDemoMatch = window.location.hash.match(/^#\/announcement-demo\/([^/?#]+)/);
  if (announcementDemoMatch) {
    return <AnnouncementDemoApp screenId={decodeURIComponent(announcementDemoMatch[1])} />;
  }

  const displayWallMatch = window.location.hash.match(/^#\/display-wall\/([^?#]+)/);
  if (displayWallMatch) {
    return <DisplayWallApp screenIds={displayWallMatch[1].split(",").map((screenId) => decodeURIComponent(screenId)).filter(Boolean)} />;
  }

  const displayMatch = window.location.hash.match(/^#\/display\/([^/?#]+)/);
  if (displayMatch) {
    return <DisplayApp screenId={decodeURIComponent(displayMatch[1])} />;
  }

  return <ControlCenter />;
}

function ControlCenter() {
  const [state, setState] = useState<LanternState>(() => loadLanternState());
  const [statePersistenceReady, setStatePersistenceReady] = useState(false);
  const [view, setView] = useHashView();
  const [query, setQuery] = useState("");
  const [selectedDisplayId, setSelectedDisplayId] = useState<ScreenId>(() => firstDisplayId(loadLanternState()));
  const [requestedBoardEditorId, setRequestedBoardEditorId] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState("Idle");
  const [donorSetupOpen, setDonorSetupOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [bugCapture, setBugCapture] = useState<BugAttachment[]>([]);
  const [bugCaptureStatus, setBugCaptureStatus] = useState("");
  const [activeUserId, setActiveUserId] = useState(() => readActiveLanternUserId(loadLanternState()));
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [bugLauncherVisible, setBugLauncherVisible] = useState(() => localStorage.getItem("project-lantern-bug-launcher-visible") !== "false");
  const [bugLauncherPosition, setBugLauncherPosition] = useState(() => readBugLauncherPosition(currentBugUser()));
  const bugLauncherDrag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const suppressBugLauncherClick = useRef(false);
  const [scheduleFocusId, setScheduleFocusId] = useState<string | null>(null);
  const [ideasOpen, setIdeasOpen] = useState(true);
  const [displayEditorTab, setDisplayEditorTab] = useState<"setup" | "room" | "names">("setup");
  const [displayEditorOpen, setDisplayEditorOpen] = useState(false);
  const [openAssignedRoomCamera, setOpenAssignedRoomCamera] = useState(false);
  const [scheduledBroadcastPrompt, setScheduledBroadcastPrompt] = useState<{ entry: ScheduleEntry; occurrenceKey: string } | null>(null);
  const [displayOpenNotice, setDisplayOpenNotice] = useState<string | null>(null);
  const [announcementTab, setAnnouncementTab] = useState<"messages" | "blips">("messages");
  const [visitorMessageManagerOpen, setVisitorMessageManagerOpen] = useState(false);
  const visitorPageEntryRef = useRef<View | null>(null);
  const videoBridge = useRef<DirectorVideoBridge | null>(null);
  const showIdeas = false;
  const activeUser = state.users.find((user) => user.id === activeUserId) ?? state.users[0];
  const activeUserName = activeUser?.name ?? currentBugUser();
  const activePreferences = state.userPreferences.find((preferences) => preferences.userId === activeUser?.id);
  const activeVisitorMessage = state.visitorMessages.find((message) => message.id === state.visitorMessageRotation.currentId)
    ?? state.visitorMessages.find((message) => message.active);

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const due = state.schedules.find((entry) => entry.active && entry.contentType === "broadcast" && entry.broadcastMode === "live" && entryOccursOnDate(entry, now) && timeToMinutes(entry.startTime) <= now.getHours() * 60 + now.getMinutes() && timeToMinutes(entry.endTime) > now.getHours() * 60 + now.getMinutes());
      if (!due) {
        setScheduledBroadcastPrompt(null);
        return;
      }
      const occurrenceKey = scheduleOccurrenceKey(due, now);
      setScheduledBroadcastPrompt((current) => {
        if (current?.occurrenceKey === occurrenceKey) return current;
        return reminderMayPrompt(state.broadcastReminderAcknowledgements, occurrenceKey, now) ? { entry: due, occurrenceKey } : null;
      });
    };
    check();
    const timer = window.setInterval(check, 15_000);
    return () => window.clearInterval(timer);
  }, [state.broadcastReminderAcknowledgements, state.schedules]);

  useEffect(() => {
    if (!activeUser) return;
    localStorage.setItem(ACTIVE_LANTERN_USER_KEY, activeUser.id);
    localStorage.setItem(ACTIVE_BUG_USER_KEY, activeUser.name);
    const bugRoster = Array.from(new Set([...readBugUsers(), ...state.users.map((user) => user.name)]));
    localStorage.setItem(BUG_USERS_KEY, JSON.stringify(bugRoster));
    notifyBugUsersUpdated(bugRoster);
  }, [activeUser, state.users]);

  useEffect(() => {
    const handleDisplayOpenResult = (event: Event) => {
      const detail = (event as CustomEvent<{ opened: string[]; blocked: string[] }>).detail;
      if (!detail?.blocked?.length) {
        setDisplayOpenNotice(null);
        return;
      }
      const blockedNames = detail.blocked.map((id) => state.screens[id]?.label ?? id);
      setDisplayOpenNotice(`The browser blocked ${blockedNames.join(", ")}. Allow pop-ups for this local site, then choose Open displays again.`);
    };
    window.addEventListener("lantern:display-open-result", handleDisplayOpenResult);
    return () => window.removeEventListener("lantern:display-open-result", handleDisplayOpenResult);
  }, [state.screens]);

  const addMenuUser = () => {
    setNewUserName("");
    setCreateUserOpen(true);
  };

  useEffect(() => {
    let mounted = true;
    void (async () => {
      let loaded = await loadIndexedDbLanternState() ?? loadLanternState();
      try {
        const shared = await loadSharedLanternState();
        loaded = shared ? mergeSharedLanternState(loaded, shared) : loaded;
      } catch {
        // The local browser copy remains usable whenever the shared service is unavailable.
      }
      const hydrated = await hydrateLanternMedia(loaded);
      const sharedImages = canWriteSharedLanternState() ? await shareLanternImages(hydrated) : hydrated;
      if (!mounted) return;
      setState(sharedImages);
      setStatePersistenceReady(true);
      if (canWriteSharedLanternState()) enableSharedStatePersistence();
      publishState(sharedImages);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!statePersistenceReady) return;
    publishState(state);
    videoBridge.current = new DirectorVideoBridge((_status, detail) => {
      setVideoStatus(detail ?? "Ready");
    });

    const channel = createHostChannel((message) => {
      if (message.type === "state-update") {
        setState(message.state);
      }

      if (message.type === "display-heartbeat") {
        setState((current) => applyHeartbeat(current, message));
      }

      if (message.type === "display-presence") {
        setState((current) => ({
          ...current,
          screens: {
            ...current.screens,
            [message.screenId]: {
              ...(current.screens[message.screenId] ?? makeDisplay(message.screenId, Object.keys(current.screens).length + 1)),
              status: current.live.active && targetIncludes(current.live.target, message.screenId) ? "live" : "ready",
              lastHeartbeat: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })
            }
          }
        }));
        void videoBridge.current?.connect(message.screenId);
      }
    });

    return () => {
      channel.close();
      videoBridge.current?.close();
    };
  }, [statePersistenceReady]);

  useEffect(() => {
    if (!state.screens[selectedDisplayId]) {
      setSelectedDisplayId(firstDisplayId(state));
    }
  }, [selectedDisplayId, state]);

  useEffect(() => {
    const announcement = state.announcement;
    if (!announcement.active || !announcement.startedAt || announcement.durationMinutes <= 0) return;
    const expiresIn = Date.parse(announcement.startedAt) + announcement.durationMinutes * 60_000 - Date.now();
    const timer = window.setTimeout(() => {
      setState((current) => {
        if (!current.announcement.active) return current;
        const next = { ...current, announcement: { ...current.announcement, active: false } };
        publishState(next);
        if (current.announcement.endSoundUrl) playSound(current.announcement.endSoundUrl);
        playAnnouncementSfx(current.announcement);
        return next;
      });
    }, Math.max(0, expiresIn));
    return () => window.clearTimeout(timer);
  }, [state.announcement.active, state.announcement.startedAt, state.announcement.durationMinutes]);

  useEffect(() => {
    const blip = state.activeBlip;
    if (!blip.active || !blip.startedAt || blip.durationMinutes <= 0) return;
    const expiresIn = Date.parse(blip.startedAt) + blip.durationMinutes * 60_000 - Date.now();
    const timer = window.setTimeout(() => updateState((current) => ({ ...current, activeBlip: { ...current.activeBlip, active: false } })), Math.max(0, expiresIn));
    return () => window.clearTimeout(timer);
  }, [state.activeBlip.active, state.activeBlip.startedAt, state.activeBlip.durationMinutes]);

  const updateState = useCallback((updater: (current: LanternState) => LanternState) => {
    setState((current) => {
      const next = updater(current);
      if (next === current) return current;
      const actor = current.users.find((user) => user.id === activeUserId) ?? current.users[0] ?? {
        id: "local-operator",
        name: currentBugUser()
      };
      const audited = withAuditHistory(current, next, { id: actor.id, name: actor.name });
      publishState(audited);
      return audited;
    });
  }, [activeUserId]);

  const advanceVisitorMessage = useCallback(() => {
    updateState((current) => {
      const selection = nextVisitorMessage(current.visitorMessages, current.visitorMessageRotation);
      return { ...current, visitorMessages: selection.messages, visitorMessageRotation: selection.rotation };
    });
  }, [updateState]);

  const chooseVisitorMessage = useCallback((messageId: string) => {
    updateState((current) => {
      const message = current.visitorMessages.find((candidate) => candidate.id === messageId && candidate.active);
      if (!message) return current;
      const shownAt = new Date().toISOString();
      return {
        ...current,
        visitorMessages: current.visitorMessages.map((candidate) => candidate.id === message.id ? { ...candidate, lastShownAt: shownAt } : candidate),
        visitorMessageRotation: {
          ...current.visitorMessageRotation,
          currentId: message.id,
          recentIds: [...current.visitorMessageRotation.recentIds.filter((id) => id !== message.id), message.id].slice(-6)
        }
      };
    });
  }, [updateState]);

  const changeVisitorMessages = useCallback((messages: LanternState["visitorMessages"]) => {
    updateState((current) => ({
      ...current,
      visitorMessages: messages,
      visitorMessageRotation: normalizeVisitorMessageRotation(current.visitorMessageRotation, messages)
    }));
  }, [updateState]);

  const sendVisitorMessage = useCallback((messageId: string, target: TargetScreen) => {
    updateState((current) => {
      const message = current.visitorMessages.find((candidate) => candidate.id === messageId);
      if (!message) return current;
      const startedAt = new Date().toISOString();
      return {
        ...current,
        activeBlip: {
          ...current.activeBlip,
          id: `visitor-message-blip-${message.id}`,
          name: "A message for every young visitor",
          kind: "celebration",
          headline: message.text,
          prompt: message.category,
          target,
          targets: target === "all" ? Object.keys(current.screens) : [target],
          active: true,
          startedAt,
          durationMinutes: 1,
          countdownSeconds: 0,
          showCountdown: false,
          ticking: false,
          startSfx: "bell",
          revealSfx: "off",
          motion: "pop"
        }
      };
    });
  }, [updateState]);

  const scheduleVisitorMessage = useCallback((messageId: string, target: TargetScreen) => {
    const announcementId = `visitor-message-${messageId}`;
    updateState((current) => {
      const message = current.visitorMessages.find((candidate) => candidate.id === messageId);
      if (!message) return current;
      const { active: _active, startedAt: _startedAt, ...announcementTemplate } = current.announcement;
      const saved = {
        ...announcementTemplate,
        id: announcementId,
        title: "Visitor message",
        message: message.text,
        details: message.category,
        target,
        targets: target === "all" ? Object.keys(current.screens) : [target]
      };
      return {
        ...current,
        savedAnnouncements: current.savedAnnouncements.some((item) => item.id === announcementId)
          ? current.savedAnnouncements.map((item) => item.id === announcementId ? saved : item)
          : [...current.savedAnnouncements, saved]
      };
    });
    setAnnouncementTab("messages");
    setView("announcements");
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("lantern:schedule-announcement", { detail: announcementId })), 0);
  }, [setView, updateState]);

  useEffect(() => {
    if (view !== "dashboard") {
      visitorPageEntryRef.current = null;
      return;
    }
    if (visitorPageEntryRef.current === view) return;
    visitorPageEntryRef.current = view;
    advanceVisitorMessage();
  }, [advanceVisitorMessage, view]);

  useEffect(() => {
    const legacyNames = readBugUsers();
    const missing = legacyNames.filter((name) => !state.users.some((user) => user.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0));
    if (!missing.length) return;
    updateState((current) => {
      const now = new Date().toISOString();
      const additions: LanternUser[] = missing.map((name) => ({
        id: localUserId(name, current.users),
        name,
        createdAt: now,
        updatedAt: now,
        accessMode: "local-demo"
      }));
      return {
        ...current,
        users: [...current.users, ...additions],
        userPreferences: [
          ...current.userPreferences,
          ...additions.map((user) => defaultUserPreferences(user, current.recognitionSettings.appearance))
        ]
      };
    });
  }, [state.users, updateState]);

  useEffect(() => {
    if (!activeUser || activePreferences?.lastDisplayId === selectedDisplayId) return;
    updateState((current) => ({
      ...current,
      userPreferences: current.userPreferences.map((preferences) => preferences.userId === activeUser.id
        ? { ...preferences, lastDisplayId: selectedDisplayId }
        : preferences)
    }));
  }, [activePreferences?.lastDisplayId, activeUser, selectedDisplayId, updateState]);

  const selectActiveUser = (userId: string) => {
    const user = state.users.find((candidate) => candidate.id === userId);
    if (!user) return;
    const preferences = state.userPreferences.find((candidate) => candidate.userId === user.id);
    setActiveUserId(user.id);
    localStorage.setItem(ACTIVE_LANTERN_USER_KEY, user.id);
    if (preferences?.lastDisplayId && state.screens[preferences.lastDisplayId]) setSelectedDisplayId(preferences.lastDisplayId);
    if (preferences?.theme && preferences.theme !== state.recognitionSettings.appearance) {
      updateState((current) => ({
        ...current,
        recognitionSettings: { ...current.recognitionSettings, appearance: preferences.theme }
      }));
    }
  };

  const createLocalUser = () => {
    const name = newUserName.trim();
    if (!name) return;
    const existing = state.users.find((user) => user.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0);
    if (existing) {
      selectActiveUser(existing.id);
      setCreateUserOpen(false);
      return;
    }
    const now = new Date().toISOString();
    const user: LanternUser = { id: localUserId(name, state.users), name, createdAt: now, updatedAt: now, accessMode: "local-demo" };
    updateState((current) => ({
      ...current,
      users: [...current.users, user],
      userPreferences: [...current.userPreferences, defaultUserPreferences(user, current.recognitionSettings.appearance)]
    }));
    setActiveUserId(user.id);
    setCreateUserOpen(false);
    setNewUserName("");
  };

  const setReminderStatus = (status: "dismissed" | "acknowledged" | "cleared", snoozeMinutes = 0) => {
    const prompt = scheduledBroadcastPrompt;
    if (!prompt) return;
    const now = new Date();
    updateState((current) => ({
      ...current,
      broadcastReminderAcknowledgements: updateReminderAcknowledgement(current.broadcastReminderAcknowledgements, {
        occurrenceKey: prompt.occurrenceKey,
        scheduleId: prompt.entry.id,
        status,
        updatedAt: now.toISOString(),
        userId: activeUser?.id,
        snoozedUntil: snoozeMinutes ? new Date(now.getTime() + snoozeMinutes * 60_000).toISOString() : undefined
      })
    }));
    setScheduledBroadcastPrompt(null);
  };

  useEffect(() => {
    if (view === "live" && scheduledBroadcastPrompt) setReminderStatus("acknowledged");
  }, [view, scheduledBroadcastPrompt?.occurrenceKey]);

  const warnings = useMemo(() => fitWarnings(state), [state]);
  const filteredDonors = useMemo(
    () =>
      state.donors.filter((donor) => {
        const group = state.donorGroups.find((item) => item.id === donor.groupId)?.name ?? "";
        const givingProgram = state.givingPrograms.find((program) => program.id === donor.givingProgramId)?.name ?? "";
        const haystack = `${donor.name} ${donor.tier} ${donor.category} ${donor.note} ${donor.subtext ?? ""} ${(donor.tags ?? []).join(" ")} ${group} ${givingProgram} ${donor.pledgeAnnualAmount ?? ""} ${donor.pledgeStatus ?? ""} ${donor.donationType ?? ""} ${donor.amount ?? ""}`.toLowerCase();
        return haystack.includes(query.toLowerCase());
      }),
    [query, state.donors, state.donorGroups, state.givingPrograms]
  );

  const openDisplays = async () => {
    publishState(state);
    await openDisplayWindows(Object.values(state.screens));
    window.setTimeout(() => publishState(state), 700);
  };

  const scheduleBoardNow = (screenId: ScreenId, boardId: string) => {
    const now = new Date();
    const start = now.getHours() * 60 + now.getMinutes();
    const id = `schedule-${Date.now()}`;
    updateState((current) => ({
      ...current,
      schedules: [...current.schedules, {
        id,
        name: `${current.boardPrograms.find((program) => program.id === boardId)?.name ?? "Donor board"} · ${current.screens[screenId]?.label ?? screenId}`,
        target: screenId,
        boardId,
        contentType: "board",
        days: [now.getDay()],
        recurrence: "once",
        scheduleDate: toDateInputValue(now),
        startTime: minutesToTime(start),
        endTime: minutesToTime(Math.min(1439, start + 60)),
        color: "#4f63cf",
        active: true
      }]
    }));
    setScheduleFocusId(id);
    setView("schedule");
  };

  const toggleAnnouncement = () => {
    updateState((current) => ({
      ...current,
      announcement: {
        ...current.announcement,
        active: !current.announcement.active,
        startedAt: !current.announcement.active ? new Date().toISOString() : current.announcement.startedAt
      }
    }));
    const sound = state.announcement.active ? state.announcement.endSoundUrl : state.announcement.startSoundUrl;
    if (sound) playSound(sound);
    if (state.announcement.active) playAnnouncementSfx(state.announcement);
  };

  const startLive = async () => {
    if (scheduledBroadcastPrompt) setReminderStatus("cleared");
    updateState((current) => ({ ...current, live: { ...current.live, active: true } }));
    await videoBridge.current?.start(state.live.target, state.live.source, state.live.videoDeviceId, state.live.audioDeviceId);
    await Promise.all(
      Object.values(state.screens)
        .filter((screen) => targetIncludes(state.live.target, screen.id))
        .map((screen) => videoBridge.current?.connect(screen.id))
    );
  };

  const startLiveStream = async (stream: MediaStream, detail: string) => {
    if (scheduledBroadcastPrompt) setReminderStatus("cleared");
    updateState((current) => ({ ...current, live: { ...current.live, active: true } }));
    await videoBridge.current?.startMediaStream(state.live.target, stream, detail);
    await Promise.all(
      Object.values(state.screens)
        .filter((screen) => targetIncludes(state.live.target, screen.id))
        .map((screen) => videoBridge.current?.connect(screen.id))
    );
  };

  const stopLive = () => {
    videoBridge.current?.stop(state.live.target);
    updateState((current) => ({ ...current, live: { ...current.live, active: false } }));
  };

  const addDonor = () => {
    setView("donors");
    setDonorSetupOpen(true);
  };

  const addDisplay = () => {
    updateState((current) => {
      const nextNumber = Object.keys(current.screens).length + 1;
      const id = `display-${nextNumber}`;
      return { ...current, screens: { ...current.screens, [id]: makeDisplay(id, nextNumber) } };
    });
  };

  const deleteDisplay = (id: ScreenId) => {
    updateState((current) => {
      if (Object.keys(current.screens).length <= 1) return current;
      const screens = { ...current.screens };
      delete screens[id];
      return { ...current, screens };
    });
  };

  const identifyDisplay = (screenId: ScreenId) => {
    const connectedDisplays = Object.values(state.screens).filter((screen) => screen.status !== "offline");
    if (!connectedDisplays.length) {
      setDisplayOpenNotice("There are no open or connected displays to identify. Open a display window, then try again.");
      return;
    }
    const channel = new BroadcastChannel("project-lantern-host-v1");
    channel.postMessage({ type: "identify-screen", screenId } satisfies HostMessage);
    channel.close();
  };

  const openDisplayEditor = (screenId: ScreenId, tab: "setup" | "room" | "names" = "setup", openAssignedCamera = false) => {
    setSelectedDisplayId(screenId);
    setDisplayEditorTab(tab);
    setOpenAssignedRoomCamera(openAssignedCamera);
    setDisplayEditorOpen(true);
    setView("dashboard");
  };

  const openAnnouncementComposer = () => {
    updateState((current) => ({
      ...current,
      announcement: {
        ...current.announcement,
        id: `announcement-${Date.now()}`,
        title: "Untitled announcement",
        message: "",
        active: false,
        startedAt: undefined
      }
    }));
    setAnnouncementTab("messages");
    setView("announcements");
  };

  useEffect(() => {
    if (view !== "donors") setDonorSetupOpen(false);
  }, [view]);

  useEffect(() => {
    const appearance = state.recognitionSettings.appearance;
    const classes = ["theme-dark", "theme-light", "theme-ocean", "theme-warm", "theme-contrast", "theme-sparkle", "theme-children"];
    document.body.classList.remove(...classes);
    if (appearance === "warm" || appearance === "sparkle" || appearance === "children") document.body.classList.add("theme-light");
    document.body.classList.add(`theme-${appearance}`);
    return () => document.body.classList.remove(...classes);
  }, [state.recognitionSettings.appearance]);

  useEffect(() => {
    if (state.recognitionSettings.appearance !== "sparkle") return;
    const sparkleAt = (event: PointerEvent) => {
      const burst = document.createElement("i");
      burst.className = "sparkle-click-burst";
      burst.style.left = `${event.clientX}px`;
      burst.style.top = `${event.clientY}px`;
      burst.textContent = "✦ ✧ ✦ ✧";
      document.body.appendChild(burst);
      window.setTimeout(() => burst.remove(), 720);
    };
    window.addEventListener("pointerdown", sparkleAt);
    return () => window.removeEventListener("pointerdown", sparkleAt);
  }, [state.recognitionSettings.appearance]);

  const openBugReport = async () => {
    setBugReportOpen(true);
    setBugCapture([]);
    setBugCaptureStatus("Add a capture or attach files");
    if (!isTauri()) return;
    setBugCaptureStatus("Capturing every open Project Lantern window…");
    try {
      const result = await invoke<{ screenshots: BugAttachment[] }>("capture_bug_windows");
      setBugCapture(result.screenshots);
      setBugCaptureStatus(result.screenshots.length ? `${result.screenshots.length} window screenshot${result.screenshots.length === 1 ? "" : "s"} attached` : "No visible app windows could be captured");
    } catch (error) {
      setBugCaptureStatus(`Capture unavailable: ${String(error)}`);
    }
  };
  const moveBugLauncher = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = bugLauncherDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = Math.max(8, Math.min(window.innerWidth - 50, drag.originX + event.clientX - drag.startX));
    const y = Math.max(8, Math.min(window.innerHeight - 50, drag.originY + event.clientY - drag.startY));
    if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) drag.moved = true;
    setBugLauncherPosition({ x, y });
    if (drag.moved) writeBugLauncherPosition(currentBugUser(), { x, y });
  };
  const finishBugLauncherDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = bugLauncherDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    bugLauncherDrag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    suppressBugLauncherClick.current = drag.moved;
  };

  return (
    <div className={`app-shell ${state.recognitionSettings.appearance === "warm" || state.recognitionSettings.appearance === "sparkle" || state.recognitionSettings.appearance === "children" ? "theme-light " : ""}theme-${state.recognitionSettings.appearance}`}>
      <aside className="sidebar">
        <div className="sidebar-aurora" aria-hidden="true" />
        <button className="brand-lockup" onClick={() => setView("dashboard")} title="Return to Dashboard" aria-label="Children's Museum of Stockton — return to Dashboard">
          <img className="museum-brand-image" src={`${import.meta.env.BASE_URL}assets/childrens-museum-stockton.png`} alt="Children's Museum of Stockton" />
        </button>
        <nav className="nav-list">
          {navItems.filter((item) => item.id !== "revisions" && item.id !== "bugs" && item.id !== "brigade").map((item) => {
            const Icon = item.icon;
            return (
              <button className={`${view === item.id ? "nav-item active" : "nav-item"}${item.id === "live" && scheduledBroadcastPrompt ? " scheduled-live-nav" : ""}`} key={item.id} onClick={() => setView(item.id)} title={item.label} aria-current={view === item.id ? "page" : undefined}>
                <span className="nav-icon"><Icon size={18} /></span>
                <span className="nav-copy"><b>{item.label}</b></span>
              </button>
            );
          })}
        </nav>
        <label className="sidebar-theme-control">
          <span><Palette size={15} /> Site theme</span>
          <select
            aria-label="Site theme"
            value={state.recognitionSettings.appearance}
            onChange={(event) => {
              const appearance = event.target.value as LanternState["recognitionSettings"]["appearance"];
              updateState((current) => ({
                ...current,
                recognitionSettings: { ...current.recognitionSettings, appearance },
                userPreferences: current.userPreferences.map((preferences) => preferences.userId === activeUser?.id
                  ? { ...preferences, theme: appearance }
                  : preferences)
              }));
            }}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="ocean">Ocean</option>
            <option value="warm">Warm</option>
            <option value="contrast">High contrast</option>
            <option value="sparkle">Sparkle Unicorn</option>
            <option value="children">Children’s Museum</option>
          </select>
        </label>
        <nav className="nav-list nav-utility-list" aria-label="History and support">
          {navItems.filter((item) => item.id === "revisions" || item.id === "bugs").map((item) => {
            const Icon = item.icon;
            return (
              <button className={view === item.id ? "nav-item active" : "nav-item"} key={item.id} onClick={() => setView(item.id)} title={item.label} aria-current={view === item.id ? "page" : undefined}>
                <span className="nav-icon"><Icon size={18} /></span>
                <span className="nav-copy"><b>{item.label}</b></span>
              </button>
            );
          })}
        </nav>
        <div className="system-card">
          <span className="system-pulse"><Activity size={14} /></span>
          <div><strong>System ready</strong><small>{Object.values(state.screens).filter((screen) => screen.status !== "offline").length}/{Object.keys(state.screens).length} displays linked</small></div>
        </div>
      </aside>

      <main className={`main-panel${view === "brigade" ? " brigade-main" : ""}${showIdeas ? ideasOpen ? " ideas-open" : " ideas-collapsed" : ""}`}>
        <header className={view === "dashboard" ? "topbar dashboard-topbar" : "topbar"}>
          <div className="page-identity">
            <p className="eyebrow"><span>Museum Donor Board Control Center</span><i />Published {state.publishedAt}</p>
            <h1>{titleFor(view)}</h1>
          </div>
          <div className="topbar-actions">
            {view === "dashboard" && (
              <>
              <button className="header-operation-button" onClick={openDisplays} title="Open every recognition display">
                <Monitor size={16} /><span>Open displays</span>
              </button>
              <button className="command-button secondary help-launch-button" onClick={() => setHelpOpen(true)} title="Open the Project Lantern walkthrough">
                <BookOpen size={18} />
                How to use
              </button>
              <button className="header-operation-button dashboard-brigade-entry" onClick={() => setView("brigade")} title="Open the Toy Soldier Brigade hub">
                <Star size={16} /><span>Toy Soldier Brigade</span>
              </button>
              <button className="header-operation-button" onClick={addDisplay} title="Add a recognition display">
                <Plus size={16} /><span>Add display</span>
              </button>
              </>
            )}
            <label className="header-user-control">
              <span><Users size={15} /> User <small>Local mode</small></span>
              <select aria-label="Current user (local non-secure mode)" value={activeUser?.id ?? ""} onChange={(event) => event.target.value === "__new__" ? addMenuUser() : selectActiveUser(event.target.value)}>
                {state.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                <option value="__new__">+ Create user…</option>
              </select>
            </label>
          </div>
        </header>
        <nav className="mobile-primary-nav" aria-label="Primary navigation">
          {navItems.filter((item) => ["dashboard", "donors", "theme", "schedule", "announcements", "live", "settings"].includes(item.id)).map((item) => {
            const Icon = item.icon;
            const scheduledLive = item.id === "live" && scheduledBroadcastPrompt;
            return <button type="button" key={item.id} className={`${view === item.id ? "active " : ""}${scheduledLive ? "scheduled-live-nav" : ""}`} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined}><Icon size={17} /><span>{item.label}</span></button>;
          })}
        </nav>

        {view === "dashboard" && (<>
          <Dashboard
            state={state}
            selectedDisplayId={selectedDisplayId}
            setSelectedDisplayId={setSelectedDisplayId}
            updateState={updateState}
            deleteDisplay={deleteDisplay}
            identifyDisplay={identifyDisplay}
            editDisplay={(screenId) => openDisplayEditor(screenId)}
            editBoard={(screenId, boardId) => {
              setSelectedDisplayId(screenId);
              setRequestedBoardEditorId(boardId);
              setView("theme");
            }}
            editRoomCamera={(screenId) => openDisplayEditor(screenId, "room", Boolean(state.screens[screenId]?.roomVideoDeviceId))}
            scheduleBoardNow={scheduleBoardNow}
          />
          {visitorMessageManagerOpen && <div className="dashboard-visitor-message-drawer">
            <VisitorMessageManager
              messages={state.visitorMessages}
              currentId={state.visitorMessageRotation.currentId}
              displays={Object.values(state.screens).map((screen) => ({ id: screen.id, name: screen.label, orientation: screen.orientation }))}
              onChange={(messages) => changeVisitorMessages(messages)}
              onUse={chooseVisitorMessage}
              onNext={advanceVisitorMessage}
              onSend={sendVisitorMessage}
              onSchedule={scheduleVisitorMessage}
            />
          </div>}
          <VisitorMessageFooter
            message={activeVisitorMessage}
            displays={Object.values(state.screens).map((screen) => ({ id: screen.id, name: screen.label, orientation: screen.orientation }))}
            onNext={advanceVisitorMessage}
            onManage={() => setVisitorMessageManagerOpen((open) => !open)}
            onSend={(target) => activeVisitorMessage && sendVisitorMessage(activeVisitorMessage.id, target)}
            manageOpen={visitorMessageManagerOpen}
          />
        </>)}
        {view === "donors" && (
          <DonorsView
            state={state}
            activeUserId={activeUser?.id}
            query={query}
            setQuery={setQuery}
            donors={filteredDonors}
            warnings={warnings}
            updateState={updateState}
            addDonor={addDonor}
            donorSetupOpen={donorSetupOpen}
            closeDonorSetup={() => setDonorSetupOpen(false)}
            onOpenBoard={(boardId) => { setView("theme"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("lantern:open-board", { detail: boardId })), 0); }}
          />
        )}
        {view === "theme" && <ThemeStudio state={state} selectedDisplayId={selectedDisplayId} setSelectedDisplayId={setSelectedDisplayId} requestedBoardId={requestedBoardEditorId} updateState={updateState} />}
        {view === "schedule" && <ScheduleCalendarView
          state={state}
          updateState={updateState}
          initialSelectedId={scheduleFocusId}
          onEditDisplay={(target) => { setSelectedDisplayId(target === "all" ? firstDisplayId(state) : target); setView("theme"); }}
          onEditAnnouncement={(announcementId) => {
            const saved = state.savedAnnouncements.find((item) => item.id === announcementId);
            if (saved) updateState((current) => ({ ...current, announcement: { ...saved, active: false, startedAt: undefined } }));
            setAnnouncementTab("messages");
            setView("announcements");
          }}
        />}
        {view === "announcements" && (
          <section className="announcements-workspace">
            <nav className="announcement-mode-tabs" aria-label="Announcement tools">
              <button type="button" className={announcementTab === "messages" ? "active" : ""} onClick={() => setAnnouncementTab("messages")} title="A fuller, timed notice for directions, closures, welcomes, or museum information. It can include layouts, imagery, sound, and a countdown."><Megaphone size={16} /> Messages <InfoDot text="A fuller, timed notice for directions, closures, welcomes, or museum information. It can include layouts, imagery, sound, and a countdown." /></button>
              <button type="button" className={announcementTab === "blips" ? "active" : ""} onClick={() => setAnnouncementTab("blips")} title="A brief, playful interruption such as a quiz, joke, celebration, or visitor prompt that appears over the current board and gets out of the way quickly."><Sparkles size={16} /> Blips <InfoDot text="A brief, playful interruption such as a quiz, joke, celebration, or visitor prompt that appears over the current board and gets out of the way quickly." /></button>
            </nav>
            <div className="announcement-tool-explainer" aria-label="Difference between Messages and Blips">
              <button type="button" className={announcementTab === "messages" ? "active" : ""} onClick={() => setAnnouncementTab("messages")}><Megaphone size={17} /><span><strong>Message</strong><small>A fuller, timed notice for directions, closures, welcomes, or museum information. It can include layouts, imagery, sound, and a countdown.</small></span></button>
              <button type="button" className={announcementTab === "blips" ? "active" : ""} onClick={() => setAnnouncementTab("blips")}><Sparkles size={17} /><span><strong>Blip</strong><small>A brief, playful interruption—such as a quiz, joke, celebration, or visitor prompt—that appears over the current board and gets out of the way quickly.</small></span></button>
            </div>
            {announcementTab === "messages"
              ? <AnnouncementsView state={state} updateState={updateState} toggleAnnouncement={toggleAnnouncement} />
              : <BlipsView state={state} updateState={updateState} onOpenSchedule={(id) => { setScheduleFocusId(id); setView("schedule"); }} />}
          </section>
        )}
        {view === "live" && (
          <section className="broadcast-workspace broadcast-only-workspace">
            <div className="comms-workspace go-live-workspace"><LivePreviewPanel
                state={state}
                activeUserId={activeUser?.id}
                patchLive={(patch) => updateState((current) => ({ ...current, live: { ...current.live, ...patch } }))}
                updateState={updateState}
                startLive={startLive}
                startLiveStream={startLiveStream}
                stopLive={stopLive}
              /></div>
          </section>
        )}
        {view === "brigade" && <BrigadeLandingPageView
          state={state}
          updateState={updateState}
          onManageDonors={() => setView("donors")}
          onOpenBoard={(boardId) => { setView("theme"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("lantern:open-board", { detail: boardId })), 0); }}
          onUseAnnouncement={(announcementId) => {
            const saved = state.savedAnnouncements.find((item) => item.id === announcementId);
            if (saved) updateState((current) => ({ ...current, announcement: { ...saved, active: false, startedAt: undefined } }));
            setAnnouncementTab("messages");
            setView("announcements");
          }}
          onPutAnnouncementOnScreen={(announcementId) => {
            const saved = state.savedAnnouncements.find((item) => item.id === announcementId);
            if (!saved) return;
            updateState((current) => ({
              ...current,
              announcement: {
                ...saved,
                target: "all",
                targets: Object.keys(current.screens),
                active: true,
                startedAt: new Date().toISOString()
              }
            }));
            if (saved.startSoundUrl) playSound(saved.startSoundUrl, saved.sfxVolume);
          }}
          onSaveJoke={({ setup, punchline }) => {
            const id = `brigade-joke-${Date.now()}`;
            updateState((current) => {
              const savedJoke: SavedBlip = {
                id,
                name: `Brigade joke · ${setup.slice(0, 44)}${setup.length > 44 ? "…" : ""}`,
                kind: "joke",
                headline: "READY FOR A GIGGLE?",
                prompt: setup,
                answer: punchline,
                subtext: "A Toy Soldier Brigade joke",
                target: "all",
                durationMinutes: 2,
                countdownSeconds: 10,
                showCountdown: true,
                ticking: false,
                startSfx: "bell",
                revealSfx: "ba-dum-tss",
                sfxVolume: 70,
                backgroundColor: "#10243f",
                accentColor: "#f4c45d",
                motion: "pop"
              };
              return { ...current, savedBlips: [...current.savedBlips, savedJoke] };
            });
          }}
        />}
        {view === "dashboard" && displayEditorOpen && <ScreensView state={state} activeUserId={activeUser?.id} selectedDisplayId={selectedDisplayId} setSelectedDisplayId={setSelectedDisplayId} openDisplays={openDisplays} updateState={updateState} initialEditingId={selectedDisplayId} initialEditorTab={displayEditorTab} initialOpenRoomCamera={openAssignedRoomCamera} editorOnly onClose={() => { setOpenAssignedRoomCamera(false); setDisplayEditorOpen(false); }} />}
        {view === "revisions" && <RevisionsView state={state} />}
        {view === "bugs" && <BugsView onNewBug={() => void openBugReport()} launcherVisible={bugLauncherVisible} onLauncherVisibleChange={(visible) => {
          setBugLauncherVisible(visible);
          localStorage.setItem("project-lantern-bug-launcher-visible", String(visible));
        }} />}
        {view === "settings" && <RecognitionSettingsView state={state} updateState={updateState} />}
        {showIdeas && <IdeasDrawer page={view} open={ideasOpen} onToggle={() => setIdeasOpen((current) => !current)} />}
      </main>
      {helpOpen && <HelpCenterModal onClose={() => setHelpOpen(false)} />}
      {createUserOpen && <div className="modal-backdrop local-user-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateUserOpen(false); }}><form className="editor-modal local-user-modal" role="dialog" aria-modal="true" aria-labelledby="local-user-title" onSubmit={(event) => { event.preventDefault(); createLocalUser(); }}><div className="editor-modal-head"><div><p className="eyebrow">Local operator profile</p><h2 id="local-user-title">Create user</h2></div><button type="button" className="icon-button" title="Close" onClick={() => setCreateUserOpen(false)}><X size={18} /></button></div><label className="field"><span>Name</span><input autoFocus value={newUserName} onChange={(event) => setNewUserName(event.target.value)} placeholder="Operator name" maxLength={80} /></label><p className="field-note local-mode-note"><Lock size={14} /> Local mode is passwordless and is intended for trusted operators on this device. It records who made changes; it is not an authentication system.</p><div className="editor-modal-actions"><button type="button" className="command-button secondary" onClick={() => setCreateUserOpen(false)}>Cancel</button><button type="submit" className="command-button primary" disabled={!newUserName.trim()}><Plus size={15} /> Create user</button></div></form></div>}
      {scheduledBroadcastPrompt && <div className="modal-backdrop scheduled-broadcast-backdrop"><section className="editor-modal scheduled-broadcast-prompt" role="dialog" aria-modal="true" aria-labelledby="scheduled-broadcast-prompt-title"><div className="editor-modal-head"><div><p className="eyebrow">Scheduled broadcast</p><h2 id="scheduled-broadcast-prompt-title">Scheduled broadcast</h2></div></div><p><strong>{scheduledBroadcastPrompt.entry.name}</strong> is scheduled to start now{scheduledBroadcastPrompt.entry.presenterName ? ` for ${scheduledBroadcastPrompt.entry.presenterName}` : ""}. Do you wish to start?</p><div className="editor-modal-actions"><button type="button" className="command-button secondary" onClick={() => setReminderStatus("dismissed", 15)}>Not now</button><button type="button" className="command-button primary" onClick={() => { setReminderStatus("acknowledged"); setView("live"); }}>Open Broadcast / Stream</button></div></section></div>}
      {displayOpenNotice && <LanternNotice message={displayOpenNotice} onDismiss={() => setDisplayOpenNotice(null)} />}
      {bugLauncherVisible && <button className="bug-report-fab" style={{ left: bugLauncherPosition.x, top: bugLauncherPosition.y }}
        onPointerDown={(event) => { bugLauncherDrag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: bugLauncherPosition.x, originY: bugLauncherPosition.y, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={moveBugLauncher}
        onPointerUp={finishBugLauncherDrag}
        onClick={() => { if (suppressBugLauncherClick.current) { suppressBugLauncherClick.current = false; return; } void openBugReport(); }}
        title="Drag to move · Click to report a bug" aria-label="Report a bug"><Bug size={19} /></button>}
      {bugReportOpen && <BugReportPanel
        initialAttachments={bugCapture}
        captureStatus={bugCaptureStatus}
        state={state}
        view={view}
        onSaved={() => setView("bugs")}
        onClose={() => setBugReportOpen(false)}
      />}
    </div>
  );
}

type BugAttachment = { name: string; dataUrl: string };
type BugStatus = "open" | "in-progress" | "ready-for-test" | "verified" | "closed";
type BugEvidence = { name: string; dataUrl?: string; path?: string; mimeType?: string };
type AgentWorkEntry = { at: string; author: string; kind: "analysis" | "proposal" | "change" | "test" | "handoff"; note: string; replyTo?: string };
function displayBugId(bugId: string) {
  const match = bugId.match(/^BUG-(\d+)$/i);
  return match ? `BUG-${match[1].padStart(5, "0")}` : bugId;
}
function bugEvidenceImageSource(bugId: string, evidence: BugEvidence) {
  if (evidence.dataUrl?.startsWith("data:image/")) return evidence.dataUrl;
  if (!evidence.path || !/\.(png|jpe?g|gif|webp|bmp)$/i.test(evidence.path)) return "";
  if (isTauri()) return convertFileSrc(evidence.path);
  const fileName = evidence.path.split(/[\\/]/).pop() ?? evidence.name;
  const evidenceBase = !BUG_API_ENDPOINT || BUG_API_ENDPOINT === "/__lantern/bugs" ? "/__lantern/evidence" : `${BUG_API_ENDPOINT}/evidence`;
  return `${evidenceBase}/${encodeURIComponent(bugId)}/${encodeURIComponent(fileName)}`;
}
type BugRecord = { bugId: string; summary: string; details: string; fixTips: string; tags: string[]; status: BugStatus; createdAt: string; updatedAt: string; attachments: string[]; folder: string; enteredBy?: string; stepsToReproduce?: string; expectedResult?: string; actualResult?: string; frequency?: string; impact?: string; diagnostics?: Record<string, unknown>; evidence?: BugEvidence[]; agentWork?: AgentWorkEntry[] };
const WEB_BUGS_KEY = "project-lantern-bug-catalog";
const BUG_USERS_KEY = "project-lantern-bug-users";
const ACTIVE_BUG_USER_KEY = "project-lantern-active-bug-user";
const ACTIVE_LANTERN_USER_KEY = "project-lantern-active-user";
const BUG_VIEW_PREFS_KEY = "project-lantern-bug-view-preferences";
const BUG_LAUNCHER_POSITIONS_KEY = "project-lantern-bug-launcher-positions";
const BUG_USERS_UPDATED_EVENT = "project-lantern-bug-users-updated";
const DEFAULT_BUG_USERS = ["Felix", "Codex"];
const UNATTRIBUTED_BUG_USER = "Unattributed";
const BUG_API_ENDPOINT = (import.meta.env.VITE_LANTERN_BUG_ENDPOINT as string | undefined)?.trim()
  || (import.meta.env.DEV ? "/__lantern/bugs" : "");
function isTauri() { return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window; }
function currentBugUser() { return localStorage.getItem(ACTIVE_BUG_USER_KEY)?.trim() || DEFAULT_BUG_USERS[0]; }
function readActiveLanternUserId(state: LanternState) {
  const saved = localStorage.getItem(ACTIVE_LANTERN_USER_KEY)?.trim();
  if (saved && state.users.some((user) => user.id === saved)) return saved;
  const legacyName = currentBugUser();
  return state.users.find((user) => user.name.localeCompare(legacyName, undefined, { sensitivity: "base" }) === 0)?.id
    ?? state.users[0]?.id
    ?? "local-operator";
}
function localUserId(name: string, users: LanternUser[]) {
  const base = `user-${name.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "operator"}`;
  if (!users.some((user) => user.id === base)) return base;
  let suffix = 2;
  while (users.some((user) => user.id === `${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
function readBugUsers() {
  try {
    const saved = JSON.parse(localStorage.getItem(BUG_USERS_KEY) ?? "[]") as unknown;
    return Array.from(new Set([...DEFAULT_BUG_USERS, ...(Array.isArray(saved) ? saved.filter((user): user is string => typeof user === "string") : [])].map((user) => user.trim()).filter(Boolean)));
  } catch { return [...DEFAULT_BUG_USERS]; }
}
function notifyBugUsersUpdated(users: string[] = []) {
  window.dispatchEvent(new CustomEvent(BUG_USERS_UPDATED_EVENT, { detail: users }));
}
function readBugLauncherPosition(user: string): { x: number; y: number } {
  try {
    const positions = JSON.parse(localStorage.getItem(BUG_LAUNCHER_POSITIONS_KEY) ?? "{}") as Record<string, { x?: number; y?: number }>;
    const saved = positions[user];
    if (typeof saved?.x === "number" && typeof saved.y === "number") return { x: saved.x, y: saved.y };
  } catch { /* Use the default position when preferences are unavailable. */ }
  return { x: Math.max(8, window.innerWidth - 64), y: Math.max(8, window.innerHeight - 62) };
}
function writeBugLauncherPosition(user: string, position: { x: number; y: number }) {
  try {
    const positions = JSON.parse(localStorage.getItem(BUG_LAUNCHER_POSITIONS_KEY) ?? "{}") as Record<string, { x: number; y: number }>;
    positions[user] = position;
    localStorage.setItem(BUG_LAUNCHER_POSITIONS_KEY, JSON.stringify(positions));
  } catch { /* Persistence is best effort, like the existing launcher visibility preference. */ }
}
function bugEnteredBy(bug: BugRecord) { return bug.enteredBy?.trim() || UNATTRIBUTED_BUG_USER; }
function readWebBugs(): BugRecord[] { try { return JSON.parse(localStorage.getItem(WEB_BUGS_KEY) ?? "[]") as BugRecord[]; } catch { return []; } }
function writeWebBugs(bugs: BugRecord[]) { localStorage.setItem(WEB_BUGS_KEY, JSON.stringify(bugs)); }
async function readBugResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Bug service returned ${response.status} instead of JSON`);
  }
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Bug service returned ${response.status}`);
  return body;
}
async function readBridgeBugs(): Promise<BugRecord[]> {
  if (!BUG_API_ENDPOINT) return [];
  return readBugResponse<BugRecord[]>(await fetch(BUG_API_ENDPOINT, { headers: { "Accept": "application/json" } }));
}
async function writeBridgeBug(bug: BugRecord): Promise<BugRecord> {
  if (!BUG_API_ENDPOINT) throw new Error("No shared bug service is configured");
  return readBugResponse<BugRecord>(await fetch(BUG_API_ENDPOINT, { method: "PUT", headers: { "Accept": "application/json", "Content-Type": "application/json" }, body: JSON.stringify(bug) }));
}
async function deleteBridgeBug(bugId: string): Promise<void> {
  if (!BUG_API_ENDPOINT) return;
  const endpoint = `${BUG_API_ENDPOINT.replace(/\/+$/, "")}/${encodeURIComponent(bugId)}`;
  await readBugResponse(await fetch(endpoint, { method: "DELETE", headers: { "Accept": "application/json" } }));
}

function BugReportPanel({ initialAttachments, captureStatus, state, view, onSaved, onClose }: {
  initialAttachments: BugAttachment[];
  captureStatus: string;
  state: LanternState;
  view: View;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [attachments, setAttachments] = useState<BugAttachment[]>(initialAttachments);
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [fixTips, setFixTips] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [actualResult, setActualResult] = useState("");
  const [frequency, setFrequency] = useState("every-time");
  const [impact, setImpact] = useState("medium");
  const [enteredBy] = useState(currentBugUser);
  const [tags, setTags] = useState<string[]>([]);
  const [knownBugTags, setKnownBugTags] = useState<string[]>(() => readWebBugs().flatMap((bug) => bug.tags));
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingAttachment, setEditingAttachment] = useState<number | null>(null);
  const [position, setPosition] = useState({ x: Math.max(20, window.innerWidth - 650), y: Math.max(20, window.innerHeight - 720) });
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => setAttachments(initialAttachments), [initialAttachments]);
  useEffect(() => {
    if (!isTauri()) return;
    void invoke<BugRecord[]>("list_bug_reports")
      .then((bugs) => setKnownBugTags(bugs.flatMap((bug) => bug.tags)))
      .catch(() => { /* Suggestions are optional; reporting still works without them. */ });
  }, []);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      setPosition({
        x: Math.max(8, Math.min(window.innerWidth - 360, drag.current.left + event.clientX - drag.current.x)),
        y: Math.max(8, Math.min(window.innerHeight - 80, drag.current.top + event.clientY - drag.current.y))
      });
    };
    const up = () => { drag.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  const addFiles = async (files: FileList | File[]) => {
    const additions = await Promise.all(Array.from(files).map(async (file) => ({ name: file.name, dataUrl: await fileToDataUrl(file) })));
    setAttachments((current) => [...current, ...additions]);
  };
  const onPaste = (event: React.ClipboardEvent) => {
    const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (images.length) { event.preventDefault(); void addFiles(images); }
  };
  const captureSnip = async () => {
    setStatus("Choose the area you want to attach…");
    try {
      if (isTauri()) {
        const result = await invoke<{ screenshots: BugAttachment[] }>("capture_bug_windows");
        setAttachments((current) => [...current, ...result.screenshots]);
        setStatus(result.screenshots.length ? `${result.screenshots.length} application window${result.screenshots.length === 1 ? "" : "s"} attached.` : "No visible application windows found.");
        return;
      } else {
        setStatus("Application rendering is available in the desktop app. Use Add files or paste an image here.");
        return;
        /*
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const video = document.createElement("video");
        video.srcObject = stream;
        await video.play();
        setStatus("Share selected. Waiting for the picker to close…");
        await new Promise((resolve) => window.setTimeout(resolve, 850));
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        stream.getTracks().forEach((track) => track.stop());
        setAttachments((current) => [...current, { name: `screen-capture-${Date.now()}.png`, dataUrl: canvas.toDataURL("image/png") }]); */
      }
      setStatus("Screenshot attached.");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setStatus(name === "NotAllowedError" || name === "AbortError"
        ? "Screen capture was cancelled. You can also use Add files."
        : "Screen capture could not start. Use Add files to attach a screenshot.");
    }
  };
  const submit = async () => {
    if (!summary.trim()) { setStatus("Add a brief description first."); return; }
    setSaving(true);
    setStatus("Building report package…");
    try {
      const payload = {
        summary, details, fixTips, stepsToReproduce, expectedResult, actualResult, frequency, impact, enteredBy,
        tags,
        attachments,
        appState: {
          activeView: view,
          revision: state.revision,
          publishedAt: state.publishedAt,
          donors: state.donors.length,
          screens: Object.values(state.screens).map(({ id, label, status, lastHeartbeat }) => ({ id, label, status, lastHeartbeat })),
          announcementActive: state.announcement.active,
          liveActive: state.live.active,
          scheduleCount: state.schedules.length,
          localStorageBytes: JSON.stringify(localStorage).length,
          location: window.location.href,
          theme: state.recognitionSettings.appearance,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          screen: `${window.screen.width}x${window.screen.height}`,
          devicePixelRatio: window.devicePixelRatio,
          userAgent: navigator.userAgent,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          online: navigator.onLine,
          network: (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection ?? null
        },
        recentEvents: getRecentClientEvents()
      };
      let reportPath: string;
      if (isTauri()) {
        reportPath = await invoke<string>("save_bug_report", { report: payload });
      } else {
        const bugs = readWebBugs();
        const now = new Date().toISOString();
        const highestBugNumber = bugs.reduce((highest, bug) => Math.max(highest, Number(bug.bugId.match(/\d+/)?.[0] ?? 0)), 0);
        const bugId = `BUG-${String(highestBugNumber + 1).padStart(5, "0")}`;
        const record: BugRecord = { bugId, summary, details, fixTips, enteredBy, stepsToReproduce, expectedResult, actualResult, frequency, impact, diagnostics: payload.appState, tags: payload.tags, status: "open", createdAt: now, updatedAt: now, attachments: attachments.map((item) => item.name), evidence: attachments, agentWork: [], folder: `.lantern/bugs/${bugId}` };
        bugs.unshift(record);
        writeWebBugs(bugs);
        if (BUG_API_ENDPOINT) {
          try {
            await writeBridgeBug(record);
            reportPath = `${bugId} in the shared bug catalogue`;
          } catch {
            reportPath = `${bugId} on this device. The shared bug service is unavailable; use Bugs > Export all to send the report`;
          }
        } else {
          reportPath = `${bugId} on this device. Use Bugs > Export all to send the report`;
        }
      }
      setStatus(`Saved to ${reportPath}`);
      window.setTimeout(() => { onClose(); onSaved(); }, 900);
    } catch (error) {
      setStatus(`Could not save: ${String(error)}`);
    } finally { setSaving(false); }
  };

  return createPortal(
    <section className="bug-report-panel" style={{ left: position.x, top: position.y }} onPaste={onPaste} role="dialog" aria-modal="false" aria-labelledby="bug-report-title">
      <header className="bug-report-dragbar" onPointerDown={(event) => { drag.current = { x: event.clientX, y: event.clientY, left: position.x, top: position.y }; }}>
        <span className="bug-report-icon"><Bug size={18} /></span>
        <div><strong id="bug-report-title">Report a bug</strong><small>{captureStatus || "Preparing evidence…"}</small></div>
        <button className="icon-button" onPointerDown={(event) => event.stopPropagation()} onClick={onClose} title="Close"><X size={17} /></button>
      </header>
      <div className="bug-report-body">
        <div className="bug-entered-by-note"><Users size={15} /><span>Entered by <strong>{enteredBy}</strong></span></div>
        <label className="field"><span>Summary <b>*</b> <InfoDot text="Give this bug, piece of feedback, or idea a short, recognizable title. Say what you noticed or what you would like to improve." /></span><input autoFocus value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What should we know or improve?" /></label>
        <label className="field"><span>Details <InfoDot text="Use this as an information dump. Include anything that may help: context, examples, what you were trying to do, what you noticed, why it matters, relevant people or displays, possible causes, and ideas for improvement. Do not worry about organizing it perfectly." /></span><textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Share everything you can think of about the bug, feedback, or idea…" /></label>
        <label className="field"><span>Steps to reproduce <InfoDot text="List the exact clicks or actions that make the problem happen. Numbered steps are easiest to follow." /></span><textarea value={stepsToReproduce} onChange={(event) => setStepsToReproduce(event.target.value)} placeholder={"1. Open…\n2. Select…\n3. Click…"} /></label>
        <div className="two-col">
          <label className="field"><span>Expected result</span><textarea value={expectedResult} onChange={(event) => setExpectedResult(event.target.value)} placeholder="What should have happened?" /></label>
          <label className="field"><span>Actual result</span><textarea value={actualResult} onChange={(event) => setActualResult(event.target.value)} placeholder="What happened instead?" /></label>
        </div>
        <div className="two-col">
          <label className="field"><span>How often</span><select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="every-time">Every time</option><option value="often">Often</option><option value="sometimes">Sometimes</option><option value="once">Only once</option></select></label>
          <label className="field"><span>Impact</span><select value={impact} onChange={(event) => setImpact(event.target.value)}><option value="low">Minor inconvenience</option><option value="medium">Work is slowed down</option><option value="high">Cannot complete the task</option><option value="critical">Live display or data is at risk</option></select></label>
        </div>
        <label className="field"><span>Tips on how to fix <InfoDot text="Optional: share anything that may help investigate, such as when the problem started, a possible cause, or a workaround you found. It is completely fine to leave this blank." /></span><textarea value={fixTips} onChange={(event) => setFixTips(event.target.value)} placeholder="Optional clues, suspected cause, or suggested solution" /></label>
        <BugTagInput
          tags={tags}
          available={[...state.recognitionSettings.tags, ...knownBugTags]}
          onChange={setTags}
        />
        <div className="bug-attachments-head"><div><strong>Attached evidence <InfoDot text="A screenshot, GIF, video, or small log file can show the exact problem. Please avoid including passwords, private donor information, or anything sensitive." /></strong><small>Render the app, paste an image, or add files.</small></div><div className="bug-evidence-actions"><button className="command-button secondary compact" title="Render every open application window" onClick={() => void captureSnip()}><Camera size={15} /> Screenshot</button><label className="command-button secondary compact"><ImagePlus size={15} /> Add files<input type="file" multiple accept="image/*,video/*,.mov,.mpeg,.mpg,.mp4,.webm,.txt,.log,.json,.zip" onChange={(event) => event.target.files && void addFiles(event.target.files)} /></label></div></div>
        <div className="bug-thumbnails">
          {attachments.map((attachment, index) => <figure key={`${attachment.name}-${index}`}><div>{attachment.dataUrl.startsWith("data:image/") ? <img src={attachment.dataUrl} alt="" /> : <span><Upload size={22} /></span>}<button className="bug-attachment-remove" onClick={() => setAttachments((current) => current.filter((_, item) => item !== index))} title="Remove attachment"><X size={13} /></button>{attachment.dataUrl.startsWith("data:image/") && <button className="bug-attachment-edit" onClick={() => setEditingAttachment(index)} title="Annotate image" aria-label={`Annotate ${attachment.name}`}><Pencil size={13} /></button>}</div><figcaption>{attachment.name}</figcaption></figure>)}
          {!attachments.length && <div className="bug-empty-attachments"><Camera size={22} /><span>Screenshots will appear here</span></div>}
        </div>
        <div className="bug-diagnostics-note"><Activity size={16} /><span>App state, version, active page, theme, board/display status, browser, viewport, screen scale, language, timezone, network state, recent client errors, and application logs are included automatically for Codex. <InfoDot text="This makes the report easier to paste into Codex and reproduce. You do not need to collect it yourself." /></span></div>
      </div>
      <footer className="bug-report-footer"><span>{status}</span><div><button className="command-button secondary" onClick={onClose}>Cancel</button><button className="command-button primary" disabled={saving} onClick={() => void submit()}><Send size={16} /> {saving ? "Saving…" : "Save report"}</button></div></footer>
      {editingAttachment !== null && attachments[editingAttachment] && <ImageAnnotationEditor attachment={attachments[editingAttachment]} onClose={() => setEditingAttachment(null)} onSave={(dataUrl) => { setAttachments((current) => current.map((item, index) => index === editingAttachment ? { ...item, dataUrl } : item)); setEditingAttachment(null); setStatus("Annotation saved to the attachment."); }} />}
    </section>,
    document.body
  );
}

type AnnotationTool = "pen" | "rectangle" | "arrow" | "eraser";

function ImageAnnotationEditor({ attachment, onClose, onSave }: { attachment: BugAttachment; onClose: () => void; onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const drawingRef = useRef<{ x: number; y: number; snapshot?: ImageData } | null>(null);
  const [tool, setTool] = useState<AnnotationTool>("pen");
  const [color, setColor] = useState("#ff3b5c");
  const [thickness, setThickness] = useState(6);
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState({ x: Math.max(8, (window.innerWidth - Math.min(900, window.innerWidth - 16)) / 2), y: Math.max(8, (window.innerHeight - Math.min(720, window.innerHeight - 16)) / 2) });

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      if (!canvasRef.current) return;
      canvasRef.current.width = image.naturalWidth;
      canvasRef.current.height = image.naturalHeight;
      setReady(true);
    };
    image.src = attachment.dataUrl;
  }, [attachment.dataUrl]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * event.currentTarget.width / bounds.width, y: (event.clientY - bounds.top) * event.currentTarget.height / bounds.height };
  };
  const configure = (context: CanvasRenderingContext2D) => {
    context.lineCap = "round"; context.lineJoin = "round"; context.lineWidth = thickness; context.strokeStyle = color;
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
  };
  const drawArrow = (context: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const head = Math.max(14, thickness * 3);
    context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y);
    context.moveTo(to.x, to.y); context.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
    context.moveTo(to.x, to.y); context.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6)); context.stroke();
  };
  const save = () => {
    const image = imageRef.current; const annotations = canvasRef.current;
    if (!image || !annotations) return;
    const output = document.createElement("canvas"); output.width = annotations.width; output.height = annotations.height;
    const context = output.getContext("2d"); if (!context) return;
    context.drawImage(image, 0, 0, output.width, output.height); context.drawImage(annotations, 0, 0);
    onSave(output.toDataURL("image/png"));
  };

  return createPortal(<div className="annotation-editor" style={{ left: position.x, top: position.y }} role="dialog" aria-modal="true" aria-label={`Annotate ${attachment.name}`}>
    <header onPointerDown={(event) => { if ((event.target as Element).closest("button, input")) return; dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, ...position }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const drag = dragRef.current; if (!drag) return; setPosition({ x: Math.max(8, Math.min(window.innerWidth - 280, drag.x + event.clientX - drag.pointerX)), y: Math.max(8, Math.min(window.innerHeight - 70, drag.y + event.clientY - drag.pointerY)) }); }} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
      <div><strong>Annotate screenshot</strong><small>{attachment.name} · drag this bar to move</small></div><button className="icon-button" onClick={onClose} title="Close annotation editor"><X size={17} /></button>
    </header>
    <div className="annotation-toolbar" role="toolbar" aria-label="Annotation tools">
      <button className={tool === "pen" ? "active" : ""} onClick={() => setTool("pen")}><Paintbrush size={16} /><span>Pen</span></button>
      <button className={tool === "rectangle" ? "active" : ""} onClick={() => setTool("rectangle")}><Square size={16} /><span>Box</span></button>
      <button className={tool === "arrow" ? "active" : ""} onClick={() => setTool("arrow")}><ArrowUpRight size={16} /><span>Arrow</span></button>
      <button className={tool === "eraser" ? "active" : ""} onClick={() => setTool("eraser")}><Eraser size={16} /><span>Eraser</span></button>
      <label title="Annotation color"><span>Color</span><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
      <label className="annotation-thickness"><span>Thickness</span><input type="range" min="2" max="30" value={thickness} onChange={(event) => setThickness(Number(event.target.value))} /><b>{thickness}px</b></label>
      <button className="annotation-clear" onClick={() => { const canvas = canvasRef.current; if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); }}><RotateCcw size={15} /><span>Clear</span></button>
    </div>
    <div className="annotation-stage"><div className="annotation-canvas-wrap"><img src={attachment.dataUrl} alt="" draggable={false} /><canvas ref={canvasRef} className={ready ? "" : "loading"}
      onPointerDown={(event) => { const context = event.currentTarget.getContext("2d"); if (!context) return; const start = point(event); configure(context); drawingRef.current = { ...start, snapshot: tool === "rectangle" || tool === "arrow" ? context.getImageData(0, 0, event.currentTarget.width, event.currentTarget.height) : undefined }; if (tool === "pen" || tool === "eraser") { context.beginPath(); context.moveTo(start.x, start.y); } event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { const drawing = drawingRef.current; const context = event.currentTarget.getContext("2d"); if (!drawing || !context) return; const current = point(event); configure(context); if (tool === "pen" || tool === "eraser") { context.lineTo(current.x, current.y); context.stroke(); } else if (drawing.snapshot) { context.putImageData(drawing.snapshot, 0, 0); configure(context); if (tool === "rectangle") context.strokeRect(drawing.x, drawing.y, current.x - drawing.x, current.y - drawing.y); else drawArrow(context, drawing, current); } }}
      onPointerUp={(event) => { drawingRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drawingRef.current = null; }}
    /></div></div>
    <footer><span>Draw directly on the image. The attachment changes only when you save.</span><div><button className="command-button secondary" onClick={onClose}>Cancel</button><button className="command-button primary" onClick={save} disabled={!ready}><Save size={16} /> Save annotation</button></div></footer>
  </div>, document.body);
}

function BugTagInput({ tags, available, onChange }: { tags: string[]; available: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalizedTags = tags.map((tag) => tag.toLocaleLowerCase());
  const suggestions = Array.from(new Set(available.map((tag) => tag.trim()).filter(Boolean)))
    .filter((tag) => !normalizedTags.includes(tag.toLocaleLowerCase()))
    .filter((tag) => !draft.trim() || tag.toLocaleLowerCase().includes(draft.trim().toLocaleLowerCase()))
    .slice(0, 6);
  const addTag = (value: string) => {
    const clean = value.trim().replace(/^,+|,+$/g, "");
    if (clean && !normalizedTags.includes(clean.toLocaleLowerCase())) onChange([...tags, clean]);
    setDraft("");
  };
  const handleChange = (value: string) => {
    if (!value.includes(",")) { setDraft(value); return; }
    const pieces = value.split(",");
    const completed = pieces.slice(0, -1).map((tag) => tag.trim()).filter(Boolean);
    const next = [...tags];
    completed.forEach((tag) => {
      if (!next.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) next.push(tag);
    });
    onChange(next);
    setDraft(pieces[pieces.length - 1] ?? "");
  };
  return <div className="field bug-tags-field">
    <span>Tags <InfoDot text="Use short labels that will help someone find similar reports, such as display, schedule, or crash. Type a comma after each tag to turn it into a label." /></span>
    <div className={`bug-tag-composer${focused ? " focused" : ""}`} onClick={() => inputRef.current?.focus()}>
      {tags.map((tag) => <button type="button" className="bug-tag-pill" key={tag} onClick={(event) => { event.stopPropagation(); onChange(tags.filter((item) => item !== tag)); }} title={`Remove ${tag}`}>{tag}<X size={12} /></button>)}
      <input
        ref={inputRef}
        value={draft}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === "Tab") && draft.trim()) { event.preventDefault(); addTag(draft); }
          if (event.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        placeholder={tags.length ? "Add another…" : "Type a tag, then a comma"}
        aria-label="Bug tags"
        aria-autocomplete="list"
        aria-expanded={focused && suggestions.length > 0}
      />
    </div>
    {focused && suggestions.length > 0 && <div className="bug-tag-suggestions" role="listbox" aria-label="Tag suggestions">
      <small>Are you thinking of…</small>
      {suggestions.map((tag) => <button type="button" role="option" key={tag} onMouseDown={(event) => event.preventDefault()} onClick={() => addTag(tag)}>{tag}</button>)}
    </div>}
    <small className="bug-tag-help">Separate tags with commas. Click a tag to remove it.</small>
  </div>;
}

function EvidenceViewer({ bugId, evidence, onClose }: { bugId: string; evidence: BugEvidence; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [gifPlaying, setGifPlaying] = useState(true);
  const [frozenFrame, setFrozenFrame] = useState("");
  const [replay, setReplay] = useState(0);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileName = evidence.path?.split(/[\\/]/).pop() ?? evidence.name;
  const evidenceBase = !BUG_API_ENDPOINT || BUG_API_ENDPOINT === "/__lantern/bugs" ? "/__lantern/evidence" : `${BUG_API_ENDPOINT}/evidence`;
  const source = evidence.dataUrl ?? `${evidenceBase}/${encodeURIComponent(bugId)}/${encodeURIComponent(fileName)}${replay ? `?replay=${replay}` : ""}`;
  const mime = evidence.mimeType ?? "";
  const isVideo = mime.startsWith("video/") || /\.(mov|mp4|mpeg|mpg|webm)$/i.test(fileName);
  const isGif = mime === "image/gif" || /\.gif$/i.test(fileName);
  const resetView = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };
  const pauseGif = () => {
    const image = imageRef.current;
    if (!image) return;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    setFrozenFrame(canvas.toDataURL("image/png"));
    setGifPlaying(false);
  };
  const playGif = () => { setGifPlaying(true); setFrozenFrame(""); setReplay(Date.now()); };
  return createPortal(<section className="evidence-viewer" role="dialog" aria-modal="true" aria-label={`Evidence ${fileName}`}>
    <header><div><strong>{fileName}</strong><small>{isVideo ? "Video evidence" : isGif ? "Animated GIF evidence" : "Image evidence"}</small></div><div className="evidence-viewer-controls"><button onClick={() => setZoom((value) => Math.max(.25, value - .25))} title="Zoom out">−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(6, value + .25))} title="Zoom in">+</button><button onClick={resetView}>Reset</button>{isGif && <button onClick={gifPlaying ? pauseGif : playGif}>{gifPlaying ? "Pause" : "Play"}</button>}<button onClick={onClose} title="Close"><X size={17} /></button></div></header>
    <div className="evidence-stage" onWheel={(event) => { event.preventDefault(); setZoom((value) => Math.max(.25, Math.min(6, value + (event.deltaY < 0 ? .15 : -.15)))); }} onPointerDown={(event) => { drag.current = { x: event.clientX, y: event.clientY, left: offset.x, top: offset.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (drag.current) setOffset({ x: drag.current.left + event.clientX - drag.current.x, y: drag.current.top + event.clientY - drag.current.y }); }} onPointerUp={() => { drag.current = null; }}>
      <div style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}>{isVideo ? <video src={source} controls autoPlay /> : <img ref={imageRef} src={isGif && !gifPlaying ? frozenFrame : source} alt={fileName} draggable={false} />}</div>
    </div>
    <footer>Scroll to zoom · drag to pan · use the media controls for playback</footer>
  </section>, document.body);
}

function BugsView({ onNewBug, launcherVisible, onLauncherVisibleChange }: { onNewBug: () => void; launcherVisible: boolean; onLauncherVisibleChange: (visible: boolean) => void }) {
  const defaultStatusFilters: BugStatus[] = ["open", "in-progress", "ready-for-test"];
  const initialActiveUser = currentBugUser();
  const readViewPreferences = (user: string) => {
    try {
      const all = JSON.parse(localStorage.getItem(BUG_VIEW_PREFS_KEY) ?? "{}") as Record<string, { statuses?: BugStatus[]; groupByStatus?: boolean; collapsed?: Partial<Record<BugStatus, boolean>>; enteredBy?: string }>;
      return all[user] ?? {};
    } catch {
      return {};
    }
  };
  const initialPreferences = readViewPreferences(initialActiveUser);
  const [bugs, setBugs] = useState<BugRecord[]>([]);
  const [selected, setSelected] = useState<BugRecord | null>(null);
  const [viewingEvidence, setViewingEvidence] = useState<BugEvidence | null>(null);
  const [listWidth, setListWidth] = useState(45);
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const splitDrag = useRef<{ startX: number; startWidth: number; containerWidth: number } | null>(null);
  const [sort, setSort] = useState<"newest" | "oldest" | "status">("newest");
  const [statusFilters, setStatusFilters] = useState<BugStatus[]>(initialPreferences.statuses ?? defaultStatusFilters);
  const [enteredByFilter, setEnteredByFilter] = useState(initialPreferences.enteredBy ?? "all");
  const [groupByStatus, setGroupByStatus] = useState(initialPreferences.groupByStatus ?? true);
  const [collapsedStatuses, setCollapsedStatuses] = useState<Partial<Record<BugStatus, boolean>>>(initialPreferences.collapsed ?? {});
  const [users, setUsers] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BUG_USERS_KEY) ?? "[]") as string[];
      return Array.from(new Set([...DEFAULT_BUG_USERS, initialActiveUser, ...saved.filter(Boolean)]));
    } catch {
      return Array.from(new Set([...DEFAULT_BUG_USERS, initialActiveUser]));
    }
  });
  const [activeUser, setActiveUser] = useState(initialActiveUser);
  const preferencesUserRef = useRef(initialActiveUser);
  const [commentTab, setCommentTab] = useState<"user" | "ai">("user");
  const [message, setMessage] = useState("");
  const [pendingBugDelete, setPendingBugDelete] = useState<BugRecord | null>(null);
  const [bugUserPromptOpen, setBugUserPromptOpen] = useState(false);
  const load = useCallback(async () => {
    if (isTauri()) {
      try { setBugs(await invoke<BugRecord[]>("list_bug_reports")); }
      catch (error) { setMessage(`Could not load bugs: ${String(error)}`); }
      return;
    }
    const local = readWebBugs();
    setBugs(local);
    const localReporters = local.map(bugEnteredBy).filter((user) => user !== UNATTRIBUTED_BUG_USER);
    const localRoster = Array.from(new Set([...readBugUsers(), ...localReporters]));
    if (localRoster.length !== readBugUsers().length) {
      localStorage.setItem(BUG_USERS_KEY, JSON.stringify(localRoster));
      setUsers((current) => Array.from(new Set([...current, ...localReporters])));
      notifyBugUsersUpdated(localReporters);
    }
    if (!BUG_API_ENDPOINT) {
      setMessage(local.length ? "Reports are saved on this device. Use Export all to share them." : "");
      return;
    }
    try {
      let shared = await readBridgeBugs();
      const sharedIds = new Set(shared.map((bug) => bug.bugId));
      for (const bug of local.filter((item) => !sharedIds.has(item.bugId))) await writeBridgeBug(bug);
      shared = await readBridgeBugs();
      writeWebBugs(shared);
      setBugs(shared);
      const reporters = shared.map(bugEnteredBy).filter((user) => user !== UNATTRIBUTED_BUG_USER);
      const roster = Array.from(new Set([...readBugUsers(), ...reporters]));
      if (roster.length !== readBugUsers().length) {
        localStorage.setItem(BUG_USERS_KEY, JSON.stringify(roster));
        setUsers((current) => Array.from(new Set([...current, ...reporters])));
        notifyBugUsersUpdated(reporters);
      }
      setMessage("");
    } catch {
      setMessage("Shared bug service unavailable. Reports on this device are still available and can be exported.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { localStorage.setItem(BUG_USERS_KEY, JSON.stringify(users)); }, [users]);
  useEffect(() => { localStorage.setItem(ACTIVE_BUG_USER_KEY, activeUser); }, [activeUser]);
  useEffect(() => {
    const preferences = readViewPreferences(activeUser);
    preferencesUserRef.current = activeUser;
    setStatusFilters(preferences.statuses ?? defaultStatusFilters);
    setEnteredByFilter(preferences.enteredBy ?? "all");
    setGroupByStatus(preferences.groupByStatus ?? true);
    setCollapsedStatuses(preferences.collapsed ?? {});
  }, [activeUser]);
  useEffect(() => {
    if (preferencesUserRef.current !== activeUser) return;
    try {
      const all = JSON.parse(localStorage.getItem(BUG_VIEW_PREFS_KEY) ?? "{}") as Record<string, unknown>;
      all[activeUser] = { statuses: statusFilters, enteredBy: enteredByFilter, groupByStatus, collapsed: collapsedStatuses };
      localStorage.setItem(BUG_VIEW_PREFS_KEY, JSON.stringify(all));
    } catch { /* Preferences are optional; the catalogue remains usable without storage. */ }
  }, [activeUser, statusFilters, enteredByFilter, groupByStatus, collapsedStatuses]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!splitDrag.current) return;
      const next = splitDrag.current.startWidth + ((event.clientX - splitDrag.current.startX) / splitDrag.current.containerWidth) * 100;
      setListWidth(Math.max(26, Math.min(68, next)));
    };
    const stop = () => {
      splitDrag.current = null;
      document.body.classList.remove("bugs-resizing");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, []);
  const reporterUsers = useMemo(() => Array.from(new Set([...DEFAULT_BUG_USERS, ...users, ...bugs.map(bugEnteredBy)])).sort((a, b) => {
    if (a === UNATTRIBUTED_BUG_USER) return 1;
    if (b === UNATTRIBUTED_BUG_USER) return -1;
    return a.localeCompare(b);
  }), [bugs, users]);
  const visible = useMemo(() => bugs.filter((bug) =>
    (!statusFilters.length || statusFilters.includes(bug.status))
    && (enteredByFilter === "all" || bugEnteredBy(bug) === enteredByFilter)
  ).sort((a, b) => {
    if (sort === "status") return a.status.localeCompare(b.status);
    return sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt);
  }), [bugs, statusFilters, enteredByFilter, sort]);
  const toggleStatusFilter = (status: BugStatus) => {
    setStatusFilters((current) => current.includes(status) ? current.filter((value) => value !== status) : [...current, status]);
  };
  const statusOrder: BugStatus[] = ["open", "in-progress", "ready-for-test", "verified", "closed"];
  const statusLabel = (status: BugStatus) => status.replace(/-/g, " ");
  const renderBugRow = (bug: BugRecord) => <div className={selected?.bugId === bug.bugId ? "bug-row active" : "bug-row"} key={bug.bugId}><button type="button" className="bug-row-main" onClick={() => setSelected({ ...bug })}><span className={`bug-status-dot ${bug.status}`} /><span><small>{displayBugId(bug.bugId)} · Entered by {bugEnteredBy(bug)}</small><strong>{bug.summary}</strong><em>{bug.tags.join(" · ") || "No tags"} · {bug.attachments.length} attachment{bug.attachments.length === 1 ? "" : "s"}</em></span></button><select className={`bug-row-status ${bug.status}`} aria-label={`Status for ${displayBugId(bug.bugId)}`} value={bug.status} onChange={(event) => void save({ ...bug, status: event.target.value as BugStatus })}><option value="open">Open</option><option value="in-progress">In progress</option><option value="ready-for-test">Ready for test</option><option value="verified">Verified</option><option value="closed">Closed</option></select><ChevronRight size={17} /></div>;
  const save = async (bug: BugRecord) => {
    const next = { ...bug, updatedAt: new Date().toISOString() };
    try {
      if (isTauri()) await invoke<BugRecord>("update_bug_report", { bug: next });
      else {
        writeWebBugs(bugs.map((item) => item.bugId === next.bugId ? next : item));
        if (BUG_API_ENDPOINT) await writeBridgeBug(next);
      }
      setSelected(next); setMessage(`${next.bugId} updated`); await load();
    } catch (error) { setMessage(`Could not update bug: ${String(error)}`); }
  };
  const deleteBug = async (bug: BugRecord) => {
    try {
      if (isTauri()) await invoke("delete_bug_report", { bugId: bug.bugId });
      else {
        if (BUG_API_ENDPOINT) await deleteBridgeBug(bug.bugId);
        const remaining = bugs.filter((item) => item.bugId !== bug.bugId);
        writeWebBugs(remaining);
        setBugs(remaining);
      }
      setSelected(null);
      setViewingEvidence(null);
      setMessage(`${bug.bugId} deleted`);
      await load();
    } catch (error) {
      setMessage(`Could not delete bug: ${String(error)}`);
    }
  };
  const exportAll = async () => {
    try {
      if (isTauri()) {
        const path = await invoke<string>("export_bug_reports");
        setMessage(`Codex-ready archive saved to ${path}`);
      } else {
        const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), bugs }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob); const link = document.createElement("a");
        link.href = url; link.download = `project-lantern-bugs-${new Date().toISOString().slice(0, 10)}.json`; link.click();
        URL.revokeObjectURL(url); setMessage("Bug catalogue downloaded.");
      }
    } catch (error) { setMessage(`Could not export bugs: ${String(error)}`); }
  };
  const exportBugToCodex = async (bug: BugRecord) => {
    const evidence = (bug.evidence?.length ? bug.evidence.map((item) => item.path ?? item.name) : bug.attachments).map((item) => `- ${item}`).join("\n") || "- None attached";
    const work = (bug.agentWork ?? []).map((entry) => `- ${entry.at} — ${entry.author} (${entry.kind}): ${entry.note}`).join("\n") || "- No discussion or work recorded";
    const diagnosticJson = JSON.stringify(bug.diagnostics ?? {}, null, 2);
    const report = `# Project Lantern bug for Codex

Bug ID: ${bug.bugId}
Status: ${statusLabel(bug.status)}
Entered by: ${bugEnteredBy(bug)}
Created: ${bug.createdAt}
Updated: ${bug.updatedAt}
Tags: ${bug.tags.join(", ") || "None"}

## Summary
${bug.summary}

## Details
${bug.details || "Not provided"}

## Steps to reproduce
${bug.stepsToReproduce || "Not provided"}

## Expected result
${bug.expectedResult || "Not provided"}

## Actual result
${bug.actualResult || "Not provided"}

## Frequency and impact
- Frequency: ${bug.frequency || "Not provided"}
- Impact: ${bug.impact || "Not provided"}

## Fix / test notes
${bug.fixTips || "Not provided"}

## Evidence
${evidence}

## Discussion and prior work
${work}

## Diagnostics
\`\`\`json
${diagnosticJson}
\`\`\`

Please inspect the Project Lantern workspace, reproduce this issue, implement the fix, verify it, and update ${bug.bugId} with analysis, change, and test entries.`;
    try {
      await navigator.clipboard.writeText(report);
      setMessage(`${bug.bugId} copied. Paste it into Codex to begin.`);
    } catch {
      const blob = new Blob([report], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${bug.bugId.toLowerCase()}-for-codex.md`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`Clipboard access was unavailable, so ${bug.bugId} was downloaded for Codex.`);
    }
  };
  const counts = { open: bugs.filter((bug) => bug.status === "open").length, testing: bugs.filter((bug) => bug.status === "ready-for-test").length, closed: bugs.filter((bug) => bug.status === "closed" || bug.status === "verified").length };
  const addUser = (name: string) => {
    const normalized = name.trim();
    if (!normalized) return;
    setUsers((current) => current.some((user) => user.toLowerCase() === normalized.toLowerCase()) ? current : [...current, normalized]);
    setActiveUser(normalized);
    setBugUserPromptOpen(false);
  };
  const addComment = () => {
    if (!selected || !comment.trim()) return;
    const parent = replyTo === null ? undefined : selected.agentWork?.[replyTo];
    setSelected({ ...selected, agentWork: [...(selected.agentWork ?? []), { at: new Date().toISOString(), author: activeUser, kind: "handoff", note: comment.trim(), replyTo: parent?.at }] });
    setComment("");
    setReplyTo(null);
    setCommentTab("user");
  };
  const isAiComment = (entry: AgentWorkEntry) => entry.kind !== "handoff" || /^(codex|ai|agent)\b/i.test(entry.author);
  const discussionEntries = (selected?.agentWork ?? [])
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => commentTab === "ai" ? isAiComment(entry) : !isAiComment(entry));
  return <section className="bugs-page">
    <div className="bugs-toolbar">
      <div><h2>Bug catalogue</h2><p>Track reports from discovery through verification.</p></div>
      <div><label className="bug-launcher-toggle"><input type="checkbox" checked={launcherVisible} onChange={(event) => onLauncherVisibleChange(event.target.checked)} /><Bug size={14} /><span>Show bug button</span></label><label className="bug-user-picker"><Users size={15} /><span>User</span><select aria-label="Current user" value={activeUser} onChange={(event) => { if (event.target.value === "__new__") setBugUserPromptOpen(true); else setActiveUser(event.target.value); }}>{users.map((user) => <option key={user} value={user}>{user}</option>)}<option value="__new__">+ Add new user…</option></select></label><button className="command-button secondary" onClick={() => void exportAll()}><Download size={16} /> Export all</button><button className="command-button primary" onClick={onNewBug}><Plus size={16} /> Report bug</button></div>
    </div>
    <div className="bug-metrics"><article><Bug /><span><b>{counts.open}</b>Open</span></article><article><BadgeCheck /><span><b>{counts.testing}</b>Ready for test</span></article><article><CheckCircle2 /><span><b>{counts.closed}</b>Verified / closed</span></article></div>
    <div className="bugs-controls"><div className="bug-filter-pills" aria-label="Filter bugs by status">{statusOrder.map((value) => <button className={statusFilters.includes(value) ? "active" : ""} aria-pressed={statusFilters.includes(value)} key={value} onClick={() => toggleStatusFilter(value)}>{statusLabel(value)}</button>)}<button className={!statusFilters.length ? "active" : ""} aria-pressed={!statusFilters.length} onClick={() => setStatusFilters([])}>All</button></div><div className="bugs-view-options"><label className="bug-entered-by-filter"><Users size={14} /><span>Entered by</span><select aria-label="Filter bugs by entered by" value={enteredByFilter} onChange={(event) => setEnteredByFilter(event.target.value)}><option value="all">All users</option>{reporterUsers.map((user) => <option key={user} value={user}>{user}</option>)}</select></label><label className="bug-group-toggle"><input type="checkbox" checked={groupByStatus} onChange={(event) => setGroupByStatus(event.target.checked)} /><span>Separate by status</span></label><label>Sort <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="status">Status</option></select></label></div></div>
    <div className="bugs-layout" style={{ gridTemplateColumns: `${listWidth}fr 8px ${100 - listWidth}fr` }}>
      <div className="bug-list">{groupByStatus ? statusOrder.filter((status) => !statusFilters.length || statusFilters.includes(status)).map((status) => {
        const group = visible.filter((bug) => bug.status === status);
        if (!group.length) return null;
        const collapsed = collapsedStatuses[status] ?? false;
        return <section className={`bug-status-group ${collapsed ? "collapsed" : ""}`} key={status}><button type="button" className="bug-status-group-heading" aria-expanded={!collapsed} onClick={() => setCollapsedStatuses((current) => ({ ...current, [status]: !collapsed }))}><ChevronDown size={15} /><span>{statusLabel(status)}</span><b>{group.length}</b></button>{!collapsed && <div className="bug-status-group-items">{group.map(renderBugRow)}</div>}</section>;
      }) : visible.map(renderBugRow)}{!visible.length && <div className="bugs-empty"><Bug size={28} /><strong>No bugs here</strong><span>New reports will appear in this catalogue.</span></div>}</div>
      <div className="bugs-splitter" role="separator" aria-label="Resize bug list and selected bug" onPointerDown={(event) => {
        const container = event.currentTarget.parentElement;
        if (!container) return;
        splitDrag.current = { startX: event.clientX, startWidth: listWidth, containerWidth: container.getBoundingClientRect().width };
        document.body.classList.add("bugs-resizing");
        event.preventDefault();
      }}><GripVertical size={15} /></div>
      <aside className="bug-detail">{selected ? <>
        <div className="bug-detail-scroll">
          <div className="bug-detail-head"><span>Selected bug · {displayBugId(selected.bugId)}</span><button className="icon-button" onClick={() => setSelected(null)}><X size={16} /></button></div>
          <label className="field"><span>Entered by</span><select value={bugEnteredBy(selected)} onChange={(event) => setSelected({ ...selected, enteredBy: event.target.value })}>{reporterUsers.map((user) => <option key={user} value={user}>{user}</option>)}</select></label>
          <label className="field"><span>Summary</span><input value={selected.summary} onChange={(e) => setSelected({ ...selected, summary: e.target.value })} /></label>
          <label className="field"><span>Details</span><textarea value={selected.details} onChange={(e) => setSelected({ ...selected, details: e.target.value })} /></label>
          <label className="field"><span>Fix / test notes</span><textarea value={selected.fixTips} onChange={(e) => setSelected({ ...selected, fixTips: e.target.value })} /></label>
          <div className="bug-detail-evidence"><strong>Evidence</strong><div>{selected.evidence?.map((item, i) => {
            const imageSource = bugEvidenceImageSource(selected.bugId, item);
            return <button type="button" key={i} className={imageSource ? "evidence-thumbnail" : ""} onClick={() => setViewingEvidence(item)}>{imageSource ? <><img src={imageSource} alt="" /><span>{item.name}</span></> : <><ImageIcon size={15} /><span>{item.path ?? item.name}</span></>}</button>;
          })}{!selected.evidence?.length && selected.attachments.map((name) => <span key={name}><ImageIcon size={15} />{name}</span>)}</div></div>
          <div className="agent-work-log">
            <div className="bug-comment-tabs" role="tablist" aria-label="Bug discussion"><button type="button" role="tab" aria-selected={commentTab === "user"} className={commentTab === "user" ? "active" : ""} onClick={() => { setCommentTab("user"); setReplyTo(null); }}>User comments</button><button type="button" role="tab" aria-selected={commentTab === "ai"} className={commentTab === "ai" ? "active" : ""} onClick={() => { setCommentTab("ai"); setReplyTo(null); }}>AI comments</button></div>
            {discussionEntries.length ? discussionEntries.map(({ entry, index }) => {
              const isReply = Boolean(entry.replyTo) || /^Reply to [^:]+:\s*/i.test(entry.note);
              const note = entry.note.replace(/^Reply to [^:]+:\s*/i, "");
              return <article key={`${entry.at}-${index}`} className={`${replyTo === index ? "replying " : ""}${isReply ? "thread-reply" : ""}`.trim()}><header><b>{isReply ? "reply" : commentTab === "user" ? "comment" : entry.kind}</b><span>{entry.author === "You" ? "Felix" : entry.author} · {new Date(entry.at).toLocaleString()}</span></header><p>{note}</p><button type="button" className="work-log-reply" onClick={() => { setReplyTo(index); if (commentTab === "ai") setCommentTab("user"); }}><MessageSquare size={12} /> Reply</button></article>;
            }) : <small>No {commentTab === "user" ? "user comments" : "AI comments"} yet.</small>}
            {commentTab === "user" && <div className="bug-comment-composer">{replyTo !== null && <div className="reply-context">Replying to {selected.agentWork?.[replyTo]?.author}<button onClick={() => setReplyTo(null)}><X size={12} /></button></div>}<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={replyTo === null ? `Comment as ${activeUser}…` : `Reply as ${activeUser}…`} /><button type="button" className="command-button secondary compact" disabled={!comment.trim()} onClick={addComment}><Send size={14} /> {replyTo === null ? "Add comment" : "Reply"}</button></div>}
          </div>
        </div>
        <footer className="bug-detail-actions"><button className="command-button danger" onClick={() => setPendingBugDelete(selected)}><Trash2 size={16} /> Delete bug</button><button className="command-button secondary" onClick={() => void exportBugToCodex(selected)}><ClipboardCopy size={16} /> Export to Codex</button><button className="command-button primary" onClick={() => void save(selected)}><Save size={16} /> Save changes</button></footer>
      </> : <div className="bugs-empty"><Pencil size={26} /><strong>Select a bug</strong><span>Open it here to edit details or move it to Ready for test.</span></div>}</aside>
    </div>
    {message && <div className="bugs-message">{message}</div>}
    {selected && viewingEvidence && <EvidenceViewer bugId={selected.bugId} evidence={viewingEvidence} onClose={() => setViewingEvidence(null)} />}
    {pendingBugDelete && <LanternConfirmDialog eyebrow="Permanent deletion" title={`Delete ${displayBugId(pendingBugDelete.bugId)} permanently?`} description={<><p><strong>{pendingBugDelete.summary}</strong></p><p>This removes the report and its attachments for every tester. This action cannot be undone.</p></>} confirmLabel="Delete bug" onCancel={() => setPendingBugDelete(null)} onConfirm={() => { const bug = pendingBugDelete; setPendingBugDelete(null); void deleteBug(bug); }} />}
    {bugUserPromptOpen && <LanternTextPromptDialog eyebrow="Bug catalogue user" title="Add a user" description="This name is saved locally and identifies who entered or updated bug reports." label="User name" placeholder="Name" submitLabel="Add user" onCancel={() => setBugUserPromptOpen(false)} onSubmit={addUser} />}
  </section>;
}

const clientEvents: string[] = [];
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => clientEvents.push(`${new Date().toISOString()} ERROR ${event.message} @ ${event.filename}:${event.lineno}`));
  window.addEventListener("unhandledrejection", (event) => clientEvents.push(`${new Date().toISOString()} REJECTION ${String(event.reason)}`));
}
function getRecentClientEvents() { return clientEvents.slice(-100); }
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
}

const helpSlides = [
  {
    kicker: "Welcome",
    title: "Meet the Museum Donor Board Control Center",
    copy: "Project Lantern brings donor records, board design, display previews, scheduling, announcements, broadcasts, and feedback into one staff-friendly workspace.",
    points: ["Prepare and preview safely", "Control portrait and landscape displays", "Publish only when you are ready"],
    accent: "01",
    image: `${import.meta.env.BASE_URL}assets/help/dashboard.png`,
    imageAlt: "Museum Donor Board Control Center dashboard with two display previews",
    callout: "Start from the Dashboard"
  },
  {
    kicker: "Dashboard",
    title: "Monitor and open every display",
    copy: "Each display card shows its assigned board, orientation, connection state, schedule, live preview, and room-camera tools. Open displays when the exhibit screens are ready.",
    points: ["Check attached and live status", "Preview boards in 2D or 3D", "Add displays, schedules, or room cameras"],
    accent: "02",
    image: `${import.meta.env.BASE_URL}assets/help/dashboard.png`,
    imageAlt: "Dashboard with portrait and landscape display management cards",
    callout: "One card per physical display"
  },
  {
    kicker: "Donors",
    title: "Build the recognition roster",
    copy: "Create donor profiles with names, tiers, categories, tags, giving details, stories, icons, and presentation treatments. Donors are assigned to boards, so one profile can be reused consistently.",
    points: ["Search, filter, group, and reorder", "Assign each donor to the right boards", "Use Active to control recognition visibility"],
    accent: "03",
    image: `${import.meta.env.BASE_URL}assets/help/donors.png`,
    imageAlt: "Donors workspace with searchable donor profiles and board assignments",
    callout: "Manage people once"
  },
  {
    kicker: "Board Editor",
    title: "Design reusable recognition boards",
    copy: "Create portrait or landscape board programs, choose the donor roster, edit text directly, and tune layout, typography, colors, backgrounds, logos, cameras, and 2D or 3D presentation.",
    points: ["Choose or add a board program", "Edit against the live preview", "Assign the finished board to displays or schedules"],
    accent: "04",
    image: `${import.meta.env.BASE_URL}assets/help/board-editor.png`,
    imageAlt: "Board Editor with board controls and a live museum recognition preview",
    callout: "Boards are reusable designs"
  },
  {
    kicker: "Schedule",
    title: "Plan boards, messages, Blips, and broadcasts",
    copy: "Use week, month, or agenda views to place content on specific displays. Color, icon, label, and border treatment distinguish each content type; only overlapping items of the same type are conflicts.",
    points: ["Add a Board, Announcement, Blip, or Broadcast", "Set display, date, time, duration, and recurrence", "Resolve same-type conflicts before showtime"],
    accent: "05",
    image: `${import.meta.env.BASE_URL}assets/help/schedule.png`,
    imageAlt: "Schedule calendar containing boards, announcements, and broadcast entries",
    callout: "Plan every display by time"
  },
  {
    kicker: "Announcements",
    title: "Overlay timely messages",
    copy: "Compose a headline, supporting message, details, colors, sounds, enhancements, target displays, layout, duration, and optional schedule. Announcements can run over a board without replacing it.",
    points: ["Save reusable announcements", "Preview on the selected display", "Send now or choose a date"],
    accent: "06",
    image: `${import.meta.env.BASE_URL}assets/help/announcements.png`,
    imageAlt: "Announcement composer with delivery controls and live display preview",
    callout: "Messages layer over boards"
  },
  {
    kicker: "Broadcast / Stream",
    title: "Compose camera and screen broadcasts",
    copy: "Choose a camera, screen share, or test feed; move the title and lower third directly; crop and position video; style the panel, frame, and canvas; then add background removal or face effects.",
    points: ["Source connects the feed", "Frame & crop shapes the composition", "Effects and recording finish the production"],
    accent: "07",
    image: `${import.meta.env.BASE_URL}assets/help/broadcast.png`,
    imageAlt: "Broadcast and Stream studio with camera composition and inspector controls",
    callout: "Preview before going on air"
  },
  {
    kicker: "Settings",
    title: "Choose the portal theme and vocabulary",
    copy: "Switch among Dark, Light, Ocean, Warm, High contrast, and Sparkle Unicorn themes. Maintain the recognition tiers, donor categories, and tags used throughout the control center.",
    points: ["Themes affect the control portal only", "Board designs keep their saved colors", "Vocabulary changes flow into donor forms and filters"],
    accent: "08",
    image: `${import.meta.env.BASE_URL}assets/help/settings.png`,
    imageAlt: "Settings workspace with portal theme and donor vocabulary controls",
    callout: "Personalize the staff workspace"
  },
  {
    kicker: "Bugs & feedback",
    title: "Capture actionable reports",
    copy: "Report a bug from any page with a description, reproduction details, expected result, frequency, severity, tags, and annotated evidence. Technical context is attached automatically for a Codex-ready handoff.",
    points: ["Capture, paste, annotate, or attach evidence", "Track status, type, comments, and testing progress", "Group and filter the catalogue to focus the work"],
    accent: "09",
    image: `${import.meta.env.BASE_URL}assets/help/bugs.png`,
    imageAlt: "Bug catalogue with status filters and report details",
    callout: "Turn feedback into fixes"
  }
];

function HelpCenterModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"slides" | "guide">("slides");
  const [slide, setSlide] = useState(0);
  const current = helpSlides[slide];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (mode === "slides" && event.key === "ArrowRight") setSlide((value) => Math.min(helpSlides.length - 1, value + 1));
      if (mode === "slides" && event.key === "ArrowLeft") setSlide((value) => Math.max(0, value - 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, onClose]);

  return createPortal(
    <div className="help-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-modal-title">
        <header className="help-modal-header">
          <div>
            <p className="eyebrow">Museum Donor Board learning center</p>
            <h2 id="help-modal-title">How to use the Control Center</h2>
          </div>
          <div className="help-modal-header-actions">
            <div className="help-mode-switch" role="tablist" aria-label="Help format">
              <button role="tab" aria-selected={mode === "slides"} className={mode === "slides" ? "active" : ""} onClick={() => setMode("slides")}><Play size={14} /> Presentation</button>
              <button role="tab" aria-selected={mode === "guide"} className={mode === "guide" ? "active" : ""} onClick={() => setMode("guide")}><BookOpen size={14} /> Quick guide</button>
            </div>
            <button className="icon-button" onClick={onClose} title="Close help"><X size={18} /></button>
          </div>
        </header>

        {mode === "slides" ? (
          <div className="help-presentation">
            <div className="help-slide" key={current.accent}>
              <div className="help-slide-number" aria-hidden="true">{current.accent}</div>
              <div className="help-slide-copy">
                <p className="help-kicker">{current.kicker}</p>
                <h3>{current.title}</h3>
                <p>{current.copy}</p>
                <ul>{current.points.map((point) => <li key={point}><CheckCircle2 size={17} /> {point}</li>)}</ul>
              </div>
              <figure className="help-slide-visual">
                <div className="help-slide-browser">
                  <div className="help-slide-browser-bar" aria-hidden="true"><i /><i /><i /><span>Museum Donor Board Control Center</span></div>
                  <img src={current.image} alt={current.imageAlt} />
                </div>
                <figcaption><Sparkles size={14} /> {current.callout}</figcaption>
              </figure>
            </div>
            <footer className="help-slide-controls">
              <button className="command-button secondary" disabled={slide === 0} onClick={() => setSlide((value) => value - 1)}><ChevronLeft size={17} /> Previous</button>
              <div className="help-slide-progress" aria-label={`Slide ${slide + 1} of ${helpSlides.length}`}>
                {helpSlides.map((_, index) => <button key={index} className={index === slide ? "active" : ""} onClick={() => setSlide(index)} aria-label={`Go to slide ${index + 1}`} />)}
                <span>{slide + 1} / {helpSlides.length}</span>
              </div>
              <button className="command-button primary" onClick={() => slide === helpSlides.length - 1 ? onClose() : setSlide((value) => value + 1)}>
                {slide === helpSlides.length - 1 ? "Start using Lantern" : "Next"} {slide < helpSlides.length - 1 && <ChevronRight size={17} />}
              </button>
            </footer>
          </div>
        ) : (
          <div className="help-guide">
            <aside className="help-guide-intro">
              <span className="help-guide-icon"><BookOpen size={26} /></span>
              <h3>Quick-start guide</h3>
              <p>Follow the current workflow from donor records and board design through scheduling, live content, publishing, and feedback.</p>
              <small>Tip: the presentation tab gives you a guided walkthrough. You can return here at any time from the Dashboard.</small>
            </aside>
            <ol className="help-guide-steps">
              {helpSlides.slice(1).map((item, index) => (
                <li key={item.title}>
                  <span>{index + 1}</span>
                  <img src={item.image} alt="" aria-hidden="true" />
                  <div><strong>{item.title}</strong><p>{item.copy}</p></div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}

function Dashboard({
  state,
  updateState,
  deleteDisplay,
  identifyDisplay,
  editDisplay,
  editBoard,
  editRoomCamera,
  scheduleBoardNow
}: {
  state: LanternState;
  selectedDisplayId: ScreenId;
  setSelectedDisplayId: (screenId: ScreenId) => void;
  updateState: (updater: (current: LanternState) => LanternState) => void;
  deleteDisplay: (screenId: ScreenId) => void;
  identifyDisplay: (screenId: ScreenId) => void;
  editDisplay: (screenId: ScreenId) => void;
  editBoard: (screenId: ScreenId, boardId: string) => void;
  editRoomCamera: (screenId: ScreenId) => void;
  scheduleBoardNow: (screenId: ScreenId, boardId: string) => void;
}) {
  const displays = Object.values(state.screens);
  const [preview3d, setPreview3d] = useState<Record<string, boolean>>({});
  const [previewReset, setPreviewReset] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!state.activeBlip.active) return;
    const timer = window.setInterval(() => setNow(new Date()), 500);
    return () => window.clearInterval(timer);
  }, [state.activeBlip.active]);
  const previewGridClass = displays.length === 1
    ? "single"
    : displays.length === 2
      ? "pair"
      : "multiple";

  return (
    <section className="dashboard-grid">
      <div className="workband">
        <div className="preview-stage">
          <div className={`dashboard-display-grid ${previewGridClass}`} data-display-count={displays.length}>
            {displays.map((screen) => {
              const activeSchedule = resolveCurrentBoardSchedule(state, screen.id);
              const activeBoard = activeSchedule
                ? state.boardPrograms.find((program) => program.id === activeSchedule.boardId)
                : undefined;
              const assignedBoard = resolveActiveBoardProgram(state, screen.id);
              const editableBoard = activeBoard ?? assignedBoard;
              const noScheduledBoard = !activeBoard;
              const activeBlip = state.activeBlip;
              const immediateBlipExpiresAt = activeBlip.startedAt && activeBlip.durationMinutes > 0
                ? Date.parse(activeBlip.startedAt) + activeBlip.durationMinutes * 60_000
                : null;
              const immediateBlipIsCurrent = immediateBlipExpiresAt === null || now.getTime() < immediateBlipExpiresAt;
              const immediateBlipTargetsDisplay = activeBlip.targets?.length
                ? activeBlip.targets.includes(screen.id)
                : targetIncludes(activeBlip.target, screen.id);
              const immediateBlip = activeBlip.active && immediateBlipIsCurrent && immediateBlipTargetsDisplay && activeBlip.startedAt
                ? { blip: activeBlip, startedAt: activeBlip.startedAt }
                : null;
              const displayBlip = immediateBlip ?? resolveScheduledBlip(state, screen.id, now);
              const nextScheduledContent = resolveNextScheduledContent(state, screen.id);
              const liveMessage = resolveScheduledAnnouncement(state, screen.id)?.announcement;
              return (
              <article className="dashboard-display-tile" key={screen.id}>
                <header className="dashboard-display-label">
                  <div>
                    <div className="dashboard-display-heading">
                      <strong>{screen.label}</strong>
                      <span className={`dashboard-assignment-pill ${activeBoard ? "board" : "unscheduled"}`} title={activeBoard ? `Active board: ${activeBoard.name}` : "No active board is scheduled"}>{activeBoard ? `Board · ${activeBoard.name}` : "Nothing scheduled"}</span>
                      {liveMessage && <span className="dashboard-assignment-pill live" title={`Live scheduled message: ${liveMessage.title || "Untitled message"}`}>Live · {liveMessage.title || "Message"}</span>}
                    </div>
                    <span>{screen.orientation} · {screen.resolution}</span>
                  </div>
                  <div className="dashboard-display-status"><button className="command-button secondary compact" onClick={() => void openDisplayWindows([screen])} title={`Open ${screen.label}`}><Monitor size={15} /> Open</button><button className="icon-button dashboard-display-edit" onClick={() => editDisplay(screen.id)} title={`Edit ${screen.label}`} aria-label={`Edit ${screen.label}`}><Settings size={16} /></button><span title={screen.status === "offline" ? "Display is not attached" : "Display attached"}>{screen.status === "offline" ? <WifiOff size={17} /> : <Wifi size={17} />}</span><button className={screen.enabled ? "icon-button live-toggle active" : "icon-button live-toggle"} onClick={() => updateState((current) => ({ ...current, screens: { ...current.screens, [screen.id]: { ...current.screens[screen.id], enabled: !current.screens[screen.id], } } }))} title={screen.enabled ? "Take display offline" : "Make display live"}><Power size={15} /></button></div>
                </header>
                <div className={`dashboard-display-preview ${orientationClass(screen)}${activeBoard ? ` mode-${preview3d[screen.id] ? "3d" : "2d"}` : " idle"}${displayBlip ? " blip-active" : ""}`}>
                  {activeBoard ? <>
                    <button type="button" className={`preview-dimension-toggle${preview3d[screen.id] ? " active" : ""}`} onClick={() => setPreview3d((current) => ({ ...current, [screen.id]: !current[screen.id] }))} title={preview3d[screen.id] ? "Lock this preview to a straight-on 2D view" : "Unlock tilt and rotation for a 3D view"}>{preview3d[screen.id] ? <Unlock size={14} /> : <Lock size={14} />}<span>{preview3d[screen.id] ? "3D" : "2D"}</span></button>
                    <BabylonDonorWall state={state} screenId={screen.id} interactive fitToScreen viewMode={preview3d[screen.id] ? "3d" : "2d"} resetKey={previewReset[screen.id] ?? 0} />
                    <button type="button" className="preview-reset-button" onClick={() => setPreviewReset((current) => ({ ...current, [screen.id]: (current[screen.id] ?? 0) + 1 }))}><RotateCcw size={13} /> Reset view</button>
                  </> : !displayBlip && <IdleDisplayNotice upcoming={nextScheduledContent} onAddSchedule={noScheduledBoard && assignedBoard ? () => scheduleBoardNow(screen.id, assignedBoard.id) : undefined} />}
                  {displayBlip && <BlipComposition blip={displayBlip.blip} startedAt={displayBlip.startedAt} />}
                </div>
                {immediateBlip && <DashboardBlipControl
                  blip={immediateBlip.blip}
                  startedAt={immediateBlip.startedAt}
                  onSetRemaining={(minutes) => updateState((current) => {
                    if (!current.activeBlip.active || !current.activeBlip.startedAt) return current;
                    const elapsedMinutes = Math.max(0, (Date.now() - Date.parse(current.activeBlip.startedAt)) / 60_000);
                    return { ...current, activeBlip: { ...current.activeBlip, durationMinutes: elapsedMinutes + minutes } };
                  })}
                  onEnd={() => updateState((current) => current.activeBlip.active ? { ...current, activeBlip: { ...current.activeBlip, active: false } } : current)}
                />}
                <div className="button-row dashboard-display-actions"><button className="icon-button" onClick={() => identifyDisplay(screen.id)} title="Identify display"><Radio size={17} /></button><button className="icon-button" onClick={() => editRoomCamera(screen.id)} title={`Configure ${screen.label} room camera`}><Camera size={17} /></button><button className="command-button secondary compact" disabled={!editableBoard} onClick={() => editableBoard && editBoard(screen.id, editableBoard.id)} title={editableBoard ? `Edit ${editableBoard.name}` : "No board available to edit"}><Settings2 size={16} /> Edit Board</button><button className="icon-button danger-icon" disabled={displays.length <= 1} onClick={() => deleteDisplay(screen.id)} title="Delete display"><Trash2 size={17} /></button></div>
              </article>
            );})}
          </div>
        </div>
      </div>
    </section>
  );
}

function IdeasDrawer({ page, open, onToggle }: { page: View; open: boolean; onToggle: () => void }) {
  return <aside className={open ? "ideas-drawer open" : "ideas-drawer"} aria-label="Ideas and shortcuts">
    {!open && <button className="ideas-drawer-toggle" onClick={onToggle} title="Expand ideas and shortcuts" aria-expanded={false}><ChevronLeft size={17} /><span>Ideas</span></button>}
    {open && <div className="ideas-drawer-content">
      <header><div><p className="eyebrow">{titleFor(page)}</p><h2>Ideas & shortcuts</h2></div><button className="icon-button" onClick={onToggle} title="Collapse ideas and shortcuts" aria-expanded={true}><ChevronRight size={17} /></button></header>
      <p className="ideas-intro">Temporary space for first-user feedback. These concepts are disabled while the team decides what is most useful.</p>
      <div className="ideas-action-grid">
        <button disabled title="Temporary idea: show a quick summary of activity on this page"><Activity size={19} /><span>Quick summary</span></button>
        <button disabled title="Temporary idea: save frequently used actions"><Star size={19} /><span>Favorites</span></button>
        <button disabled title="Temporary idea: show recent operator actions and changes"><History size={19} /><span>Recent activity</span></button>
        <button disabled title="Temporary idea: collect notes from staff"><MessageSquare size={19} /><span>Staff notes</span></button>
      </div>
      <div className="ideas-feedback-note"><MessageSquare size={16} /><span>What would help you work faster on this page?</span></div>
    </div>}
  </aside>;
}

function DonorsView({
  state,
  activeUserId,
  query,
  setQuery,
  donors,
  warnings,
  updateState,
  addDonor,
  donorSetupOpen,
  closeDonorSetup,
  onOpenBoard
}: {
  state: LanternState;
  activeUserId?: string;
  query: string;
  setQuery: (query: string) => void;
  donors: Donor[];
  warnings: string[];
  updateState: (updater: (current: LanternState) => LanternState) => void;
  addDonor: () => void;
  donorSetupOpen: boolean;
  closeDonorSetup: () => void;
  onOpenBoard: (boardId: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Donor | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"manual" | "az" | "za">(
    () => state.userPreferences.find((preferences) => preferences.userId === activeUserId)?.donorSort ?? "manual"
  );
  const [page, setPage] = useState(0);
  const [editTab, setEditTab] = useState<"profile" | "recognition" | "history" | "displays">("profile");
  const [discardDraftPending, setDiscardDraftPending] = useState(false);
  const discardEditor = () => {
    setDiscardDraftPending(false);
    setEditingId(null);
    setDraft(null);
  };
  const closeEditor = () => {
    if (draft && editingId) {
      const original = state.donors.find((donor) => donor.id === editingId);
      const originalWithBoards = original ? {
        ...original,
        boardIds: original.boardIds ?? state.boardPrograms.filter((board) => board.donorIds.includes(original.id)).map((board) => board.id)
      } : null;
      if (JSON.stringify(draft) !== JSON.stringify(originalWithBoards)) {
        setDiscardDraftPending(true);
        return;
      }
    }
    discardEditor();
  };
  const [createdDonorName, setCreatedDonorName] = useState<string | null>(null);
  const [donorPendingDelete, setDonorPendingDelete] = useState<Donor | null>(null);
  const [groupPromptOpen, setGroupPromptOpen] = useState(false);
  const allTags = Array.from(new Set([...state.recognitionSettings.tags, ...state.donors.flatMap((donor) => donor.tags ?? [])])).sort();
  const visibleDonors = donors
    .filter((donor) => (tagFilter === "all" || donor.tags?.includes(tagFilter)) && (groupFilter === "all" || donor.groupId === groupFilter) && (typeFilter === "all" || donor.donationType === typeFilter))
    .sort((a, b) => sortOrder === "manual" ? 0 : a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * (sortOrder === "az" ? 1 : -1));
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(visibleDonors.length / pageSize));
  const pageDonors = visibleDonors.slice(page * pageSize, page * pageSize + pageSize);

  useEffect(() => setPage(0), [query, tagFilter, groupFilter, typeFilter, sortOrder]);
  useEffect(() => {
    setSortOrder(state.userPreferences.find((preferences) => preferences.userId === activeUserId)?.donorSort ?? "manual");
  }, [activeUserId, state.userPreferences]);
  useEffect(() => setPage((current) => Math.min(current, pageCount - 1)), [pageCount]);
  useEffect(() => {
    if (!createdDonorName) return;
    const timer = window.setTimeout(() => setCreatedDonorName(null), 4200);
    return () => window.clearTimeout(timer);
  }, [createdDonorName]);
  const addGroup = (name: string) => {
    const normalized = name.trim();
    if (!normalized) return;
    updateState((current) => ({ ...current, donorGroups: [...current.donorGroups, { id: `group-${Date.now()}`, name: normalized, color: "#8e7cc3" }] }));
    setGroupPromptOpen(false);
  };

  const editDonor = (donor: Donor) => {
    setEditingId(donor.id);
    setDraft({ ...donor, boardIds: donor.boardIds ?? state.boardPrograms.filter((board) => board.donorIds.includes(donor.id)).map((board) => board.id) });
    setEditTab("profile");
  };

  const givingBoardMatchesDonor = (current: LanternState, board: DonorBoardProgram, donor: Donor) => {
    if (!donor.givingProgramId || board.givingProgramId !== donor.givingProgramId) return false;
    const givingProgram = current.givingPrograms.find((program) => program.id === donor.givingProgramId);
    if (donor.pledgeOneTime && !givingProgram?.allowOneTimeQualification) return false;
    if (board.templatePurpose === "roster") return true;
    if (board.templatePurpose !== "level") return false;
    const levelName = givingProgram?.levels.find((level) => level.id === donor.givingLevelId)?.name ?? donor.tier;
    const levelFilters = [...new Set(board.panels?.flatMap((panel) => panel.donorTierFilter ?? []) ?? [])];
    return levelFilters.length === 0 || levelFilters.some((filter) => filter.localeCompare(levelName, undefined, { sensitivity: "base" }) === 0);
  };

  const saveDonor = () => {
    if (!draft) return;
    updateState((current) => {
      const boardIds = new Set(draft.boardIds ?? []);
      const savedDonor = { ...draft, boardIds: [...boardIds] };
      return {
        ...current,
        donors: current.donors.map((donor) => (donor.id === draft.id ? savedDonor : donor)),
        boardPrograms: current.boardPrograms.map((board) => ({
          ...board,
          donorIds: boardIds.has(board.id)
            ? [...new Set([...board.donorIds, draft.id])]
            : board.donorIds.filter((id) => id !== draft.id)
        })),
        recognitionSettings: { ...current.recognitionSettings, tags: [...new Set([...current.recognitionSettings.tags, ...(draft.tags ?? [])])].sort() }
      };
    });
    setEditingId(null);
    setDraft(null);
    setDiscardDraftPending(false);
  };

  const deleteDonor = (id: string) => {
    updateState((current) => ({
      ...current,
      donors: current.donors.filter((donor) => donor.id !== id),
      boardPrograms: current.boardPrograms.map((board) => ({
        ...board,
        donorIds: board.donorIds.filter((donorId) => donorId !== id),
        panels: board.panels?.map((panel) => panel.donorIds?.includes(id) ? { ...panel, donorIds: panel.donorIds.filter((donorId) => donorId !== id) } : panel)
      })),
      screens: Object.fromEntries(Object.entries(current.screens).map(([screenId, screen]) => [screenId, { ...screen, donorIds: screen.donorIds?.filter((donorId) => donorId !== id) }]))
    }));
    setDonorPendingDelete(null);
  };

  const moveDonor = (overId: string) => {
    if (!draggedId || draggedId === overId) return;
    updateState((current) => {
      const list = [...current.donors];
      const from = list.findIndex((donor) => donor.id === draggedId);
      const to = list.findIndex((donor) => donor.id === overId);
      if (from < 0 || to < 0) return current;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return { ...current, donors: list };
    });
    setDraggedId(null);
    setDragOverId(null);
  };

  const setDonorSort = (donorSort: "manual" | "az" | "za") => {
    setSortOrder(donorSort);
    if (!activeUserId) return;
    updateState((current) => ({
      ...current,
      userPreferences: current.userPreferences.map((preferences) => preferences.userId === activeUserId
        ? { ...preferences, donorSort }
        : preferences)
    }));
  };

  const beginDonorDrag = (event: React.DragEvent<HTMLButtonElement>, donor: Donor) => {
    setDraggedId(donor.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", donor.id);
    const preview = document.createElement("div");
    preview.className = "donor-drag-preview";
    preview.textContent = donor.name;
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, 18, 18);
    window.setTimeout(() => preview.remove(), 0);
  };

  const endDonorDrag = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const donorIsOnBoard = (donor: Donor, board: DonorBoardProgram) => donor.boardIds?.includes(board.id) ?? board.donorIds.includes(donor.id);

  const toggleDonorBoard = (donorId: string, boardId: string) => {
    updateState((current) => {
      const board = current.boardPrograms.find((item) => item.id === boardId);
      if (!board) return current;
      const isOn = board.donorIds.includes(donorId);
      return {
        ...current,
        donors: current.donors.map((item) => item.id === donorId ? { ...item, boardIds: isOn ? (item.boardIds ?? []).filter((id) => id !== boardId) : [...new Set([...(item.boardIds ?? []), boardId])] } : item),
        boardPrograms: current.boardPrograms.map((item) => item.id === boardId ? { ...item, donorIds: isOn ? item.donorIds.filter((id) => id !== donorId) : [...new Set([...item.donorIds, donorId])] } : item)
      };
    });
  };

  const createDonor = (donor: Donor) => {
    updateState((current) => {
      const assignedScreens = Object.values(current.screens).filter((screen) => donor.displayIds?.includes(screen.id));
      const assignedBoardIds = new Set(assignedScreens.map((screen) => screen.boardProgramId ?? current.boardPrograms[0]?.id).filter(Boolean));
      if (donor.givingProgramId) {
        current.boardPrograms
          .filter((program) => program.givingProgramId === donor.givingProgramId && (program.templatePurpose === "roster" || program.templatePurpose === "level"))
          .forEach((program) => {
            if (givingBoardMatchesDonor(current, program, donor)) assignedBoardIds.add(program.id);
            else assignedBoardIds.delete(program.id);
          });
      }

      return {
        ...current,
        donors: [{ ...donor, boardIds: [...assignedBoardIds] }, ...current.donors],
        recognitionSettings: { ...current.recognitionSettings, tags: [...new Set([...current.recognitionSettings.tags, ...(donor.tags ?? [])])].sort() },
        boardPrograms: current.boardPrograms.map((program) => assignedBoardIds.has(program.id)
          ? { ...program, donorIds: [...new Set([...program.donorIds, donor.id])] }
          : program),
        screens: Object.fromEntries(Object.entries(current.screens).map(([screenId, screen]) => [
          screenId,
          donor.displayIds?.includes(screenId) && (screen.donorRosterConfigured || screen.donorIds?.length)
            ? { ...screen, donorRosterConfigured: true, donorIds: [...new Set([...(screen.donorIds ?? []), donor.id])] }
            : screen
        ]))
      };
    });
    setQuery("");
    setTagFilter("all");
    setGroupFilter("all");
    setTypeFilter("all");
    setPage(0);
    setCreatedDonorName(donor.name);
    closeDonorSetup();
  };

  return (
    <section className="content-grid donors-grid compact-donors">
      <div className="toolbar-row">
        <div className="search-field">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, tags, groups, notes" />
        </div>
        <select className="toolbar-select" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="all">All tags</option>{allTags.map((tag) => <option key={tag}>{tag}</option>)}</select>
        <select className="toolbar-select" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="all">All groups</option>{state.donorGroups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select>
        <select className="toolbar-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All donation types</option>{["Cash", "In-kind", "Sponsorship", "Legacy", "Volunteer"].map((type) => <option key={type}>{type}</option>)}</select>
        <select className="toolbar-select" aria-label="Sort donors" value={sortOrder} onChange={(event) => setDonorSort(event.target.value as typeof sortOrder)} title="Choose how donor names are ordered"><option value="manual">Manual order</option><option value="az">Name A–Z</option><option value="za">Name Z–A</option></select>
        <button className="command-button primary" onClick={addDonor}>
          <Plus size={18} />
          Add donor
        </button>
      </div>

      <div className="donor-groups-row"><button className={groupFilter === "all" ? "group-chip selected" : "group-chip"} onClick={() => setGroupFilter("all")}>All donors <b>{state.donors.length}</b></button>{state.donorGroups.map((group) => <button className={groupFilter === group.id ? "group-chip selected" : "group-chip"} style={{ "--group-color": group.color } as React.CSSProperties} key={group.id} onClick={() => setGroupFilter(group.id)}>{group.name} <b>{state.donors.filter((donor) => donor.groupId === group.id).length}</b></button>)}<button className="group-chip add" onClick={() => setGroupPromptOpen(true)}><Plus size={14} /> New group</button></div>

      {createdDonorName && <div className="donor-created-banner" role="status"><CheckCircle2 size={17} /><span><strong>{createdDonorName}</strong> is set up and ready.</span><button type="button" className="icon-button" onClick={() => setCreatedDonorName(null)} title="Dismiss"><X size={14} /></button></div>}

      <div className="donor-card-list">
        {pageDonors.map((donor) => {
          const activeDraft = editingId === donor.id && draft ? draft : donor;
          const editing = false;
          const assignedBoards = state.boardPrograms.filter((board) => donorIsOnBoard(donor, board));
          const visibleTags = (donor.tags ?? []).slice(0, 3);
          const hiddenTagCount = Math.max(0, (donor.tags?.length ?? 0) - visibleTags.length);
          return (
            <article
              className={`${editing ? "donor-card editing" : "donor-card"}${draggedId === donor.id ? " dragging" : ""}${dragOverId === donor.id && draggedId !== donor.id ? " drop-target" : ""}`}
              key={donor.id}
              onDragOver={(event) => { if (draggedId && sortOrder === "manual") { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverId(donor.id); } }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverId((current) => current === donor.id ? null : current); }}
              onDrop={(event) => { event.preventDefault(); moveDonor(donor.id); endDonorDrag(); }}
            >
              <button className="icon-button drag-button themed-tooltip" data-tooltip={sortOrder === "manual" ? "Drag to reorder" : "Choose Manual order to drag"} draggable={!editing && sortOrder === "manual"} onDragStart={(event) => beginDonorDrag(event, donor)} onDragEnd={endDonorDrag} disabled={sortOrder !== "manual"} aria-label={`Reorder ${donor.name}`}>
                <GripVertical size={17} />
              </button>
              <div className="donor-main">
                {editing ? (
                  <>
                    <input value={activeDraft.name} onChange={(event) => setDraft({ ...activeDraft, name: event.target.value })} />
                    <div className="donor-edit-grid">
                      <select value={activeDraft.tier} onChange={(event) => setDraft({ ...activeDraft, tier: event.target.value as Donor["tier"] })}>
                        <option>Founder</option>
                        <option>Champion</option>
                        <option>Patron</option>
                        <option>Friend</option>
                      </select>
                      <select value={activeDraft.category} onChange={(event) => setDraft({ ...activeDraft, category: event.target.value as Donor["category"] })}>
                        <option>Family</option>
                        <option>Corporate</option>
                        <option>Community</option>
                        <option>Legacy</option>
                      </select>
                      <input value={activeDraft.since} onChange={(event) => setDraft({ ...activeDraft, since: event.target.value })} />
                      <select value={activeDraft.donationType ?? "Cash"} onChange={(event) => setDraft({ ...activeDraft, donationType: event.target.value as Donor["donationType"] })}>{["Cash", "In-kind", "Sponsorship", "Legacy", "Volunteer"].map((type) => <option key={type}>{type}</option>)}</select>
                      <input type="number" value={activeDraft.amount ?? ""} onChange={(event) => setDraft({ ...activeDraft, amount: event.target.value === "" ? undefined : Math.max(0, Number(event.target.value)) })} placeholder="Amount" />
                      <select value={activeDraft.groupId ?? ""} onChange={(event) => setDraft({ ...activeDraft, groupId: event.target.value || undefined })}><option value="">No group</option>{state.donorGroups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select>
                      <label className="switch-row">
                        <input type="checkbox" checked={activeDraft.active} onChange={(event) => setDraft({ ...activeDraft, active: event.target.checked })} />
                        <span>{activeDraft.active ? "Active" : "Draft"}</span>
                      </label>
                    </div>
                    <input value={activeDraft.note} onChange={(event) => setDraft({ ...activeDraft, note: event.target.value })} />
                    <input value={activeDraft.subtext ?? ""} onChange={(event) => setDraft({ ...activeDraft, subtext: event.target.value })} placeholder="Optional name subtext" />
                    <input value={(activeDraft.tags ?? []).join(", ")} onChange={(event) => setDraft({ ...activeDraft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} placeholder="Tags, separated by commas" />
                    <div className="display-checks">{Object.values(state.screens).map((screen) => <label key={screen.id}><input type="checkbox" checked={activeDraft.displayIds?.includes(screen.id) ?? false} onChange={(event) => setDraft({ ...activeDraft, displayIds: event.target.checked ? [...(activeDraft.displayIds ?? []), screen.id] : (activeDraft.displayIds ?? []).filter((id) => id !== screen.id) })} />{screen.label}</label>)}</div>
                  </>
                ) : (
                  <>
                    <div className="donor-title-row"><strong title={donor.name}>{donor.name}</strong><details className="donor-board-disclosure themed-tooltip" data-tooltip={assignedBoards.length ? `Used on: ${assignedBoards.map((board) => board.name).join(", ")}` : "This donor is not currently used on a board."} onClick={(event) => event.stopPropagation()}><summary aria-label={`${donor.name} board assignments`}><LayoutDashboard size={12} />{assignedBoards.length} board{assignedBoards.length === 1 ? "" : "s"}</summary><div className="donor-display-toggles">{assignedBoards.map((board) => {
                      const isOn = donorIsOnBoard(donor, board);
                      return <label className={`screen-toggle-chip${isOn ? " on" : " off"}`} title={`${board.name} · ${isOn ? "Included" : "Not included"}`} key={board.id}><input type="checkbox" aria-label={board.name} checked={isOn} onChange={() => toggleDonorBoard(donor.id, board.id)} /><LayoutDashboard size={11} /><span>{board.name}</span></label>;
                    })}</div></details></div>
                    <span className="donor-recognition-summary"><b>{donor.tier}{donor.givingProgramId ? " Level" : ""}</b><i aria-hidden="true" />{donor.category}<i aria-hidden="true" />Since {donor.pledgeStartYear ?? donor.donationDate ?? donor.since}</span>
                    <small className="donor-giving-summary">{donor.pledgeAnnualAmount ? `$${donor.pledgeAnnualAmount.toLocaleString()}/year · ${donor.pledgeYears ?? 5}-year pledge · ${donor.pledgeStatus ?? "Pledged"}` : `${donor.donationType ?? "Cash"}${donor.amountUnknown ? " · amount unknown" : donor.amount ? ` · $${donor.amount.toLocaleString()}` : ""}`}</small>
                    {!!visibleTags.length && <div className="donor-meta-row">{visibleTags.map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}{hiddenTagCount > 0 && <span className="tag-chip donor-more-tags" title={(donor.tags ?? []).slice(visibleTags.length).join(", ")}>+{hiddenTagCount} more</span>}</div>}
                  </>
                )}
              </div>
              <div className="donor-actions">
                {editing ? (
                  <>
                    <button className="icon-button" onClick={saveDonor} title="Save donor">
                      <Save size={18} />
                    </button>
                    <button className="icon-button" onClick={() => setEditingId(null)} title="Cancel editing">
                      <X size={18} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className={`${donor.active ? "state-dot active" : "state-dot"} themed-tooltip`} data-tooltip={donor.active ? "Active donors may appear on every assigned recognition board." : "Draft donors are saved but hidden from recognition boards."}>{donor.active ? "Active" : "Draft"}</span>
                    <button className="icon-button" onClick={() => editDonor(donor)} title="Edit donor">
                      <Pencil size={18} />
                    </button>
                    <button className="icon-button danger-icon" onClick={() => setDonorPendingDelete(donor)} title="Delete donor">
                      <Trash2 size={18} />
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
        {!pageDonors.length && <div className="empty-inspector"><Search size={28} /><strong>No matching donors</strong><span>Try changing the search or filter controls.</span></div>}
      </div>
      <div className="collection-footer"><span>Showing {pageDonors.length ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, visibleDonors.length)} of {visibleDonors.length}</span><Pager page={page} pageCount={pageCount} onChange={setPage} /></div>

      {draft && editingId && createPortal(<div className="modal-backdrop donor-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
        <section className="editor-modal donor-editor-modal" role="dialog" aria-modal="true" aria-labelledby="donor-editor-title">
          <div className="editor-modal-head"><div><p className="eyebrow">Recognition profile</p><h2 id="donor-editor-title">Edit donor</h2></div><button className="icon-button" onClick={closeEditor} title="Close editor"><X size={18} /></button></div>
          <EditorTabs value={editTab} options={[["profile", "Profile"], ["recognition", "Pledge"], ["history", "Donation History"], ["displays", "Boards"]]} onChange={(value) => setEditTab(value as typeof editTab)} />
          <div className="editor-modal-body donor-editor-body">
            {editTab === "profile" && <div className="editor-form-grid"><LabeledInput label="Name" info="Donor or organization display name." value={draft.name} onChange={(name) => setDraft({ ...draft, name })} /><LabeledInput label={draft.givingProgramId ? "Recognition year" : "Donation date"} info={draft.givingProgramId ? "Cohort or pledge start year; this does not record a received gift." : "Enter an exact date or only a year."} value={draft.givingProgramId ? (draft.pledgeStartYear ?? draft.since) : (draft.donationDate ?? draft.since)} onChange={(date) => setDraft(draft.givingProgramId ? { ...draft, pledgeStartYear: date, since: date } : { ...draft, donationDate: date, since: date })} /><LabeledSelect label="Tier" info="Recognition tier." value={draft.tier} options={state.recognitionSettings.tiers} onChange={(tier) => setDraft({ ...draft, tier })} /><LabeledSelect label="Category" info="Donor category." value={draft.category} options={state.recognitionSettings.categories} onChange={(category) => setDraft({ ...draft, category })} /><label className="field span-two"><span>Basic public information <InfoDot text="Short summary used in donor lists." /></span><textarea value={draft.basicInfo ?? ""} onChange={(event) => setDraft({ ...draft, basicInfo: event.target.value })} /></label><label className="field span-two"><span>Expanded donor story <InfoDot text="Longer story shown on the donor profile." /></span><textarea className="expanded-copy" value={draft.expandedInfo ?? ""} onChange={(event) => setDraft({ ...draft, expandedInfo: event.target.value })} /></label><label className="switch-row span-two"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>{draft.active ? "Active on recognition boards" : "Saved as draft"}</span></label></div>}
            {editTab === "recognition" && <DonorPledgeEditor state={state} donor={draft} onChange={setDraft} />}
            {editTab === "history" && <DonationHistoryEditor donor={draft} users={state.users} activeUserId={activeUserId} onChange={(donations) => setDraft({ ...draft, donations })} />}
            {editTab === "displays" && <div className="display-assignment-grid">{state.boardPrograms.map((board) => <div className={draft.boardIds?.includes(board.id) ? "display-assignment selected" : "display-assignment"} key={board.id}><label><input type="checkbox" checked={draft.boardIds?.includes(board.id) ?? false} onChange={(event) => setDraft({ ...draft, boardIds: event.target.checked ? [...(draft.boardIds ?? []), board.id] : (draft.boardIds ?? []).filter((id) => id !== board.id) })} /><span><strong>{board.name}</strong></span></label><button type="button" className="command-button secondary compact" onClick={() => onOpenBoard(board.id)}><ExternalLink size={14} /> Open board</button></div>)}</div>}
          </div>
          <div className="editor-modal-actions"><button className="command-button secondary" onClick={closeEditor}>Cancel</button><button className="command-button primary" onClick={saveDonor}><Save size={17} /> Save changes</button></div>
        </section>
      </div>, document.body)}
      {discardDraftPending && createPortal(<div className="modal-backdrop destructive-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDiscardDraftPending(false); }}>
        <section className="editor-modal destructive-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="discard-donor-title" aria-describedby="discard-donor-description">
          <div className="destructive-confirm-icon"><AlertTriangle size={22} /></div>
          <div><p className="eyebrow">Unsaved donor changes</p><h2 id="discard-donor-title">Discard these changes?</h2><p id="discard-donor-description">Profile, pledge, gift-history, and board edits in this window will be lost.</p></div>
          <div className="editor-modal-actions"><button type="button" className="command-button secondary" onClick={() => setDiscardDraftPending(false)}>Keep editing</button><button type="button" className="command-button danger" onClick={discardEditor}>Discard changes</button></div>
        </section>
      </div>, document.body)}
      {donorPendingDelete && createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDonorPendingDelete(null); }}>
        <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="delete-donor-title">
          <div className="editor-modal-head"><div><p className="eyebrow">Permanent deletion</p><h2 id="delete-donor-title">Delete {donorPendingDelete.name}?</h2></div><button type="button" className="icon-button" onClick={() => setDonorPendingDelete(null)} title="Cancel deletion"><X size={18} /></button></div>
          <div className="editor-modal-body"><p>This will permanently delete all data for this donor and remove them from every board they are assigned to. This action cannot be undone.</p></div>
          <div className="editor-modal-actions"><button type="button" className="command-button secondary" onClick={() => setDonorPendingDelete(null)}>Cancel</button><button type="button" className="command-button danger" onClick={() => deleteDonor(donorPendingDelete.id)}><Trash2 size={17} /> Delete donor</button></div>
        </section>
      </div>, document.body)}
      {groupPromptOpen && <LanternTextPromptDialog eyebrow="Donor organization" title="Create a donor group" description="Groups help staff filter the roster. Creating one does not move or reassign any donors." label="Group name" placeholder="For example, Community partners" submitLabel="Create group" onCancel={() => setGroupPromptOpen(false)} onSubmit={addGroup} />}
      {donorSetupOpen && <DonorSetupWizard state={state} onClose={closeDonorSetup} onCreate={createDonor} />}
    </section>
  );
}

function CurrencyInput({ label, value, onChange }: { label: string; value?: number; onChange: (value?: number) => void }) {
  const [focused, setFocused] = useState(false);
  const [draftValue, setDraftValue] = useState(value == null || value === 0 ? "" : String(value));

  useEffect(() => {
    if (!focused) setDraftValue(value == null || value === 0 ? "" : String(value));
  }, [value, focused]);

  const commit = (raw: string) => {
    onChange(parseCurrencyAmount(raw));
  };

  return <label className="field currency-field">
    <span>{label} <InfoDot text="Enter a dollar amount. Commas and currency formatting are added automatically." /></span>
    <div className="currency-control">
      <b>$</b>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={focused ? draftValue : value ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : ""}
        placeholder="0"
        onFocus={() => { setFocused(true); setDraftValue(value == null || value === 0 ? "" : value.toLocaleString("en-US", { maximumFractionDigits: 2 })); }}
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={() => { commit(draftValue); setFocused(false); }}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      />
      {value != null && value > 0 && <button type="button" className="currency-clear" onMouseDown={(event) => event.preventDefault()} onClick={() => { setDraftValue(""); onChange(undefined); }} title="Clear amount"><X size={13} /></button>}
    </div>
  </label>;
}

function PledgeAmountControl({ amounts, value, onChange }: { amounts: number[]; value?: number; onChange: (value?: number) => void }) {
  const configured = [...new Set(amounts.filter((amount) => Number.isFinite(amount) && amount > 0))].sort((left, right) => left - right);
  const configuredValue = value != null && configured.includes(value) ? String(value) : "custom";
  return <div className="pledge-amount-control">
    <label className="field"><span>Annual pledge amount <InfoDot text="Choose a configured program amount, or use Custom for a pasted or free-entry currency value." /></span><select value={configuredValue} onChange={(event) => onChange(event.target.value === "custom" ? undefined : Number(event.target.value))}>{configured.map((amount) => <option value={amount} key={amount}>{amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}</option>)}<option value="custom">Custom</option></select></label>
    {configuredValue === "custom" && <CurrencyInput label="Custom annual pledge" value={value} onChange={onChange} />}
  </div>;
}

type PledgeTermValue = { pledgeYears?: number; pledgeOneTime?: boolean; years?: number };

function PledgeTermControl({ donor, defaultYears, onChange }: { donor: PledgeTermValue; defaultYears: number; onChange: (donor: PledgeTermValue) => void }) {
  const years = Math.max(1, Math.round(donor.pledgeYears ?? donor.years ?? defaultYears ?? 1));
  const supportsOneTime = !("years" in donor);
  const setYears = (next: number) => onChange({ ...donor, pledgeOneTime: false, pledgeYears: Math.max(1, Math.min(99, Math.round(next) || 1)) });
  return <div className="pledge-term-field field">
    <span>Pledge term <InfoDot text="Use one or more years, or explicitly mark this as a one-time pledge. Zero and negative terms are never stored." /></span>
    {supportsOneTime && <label className="switch-row pledge-one-time"><input type="checkbox" checked={donor.pledgeOneTime ?? false} onChange={(event) => onChange({ ...donor, pledgeOneTime: event.target.checked, pledgeYears: event.target.checked ? undefined : years })} /><span>One-time pledge</span></label>}
    {(!supportsOneTime || !donor.pledgeOneTime) && <div className="themed-stepper"><button type="button" onClick={() => setYears(years - 1)} disabled={years <= 1} aria-label="Reduce pledge term"><span>−</span></button><input type="text" inputMode="numeric" pattern="[0-9]*" aria-label="Pledge term in years" value={years} onChange={(event) => setYears(Number(event.target.value.replace(/\D/g, "")) || 1)} /><b>years</b><button type="button" onClick={() => setYears(years + 1)} disabled={years >= 99} aria-label="Increase pledge term"><span>+</span></button></div>}
  </div>;
}

function DonorPledgeEditor({ state, donor, onChange }: { state: LanternState; donor: Donor; onChange: (donor: Donor) => void }) {
  const program = state.givingPrograms.find((item) => item.id === donor.givingProgramId);
  const level = program?.levels.find((item) => item.id === donor.givingLevelId);
  const connectedBoards = (nextDonor: Donor) => {
    const managedProgramIds = new Set([donor.givingProgramId, nextDonor.givingProgramId].filter(Boolean));
    const retained = (nextDonor.boardIds ?? donor.boardIds ?? []).filter((boardId) => {
      const board = state.boardPrograms.find((candidate) => candidate.id === boardId);
      return !board?.givingProgramId || !managedProgramIds.has(board.givingProgramId) || !["roster", "level"].includes(board.templatePurpose ?? "");
    });
    if (!nextDonor.givingProgramId) return { ...nextDonor, boardIds: retained };
    const nextProgram = state.givingPrograms.find((candidate) => candidate.id === nextDonor.givingProgramId);
    if (nextDonor.pledgeOneTime && !nextProgram?.allowOneTimeQualification) return { ...nextDonor, boardIds: retained };
    const levelName = nextProgram?.levels.find((candidate) => candidate.id === nextDonor.givingLevelId)?.name ?? nextDonor.tier;
    const matching = state.boardPrograms.filter((board) => {
      if (board.givingProgramId !== nextDonor.givingProgramId) return false;
      if (board.templatePurpose === "roster") return true;
      if (board.templatePurpose !== "level") return false;
      const filters = [...new Set(board.panels?.flatMap((panel) => panel.donorTierFilter ?? []) ?? [])];
      return !filters.length || filters.some((filter) => filter.localeCompare(levelName, undefined, { sensitivity: "base" }) === 0);
    }).map((board) => board.id);
    return { ...nextDonor, boardIds: [...new Set([...retained, ...matching])] };
  };
  const chooseProgram = (givingProgramId: string) => {
    if (!givingProgramId) {
      onChange(connectedBoards({ ...donor, givingProgramId: undefined, givingLevelId: undefined, pledgeAnnualAmount: undefined, pledgeYears: undefined, pledgeOneTime: undefined, pledgeStartYear: undefined, pledgeStatus: undefined }));
      return;
    }
    const nextProgram = state.givingPrograms.find((item) => item.id === givingProgramId);
    const nextLevel = nextProgram?.levels[0];
    onChange(connectedBoards({
      ...donor,
      givingProgramId,
      givingLevelId: nextLevel?.id,
      tier: nextLevel?.name ?? donor.tier,
      category: "Giving Society",
      groupId: nextLevel ? `group-toy-${nextLevel.id}` : donor.groupId,
      pledgeAnnualAmount: nextLevel?.annualPledge,
      pledgeYears: nextLevel?.years ?? 5,
      pledgeOneTime: false,
      pledgeStartYear: donor.pledgeStartYear ?? donor.since,
      pledgeStatus: donor.pledgeStatus ?? "Pledged",
      tags: [...new Set([...(donor.tags ?? []), nextProgram?.name ?? "Giving society", nextProgram?.classLabel ?? "", nextLevel ? `${nextLevel.name} Level` : "", "Five-year pledge"].filter(Boolean))],
      note: nextLevel ? `${nextLevel.description} pledged to ${nextProgram?.fundDesignation.toLowerCase() ?? "unrestricted funds"}` : donor.note
    }));
  };
  const chooseLevel = (givingLevelId: string) => {
    if (!program) return;
    const nextLevel = program.levels.find((item) => item.id === givingLevelId);
    if (!nextLevel) return;
    onChange(connectedBoards({
      ...donor,
      givingLevelId,
      tier: nextLevel.name,
      groupId: `group-toy-${nextLevel.id}`,
      pledgeAnnualAmount: nextLevel.annualPledge,
      pledgeYears: nextLevel.years,
      note: `${nextLevel.description} pledged to ${program.fundDesignation.toLowerCase()}`,
      tags: [...new Set([...(donor.tags ?? []).filter((tag) => !program.levels.some((candidate) => `${candidate.name} Level` === tag)), `${nextLevel.name} Level`])]
    }));
  };

  return <div className="pledge-editor">
    <div className="pledge-editor-note"><BadgeCheck size={19} /><span><strong>A pledge is a commitment, not a received payment.</strong><small>Creating or changing a pledge never adds money to Donation History. Add a gift there only when the museum actually receives it.</small></span></div>
    <div className="editor-form-grid">
      <LabeledSelect label="Giving program" info="Optional society or campaign. Program and level drive linked roster-board eligibility." value={donor.givingProgramId ?? ""} options={["", ...state.givingPrograms.filter((item) => item.active !== false || item.id === donor.givingProgramId).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).map((item) => item.id)]} optionLabels={{ "": "No giving program", ...Object.fromEntries(state.givingPrograms.map((item) => [item.id, `${item.name}${item.active === false ? " (archived)" : ""}`])) }} onChange={chooseProgram} />
      {program && <LabeledSelect label="Giving level" info="Controls the member's tier and linked level-board placement." value={donor.givingLevelId ?? ""} options={program.levels.filter((item) => item.active !== false || item.id === donor.givingLevelId).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).map((item) => item.id)} optionLabels={Object.fromEntries(program.levels.map((item) => [item.id, `${item.name} Level${item.active === false ? " (archived)" : ""}`]))} onChange={chooseLevel} />}
      {program && <PledgeAmountControl amounts={program.levels.filter((item) => item.active !== false).map((item) => item.annualPledge)} value={donor.pledgeAnnualAmount} onChange={(pledgeAnnualAmount) => onChange({ ...donor, pledgeAnnualAmount })} />}
      {program && <PledgeTermControl donor={donor} defaultYears={level?.years ?? 5} onChange={(term) => {
        const nextDonor = { ...donor, ...term };
        const termTag = nextDonor.pledgeOneTime ? "One-time pledge" : `${nextDonor.pledgeYears ?? level?.years ?? 5}-year pledge`;
        onChange(connectedBoards({ ...nextDonor, tags: [...new Set([...(nextDonor.tags ?? []).filter((tag) => !/^(one-time|five-year|\d+-year) pledge$/i.test(tag)), termTag])] }));
      }} />}
      {program && <LabeledInput label="Pledge start year" info="Cohort or commitment start year." value={donor.pledgeStartYear ?? program.classYear} onChange={(pledgeStartYear) => onChange({ ...donor, pledgeStartYear })} />}
      {program && <LabeledSelect label="Pledge status" info="Internal status for the multi-year commitment." value={donor.pledgeStatus ?? "Pledged"} options={["Pledged", "Active", "Fulfilled", "Paused"]} onChange={(pledgeStatus) => onChange({ ...donor, pledgeStatus: pledgeStatus as Donor["pledgeStatus"] })} />}
    </div>
    <div className="pledge-data-map"><span><strong>Program + level</strong><small>Used for linked recognition-board eligibility.</small></span><span><strong>Annual amount + term</strong><small>Shown in the pledge summary and recognition profile.</small></span><span><strong>Received gifts</strong><small>Recorded only in Donation History for reconciliation.</small></span></div>
    {program && <div className="pledge-summary-card">
      <div><span>{program.classLabel}</span><strong>{program.name}</strong><small>{program.fundDesignation}</small></div>
      <div><span>Recognition</span><strong>{level?.name ?? donor.tier} Level</strong><small>{donor.pledgeAnnualAmount ? `$${donor.pledgeAnnualAmount.toLocaleString()}/year` : "Amount not set"} · {donor.pledgeOneTime ? "One-time pledge" : `${donor.pledgeYears ?? 5} years`}</small></div>
    </div>}
  </div>;
}

function ColorOverrideField({ label, value, fallback, onChange }: { label: string; value?: string; fallback: string; onChange: (value?: string) => void }) {
  return <label className="field color-override-field">
    <span>{label}</span>
    <div className="color-override-control">
      <input type="color" value={value || fallback} onChange={(event) => onChange(event.target.value)} aria-label={label} />
      <input value={(value || fallback).toUpperCase()} onChange={(event) => /^#[0-9a-f]{6}$/i.test(event.target.value) && onChange(event.target.value)} aria-label={`${label} hex value`} />
      <button type="button" className="icon-button" disabled={!value} onClick={() => onChange(undefined)} title={`Use default ${label.toLowerCase()}`}><RotateCcw size={14} /></button>
    </div>
  </label>;
}

function TagEditor({ selected, available, onChange }: { selected: string[]; available: string[]; onChange: (tags: string[]) => void }) {
  const [customTag, setCustomTag] = useState("");
  const addTag = (tag: string) => {
    const clean = tag.trim();
    if (clean && !selected.includes(clean)) onChange([...selected, clean]);
    setCustomTag("");
  };
  return <div className="tag-editor span-two"><span className="field-label">Tags <InfoDot text="Reusable labels for searching and filtering donors." /></span><div className="tag-pill-editor">{selected.map((tag) => <button type="button" className="tag-chip selected" key={tag} onClick={() => onChange(selected.filter((item) => item !== tag))}>{tag}<X size={11} /></button>)}{!selected.length && <small>No tags selected</small>}</div><div className="tag-add-row"><select value="" aria-label="Add an existing tag" onChange={(event) => addTag(event.target.value)}><option value="">Add existing tag</option>{available.filter((tag) => !selected.includes(tag)).map((tag) => <option key={tag}>{tag}</option>)}</select><input value={customTag} onChange={(event) => setCustomTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(customTag); } }} placeholder="Create a tag" /><button type="button" className="icon-button" onClick={() => addTag(customTag)} title="Add tag"><Plus size={15} /></button></div></div>;
}

function DonationHistoryEditor({ donor, users, activeUserId, onChange }: { donor: Donor; users: LanternUser[]; activeUserId?: string; onChange: (donations: DonationRecord[]) => void }) {
  const donations = donor.donations ?? [];
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const patchGift = (id: string, patch: Partial<DonationRecord>, preserveUpdatedBy = false) => onChange(donations.map((gift) => gift.id === id ? {
    ...gift,
    ...patch,
    updatedByUserId: preserveUpdatedBy ? patch.updatedByUserId : activeUserId ?? gift.updatedByUserId,
    updatedAt: new Date().toISOString()
  } : gift));
  const addGift = () => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    onChange([...donations, {
      id: `gift-${Date.now()}`,
      date,
      amount: 0,
      enteredByUserId: activeUserId,
      updatedByUserId: activeUserId,
      enteredAt: now.toISOString(),
      updatedAt: now.toISOString()
    }]);
  };
  const userOptions = ["", ...users.map((user) => user.id)];
  const userLabels = { "": "Not recorded", ...Object.fromEntries(users.map((user) => [user.id, user.name])) };
  return <div className="gift-history">
    <div className="gift-history-head"><div><strong>Donation History</strong><small>Record only contributions actually received. Pledge changes never create a payment.</small></div><button type="button" className="command-button secondary" onClick={addGift}><Plus size={15} /> Add received gift</button></div>
    {donations.map((gift, index) => <article className="gift-history-card" key={gift.id}>
      <header><div><span>Received gift {index + 1}</span><strong>{gift.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong>{gift.migrationKey && <small>Imported opening payment</small>}</div><button type="button" className="icon-button danger-icon" onClick={() => setPendingDeleteId(gift.id)} title="Remove received gift"><Trash2 size={15} /></button></header>
      <div className="gift-reconciliation-grid">
        <LabeledInput label="Received date" info="The date the museum received this contribution." value={gift.date} onChange={(date) => patchGift(gift.id, { date })} />
        <CurrencyInput label="Amount received" value={gift.amount} onChange={(amount) => patchGift(gift.id, { amount: amount ?? 0 })} />
        <LabeledSelect label="Contribution type" info="Optional reporting classification, separate from the payment method." value={gift.type ?? ""} options={["", "Cash", "In-kind", "Sponsorship", "Legacy", "Volunteer"]} optionLabels={{ "": "Not classified" }} onChange={(type) => patchGift(gift.id, { type: (type || undefined) as DonationRecord["type"] })} />
        <LabeledSelect label="Payment method" info="How the contribution was received. Leave blank when unknown." value={gift.paymentMethod ?? ""} options={["", "Cash", "Check", "Credit card", "ACH", "Wire", "In-kind", "Other"]} optionLabels={{ "": "Not recorded" }} onChange={(paymentMethod) => patchGift(gift.id, { paymentMethod: (paymentMethod || undefined) as DonationRecord["paymentMethod"] })} />
        <LabeledInput label="Transaction / reference" info="Processor or bank reference when one actually exists." value={gift.transactionReference ?? ""} onChange={(transactionReference) => patchGift(gift.id, { transactionReference: transactionReference || undefined })} />
        <LabeledInput label="Check number" info="Leave blank unless a real check number is available." value={gift.checkNumber ?? ""} onChange={(checkNumber) => patchGift(gift.id, { checkNumber: checkNumber || undefined })} />
        <label className="field span-two"><span>Receipt / reference note</span><textarea value={gift.receiptNote ?? gift.note ?? ""} onChange={(event) => patchGift(gift.id, { receiptNote: event.target.value || undefined })} placeholder="Receipt location, batch note, or migration label" /></label>
        <label className="field span-two"><span>Internal notes</span><textarea value={gift.internalNotes ?? ""} onChange={(event) => patchGift(gift.id, { internalNotes: event.target.value || undefined })} placeholder="Private reconciliation notes" /></label>
        <LabeledSelect label="Entered by" info="Operator who originally entered this gift." value={gift.enteredByUserId ?? ""} options={userOptions} optionLabels={userLabels} onChange={(enteredByUserId) => patchGift(gift.id, { enteredByUserId: enteredByUserId || undefined })} />
        <LabeledSelect label="Updated by" info="Operator responsible for the latest reconciliation update." value={gift.updatedByUserId ?? ""} options={userOptions} optionLabels={userLabels} onChange={(updatedByUserId) => patchGift(gift.id, { updatedByUserId: updatedByUserId || undefined }, true)} />
      </div>
      {pendingDeleteId === gift.id && <div className="gift-delete-confirm" role="alertdialog" aria-label="Remove received gift"><span>This removes the received-gift record when you save the donor.</span><div><button type="button" className="command-button secondary compact" onClick={() => setPendingDeleteId(null)}>Cancel</button><button type="button" className="command-button danger compact" onClick={() => { onChange(donations.filter((item) => item.id !== gift.id)); setPendingDeleteId(null); }}>Remove gift</button></div></div>}
    </article>)}
    {!donations.length && <div className="empty-gift-history"><History size={22} /><strong>No received gifts recorded</strong><span>Add one only after money or an in-kind contribution is received.</span></div>}
  </div>;
}

type DonorSetupDraft = Omit<Donor, "id">;

function DonorSetupWizard({ state, onClose, onCreate }: { state: LanternState; onClose: () => void; onCreate: (donor: Donor) => void }) {
  const currentYear = new Date().getFullYear();
  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [draft, setDraft] = useState<DonorSetupDraft>(() => ({
    name: "",
    tier: "Friend",
    category: "Community",
    active: false,
    since: String(currentYear),
    note: "",
    basicInfo: "",
    expandedInfo: "",
    subtext: "",
    tags: [],
    donations: [],
    displayIds: []
  }));

  const steps = [
    { label: "Profile", detail: "Who to recognize" },
    { label: "Recognition", detail: "Contribution details" },
    { label: "Placement", detail: "Displays and status" }
  ];
  const recognitionDate = draft.givingProgramId ? (draft.pledgeStartYear ?? draft.since) : (draft.donationDate ?? draft.since);
  const recognitionYear = Number(recognitionDate.slice(0, 4));
  const nameError = draft.name.trim() ? "" : "Enter the donor or organization name.";
  const sinceError = /^(\d{4}|\d{4}-\d{2}-\d{2})$/.test(recognitionDate) && recognitionYear >= 1800 && recognitionYear <= currentYear + 1
    ? ""
    : `Enter a four-digit year between 1800 and ${currentYear + 1}.`;
  const noteError = draft.note.trim() ? "" : "Add a short recognition note so the donor record has context.";
  const placementError = draft.active && !draft.displayIds?.length
    ? "Choose at least one display before activating this donor."
    : "";
  const stepIsValid = step === 0 ? !nameError && !sinceError : step === 1 ? !noteError : !placementError;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const moveForward = () => {
    if (!stepIsValid) {
      setAttempted(true);
      return;
    }
    setAttempted(false);
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const finishSetup = () => {
    if (!stepIsValid) {
      setAttempted(true);
      return;
    }
    onCreate({
      ...draft,
      id: `d-${Date.now()}`,
      name: draft.name.trim(),
      since: recognitionDate.trim(),
      donationDate: draft.givingProgramId && !draft.amount ? undefined : recognitionDate.trim(),
      donationType: draft.amount ? (draft.donationType ?? "Cash") : draft.givingProgramId ? undefined : draft.donationType,
      pledgeStartYear: draft.givingProgramId ? (draft.pledgeStartYear ?? recognitionDate.slice(0, 4)) : undefined,
      note: draft.note.trim(),
      basicInfo: draft.basicInfo?.trim() || draft.note.trim(),
      expandedInfo: draft.expandedInfo?.trim(),
      subtext: draft.subtext?.trim(),
      tags: draft.tags ?? [],
      donations: draft.amount ? [{ id: `gift-${Date.now()}`, date: recognitionDate.trim(), amount: draft.amount, type: draft.donationType ?? "Cash", note: draft.note.trim() }] : []
    });
  };

  const toggleDisplay = (screenId: ScreenId) => {
    const assigned = draft.displayIds?.includes(screenId) ?? false;
    setDraft({
      ...draft,
      displayIds: assigned
        ? (draft.displayIds ?? []).filter((id) => id !== screenId)
        : [...(draft.displayIds ?? []), screenId]
    });
  };

  const groupName = state.donorGroups.find((group) => group.id === draft.groupId)?.name ?? "No group";
  const assignedDisplays = Object.values(state.screens).filter((screen) => draft.displayIds?.includes(screen.id));
  const selectedGivingProgram = state.givingPrograms.find((program) => program.id === draft.givingProgramId);
  const chooseWizardProgram = (givingProgramId: string) => {
    if (!givingProgramId) {
      setDraft({ ...draft, givingProgramId: undefined, givingLevelId: undefined, pledgeAnnualAmount: undefined, pledgeYears: undefined, pledgeOneTime: undefined, pledgeStartYear: undefined, pledgeStatus: undefined });
      return;
    }
    const program = state.givingPrograms.find((item) => item.id === givingProgramId);
    const level = program?.levels[0];
    setDraft({
      ...draft,
      givingProgramId,
      givingLevelId: level?.id,
      tier: level?.name ?? draft.tier,
      category: "Giving Society",
      groupId: level ? `group-toy-${level.id}` : draft.groupId,
      pledgeAnnualAmount: level?.annualPledge,
      pledgeYears: level?.years ?? 5,
      pledgeOneTime: false,
      pledgeStartYear: draft.since.slice(0, 4),
      pledgeStatus: "Pledged",
      note: level ? `${level.description} pledged to ${program?.fundDesignation.toLowerCase() ?? "unrestricted funds"}` : draft.note,
      basicInfo: level && program ? `${level.name} Level · ${level.description} · ${program.classLabel}` : draft.basicInfo,
      subtext: level && program ? `${level.name} Level · ${program.classLabel}` : draft.subtext,
      tags: [...new Set([...(draft.tags ?? []), program?.name ?? "", program?.classLabel ?? "", level ? `${level.name} Level` : "", "Five-year pledge"].filter(Boolean))]
    });
  };
  const chooseWizardLevel = (givingLevelId: string) => {
    if (!selectedGivingProgram) return;
    const level = selectedGivingProgram.levels.find((item) => item.id === givingLevelId);
    if (!level) return;
    setDraft({
      ...draft,
      givingLevelId,
      tier: level.name,
      groupId: `group-toy-${level.id}`,
      pledgeAnnualAmount: level.annualPledge,
      pledgeYears: level.years,
      note: `${level.description} pledged to ${selectedGivingProgram.fundDesignation.toLowerCase()}`,
      basicInfo: `${level.name} Level · ${level.description} · ${selectedGivingProgram.classLabel}`,
      subtext: `${level.name} Level · ${selectedGivingProgram.classLabel}`,
      tags: [...new Set([...(draft.tags ?? []).filter((tag) => !selectedGivingProgram.levels.some((candidate) => `${candidate.name} Level` === tag)), `${level.name} Level`])]
    });
  };

  return (
    <div className="modal-backdrop donor-setup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="editor-modal donor-setup-modal" role="dialog" aria-modal="true" aria-labelledby="donor-setup-title">
        <div className="editor-modal-head donor-setup-head">
          <div>
            <p className="eyebrow">New recognition profile</p>
            <h2 id="donor-setup-title">Add a donor</h2>
            <p className="setup-intro">Enter the details once, then choose exactly where this donor should appear.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Cancel donor setup"><X size={18} /></button>
        </div>

        <div className="donor-setup-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
          {steps.map((item, index) => (
            <div className={`setup-progress-step${index === step ? " current" : ""}${index < step ? " complete" : ""}`} aria-current={index === step ? "step" : undefined} key={item.label}>
              <span className="setup-step-number">{index < step ? <CheckCircle2 size={16} /> : index + 1}</span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            </div>
          ))}
        </div>

        <div className="editor-modal-body donor-setup-body">
          <div className="setup-step-heading">
            <span>Step {step + 1} of {steps.length}</span>
            <h3>{step === 0 ? "Start with the donor profile" : step === 1 ? "Add recognition details" : "Choose placement and finish"}</h3>
            <p>{step === 0 ? "Use the exact name and history you want attached to this recognition record." : step === 1 ? "Capture the contribution and the wording guests may see on the board." : "Assign displays, choose whether to activate now, and review the completed setup."}</p>
          </div>

          {step === 0 && (
            <div className="editor-form-grid setup-form-grid">
              <label className={`field span-two${attempted && nameError ? " has-error" : ""}`}>
                <span>Display name <b>Required</b></span>
                <input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. The Rivera Family or Northstar Labs" />
                <small className="field-guidance">This is the name guests will see on recognition boards.</small>
                {attempted && nameError && <small className="field-error" role="alert">{nameError}</small>}
              </label>
              <label className={`field${attempted && sinceError ? " has-error" : ""}`}>
                <span>Recognition date <b>Required</b></span>
                <input value={recognitionDate} onChange={(event) => setDraft({ ...draft, since: event.target.value, donationDate: draft.givingProgramId ? undefined : event.target.value, pledgeStartYear: draft.givingProgramId ? event.target.value.slice(0, 4) : draft.pledgeStartYear })} placeholder="2026 or 2026-07-22" />
                <small className="field-guidance">Use the year or date this recognition begins. Pledges remain separate from received gifts.</small>
                {attempted && sinceError && <small className="field-error" role="alert">{sinceError}</small>}
              </label>
              <LabeledSelect label="Recognition tier" info="Controls how this donor is grouped by level of support." value={draft.tier} options={state.recognitionSettings.tiers} onChange={(tier) => setDraft({ ...draft, tier })} />
              <LabeledSelect label="Donor category" info="Describes the kind of donor being recognized." value={draft.category} options={state.recognitionSettings.categories} onChange={(category) => setDraft({ ...draft, category })} />
              <LabeledSelect label="Group" info="Optional collection used to organize and filter donors." value={draft.groupId ?? ""} options={["", ...state.donorGroups.map((group) => group.id)]} optionLabels={{ "": "No group", ...Object.fromEntries(state.donorGroups.map((group) => [group.id, group.name])) }} onChange={(groupId) => setDraft({ ...draft, groupId: groupId || undefined })} />
            </div>
          )}

          {step === 1 && (
            <div className="editor-form-grid setup-form-grid">
              <LabeledSelect label="Giving program" info="Optional pledge society or campaign." value={draft.givingProgramId ?? ""} options={["", ...state.givingPrograms.filter((program) => program.active !== false).map((program) => program.id)]} optionLabels={{ "": "No giving program", ...Object.fromEntries(state.givingPrograms.map((program) => [program.id, program.name])) }} onChange={chooseWizardProgram} />
              {selectedGivingProgram && <LabeledSelect label="Giving level" info="Sets the pledge terms and dynamic level-board placement." value={draft.givingLevelId ?? ""} options={selectedGivingProgram.levels.filter((level) => level.active !== false).map((level) => level.id)} optionLabels={Object.fromEntries(selectedGivingProgram.levels.map((level) => [level.id, `${level.name} Level`]))} onChange={chooseWizardLevel} />}
              {selectedGivingProgram && <PledgeAmountControl amounts={selectedGivingProgram.levels.filter((level) => level.active !== false).map((level) => level.annualPledge)} value={draft.pledgeAnnualAmount} onChange={(pledgeAnnualAmount) => setDraft({ ...draft, pledgeAnnualAmount })} />}
              {selectedGivingProgram && <PledgeTermControl donor={draft} defaultYears={selectedGivingProgram.levels.find((level) => level.id === draft.givingLevelId)?.years ?? 5} onChange={(term) => setDraft({ ...draft, ...term })} />}
              <LabeledSelect label={selectedGivingProgram ? "Received gift type" : "Donation type"} info={selectedGivingProgram ? "Only used when an actual contribution is recorded with this pledge." : "The kind of contribution being recognized."} value={draft.donationType ?? "Cash"} options={["Cash", "In-kind", "Sponsorship", "Legacy", "Volunteer"]} onChange={(donationType) => setDraft({ ...draft, donationType: donationType as Donor["donationType"] })} />
              <CurrencyInput label={selectedGivingProgram ? "Received contribution (optional)" : "Contribution amount"} value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} />
              {selectedGivingProgram && <div className="pledge-editor-note span-two"><BadgeCheck size={18} /><span><strong>Leave the received contribution blank for a pledge-only record.</strong><small>The annual pledge will still drive recognition level and board placement without creating a payment.</small></span></div>}
              <label className={`field span-two${attempted && noteError ? " has-error" : ""}`}>
                <span>Recognition note <b>Required</b></span>
                <textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="e.g. Annual education fund supporter" />
                <small className="field-guidance">Internal context that helps staff understand this recognition.</small>
                {attempted && noteError && <small className="field-error" role="alert">{noteError}</small>}
              </label>
              <label className="field span-two"><span>Basic public information</span><textarea value={draft.basicInfo ?? ""} onChange={(event) => setDraft({ ...draft, basicInfo: event.target.value })} placeholder="Short summary for donor lists" /></label>
              <label className="field span-two"><span>Expanded donor story</span><textarea className="expanded-copy" value={draft.expandedInfo ?? ""} onChange={(event) => setDraft({ ...draft, expandedInfo: event.target.value })} placeholder="Longer story, background, and impact details for the website" /></label>
              <label className="field">
                <span>Display subtext</span>
                <input value={draft.subtext ?? ""} onChange={(event) => setDraft({ ...draft, subtext: event.target.value })} placeholder="e.g. In memory of Elena Rivera" />
                <small className="field-guidance">Optional line shown below the donor name.</small>
              </label>
              <TagEditor selected={draft.tags ?? []} available={state.recognitionSettings.tags} onChange={(tags) => setDraft({ ...draft, tags })} />
            </div>
          )}

          {step === 2 && (
            <div className="setup-placement">
              <div className="setup-status-choice" role="group" aria-label="Donor status">
                <button type="button" className={!draft.active ? "setup-status-card selected" : "setup-status-card"} aria-pressed={!draft.active} onClick={() => setDraft({ ...draft, active: false })}>
                  <Save size={19} /><span><strong>Save as draft</strong><small>Keep the profile ready without showing it publicly yet.</small></span>
                </button>
                <button type="button" className={draft.active ? "setup-status-card selected" : "setup-status-card"} aria-pressed={draft.active} onClick={() => setDraft({ ...draft, active: true })}>
                  <BadgeCheck size={19} /><span><strong>Activate now</strong><small>Show the donor on every display selected below.</small></span>
                </button>
              </div>

              <div className="setup-display-heading">
                <div><strong>Display assignments</strong><small>Select where this donor is allowed to appear.</small></div>
                <div className="mini-actions"><button type="button" onClick={() => setDraft({ ...draft, displayIds: Object.keys(state.screens) })}>Select all</button><button type="button" onClick={() => setDraft({ ...draft, displayIds: [] })}>Clear</button></div>
              </div>
              <div className="display-assignment-grid setup-display-grid">
                {Object.values(state.screens).map((screen) => {
                  const board = state.boardPrograms.find((program) => program.id === screen.boardProgramId) ?? state.boardPrograms[0];
                  const selected = draft.displayIds?.includes(screen.id) ?? false;
                  return (
                    <label className={selected ? "display-assignment selected" : "display-assignment"} key={screen.id}>
                      <input type="checkbox" checked={selected} onChange={() => toggleDisplay(screen.id)} />
                      <Monitor size={20} />
                      <span><strong>{screen.label}</strong><small>{board?.name ?? "No board assigned"} · {screen.orientation}</small></span>
                    </label>
                  );
                })}
                {!Object.keys(state.screens).length && <div className="setup-empty-displays"><Monitor size={22} /><span>No displays have been configured yet. Save this donor as a draft.</span></div>}
              </div>
              {attempted && placementError && <div className="setup-placement-error" role="alert"><AlertTriangle size={15} />{placementError}</div>}

              <div className="setup-review-grid" aria-label="Donor setup summary">
                <div className="setup-review-card"><span>Profile</span><strong>{draft.name.trim()}</strong><small>{draft.tier} · {draft.category} · {selectedGivingProgram ? "Pledge starts" : "Gift"} {recognitionDate}</small></div>
                <div className="setup-review-card"><span>Recognition</span><strong>{selectedGivingProgram ? `${draft.tier} Level · $${(draft.pledgeAnnualAmount ?? 0).toLocaleString()}/year` : (draft.donationType ?? "Contribution")}{draft.amount ? ` · $${draft.amount.toLocaleString()} received` : ""}</strong><small>{groupName} · visual styling is configured per board</small></div>
                <div className="setup-review-card"><span>Placement</span><strong>{assignedDisplays.length ? `${assignedDisplays.length} display${assignedDisplays.length === 1 ? "" : "s"}` : "No displays"}</strong><small>{draft.active ? "Activates immediately" : "Saved as draft"}</small></div>
              </div>
            </div>
          )}
        </div>

        <div className="editor-modal-actions donor-setup-actions">
          <button type="button" className="command-button secondary setup-cancel" onClick={onClose}>Cancel</button>
          <div>
            {step > 0 && <button type="button" className="command-button secondary" onClick={() => { setAttempted(false); setStep((current) => current - 1); }}><ChevronLeft size={17} /> Back</button>}
            {step < steps.length - 1
              ? <button type="button" className="command-button primary" onClick={moveForward}>Continue <ChevronRight size={17} /></button>
              : <button type="button" className="command-button primary" onClick={finishSetup}><CheckCircle2 size={17} /> Create donor</button>}
          </div>
        </div>
      </section>
    </div>
  );
}

const boardPanelTypes: BoardPanelType[] = ["text", "donors", "image"];

function boardPanelLabel(type: BoardPanelType) {
  const labels: Record<BoardPanelType, string> = {
    text: "Text",
    heading: "Heading",
    "supporters-heading": "Subheader",
    donors: "Donor list",
    message: "Message",
    story: "Feature story",
    footer: "Footer",
    image: "Image / PNG",
    "donor-star": "Donor star"
  };
  return labels[type];
}

function boardPreviewPalette(palette: DonorBoardProgram["palette"]) {
  if (palette === "legacy-navy") return { text: "#fff6df", accent: "#f2bd22", secondary: "#4da6bf", muted: "#c7e0e7" };
  if (palette === "legacy-sky") return { text: "#173f61", accent: "#f4bd18", secondary: "#0d5c91", muted: "#dceefa" };
  if (palette === "brigade-blue") return { text: "#fff6df", accent: "#f4c45d", secondary: "#f06b55", muted: "#d8edf0" };
  if (palette === "brigade-red") return { text: "#fff6df", accent: "#f4c45d", secondary: "#72c6d5", muted: "#f7dcd1" };
  if (palette === "brigade-sunshine") return { text: "#173f61", accent: "#a82f28", secondary: "#146f98", muted: "#3f5669" };
  if (palette === "brigade-cream") return { text: "#173f61", accent: "#bc3b2f", secondary: "#1575a2", muted: "#586a76" };
  return { text: "#f5f2eb", accent: "#d9a657", secondary: "#79cac6", muted: "#bdc7c7" };
}

function ScheduleBoardPicker({ programs, value, onChange }: { programs: DonorBoardProgram[]; value: string; onChange: (boardId: string) => void }) {
  const pickerRef = useRef<HTMLDetailsElement>(null);
  const [search, setSearch] = useState("");
  const groups = [
    { label: "Supporter spotlights", programs: programs.filter((program) => program.templatePurpose === "story") },
    { label: "Honor rolls", programs: programs.filter((program) => program.templatePurpose === "roster" || program.templatePurpose === "level") },
    { label: "Program information", programs: programs.filter((program) => program.templatePurpose === "invitation") },
    { label: "Good deeds", programs: programs.filter((program) => program.templatePurpose === "good-deeds") },
    { label: "Custom boards", programs: programs.filter((program) => !program.templatePurpose) }
  ].filter((group) => group.programs.length);
  const current = programs.find((program) => program.id === value) ?? programs[0];
  const currentGroup = groups.find((group) => group.programs.some((program) => program.id === current?.id));
  const displayName = (program: DonorBoardProgram) => program.name.replace(/\s*(?:Â·|-|·)\s*(?:portrait|landscape)\s*$/i, "").trim();
  const needle = search.trim().toLowerCase();
  const filteredGroups = groups.map((group) => ({ ...group, programs: group.programs.filter((program) => !needle || program.name.toLowerCase().includes(needle) || program.orientation.toLowerCase().includes(needle) || group.label.toLowerCase().includes(needle)) })).filter((group) => group.programs.length);
  if (!current) return null;
  return <div className="field schedule-board-picker"><span>Board <InfoDot text="Choose the donor board shown during this event." /></span><details className="board-picker" ref={pickerRef} onToggle={(event) => { if (!(event.currentTarget as HTMLDetailsElement).open) setSearch(""); }}><summary aria-label={`Choose board. Current board: ${current.name}`}><span className="board-picker-current"><BoardOrientationIcon orientation={current.orientation} /><span><strong>{displayName(current)}</strong><small>{currentGroup?.label ?? "Custom boards"} Â· {current.orientation}</small></span></span><ChevronDown size={16} /></summary><div className="board-picker-popover"><label className="board-picker-search"><Search size={15} /><span className="sr-only">Search boards</span><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search boards or folders" /></label><div className="board-picker-groups">{filteredGroups.map((group) => <section className="board-picker-group" key={group.label}><header><Folder size={14} /><strong>{group.label}</strong><span>{group.programs.length}</span></header>{group.programs.map((program) => <button type="button" className={program.id === current.id ? "selected board-picker-option" : "board-picker-option"} aria-current={program.id === current.id ? "true" : undefined} key={program.id} onClick={() => { onChange(program.id); pickerRef.current?.removeAttribute("open"); }}><BoardOrientationIcon orientation={program.orientation} /><span>{displayName(program)}</span><small>{program.orientation}</small></button>)}</section>)}{!filteredGroups.length && <div className="board-picker-empty"><Search size={18} /><span>No boards match â€œ{search}â€.</span></div>}</div></div></details></div>;
}

function BoardOrientationIcon({ orientation }: { orientation: DonorBoardProgram["orientation"] }) {
  const Icon = orientation === "Portrait" ? Smartphone : Monitor;
  return <span className="board-orientation-icon" title={`${orientation} board`}><Icon size={14} aria-hidden="true" /><span className="sr-only">{orientation}</span></span>;
}

function defaultBoardPanels(program: LanternState["boardPrograms"][number]): BoardPanel[] {
  return [
    { id: `${program.id}-heading`, type: "text", title: [program.heading, program.subtitle].filter(Boolean).join("\n"), size: "standard", x: 4, y: 4, width: 92, height: 22 },
    { id: `${program.id}-supporters-heading`, type: "text", title: "Our supporters", size: "compact", x: 5, y: 29, width: 90, height: 7 },
    { id: `${program.id}-donors`, type: "donors", title: "", size: "feature", columns: program.columns, x: 5, y: 36, width: 90, height: 45 },
    { id: `${program.id}-footer`, type: "text", title: program.footer, size: "compact", x: 5, y: 84, width: 90, height: 11 }
  ];
}

function createBoardPanel(type: BoardPanelType, position = { x: 30, y: 35 }): BoardPanel {
  const id = `${type}-${Date.now()}`;
  const templates: Record<BoardPanelType, BoardPanel> = {
    text: { id, type, title: "Add your text here", size: "standard" },
    heading: { id, type, title: "OUR GENEROUS DONORS", size: "standard" },
    "supporters-heading": { id, type, title: "Our supporters", size: "compact" },
    donors: { id, type, title: "", size: "feature", columns: 2 },
    message: { id, type, eyebrow: "A NOTE OF GRATITUDE", title: "Your support makes discovery possible", body: "Thank you for investing in our community.", size: "standard" },
    story: { id, type, eyebrow: "FEATURED STORY", title: "A brighter future, built together", body: "Share a short story about the impact your supporters made possible.", size: "standard" },
    footer: { id, type, title: "TOGETHER, WE MAKE A DIFFERENCE.", size: "compact" },
    image: { id, type, title: "Image", size: "standard", imageFit: "contain" },
    "donor-star": { id, type, title: "Select a donor", size: "standard", imageUrl: "/assets/donor-icons/legacy-star-flat.svg", imageFit: "contain", fontFamily: "DM Sans", fontSize: 14, textColor: "#201708" }
  };
  const dimensions: Record<BoardPanelType, { width: number; height: number }> = {
    text: { width: 48, height: 18 },
    heading: { width: 54, height: 20 }, "supporters-heading": { width: 70, height: 8 }, donors: { width: 70, height: 44 }, message: { width: 48, height: 24 },
    story: { width: 55, height: 30 }, footer: { width: 70, height: 12 }, image: { width: 34, height: 32 }, "donor-star": { width: 22, height: 18 }
  };
  const { width, height } = dimensions[type];
  return { ...templates[type], x: Math.max(0, Math.min(100 - width, position.x)), y: Math.max(0, Math.min(100 - height, position.y)), width, height };
}

function ThemeStudio({
  state,
  selectedDisplayId,
  setSelectedDisplayId,
  requestedBoardId,
  updateState
}: {
  state: LanternState;
  selectedDisplayId: ScreenId;
  setSelectedDisplayId: (screenId: ScreenId) => void;
  requestedBoardId: string | null;
  updateState: (updater: (current: LanternState) => LanternState) => void;
}) {
  const display = state.screens[selectedDisplayId] ?? Object.values(state.screens)[0];
  const [selectedProgramId, setSelectedProgramId] = useState(() => requestedBoardId ?? resolveDisplayedBoardProgramId(state, display.id));
  useEffect(() => {
    if (requestedBoardId && state.boardPrograms.some((program) => program.id === requestedBoardId)) setSelectedProgramId(requestedBoardId);
  }, [requestedBoardId, state.boardPrograms]);
  useEffect(() => {
    const openBoard = (event: Event) => setSelectedProgramId((event as CustomEvent<string>).detail);
    window.addEventListener("lantern:open-board", openBoard);
    return () => window.removeEventListener("lantern:open-board", openBoard);
  }, []);
  const [selectedPanelId, setSelectedPanelId] = useState("");
  const [selectedPanelIds, setSelectedPanelIds] = useState<string[]>([]);
  const [panelClipboard, setPanelClipboard] = useState<BoardPanel | null>(null);
  const [newPanelType, setNewPanelType] = useState<BoardPanelType>("message");
  const [placingPanelType, setPlacingPanelType] = useState<BoardPanelType | null>(null);
  const [donorPage, setDonorPage] = useState(0);
  const [donorSearch, setDonorSearch] = useState("");
  const [boardSearch, setBoardSearch] = useState("");
  const [boardEditorZoom, setBoardEditorZoom] = useState(1);
  const [boardEditorPan, setBoardEditorPan] = useState({ x: 0, y: 0 });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "local" | "error">("idle");
  const [pendingProgramDeleteId, setPendingProgramDeleteId] = useState<string | null>(null);
  const [pendingPanelDelete, setPendingPanelDelete] = useState<{ programId: string; ids: string[]; removed: Array<{ panel: BoardPanel; index: number }>; x: number; y: number } | null>(null);
  const [lastDeletedPanels, setLastDeletedPanels] = useState<{ programId: string; removed: Array<{ panel: BoardPanel; index: number }> } | null>(null);
  const boardPickerRef = useRef<HTMLDetailsElement>(null);
  const selectedProgram = state.boardPrograms.find((program) => program.id === selectedProgramId) ?? state.boardPrograms[0];
  const pendingProgramDelete = state.boardPrograms.find((program) => program.id === pendingProgramDeleteId);
  const boardDisplay = selectedProgram ? { ...display, orientation: selectedProgram.orientation } : display;
  const panels = selectedProgram?.panels ?? [];
  const selectedPanel = panels.find((panel) => panel.id === selectedPanelId);
  const donorPageSize = 8;
  const filteredBoardDonors = state.donors.filter((donor) => donor.name.toLowerCase().includes(donorSearch.trim().toLowerCase()));
  const donorPageCount = Math.max(1, Math.ceil(filteredBoardDonors.length / donorPageSize));
  const donorPageItems = filteredBoardDonors.slice(donorPage * donorPageSize, donorPage * donorPageSize + donorPageSize);
  useEffect(() => setDonorPage(0), [donorSearch]);
  useEffect(() => {
    if (donorPage >= donorPageCount) setDonorPage(donorPageCount - 1);
  }, [donorPage, donorPageCount]);
  useEffect(() => {
    if (!selectedProgram?.panels?.some((panel) => panel.x == null || panel.y == null || panel.width == null || panel.height == null)) return;
    const fallback = defaultBoardPanels(selectedProgram);
    const migrated = selectedProgram.panels.map((panel, index) => {
      if (panel.x != null && panel.y != null && panel.width != null && panel.height != null) return panel;
      const base = fallback[index] ?? createBoardPanel(panel.type, { x: 8 + (index % 3) * 12, y: 8 + (index % 4) * 14 });
      return { ...panel, x: base.x, y: base.y, width: base.width, height: base.height };
    });
    patchProgram({ panels: migrated });
  }, [selectedProgram?.id, selectedProgram?.panels]);

  useEffect(() => {
    setSelectedPanelId("");
    setBoardEditorZoom(1);
    setBoardEditorPan({ x: 0, y: 0 });
  }, [selectedProgramId]);

  useEffect(() => {
    if (!selectedProgram?.panels?.some((panel) => !["text", "donors", "image"].includes(panel.type))) return;
    const migrated = selectedProgram.panels.flatMap((panel) => {
      if (["text", "donors", "image"].includes(panel.type)) return [panel];
      if (panel.type === "donor-star") {
        const groupId = panel.groupId ?? `group-${panel.id}`;
        return [
          { ...panel, id: `${panel.id}-image`, type: "image" as const, title: "Recognition star", groupId, donorId: undefined, eyebrow: undefined, body: undefined },
          { ...panel, type: "text" as const, title: state.donors.find((donor) => donor.id === panel.donorId)?.name ?? panel.title, groupId, imageUrl: undefined, imageFit: undefined, donorId: undefined, eyebrow: undefined, body: undefined }
        ];
      }
      return [{ ...panel, type: "text" as const, title: [panel.eyebrow, panel.title, panel.body].filter(Boolean).join("\n"), eyebrow: undefined, body: undefined, donorId: undefined }];
    });
    patchProgram({ panels: migrated });
  }, [selectedProgram?.id, selectedProgram?.panels, state.donors]);

  useEffect(() => {
    const displayedProgramId = resolveDisplayedBoardProgramId(state, display.id);
    if (displayedProgramId) {
      setSelectedProgramId(displayedProgramId);
    }
  }, [display.id]);

  useEffect(() => {
    if (selectedPanelId && !panels.some((panel) => panel.id === selectedPanelId)) setSelectedPanelId("");
  }, [panels, selectedPanelId]);

  const patchProgram = (patch: Partial<LanternState["boardPrograms"][number]>) => {
    if (!selectedProgram) return;
    updateState((current) => ({
      ...current,
      boardPrograms: current.boardPrograms.map((program) => program.id === selectedProgram.id ? { ...program, ...patch } : program)
    }));
  };

  const patchPanel = (panelId: string, patch: Partial<BoardPanel>) => {
    if (!selectedProgram) return;
    const programId = selectedProgram.id;
    updateState((current) => {
      const currentProgram = current.boardPrograms.find((program) => program.id === programId);
      if (!currentProgram) return current;
      const nextPanels = (currentProgram.panels ?? []).map((panel) => panel.id === panelId ? { ...panel, ...patch } : panel);
      const nextPanel = nextPanels.find((panel) => panel.id === panelId);
      const legacyPatch = nextPanel?.type === "heading"
        ? { heading: "", subtitle: nextPanel.title, description: "" }
        : nextPanel?.type === "footer"
          ? { footer: nextPanel.title }
          : nextPanel?.type === "donors"
            ? { columns: nextPanel.columns && nextPanel.columns <= 2 ? nextPanel.columns as 1 | 2 : currentProgram.columns }
            : {};
      return {
        ...current,
        boardPrograms: current.boardPrograms.map((program) => program.id === programId ? { ...program, panels: nextPanels, ...legacyPatch } : program)
      };
    });
  };

  const addPanel = (type = newPanelType, position?: { x: number; y: number }) => {
    const panel = createBoardPanel(type, position);
    patchProgram({ panels: [...panels, panel] });
    setSelectedPanelId(panel.id);
    setPlacingPanelType(null);
  };
  const copySelectedPanel = () => {
    if (!selectedPanel) return;
    setPanelClipboard({ ...selectedPanel, donorTierFilter: selectedPanel.donorTierFilter ? [...selectedPanel.donorTierFilter] : undefined });
  };
  const pastePanel = () => {
    if (!selectedProgram || !panelClipboard) return;
    const width = panelClipboard.width ?? 30;
    const height = panelClipboard.height ?? 18;
    const pasted: BoardPanel = {
      ...panelClipboard,
      id: `${panelClipboard.type}-copy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      groupId: undefined,
      donorTierFilter: panelClipboard.donorTierFilter ? [...panelClipboard.donorTierFilter] : undefined,
      x: clamp((panelClipboard.x ?? 30) + 2, -50, 100),
      y: clamp((panelClipboard.y ?? 35) + 2, -50, 100),
      width,
      height
    };
    patchProgram({ panels: [...panels, pasted] });
    setSelectedPanelId(pasted.id);
    setSelectedPanelIds([pasted.id]);
  };
  const addWidget = (widget: BoardWidget) => {
    const cloned = widget.panels.map((panel) => ({ ...panel, id: `${widget.id}-${Date.now()}-${panel.id}`, imageUrl: panel.imageUrl ?? widget.defaultImageUrl }));
    patchProgram({ panels: [...panels, ...cloned] }); setSelectedPanelIds(cloned.map((panel) => panel.id)); setSelectedPanelId(cloned[0]?.id ?? "");
  };
  const saveWidget = (name: string) => {
    const chosen = panels.filter((panel) => selectedPanelIds.includes(panel.id)); if (!chosen.length) return;
    const widget: BoardWidget = { id: `widget-${Date.now()}`, name, panels: chosen.map((panel) => ({ ...panel, id: `${panel.id}-template` })), defaultImageUrl: chosen.find((panel) => panel.type === "image" && panel.imageUrl)?.imageUrl };
    updateState((current) => ({ ...current, widgets: [...(current.widgets ?? []), widget] }));
  };

  const requestRemovePanel = (panelId: string, position?: { x: number; y: number }) => {
    if (!selectedProgram) return;
    const ids = selectedPanelIds.includes(panelId) ? selectedPanelIds : [panelId];
    const removed = panels.flatMap((panel, index) => ids.includes(panel.id) ? [{ panel, index }] : []);
    setPendingPanelDelete({ programId: selectedProgram.id, ids, removed, x: Math.max(8, Math.min(window.innerWidth - 260, position?.x ?? window.innerWidth / 2 - 130)), y: Math.max(8, Math.min(window.innerHeight - 132, position?.y ?? window.innerHeight / 2 - 66)) });
  };
  const confirmRemovePanel = () => {
    if (!pendingPanelDelete) return;
    updateState((current) => ({ ...current, boardPrograms: current.boardPrograms.map((program) => program.id === pendingPanelDelete.programId ? { ...program, panels: (program.panels ?? []).filter((panel) => !pendingPanelDelete.ids.includes(panel.id)) } : program) }));
    setLastDeletedPanels({ programId: pendingPanelDelete.programId, removed: pendingPanelDelete.removed });
    setSelectedPanelId(""); setSelectedPanelIds([]);
    setPendingPanelDelete(null);
  };
  const undoLastPanelDelete = useCallback(() => {
    if (!lastDeletedPanels) return;
    updateState((current) => ({ ...current, boardPrograms: current.boardPrograms.map((program) => {
      if (program.id !== lastDeletedPanels.programId) return program;
      const currentPanels = program.panels ?? [];
      const existingIds = new Set(currentPanels.map((panel) => panel.id));
      const restored = lastDeletedPanels.removed.filter(({ panel }) => !existingIds.has(panel.id));
      const nextPanels = [...currentPanels];
      restored.sort((a, b) => a.index - b.index).forEach(({ panel, index }) => nextPanels.splice(Math.min(index, nextPanels.length), 0, panel));
      return { ...program, panels: nextPanels };
    }) }));
    setSelectedPanelIds(lastDeletedPanels.removed.map(({ panel }) => panel.id));
    setSelectedPanelId(lastDeletedPanels.removed[0]?.panel.id ?? "");
    setLastDeletedPanels(null);
  }, [lastDeletedPanels, updateState]);
  useEffect(() => {
    const handleUndo = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!lastDeletedPanels) return;
      event.preventDefault();
      undoLastPanelDelete();
    };
    window.addEventListener("keydown", handleUndo);
    return () => window.removeEventListener("keydown", handleUndo);
  }, [lastDeletedPanels, undoLastPanelDelete]);
  const groupSelectedPanels = () => {
    const ids = selectedPanelIds.length > 1 ? selectedPanelIds : selectedPanelId ? [selectedPanelId] : [];
    if (ids.length < 2) return;
    const groupId = `group-${Date.now()}`;
    patchProgram({ panels: panels.map((panel) => ids.includes(panel.id) ? { ...panel, groupId } : panel) });
  };
  const ungroupPanel = (panel: BoardPanel) => {
    if (!panel.groupId) return;
    patchProgram({ panels: panels.map((item) => item.groupId === panel.groupId ? { ...item, groupId: undefined } : item) });
  };

  const duplicateProgram = () => {
    if (!selectedProgram) return;
    const id = `board-${Date.now()}`;
    const clonedPanels = panels.map((panel, index) => ({ ...panel, id: `${id}-${panel.type}-${index}` }));
    updateState((current) => ({
      ...current,
      donors: current.donors.map((donor) => selectedProgram.donorIds.includes(donor.id)
        ? { ...donor, boardIds: [...new Set([...(donor.boardIds ?? []), id])] }
        : donor),
      boardPrograms: [...current.boardPrograms, { ...selectedProgram, id, name: `${selectedProgram.name} copy`, active: false, panels: clonedPanels }]
    }));
    setSelectedProgramId(id);
    setSelectedPanelId("");
  };

  const createProgram = () => {
    const id = `board-${Date.now()}`;
    const next = {
      ...selectedProgram,
      id,
      name: "Untitled board",
      active: false,
      donorIds: [],
      donorStyles: undefined,
      panels: []
    };
    updateState((current) => ({ ...current, boardPrograms: [...current.boardPrograms, next] }));
    setSelectedProgramId(id);
  };

  const deleteProgram = (programId: string) => {
    if (state.boardPrograms.length <= 1) return;
    const program = state.boardPrograms.find((item) => item.id === programId);
    if (!program) return;
    const remaining = state.boardPrograms.filter((item) => item.id !== program.id);
    updateState((current) => ({
      ...current,
      donors: current.donors.map((donor) => ({ ...donor, boardIds: (donor.boardIds ?? []).filter((id) => id !== program.id) })),
      boardPrograms: current.boardPrograms.filter((item) => item.id !== program.id),
      screens: Object.fromEntries(Object.entries(current.screens).map(([id, screen]) => [id, screen.boardProgramId === program.id ? { ...screen, boardProgramId: remaining[0]?.id } : screen])) as LanternState["screens"]
    }));
    setSelectedProgramId(remaining[0]?.id ?? "");
    setPendingProgramDeleteId(null);
  };

  const chooseBoardBackground = async (file?: File) => {
    if (!file || !selectedProgram) return;
    try {
      const backgroundImage = await uploadLanternAsset(file);
      void deleteLanternMedia(selectedProgram.backgroundMediaId);
      patchProgram({
        backgroundMode: "image",
        backgroundImage,
        backgroundMediaId: undefined,
        backgroundCrop: { scale: 1, x: 0, y: 0, rotation: 0 }
      });
    } catch {
      const mediaId = await storeLanternMedia(file);
      void deleteLanternMedia(selectedProgram.backgroundMediaId);
      patchProgram({
        backgroundMode: "image",
        backgroundImage: URL.createObjectURL(file),
        backgroundMediaId: mediaId,
        backgroundCrop: { scale: 1, x: 0, y: 0, rotation: 0 }
      });
    }
  };

  const removeBoardBackground = () => {
    if (!selectedProgram) return;
    void deleteLanternMedia(selectedProgram.backgroundMediaId);
    patchProgram({
      backgroundMode: "board",
      backgroundImage: undefined,
      backgroundMediaId: undefined,
      backgroundCrop: { scale: 1, x: 0, y: 0, rotation: 0 }
    });
  };

  const toggleProgramDonor = (donorId: string, checked: boolean) => {
    if (!selectedProgram) return;
    const donorIds = checked ? [...new Set([...selectedProgram.donorIds, donorId])] : selectedProgram.donorIds.filter((id) => id !== donorId);
    setProgramDonorIds(donorIds);
  };

  const setProgramDonorIds = (donorIds: string[]) => {
    if (!selectedProgram) return;
    const roster = new Set(donorIds);
    updateState((current) => ({
      ...current,
      donors: current.donors.map((donor) => ({
        ...donor,
        boardIds: roster.has(donor.id)
          ? [...new Set([...(donor.boardIds ?? []), selectedProgram.id])]
          : (donor.boardIds ?? []).filter((id) => id !== selectedProgram.id)
      })),
      boardPrograms: current.boardPrograms.map((program) => program.id === selectedProgram.id ? { ...program, donorIds } : program)
    }));
  };

  const patchBoardPresentation = (patch: Partial<BoardDonorPresentation>) => {
    patchProgram({ donorPresentation: { ...(selectedProgram.donorPresentation ?? {}), ...patch } });
  };

  const patchDonorPresentation = (donorId: string, patch: Partial<BoardDonorPresentation>) => {
    patchProgram({ donorStyles: patchBoardDonorStyle(selectedProgram, donorId, patch) });
  };

  const renameDonor = (donorId: string, name: string) => {
    updateState((current) => ({ ...current, donors: current.donors.map((donor) => donor.id === donorId ? { ...donor, name } : donor) }));
  };

  const saveBoard = async () => {
    setSaveStatus("saving");
    const persistence = await saveLanternStateDurably(state);
    publishState(state, { persist: false });
    if (persistence === "failed") {
      setSaveStatus("error");
      return;
    }
    if (!canWriteSharedLanternState()) {
      setSaveStatus("local");
      window.setTimeout(() => setSaveStatus("idle"), 2600);
      return;
    }
    try {
      await saveSharedLanternState(state);
      setSaveStatus("saved");
    } catch (error) {
      // The local save already succeeded, so keep the operator's edit safe and
      // accurately report that only the optional shared sync needs a retry.
      console.warn("Project Lantern saved this board locally but could not sync it.", error);
      setSaveStatus("local");
    }
    window.setTimeout(() => setSaveStatus("idle"), 2600);
  };

  const groupedBoardPrograms = [
    { label: "Supporter spotlights", programs: state.boardPrograms.filter((program) => program.templatePurpose === "story") },
    { label: "Honor rolls", programs: state.boardPrograms.filter((program) => program.templatePurpose === "roster" || program.templatePurpose === "level") },
    { label: "Program information", programs: state.boardPrograms.filter((program) => program.templatePurpose === "invitation") },
    { label: "Good deeds", programs: state.boardPrograms.filter((program) => program.templatePurpose === "good-deeds") },
    { label: "Custom boards", programs: state.boardPrograms.filter((program) => !program.templatePurpose) }
  ].filter((group) => group.programs.length);
  const selectedBoardGroup = groupedBoardPrograms.find((group) => group.programs.some((program) => program.id === selectedProgram?.id));
  const boardPickerName = (program: DonorBoardProgram) => program.name.replace(/\s*(?:·|-)\s*(?:portrait|landscape)\s*$/i, "").trim();
  const normalizedBoardSearch = boardSearch.trim().toLowerCase();
  const filteredBoardGroups = groupedBoardPrograms.map((group) => ({
    ...group,
    programs: group.programs.filter((program) => !normalizedBoardSearch
      || program.name.toLowerCase().includes(normalizedBoardSearch)
      || program.orientation.toLowerCase().includes(normalizedBoardSearch)
      || group.label.toLowerCase().includes(normalizedBoardSearch))
  })).filter((group) => group.programs.length);
  const selectedBackgroundCrop = selectedProgram?.backgroundCrop ?? { scale: 1, x: 0, y: 0, rotation: 0 };

  if (!selectedProgram) return <div className="empty-inspector"><strong>No boards available</strong></div>;

  return (
    <section className="board-builder">
      <div className="board-builder-toolbar">
        <div className="board-select-cluster">
          <details className="board-picker" ref={boardPickerRef} onToggle={(event) => { if (!(event.currentTarget as HTMLDetailsElement).open) setBoardSearch(""); }}>
            <summary aria-label={`Choose board. Current board: ${selectedProgram.name}`}>
              <span className="board-picker-label">Board</span>
              <span className="board-picker-current"><BoardOrientationIcon orientation={selectedProgram.orientation} /><span><strong>{boardPickerName(selectedProgram)}</strong><small>{selectedBoardGroup?.label ?? "Custom boards"} · {selectedProgram.orientation}</small></span></span>
              <ChevronDown size={16} />
            </summary>
            <div className="board-picker-popover">
              <label className="board-picker-search"><Search size={15} /><span className="sr-only">Search boards</span><input autoFocus value={boardSearch} onChange={(event) => setBoardSearch(event.target.value)} placeholder="Search boards or folders" /></label>
              <div className="board-picker-groups">
                {filteredBoardGroups.map((group) => <section className="board-picker-group" key={group.label}>
                  <header><Folder size={14} /><strong>{group.label}</strong><span>{group.programs.length}</span></header>
                  {group.programs.map((program) => <button type="button" className={program.id === selectedProgram.id ? "selected board-picker-option" : "board-picker-option"} aria-current={program.id === selectedProgram.id ? "true" : undefined} key={program.id} onClick={() => { setSelectedProgramId(program.id); boardPickerRef.current?.removeAttribute("open"); }}><BoardOrientationIcon orientation={program.orientation} /><span>{boardPickerName(program)}</span><small>{program.orientation}</small></button>)}
                </section>)}
                {!filteredBoardGroups.length && <div className="board-picker-empty"><Search size={18} /><span>No boards match “{boardSearch}”.</span></div>}
              </div>
            </div>
          </details>
          <details className="board-toolbar-menu">
            <summary className="command-button secondary compact"><SlidersHorizontal size={15} /> Board actions <ChevronDown size={14} /></summary>
            <div className="board-toolbar-popover">
              <button type="button" onClick={duplicateProgram}><ClipboardCopy size={15} /> Make a copy</button>
              <button type="button" onClick={createProgram}><Plus size={15} /> New blank board</button>
              <button type="button" className="danger" onClick={() => setPendingProgramDeleteId(selectedProgram.id)} disabled={state.boardPrograms.length <= 1}><Trash2 size={15} /> Delete board</button>
            </div>
          </details>
        </div>
        <div className="board-save-cluster">
          <button type="button" className="command-button primary compact" disabled={saveStatus === "saving"} onClick={() => void saveBoard()}><Save size={16} /> {saveStatus === "saving" ? "Saving…" : "Save board"}</button>
          <span className={`board-save-status ${saveStatus}`} role="status">{saveStatus === "saved" ? "Saved for everyone" : saveStatus === "local" ? "Saved on this device" : saveStatus === "error" ? "Could not save locally — check browser storage" : ""}</span>
        </div>
      </div>

      <div className="board-builder-workspace">
        <main className="direct-board-stage" onPointerDown={(event) => {
          if (!(event.target as Element).closest(".direct-board-canvas")) setSelectedPanelId("");
        }}>
          <div className="board-stage-meta"><span><strong>{selectedProgram.name}</strong> · Click any panel or text to edit</span></div>
          <DirectBoardCanvas
            state={state}
            display={boardDisplay}
            program={selectedProgram}
            panels={panels}
            selectedPanelId={selectedPanel?.id ?? ""}
            selectedPanelIds={selectedPanelIds}
            onSelect={(id, additive) => { setSelectedPanelId(id); setSelectedPanelIds((current) => additive ? (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) : [id]); }}
            onPatch={patchPanel}
            onRemove={requestRemovePanel}
            onRenameDonor={renameDonor}
            placingPanelType={placingPanelType}
            onBeginPlace={setPlacingPanelType}
            onAdd={addPanel}
            widgets={state.widgets ?? []}
            onAddWidget={addWidget}
            onSaveWidget={saveWidget}
            editorZoom={boardEditorZoom}
            editorPan={boardEditorPan}
          />
          <div className="board-editor-view-controls" aria-label="Board editor view controls">
            <div className="board-editor-zoom-controls"><button type="button" onClick={() => setBoardEditorZoom((value) => clamp(value - .15, .75, 2.4))} title="Zoom out" aria-label="Zoom out"><ZoomOut size={15} /></button><button type="button" className="board-editor-zoom-value" onClick={() => { setBoardEditorZoom(1); setBoardEditorPan({ x: 0, y: 0 }); }} title="Reset zoom and pan">{Math.round(boardEditorZoom * 100)}%</button><button type="button" onClick={() => setBoardEditorZoom((value) => clamp(value + .15, .75, 2.4))} title="Zoom in" aria-label="Zoom in"><ZoomIn size={15} /></button></div>
            <div className="board-editor-pan-controls" aria-label="Pan board view"><span /><button type="button" onClick={() => setBoardEditorPan((value) => ({ ...value, y: value.y + 44 }))} title="Pan up" aria-label="Pan up"><ChevronUp size={15} /></button><span /><button type="button" onClick={() => setBoardEditorPan((value) => ({ ...value, x: value.x + 44 }))} title="Pan left" aria-label="Pan left"><ChevronLeft size={15} /></button><button type="button" onClick={() => { setBoardEditorZoom(1); setBoardEditorPan({ x: 0, y: 0 }); }} title="Reset board view" aria-label="Reset board view"><RotateCcw size={14} /></button><button type="button" onClick={() => setBoardEditorPan((value) => ({ ...value, x: value.x - 44 }))} title="Pan right" aria-label="Pan right"><ChevronRight size={15} /></button><span /><button type="button" onClick={() => setBoardEditorPan((value) => ({ ...value, y: value.y - 44 }))} title="Pan down" aria-label="Pan down"><ChevronDown size={15} /></button><span /></div>
          </div>
        </main>

        <aside className="board-panel-inspector">
          <div className="inspector-sticky-head">
            <div className="inspector-title-block"><p className="eyebrow">{selectedPanel ? "Selected element" : "Board settings"}</p><h2>{selectedPanel ? boardPanelLabel(selectedPanel.type) : "Edit this board"}</h2><label className="board-element-picker"><span className="sr-only">Choose board element</span><select value={selectedPanel?.id ?? ""} onChange={(event) => { setSelectedPanelId(event.target.value); setSelectedPanelIds(event.target.value ? [event.target.value] : []); }}><option value="">Board settings</option>{panels.map((panel, index) => <option value={panel.id} key={panel.id}>{index + 1}. {boardPanelLabel(panel.type)}{panel.title ? ` · ${panel.title.slice(0, 28)}` : ""}</option>)}</select></label></div>
            <div className="panel-icon-actions">
              <details className="board-add-menu">
                <summary className="command-button secondary compact"><Plus size={15} /> Add content</summary>
                <div className="board-add-popover">
                  <label><span>Content type</span><select value={newPanelType} onChange={(event) => setNewPanelType(event.target.value as BoardPanelType)}>{boardPanelTypes.map((type) => <option value={type} key={type}>{boardPanelLabel(type)}</option>)}</select></label>
                  <button type="button" onClick={() => addPanel(newPanelType)}><Plus size={14} /> Add to center</button>
                  <button type="button" onClick={() => setPlacingPanelType(newPanelType)}><Move size={14} /> Place on board</button>
                </div>
              </details>
              {selectedPanel && <button type="button" className="command-button secondary compact" onClick={copySelectedPanel} title="Copy the selected panel so it can be pasted onto another board"><ClipboardCopy size={15} /> Copy</button>}
              <button type="button" className="command-button secondary compact" disabled={!panelClipboard} onClick={pastePanel} title={panelClipboard ? "Paste the copied panel onto this board" : "Copy a panel first"}><Plus size={15} /> Paste</button>
              {selectedPanel && <button type="button" className="icon-button" title="Return to board settings" aria-label="Return to board settings" onClick={() => { setSelectedPanelId(""); setSelectedPanelIds([]); }}><X size={16} /></button>}
            </div>
          </div>
          <div className="board-inspector-scroll">
            {selectedPanel ? <div className="inspector-block">
              <section className="inspector-primary-section">
                <header><strong>Content</strong><small>Edit here or click text directly on the board.</small></header>
                {selectedPanel.type === "text" && <label className="field"><span>Text <InfoDot text="Use line breaks to arrange all copy inside this one text panel." /></span><textarea rows={7} value={selectedPanel.title} onChange={(event) => patchPanel(selectedPanel.id, { title: event.target.value })} /></label>}
                {selectedPanel.type === "image" && <><label className="command-button secondary compact image-upload-button"><Upload size={15} /> {selectedPanel.imageUrl ? "Replace image" : "Choose PNG or image"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void readSharedImageFile(file, (imageUrl) => patchPanel(selectedPanel.id, { imageUrl })); }} /></label><LabeledSelect label="Image fit" info="Contain keeps the whole image visible; cover fills the element." value={selectedPanel.imageFit ?? "contain"} options={["contain", "cover"]} optionLabels={{ contain: "Contain", cover: "Cover" }} onChange={(imageFit) => patchPanel(selectedPanel.id, { imageFit: imageFit as BoardPanel["imageFit"] })} /></>}
              </section>
              {selectedPanel.type === "donors" && <>
                <div className="field"><span>Names in each row</span><SegmentedControl value={String(selectedPanel.columns ?? selectedProgram.columns)} options={[["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]]} onChange={(value) => patchPanel(selectedPanel.id, { columns: Number(value) as BoardPanel["columns"] })} /></div>
                <div className="field panel-tier-filter"><span>Show recognition levels <InfoDot text="Level filters update automatically when a donor's pledge level changes." /></span><div><button type="button" className={!selectedPanel.donorTierFilter?.length ? "selected" : ""} aria-pressed={!selectedPanel.donorTierFilter?.length} onClick={() => patchPanel(selectedPanel.id, { donorTierFilter: undefined })}>All levels</button>{state.recognitionSettings.tiers.map((tier) => { const selected = selectedPanel.donorTierFilter?.includes(tier) ?? false; return <button type="button" className={selected ? "selected" : ""} aria-pressed={selected} key={tier} onClick={() => { const current = selectedPanel.donorTierFilter ?? []; const next = selected ? current.filter((item) => item !== tier) : [...current, tier]; patchPanel(selectedPanel.id, { donorTierFilter: next.length ? next : undefined }); }}>{tier}</button>; })}</div></div>
                <details className="inspector-details roster-details">
                  <summary>Choose board roster <span>{selectedProgram.donorIds.length} selected</span></summary>
                  <div className="inspector-block">
                    <LabeledInput label="Find a supporter" info="Search the museum's supporter list." value={donorSearch} onChange={setDonorSearch} />
                    <p className="field-note">Roster membership applies to every donor-list element on this board.</p>
                    <div className="mini-actions"><button type="button" onClick={() => setProgramDonorIds(state.donors.filter((donor) => donor.active).map((donor) => donor.id))}>Use all active</button><button type="button" onClick={() => setProgramDonorIds([])}>Clear roster</button></div>
                    <div className="board-donor-picker compact-picker">{donorPageItems.map((donor) => <label key={donor.id}><input type="checkbox" checked={selectedProgram.donorIds.includes(donor.id)} onChange={(event) => toggleProgramDonor(donor.id, event.target.checked)} /><span>{donor.name}</span></label>)}{!donorPageItems.length && <p className="field-note">No supporters match “{donorSearch}”.</p>}</div>
                    <Pager page={donorPage} pageCount={donorPageCount} onChange={setDonorPage} />
                  </div>
                </details>
                <details className="inspector-details">
                  <summary>Lines & capacity</summary>
                  <div className="inspector-block">
                    <Slider label="Rows" info="Sets how many donor rows fit inside this element." value={selectedPanel.rows ?? Math.max(1, Math.ceil(selectedProgram.donorIds.length / (selectedPanel.columns ?? selectedProgram.columns)))} min={1} max={12} onChange={(rows) => patchPanel(selectedPanel.id, { rows })} />
                    <div className="donor-divider-controls"><div className="two-col"><Slider label="Line thickness" info="Choose 0 to hide divider lines." value={selectedPanel.donorDividerThickness ?? 1} min={0} max={6} onChange={(donorDividerThickness) => patchPanel(selectedPanel.id, { donorDividerThickness })} /><Slider label="Line visibility" info="Sets how faint or strong divider lines appear." value={selectedPanel.donorDividerOpacity ?? 18} min={0} max={100} onChange={(donorDividerOpacity) => patchPanel(selectedPanel.id, { donorDividerOpacity })} /></div><ColorOverrideField label="Line color" value={selectedPanel.donorDividerColor} fallback="#D9A657" onChange={(donorDividerColor) => patchPanel(selectedPanel.id, { donorDividerColor })} /></div>
                  </div>
                </details>
              </>}
              {selectedPanel.type !== "image" && <details className="inspector-details" open><summary>Typography</summary><div className="inspector-block"><LabeledSelect label="Element font" info="Typeface used only by this element." value={selectedPanel.fontFamily ?? selectedProgram.fontFamily ?? display.fontFamily ?? "Montserrat"} options={boardFontOptions} optionLabels={boardFontLabels} onChange={(fontFamily) => patchPanel(selectedPanel.id, { fontFamily: fontFamily as BoardPanel["fontFamily"] })} /><div className="panel-type-row"><TypographyNumberField label="Font size" info="Type a point size or use the arrows. It applies directly to this element." value={selectedPanel.fontSize ?? (selectedPanel.type === "donors" ? display.nameSize ?? 28 : 24)} min={4} max={240} suffix="px" onChange={(fontSize) => patchPanel(selectedPanel.id, { fontSize })} /><ColorOverrideField label="Font color" value={selectedPanel.textColor} fallback="#F5F2EB" onChange={(textColor) => patchPanel(selectedPanel.id, { textColor })} /></div><div className="typography-number-row"><TypographyNumberField label="Letter spacing" info="Extra space between letters." value={selectedPanel.letterSpacing ?? 0} min={-8} max={40} step={0.1} suffix="px" onChange={(letterSpacing) => patchPanel(selectedPanel.id, { letterSpacing })} /><TypographyNumberField label="Line spacing" info="Space from one line of text to the next." value={selectedPanel.lineHeight ?? 1.2} min={0.6} max={4} step={0.1} suffix="×" onChange={(lineHeight) => patchPanel(selectedPanel.id, { lineHeight })} /></div><div className="typography-toolbar" aria-label="Text formatting"><button type="button" className={selectedPanel.fontWeight === "bold" ? "active" : ""} aria-pressed={selectedPanel.fontWeight === "bold"} title="Bold" onClick={() => patchPanel(selectedPanel.id, { fontWeight: selectedPanel.fontWeight === "bold" ? "normal" : "bold" })}><strong>B</strong></button><button type="button" className={selectedPanel.fontStyle === "italic" ? "active" : ""} aria-pressed={selectedPanel.fontStyle === "italic"} title="Italic" onClick={() => patchPanel(selectedPanel.id, { fontStyle: selectedPanel.fontStyle === "italic" ? "normal" : "italic" })}><em>I</em></button><button type="button" className={selectedPanel.underline ? "active" : ""} aria-pressed={Boolean(selectedPanel.underline)} title="Underline" onClick={() => patchPanel(selectedPanel.id, { underline: !selectedPanel.underline })}><u>U</u></button><button type="button" className={selectedPanel.strikethrough ? "active" : ""} aria-pressed={Boolean(selectedPanel.strikethrough)} title="Strikethrough" onClick={() => patchPanel(selectedPanel.id, { strikethrough: !selectedPanel.strikethrough })}><s>S</s></button></div><div className="typography-choice-row"><div className="field"><span>Text alignment</span><SegmentedControl value={selectedPanel.textAlign ?? "center"} options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]} onChange={(textAlign) => patchPanel(selectedPanel.id, { textAlign: textAlign as BoardPanel["textAlign"] })} /></div><div className="field"><span>Text direction</span><SegmentedControl value={selectedPanel.textDirection ?? "horizontal"} options={[["horizontal", "Horizontal"], ["vertical", "Vertical"]]} onChange={(textDirection) => patchPanel(selectedPanel.id, { textDirection: textDirection as BoardPanel["textDirection"] })} /></div><div className="field"><span>Text arc</span><SegmentedControl value={selectedPanel.textArc ?? "none"} options={[["none", "Straight"], ["up", "Arc up"], ["down", "Arc down"]]} onChange={(textArc) => patchPanel(selectedPanel.id, { textArc: textArc as BoardPanel["textArc"] })} /></div></div></div></details>}
              <div className="panel-group-actions"><span>{selectedPanel.groupId ? "Grouped panels move together." : "Select two panels with Shift to group them."}</span>{selectedPanel.groupId ? <button type="button" onClick={() => ungroupPanel(selectedPanel)}>Ungroup</button> : <button type="button" disabled={selectedPanelIds.length < 2} onClick={groupSelectedPanels}>Group selected</button>}</div>
              <details className="inspector-details"><summary>Layout & position</summary><div className="inspector-block"><div className="panel-position-grid">{(["x", "y", "width", "height"] as const).map((field) => <label className="field" key={field}><span>{field === "width" ? "W" : field === "height" ? "H" : field.toUpperCase()} (%)</span><input type="number" min={field === "width" || field === "height" ? 4 : -50} max={field === "width" || field === "height" ? 150 : 100} step="0.5" value={Math.round((selectedPanel[field] ?? 0) * 10) / 10} onChange={(event) => { const value = Number(event.target.value); const isSize = field === "width" || field === "height"; const limit = field === "width" ? Math.min(150, 150 - (selectedPanel.x ?? 0)) : field === "height" ? Math.min(150, 150 - (selectedPanel.y ?? 0)) : 100; patchPanel(selectedPanel.id, { [field]: Math.max(isSize ? 4 : -50, Math.min(limit, value)) }); }} /></label>)}</div><small className="panel-position-note">Panels may extend beyond the board edge; anything outside the board stays clipped.</small><button type="button" className="command-button danger compact" disabled={panels.length === 1} onClick={(event) => requestRemovePanel(selectedPanel.id, { x: event.clientX, y: event.clientY })}><Trash2 size={14} /> Remove element</button></div></details>
            </div> : <>
            <details className="inspector-details" open><summary>Essentials</summary><div className="inspector-block">
              <LabeledInput label="Board name" info="Name used in schedules and display controls." value={selectedProgram.name} onChange={(name) => patchProgram({ name })} />
              <div className="field"><span>Format <InfoDot text="Saved with this board and applied when the board is assigned to a display." /></span><SegmentedControl value={selectedProgram.orientation} options={[["Portrait", "Portrait"], ["Landscape", "Landscape"]]} onChange={(orientation) => patchProgram({ orientation: orientation as DisplayProfile["orientation"] })} /></div>
              <LabeledSelect label="Board palette" info="A saved visitor-facing color system for this board." value={selectedProgram.palette ?? "classic"} options={["classic", "brigade-blue", "brigade-red", "brigade-sunshine", "brigade-cream", "legacy-navy", "legacy-sky"]} optionLabels={{ classic: "Lantern classic", "brigade-blue": "Brigade blue", "brigade-red": "Brigade red", "brigade-sunshine": "Brigade sunshine", "brigade-cream": "Brigade cream", "legacy-navy": "Legacy navy wall", "legacy-sky": "Legacy sky wall" }} onChange={(palette) => patchProgram({ palette: palette as DonorBoardProgram["palette"] })} />
              <LabeledSelect label="Board typeface" info="Default typeface for elements that do not use an override." value={selectedProgram.fontFamily ?? display.fontFamily ?? "Montserrat"} options={boardFontOptions} optionLabels={boardFontLabels} onChange={(fontFamily) => patchProgram({ fontFamily: fontFamily as DonorBoardProgram["fontFamily"] })} />
            </div></details>
            <details className="inspector-details"><summary>Background & frame</summary><div className="inspector-block">
              <label className="switch-row"><input type="checkbox" checked={selectedProgram.showFrame ?? display.showFrame ?? true} onChange={(event) => patchProgram({ showFrame: event.target.checked })} /><span>Show board frame</span></label>
              <div className="board-background-controls">
                <label className="command-button secondary compact image-upload-button"><ImagePlus size={15} /> {selectedProgram.backgroundImage ? "Replace board image" : "Add board image"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void chooseBoardBackground(event.target.files?.[0])} /></label>
                {selectedProgram.backgroundImage && <button type="button" className="command-button danger compact" onClick={removeBoardBackground}><Trash2 size={15} /> Use display background</button>}
              </div>
              {selectedProgram.backgroundImage && <>
                <Slider label="Background scale" info="Zoom the image saved with this board." value={Math.round(selectedBackgroundCrop.scale * 100)} min={50} max={300} onChange={(value) => patchProgram({ backgroundCrop: { ...selectedBackgroundCrop, scale: value / 100 } })} />
                <Slider label="Background pan X" info="Move the board image horizontally." value={selectedBackgroundCrop.x} min={-100} max={100} onChange={(x) => patchProgram({ backgroundCrop: { ...selectedBackgroundCrop, x } })} />
                <Slider label="Background pan Y" info="Move the board image vertically." value={selectedBackgroundCrop.y} min={-100} max={100} onChange={(y) => patchProgram({ backgroundCrop: { ...selectedBackgroundCrop, y } })} />
              </>}
              <p className="field-note">Board images are saved with this template and do not change other displays.</p>
            </div></details>
            <details className="inspector-details"><summary>Text treatment</summary><div className="inspector-block">
              <LabeledSelect label="Text finish" info="Cut brass adds a metallic face, beveled edge, and dimensional highlight." value={selectedProgram.textFinish ?? display.textFinish ?? "flat"} options={["flat", "cut-brass"]} optionLabels={{ flat: "Flat color", "cut-brass": "Cut-out brass" }} onChange={(textFinish) => patchProgram({ textFinish: textFinish as DisplayProfile["textFinish"] })} />
              <label className="switch-row"><input type="checkbox" checked={selectedProgram.textShadowEnabled ?? display.textShadowEnabled ?? false} onChange={(event) => patchProgram({ textShadowEnabled: event.target.checked })} /><span>Shadow under text</span></label>
              {(selectedProgram.textShadowEnabled ?? display.textShadowEnabled) && <>
                <Slider label="Shadow strength" info="Controls how dark and pronounced the text shadow appears." value={selectedProgram.textShadowStrength ?? display.textShadowStrength ?? 55} min={0} max={100} onChange={(textShadowStrength) => patchProgram({ textShadowStrength })} />
                <Slider label="Shadow angle" info="Sets the direction the shadow falls, in degrees." value={selectedProgram.textShadowAngle ?? display.textShadowAngle ?? 135} min={0} max={360} onChange={(textShadowAngle) => patchProgram({ textShadowAngle })} />
                <Slider label="Shadow distance" info="Sets how far the text appears lifted from the board." value={selectedProgram.textShadowDistance ?? display.textShadowDistance ?? 5} min={0} max={16} onChange={(textShadowDistance) => patchProgram({ textShadowDistance })} />
              </>}
            </div></details>
            <details className="inspector-details" open><summary>Donor presentation</summary><div className="inspector-block">
              <BoardDonorPresentationEditor
                program={selectedProgram}
                donors={selectedProgram.donorIds.map((donorId) => state.donors.find((donor) => donor.id === donorId)).filter((donor): donor is Donor => Boolean(donor))}
                fallbacks={{
                  fontFamily: selectedProgram.fontFamily ?? display.fontFamily ?? "Montserrat",
                  nameColor: boardPreviewPalette(selectedProgram.palette).text,
                  accentColor: boardPreviewPalette(selectedProgram.palette).accent
                }}
                fontOptions={boardFontOptions}
                fontLabels={boardFontLabels}
                iconsVisible={selectedProgram.showIcons ?? display.showIcons ?? false}
                onIconsVisibleChange={(showIcons) => patchProgram({ showIcons })}
                onPatchDefaults={patchBoardPresentation}
                onPatchDonor={patchDonorPresentation}
                onClearDefaults={() => patchProgram({ donorPresentation: undefined })}
                onClearDonor={(donorId) => patchProgram({ donorStyles: clearBoardDonorStyle(selectedProgram, donorId) })}
              />
              <p className="field-note">These settings belong only to this board. Donor profile data remains unchanged.</p>
            </div></details></>}
          </div>
        </aside>
      </div>
      {pendingProgramDelete && <LanternConfirmDialog eyebrow="Delete board template" title={`Delete “${pendingProgramDelete.name}”?`} description="This removes the reusable board and its board-specific presentation settings. Donor profiles remain available, and displays using this board move to the next available board." confirmLabel="Delete board" onCancel={() => setPendingProgramDeleteId(null)} onConfirm={() => deleteProgram(pendingProgramDelete.id)} />}
      {pendingPanelDelete && createPortal(<section className="panel-delete-confirm" style={{ left: pendingPanelDelete.x, top: pendingPanelDelete.y }} role="alertdialog" aria-label="Confirm element deletion"><strong>Remove {pendingPanelDelete.removed.length === 1 ? "this element" : `${pendingPanelDelete.removed.length} elements`}?</strong><span>You can restore it with Ctrl/Cmd+Z.</span><div><button type="button" onClick={() => setPendingPanelDelete(null)}>Cancel</button><button type="button" className="danger" onClick={confirmRemovePanel}>Remove</button></div></section>, document.body)}
    </section>
  );
}

function DashboardBlipControl({ blip, startedAt, onSetRemaining, onEnd }: {
  blip: LanternState["activeBlip"];
  startedAt: string;
  onSetRemaining: (minutes: number) => void;
  onEnd: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const totalSeconds = Math.max(1, Math.round(blip.durationMinutes * 60));
  const elapsedSeconds = Math.max(0, (now - Date.parse(startedAt)) / 1000);
  const remainingSeconds = Math.max(0, Math.ceil(totalSeconds - elapsedSeconds));
  const remainingMinutes = Math.max(.1, Math.ceil(remainingSeconds / 6) / 10);
  const [draftMinutes, setDraftMinutes] = useState(() => String(remainingMinutes));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setDraftMinutes(String(remainingMinutes));
  }, [blip.durationMinutes, startedAt]);

  const commitRemaining = () => {
    const next = Number(draftMinutes);
    if (!Number.isFinite(next) || next <= 0) {
      setDraftMinutes(String(remainingMinutes));
      return;
    }
    onSetRemaining(Math.min(1440, Math.max(.1, next)));
  };

  return <section className="dashboard-blip-control" style={{ "--dashboard-blip-accent": blip.accentColor, "--dashboard-blip-progress": `${Math.max(0, Math.min(1, remainingSeconds / totalSeconds)) * 360}deg` } as React.CSSProperties} aria-label={`Active Blip: ${blip.name}`}>
    <div className="dashboard-blip-ring" aria-label={`Blip active, ${formatCountdown(remainingSeconds)} remaining`}>
      <i aria-hidden="true" />
      <div><span>Blip active</span><strong>{formatCountdown(remainingSeconds)}</strong><small>remaining</small></div>
    </div>
    <label className="dashboard-blip-duration"><span>Time remaining</span><div><input type="number" min="0.1" max="1440" step="0.1" value={draftMinutes} onChange={(event) => setDraftMinutes(event.target.value)} onBlur={commitRemaining} onKeyDown={(event) => { if (event.key === "Enter") { event.currentTarget.blur(); } }} aria-label="Blip time remaining in minutes" /><b>min</b></div></label>
    <button type="button" className="command-button danger compact" onClick={onEnd}><Square size={14} /> End blip</button>
  </section>;
}

/** Keep bundled board assets working when the app is hosted below a repository path on GitHub Pages. */
function resolveProjectAssetUrl(value: string) {
  if (!value.startsWith("/")) return value;
  return `${import.meta.env.BASE_URL}${value.slice(1)}`;
}

function DirectBoardCanvas({
  state,
  display,
  program,
  panels,
  selectedPanelId,
  onSelect,
  onPatch,
  onRemove,
  onRenameDonor,
  placingPanelType,
  onBeginPlace,
  onAdd,
  editorZoom,
  editorPan
  ,selectedPanelIds = [], widgets = [], onAddWidget, onSaveWidget
}: {
  state: LanternState;
  display: DisplayProfile;
  program: LanternState["boardPrograms"][number];
  panels: BoardPanel[];
  selectedPanelId: string;
  onSelect: (id: string, additive?: boolean) => void;
  selectedPanelIds?: string[];
  onPatch: (id: string, patch: Partial<BoardPanel>) => void;
  onRemove: (id: string, position?: { x: number; y: number }) => void;
  onRenameDonor: (id: string, name: string) => void;
  placingPanelType: BoardPanelType | null;
  onBeginPlace: (type: BoardPanelType | null) => void;
  onAdd: (type?: BoardPanelType, position?: { x: number; y: number }) => void;
  editorZoom: number;
  editorPan: { x: number; y: number };
  widgets?: BoardWidget[]; onAddWidget?: (widget: BoardWidget) => void; onSaveWidget?: (name: string) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const manipulationRef = useRef<{ pointerId: number; moved: boolean; pending: Map<string, Partial<BoardPanel>> } | null>(null);
  const suppressPanelClickRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [widgetNamePromptOpen, setWidgetNamePromptOpen] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setContextMenu(null); onBeginPlace(null); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onBeginPlace]);
  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = (event: PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) setContextMenu(null);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [contextMenu]);
  const donors = program.donorIds
    .map((id) => state.donors.find((donor) => donor.id === id))
    .filter((donor): donor is Donor => Boolean(donor?.active));
  const palette = boardPreviewPalette(program.palette);
  const panelDonors = (panel: BoardPanel) => donors.filter((donor) =>
    (!panel.donorIds?.length || panel.donorIds.includes(donor.id))
    && (!panel.donorTierFilter?.length || panel.donorTierFilter.includes(donor.tier))
  );
  const commitText = (panel: BoardPanel, field: "eyebrow" | "title" | "body", value: string) => onPatch(panel.id, { [field]: value });
  const beginManipulation = (event: React.PointerEvent, panel: BoardPanel, mode: "move" | "resize", edge = "") => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(panel.id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const dragTarget = event.currentTarget as HTMLElement;
    dragTarget.setPointerCapture(event.pointerId);
    manipulationRef.current = { pointerId: event.pointerId, moved: false, pending: new Map() };
    const initial = { x: panel.x ?? 0, y: panel.y ?? 0, width: panel.width ?? 30, height: panel.height ?? 20 };
    const groupedPanels = mode === "move" && panel.groupId ? panels.filter((item) => item.groupId === panel.groupId) : [panel];
    const groupedInitial = new Map(groupedPanels.map((item) => [item.id, { x: item.x ?? 0, y: item.y ?? 0, width: item.width ?? 30, height: item.height ?? 20 }]));
    const move = (pointer: PointerEvent) => {
      if (manipulationRef.current?.pointerId !== pointer.pointerId) return;
      const dx = (pointer.clientX - startX) / rect.width * 100;
      const dy = (pointer.clientY - startY) / rect.height * 100;
      if (Math.abs(pointer.clientX - startX) > 2 || Math.abs(pointer.clientY - startY) > 2) manipulationRef.current.moved = true;
      const previewPatch = (item: BoardPanel, patch: Partial<BoardPanel>) => {
        manipulationRef.current?.pending.set(item.id, patch);
        const element = canvasRef.current?.querySelector<HTMLElement>(`[data-panel-id="${item.id}"]`);
        if (!element) return;
        if (patch.x !== undefined) element.style.left = `${patch.x}%`;
        if (patch.y !== undefined) element.style.top = `${patch.y}%`;
        if (patch.width !== undefined) element.style.width = `${patch.width}%`;
        if (patch.height !== undefined) element.style.height = `${patch.height}%`;
      };
      if (mode === "move") {
        groupedPanels.forEach((item) => {
          const origin = groupedInitial.get(item.id)!;
          previewPatch(item, { x: Math.max(-50, Math.min(100, origin.x + dx)), y: Math.max(-50, Math.min(100, origin.y + dy)) });
        });
        return;
      }
      let { x, y, width, height } = initial;
      if (edge.includes("e")) width = Math.max(4, Math.min(150 - x, initial.width + dx));
      if (edge.includes("s")) height = Math.max(4, Math.min(150 - y, initial.height + dy));
      if (edge.includes("w")) { const nextX = Math.max(-50, Math.min(initial.x + initial.width - 4, initial.x + dx)); width = initial.width + initial.x - nextX; x = nextX; }
      if (edge.includes("n")) { const nextY = Math.max(-50, Math.min(initial.y + initial.height - 4, initial.y + dy)); height = initial.height + initial.y - nextY; y = nextY; }
      previewPatch(panel, { x, y, width, height });
    };
    const stop = (pointer: PointerEvent) => {
      if (manipulationRef.current?.pointerId !== pointer.pointerId) return;
      const { moved, pending } = manipulationRef.current;
      manipulationRef.current = null;
      if (dragTarget.hasPointerCapture(pointer.pointerId)) dragTarget.releasePointerCapture(pointer.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      if (moved) {
        pending.forEach((patch, panelId) => onPatch(panelId, patch));
        suppressPanelClickRef.current = true;
        window.setTimeout(() => { suppressPanelClickRef.current = false; }, 0);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  const placePanel = (event: React.PointerEvent) => {
    if (!placingPanelType || !canvasRef.current || (event.target as Element).closest(".direct-board-panel, .board-context-menu")) return;
    const rect = canvasRef.current.getBoundingClientRect();
    onAdd(placingPanelType, { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 });
  };
  const boardBackgroundImage = program.backgroundMode === "image" && program.backgroundImage ? program.backgroundImage : display.backgroundImage;
  const boardBackgroundCrop = program.backgroundMode === "image" && program.backgroundImage ? program.backgroundCrop ?? display.backgroundCrop : display.backgroundCrop;
  const backgroundScale = boardBackgroundCrop?.scale ?? 1;
  const particleCount = display.particleCount ?? 34;
  const shadowRadians = (program.textShadowAngle ?? display.textShadowAngle ?? 135) * Math.PI / 180;
  const shadowDistance = program.textShadowDistance ?? display.textShadowDistance ?? 5;
  const prioritizeMoveHandle = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest(".panel-move-handle")) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const candidate = [...panels].reverse().find((panel) => {
      const left = rect.left + ((panel.x ?? 5) / 100) * rect.width;
      const top = rect.top + ((panel.y ?? 5) / 100) * rect.height;
      const bottom = rect.top + (((panel.y ?? 5) + (panel.height ?? 18)) / 100) * rect.height;
      const handleTop = (panel.y ?? 5) < 8 ? bottom + 4 : top - 26;
      return event.clientX >= left && event.clientX <= left + 22 && event.clientY >= handleTop && event.clientY <= handleTop + 22;
    });
    if (candidate && !(event.target as Element).closest(`[data-panel-id="${candidate.id}"] .panel-move-handle`)) beginManipulation(event, candidate, "move");
  };
  return <div ref={canvasRef} className={`direct-board-canvas ${display.orientation.toLowerCase()} ${state.board.visualStyle} palette-${program.palette ?? "classic"}${(program.showFrame ?? display.showFrame) === false ? " no-frame" : ""}${placingPanelType ? " placing-panel" : ""}${(program.textFinish ?? display.textFinish) === "cut-brass" ? " finish-cut-brass" : ""}${(program.textShadowEnabled ?? display.textShadowEnabled) ? " text-shadow-enabled" : ""}`} style={{
    fontFamily: program.fontFamily ?? display.fontFamily ?? "Montserrat",
    "--board-editor-zoom": editorZoom,
    "--board-editor-pan-x": `${editorPan.x}px`,
    "--board-editor-pan-y": `${editorPan.y}px`,
    "--board-palette-text": palette.text,
    "--board-palette-accent": palette.accent,
    "--board-palette-secondary": palette.secondary,
    "--board-palette-muted": palette.muted,
    "--board-text-shadow-x": `${Math.cos(shadowRadians) * shadowDistance}px`,
    "--board-text-shadow-y": `${Math.sin(shadowRadians) * shadowDistance}px`,
    "--board-text-shadow-blur": `${1 + (program.textShadowStrength ?? display.textShadowStrength ?? 55) / 28}px`,
    "--board-text-shadow-alpha": Math.min(.62, .1 + (program.textShadowStrength ?? display.textShadowStrength ?? 55) / 165)
  } as React.CSSProperties} onPointerDownCapture={prioritizeMoveHandle} onPointerDown={(event) => { if (!placingPanelType && !(event.target as Element).closest(".direct-board-panel, .board-context-menu")) onSelect(""); placePanel(event); }} onContextMenu={(event) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setContextMenu({ x: Math.max(6, Math.min(event.clientX - rect.left, rect.width - 168)), y: Math.max(6, Math.min(event.clientY - rect.top, rect.height - 286)) }); }}>
    {boardBackgroundImage && <div className="direct-board-background"><img src={resolveProjectAssetUrl(boardBackgroundImage)} alt="" style={{ width: `${backgroundScale * 100}%`, height: `${backgroundScale * 100}%`, objectPosition: `${boardBackgroundCrop?.x ?? 50}% ${boardBackgroundCrop?.y ?? 50}%` }} /></div>}
    {display.particleAnimationEnabled && <div className={`board-particles particles-${display.particleColorStyle ?? "warm"} drift-${display.particleDriftDirection ?? "natural"}`} style={{ "--particle-speed": `${display.particleLifetime ?? Math.max(7, 24 - (display.particleDriftSpeed ?? 4) * 1.45)}s`, "--particle-gravity": display.particleGravity ?? 3 } as React.CSSProperties}>{Array.from({ length: particleCount }, (_, index) => {
      const scatter = (salt: number) => ((Math.sin((index + 1) * salt) * 10000) % 1 + 1) % 1;
      const spread = (display.particleSpread ?? 100) / 100;
      const size = display.particleSize ?? 3;
      const lifetime = display.particleLifetime ?? 12;
      return <i key={index} style={{
        "--particle-x": `${50 + (scatter(12.9898) - 0.5) * spread * 100}%`,
        "--particle-y": `${50 + (scatter(78.233) - 0.5) * spread * 100}%`,
        "--particle-size": `${Math.max(0.5, size * (0.45 + scatter(39.346)))}px`,
        "--particle-depth": 0.32 + scatter(93.184) * 0.68,
        "--particle-duration": `${Math.max(1, lifetime + (scatter(17.719) - 0.5) * (display.particleLifetimeRange ?? 4))}s`,
        "--particle-delay": `${-scatter(63.726) * 24}s`,
        "--particle-wander": `${(display.particleWander ?? 5) * (2 + scatter(44.123) * 7)}px`,
        "--particle-lift": `${10 + scatter(28.417) * 34}px`,
        "--particle-phase": scatter(54.531) > 0.5 ? 1 : -1
      } as React.CSSProperties} />;
    })}</div>}
    <div className="direct-board-inner">
      {panels.map((panel, index) => <section key={panel.id} data-panel-id={panel.id} data-text-align={panel.textAlign ?? "center"} data-text-direction={panel.textDirection ?? "horizontal"} data-text-arc={panel.textArc ?? "none"} className={`direct-board-panel panel-${panel.type} panel-${panel.size}${panel.id === selectedPanelId ? " selected" : ""}${(panel.y ?? index * 20 + 5) < 8 ? " panel-tools-below" : ""}`} style={{
        left: `${panel.x ?? 5}%`,
        top: `${panel.y ?? index * 20 + 5}%`,
        width: `${panel.width ?? 90}%`,
        height: `${panel.height ?? 18}%`,
        zIndex: panel.id === selectedPanelId ? panels.length + 20 : index + 2,
        textAlign: panel.textAlign ?? "center",
        fontFamily: panel.fontFamily ?? program.fontFamily ?? display.fontFamily ?? "Montserrat",
        "--panel-text-color": panel.textColor ?? (panel.type === "supporters-heading" || panel.type === "footer" ? palette.accent : panel.type === "message" || panel.type === "story" ? palette.text : palette.text),
        "--panel-font-size": `${panel.fontSize ?? (panel.type === "heading" ? 32 : panel.type === "donors" ? display.nameSize ?? 28 : 24)}px`,
        "--panel-base-font-size": `${panel.fontSize ?? (panel.type === "heading" ? 32 : panel.type === "donors" ? display.nameSize ?? 28 : 24)}px`,
        "--panel-letter-spacing": `${panel.letterSpacing ?? 0}px`,
        "--panel-line-height": panel.lineHeight ?? 1.2,
        "--panel-font-weight": panel.fontWeight === "bold" ? 700 : 400,
        "--panel-font-style": panel.fontStyle ?? "normal",
        "--panel-text-decoration": `${panel.underline ? "underline" : ""}${panel.underline && panel.strikethrough ? " " : ""}${panel.strikethrough ? "line-through" : ""}` || "none",
        "--donor-name-size": `${panel.fontSize ?? display.nameSize ?? 28}px`,
        "--donor-divider-color": panel.donorDividerColor ?? palette.accent,
        "--donor-divider-thickness": `${panel.donorDividerThickness ?? 1}px`,
        "--donor-divider-opacity": `${panel.donorDividerOpacity ?? 18}%`
      } as React.CSSProperties} onClick={(event) => { if (suppressPanelClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressPanelClickRef.current = false; return; } event.stopPropagation(); onSelect(panel.id, event.shiftKey); }}>
        <button type="button" className="panel-move-handle" title="Drag to move panel" aria-label="Drag to move panel" onPointerDown={(event) => beginManipulation(event, panel, "move")}><Move size={16} /></button>
        <button type="button" className="panel-remove-handle" title="Remove panel" aria-label="Remove panel" disabled={panels.length === 1} onClick={(event) => { event.stopPropagation(); onRemove(panel.id, { x: event.clientX, y: event.clientY }); }}><Trash2 size={15} /></button>
        {["n", "ne", "e", "se", "s", "sw", "w", "nw"].map((edge) => <span key={edge} className={`panel-resize-handle resize-${edge}`} onPointerDown={(event) => beginManipulation(event, panel, "resize", edge)} />)}
        {panel.type === "text" && <AutoFitBoardContent className="direct-single-text-content"><EditableBoardText className="board-text" value={panel.title} multiline onCommit={(value) => commitText(panel, "title", value)} /></AutoFitBoardContent>}
        {panel.type === "heading" && <AutoFitBoardContent className="direct-single-text-content"><EditableBoardText className="board-title" value={panel.title} onCommit={(value) => commitText(panel, "title", value)} /></AutoFitBoardContent>}
        {panel.type === "supporters-heading" && <AutoFitBoardContent className="direct-single-text-content"><EditableBoardText className="board-section-title" value={panel.title} onCommit={(value) => commitText(panel, "title", value)} /></AutoFitBoardContent>}
        {panel.type === "donors" && <div className="direct-donor-grid" style={directDonorGridStyle(panelDonors(panel), panel.columns ?? program.columns, panel.rows, display)}>{panelDonors(panel).slice(0, (panel.rows ?? Math.max(1, Math.ceil(panelDonors(panel).length / (panel.columns ?? program.columns)))) * (panel.columns ?? program.columns)).map((donor) => <DirectBoardDonorName donor={donor} display={display} program={program} palette={palette} onRename={onRenameDonor} key={donor.id} />)}{!panelDonors(panel).length && <button className="empty-board-action" type="button">Select donors or recognition levels in the inspector</button>}</div>}
        {panel.type === "message" && <AutoFitBoardContent className="direct-message-content"><EditableBoardText className="board-eyebrow" value={panel.eyebrow ?? ""} onCommit={(value) => commitText(panel, "eyebrow", value)} /><EditableBoardText className="board-message-title" value={panel.title} onCommit={(value) => commitText(panel, "title", value)} /><EditableBoardText className="board-copy" value={panel.body ?? ""} onCommit={(value) => commitText(panel, "body", value)} /></AutoFitBoardContent>}
        {panel.type === "story" && <><div className="direct-story-image" style={state.board.storyImageUrl ? { backgroundImage: `url(${state.board.storyImageUrl})` } : undefined}><ImageIcon size={22} /></div><AutoFitBoardContent className="direct-story-copy"><EditableBoardText className="board-eyebrow" value={panel.eyebrow ?? ""} onCommit={(value) => commitText(panel, "eyebrow", value)} /><EditableBoardText className="board-message-title" value={panel.title} onCommit={(value) => commitText(panel, "title", value)} /><EditableBoardText className="board-copy" value={panel.body ?? ""} onCommit={(value) => commitText(panel, "body", value)} /></AutoFitBoardContent></>}
        {panel.type === "image" && <div className={`direct-image-panel fit-${panel.imageFit ?? "contain"}`}>{panel.imageUrl ? <img src={resolveProjectAssetUrl(panel.imageUrl)} alt="" /> : <><ImagePlus size={28} /><span>Choose an image in the right menu</span></>}</div>}
        {panel.type === "donor-star" && <DirectStarDonorName donor={state.donors.find((donor) => donor.id === panel.donorId)} fallbackName={panel.title} imageUrl={panel.imageUrl} fontFamily={panel.fontFamily ?? program.fontFamily ?? display.fontFamily ?? "DM Sans"} fontSize={panel.fontSize ?? 14} textColor={panel.textColor ?? "#201708"} onRename={onRenameDonor} />}
        {panel.type === "footer" && <div className={`direct-footer-line icons-${panel.footerIconPlacement ?? "left"}`}><span /><span>♡</span><EditableBoardText value={panel.title} onCommit={(value) => commitText(panel, "title", value)} />{panel.footerIconPlacement === "both" && <span className="footer-heart">♡</span>}<span /></div>}
      </section>)}
    </div>
    {placingPanelType && <div className="placement-hint"><Plus size={14} /> Click where the {boardPanelLabel(placingPanelType).toLowerCase()} should go</div>}
    {contextMenu && <div ref={contextMenuRef} className="board-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}><strong>Add panel</strong>{boardPanelTypes.map((type) => <button key={type} type="button" onClick={() => { onBeginPlace(type); setContextMenu(null); }}>{boardPanelLabel(type)}</button>)}{widgets.map((widget) => <button key={widget.id} type="button" onClick={() => { onAddWidget?.(widget); setContextMenu(null); }}>{widget.name}</button>)}{selectedPanelIds.length > 1 && <button type="button" onClick={() => { setWidgetNamePromptOpen(true); setContextMenu(null); }}>Save selection as widget</button>}</div>}
    {widgetNamePromptOpen && <LanternTextPromptDialog eyebrow="Reusable board content" title="Save selection as a widget" description="The selected panels are copied into a reusable widget. The panels already on this board remain unchanged." label="Widget name" initialValue="Saved widget" submitLabel="Save widget" onCancel={() => setWidgetNamePromptOpen(false)} onSubmit={(name) => { onSaveWidget?.(name); setWidgetNamePromptOpen(false); }} />}
  </div>;
}

function directDonorGridStyle(donors: Donor[], columns: number, requestedRows: number | undefined, display: DisplayProfile): React.CSSProperties {
  const rowCount = requestedRows ?? Math.max(1, Math.ceil(donors.length / columns));
  const layout = buildDonorNameGridLayout(donors.map((donor) => ({
    name: donor.name,
    hasSubtext: donorSubtextVisibleForDisplay(display, donor.id) && Boolean(donor.subtext)
  })), columns, rowCount);
  return {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridTemplateRows: layout.rowUnits.map((units) => `${units}fr`).join(" "),
    "--donor-shared-size": `${Math.max(.65, 82 / layout.totalUnits)}cqh`,
    "--donor-column-cap": columns > 1 ? "3.5cqw" : "7.2cqw"
  } as React.CSSProperties;
}

function DirectBoardDonorName({ donor, display, program, palette, onRename }: {
  donor: Donor;
  display: DisplayProfile;
  program: DonorBoardProgram;
  palette: ReturnType<typeof boardPreviewPalette>;
  onRename: (donorId: string, name: string) => void;
}) {
  const presentation = resolveBoardDonorPresentation(program, donor.id, {
    fontFamily: program.fontFamily ?? display.fontFamily ?? "Montserrat",
    nameColor: palette.text,
    accentColor: palette.accent
  });
  const showIcon = (program.showIcons ?? display.showIcons) && presentation.recognitionIcon !== "none";
  return <div
    className={`direct-donor-name board-highlight-${presentation.highlight} board-animation-${presentation.animation}`}
    style={{
      "--board-donor-name": presentation.nameColor,
      "--board-donor-accent": presentation.accentColor,
      fontFamily: `${presentation.fontFamily}, sans-serif`
    } as React.CSSProperties}
  >
    {showIcon && (presentation.recognitionIconImage
      ? <img className="board-donor-custom-icon" src={presentation.recognitionIconImage} alt="" />
      : <span className="board-donor-preview-icon" aria-hidden="true">{recognitionIconGlyph(presentation.recognitionIcon)}</span>)}
    <EditableBoardText value={donor.name} animation={presentation.animation} multiline onCommit={(value) => onRename(donor.id, value)} />
    {donorSubtextVisibleForDisplay(display, donor.id) && donor.subtext && <small>{donor.subtext}</small>}
  </div>;
}

function DirectStarDonorName({ donor, fallbackName, imageUrl, fontFamily, fontSize, textColor, onRename }: {
  donor?: Donor;
  fallbackName: string;
  imageUrl?: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  onRename: (donorId: string, name: string) => void;
}) {
  const name = donor?.name ?? fallbackName;
  return <div className="direct-star-donor" style={{ "--star-donor-font-size": `${fontSize}px`, "--star-donor-color": textColor, fontFamily } as React.CSSProperties}>
    {imageUrl ? <img src={resolveProjectAssetUrl(imageUrl)} alt="" /> : <span className="direct-star-placeholder">★</span>}
    <EditableBoardText className="direct-star-donor-name" value={name} multiline onCommit={(value) => donor && onRename(donor.id, value)} />
  </div>;
}

function AutoFitBoardContent({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const originalSize = Number.parseFloat(getComputedStyle(element).getPropertyValue("--panel-base-font-size")) || 24;
        let scale = 1;
        const hasOverflow = () => {
          const textNodes = Array.from(element.querySelectorAll<HTMLElement>(".editable-board-text"));
          return element.scrollHeight > element.clientHeight + 1
            || element.scrollWidth > element.clientWidth + 1
            || textNodes.some((node) => node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1);
        };
        element.style.setProperty("--panel-font-size", `${originalSize}px`);
        while (scale > .48 && hasOverflow()) {
          scale = Math.max(.48, Number((scale - .04).toFixed(2)));
          element.style.setProperty("--panel-font-size", `${Math.max(8, originalSize * scale)}px`);
        }
      });
    };
    const resizeObserver = new ResizeObserver(fit);
    const mutationObserver = new MutationObserver(fit);
    resizeObserver.observe(element);
    mutationObserver.observe(element, { childList: true, characterData: true, subtree: true });
    fit();
    return () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); mutationObserver.disconnect(); };
  }, []);

  return <div ref={ref} className={className}>{children}</div>;
}

function EditableBoardText({ value, onCommit, className = "", animation, multiline = false }: { value: string; onCommit: (value: string) => void; className?: string; animation?: BoardDonorPresentation["animation"]; multiline?: boolean }) {
  const lines = multiline ? splitDonorNameLines(value) : [value];
  return <div className={`editable-board-text${multiline ? " multiline-donor-name" : ""} ${className}`} contentEditable suppressContentEditableWarning role="textbox" tabIndex={0} onFocus={(event) => { const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(event.currentTarget); selection?.removeAllRanges(); selection?.addRange(range); }} onBlur={(event) => { const text = event.currentTarget.innerText.replace(/\u00a0/g, " "); onCommit(multiline ? text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") : text.replace(/\s+/g, " ").trim()); }} onKeyDown={(event) => { if (event.key === "Enter" && !multiline) { event.preventDefault(); event.currentTarget.blur(); } }}>{lines.map((line, index) => <Fragment key={`${line}-${index}`}><span className="donor-name-line">{animation ? <AnimatedDonorName name={line} animation={animation} /> : line}</span>{index < lines.length - 1 && <br />}</Fragment>)}</div>;
}

function LegacyThemeStudio({
  state,
  selectedDisplayId,
  setSelectedDisplayId,
  updateState
}: {
  state: LanternState;
  selectedDisplayId: ScreenId;
  setSelectedDisplayId: (screenId: ScreenId) => void;
  updateState: (updater: (current: LanternState) => LanternState) => void;
}) {
  const display = state.screens[selectedDisplayId] ?? Object.values(state.screens)[0];
  const [selectedProgramId, setSelectedProgramId] = useState(() => display.boardProgramId ?? state.boardPrograms[0]?.id ?? "");
  const [setupTab, setSetupTab] = useState<"display" | "surface">("display");
  const [propertyTab, setPropertyTab] = useState<"content" | "design" | "story" | "names" | "media">("content");
  const [donorPage, setDonorPage] = useState(0);
  const selectedProgram = state.boardPrograms.find((program) => program.id === selectedProgramId) ?? state.boardPrograms[0];
  const programDonors = selectedProgram ? state.donors.filter((donor) => selectedProgram.donorIds.includes(donor.id)) : [];
  const displayDonorIds = selectedProgram?.donorIds ?? [];
  const liveProgramDonors = programDonors.filter((donor) => donor.active)
    .sort((a, b) => displayDonorIds.indexOf(a.id) - displayDonorIds.indexOf(b.id));
  const donorPageSize = 7;
  const donorPageCount = Math.max(1, Math.ceil(state.donors.length / donorPageSize));
  const donorPageItems = state.donors.slice(donorPage * donorPageSize, donorPage * donorPageSize + donorPageSize);

  const patchTheme = (patch: Partial<LanternTheme>) => {
    updateState((current) => ({ ...current, theme: { ...current.theme, ...patch } }));
  };

  const patchDisplay = (patch: Partial<DisplayProfile>) => {
    updateState((current) => ({
      ...current,
      screens: { ...current.screens, [display.id]: { ...current.screens[display.id], ...patch } }
    }));
  };

  const patchBoard = (patch: Partial<LanternState["board"]>) => {
    updateState((current) => ({ ...current, board: { ...current.board, ...patch } }));
  };

  const patchProgram = (patch: Partial<LanternState["boardPrograms"][number]>) => {
    if (!selectedProgram) return;
    updateState((current) => ({
      ...current,
      boardPrograms: current.boardPrograms.map((program) => (program.id === selectedProgram.id ? { ...program, ...patch } : program))
    }));
  };

  const toggleProgramDonor = (donorId: string, checked: boolean) => {
    if (!selectedProgram) return;
    patchProgram({ donorIds: checked ? [...new Set([...selectedProgram.donorIds, donorId])] : selectedProgram.donorIds.filter((id) => id !== donorId) });
  };

  const duplicateProgram = () => {
    if (!selectedProgram) return;
    const id = `board-${Date.now()}`;
    updateState((current) => ({
      ...current,
      boardPrograms: [
        ...current.boardPrograms,
        { ...selectedProgram, id, name: `${selectedProgram.name} copy`, active: false }
      ]
    }));
    setSelectedProgramId(id);
  };

  const useBoardOnDisplay = () => {
    if (!selectedProgram) return;
    updateState((current) => ({
      ...current,
      donors: current.donors.map((donor) =>
        selectedProgram.donorIds.includes(donor.id)
          ? { ...donor, displayIds: [...new Set([...(donor.displayIds ?? []), display.id])] }
          : donor
      ),
      screens: {
        ...current.screens,
        [display.id]: {
          ...current.screens[display.id],
          style: "donor-wall",
          boardProgramId: selectedProgram.id,
          orientation: selectedProgram.orientation,
          resolution: selectedProgram.orientation === "Portrait" ? "1080 x 1920" : "1920 x 1080",
          donorIds: [],
          donorRosterConfigured: false,
          customHeading: "",
          customSubheading: "",
          columns: undefined
        }
      }
    }));
  };

  const chooseMedia = async (file?: File) => {
    if (!file) return;
    const mediaType: DisplayProfile["backgroundMediaType"] = file.type.startsWith("video/") ? "video" : "image";
    if (mediaType === "image") {
      try {
        const backgroundImage = await uploadLanternAsset(file);
        void deleteLanternMedia(display.backgroundMediaId);
        patchDisplay({
          style: "donor-wall",
          backgroundMode: "image",
          backgroundImage,
          backgroundMediaId: undefined,
          backgroundMediaType: "image",
          backgroundMediaName: file.name,
          backgroundMediaAnimated: file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif"),
          backgroundCrop: { scale: 1, x: 0, y: 0, rotation: 0 }
        });
        return;
      } catch {
        // Retain the existing device-local media path while offline.
      }
    }
    const mediaId = await storeLanternMedia(file);
    void deleteLanternMedia(display.backgroundMediaId);
    patchDisplay({
      style: "donor-wall",
      backgroundMode: "image",
      backgroundImage: URL.createObjectURL(file),
      backgroundMediaId: mediaId,
      backgroundMediaType: mediaType,
      backgroundMediaName: file.name,
      backgroundMediaAnimated: mediaType === "video" || file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif"),
      backgroundCrop: { scale: 1, x: 0, y: 0, rotation: 0 }
    });
  };

  return (
    <section className="studio-layout">
      <aside className="studio-sidebar">
        <EditorTabs value={setupTab} options={[["display", "Display"], ["surface", "Surface"]]} onChange={(value) => setSetupTab(value as typeof setupTab)} />
        {setupTab === "display" ? <ControlGroup title="Display setup" icon={Settings2} info="Choose which physical display and board you are styling.">
          <DisplayPicker state={state} value={display.id} onChange={setSelectedDisplayId} />
          <SegmentedControl value={display.style} options={styleOptions} onChange={(value) => patchDisplay({ style: value as DisplayStyle })} />
          <LabeledSelect label="Board" info="Choose the donor board program to edit and preview." value={selectedProgram?.id ?? ""} options={state.boardPrograms.map((program) => program.id)} optionLabels={Object.fromEntries(state.boardPrograms.map((program) => [program.id, program.name]))} onChange={setSelectedProgramId} />
          <button type="button" className="inline-option-button" onClick={duplicateProgram} disabled={!selectedProgram}><Plus size={15} /> Duplicate board</button>
        </ControlGroup> : <>
          <ControlGroup title="Materials" icon={Palette} info="Controls the donor-wall material style only.">
            <LabeledSelect label="Material" info="The base surface used by the donor-wall style." value={state.theme.material} options={["Walnut", "Painted Maple", "Brushed Brass", "Deep Navy Enamel"]} onChange={(value) => patchTheme({ material: value as LanternTheme["material"] })} />
            <LabeledSelect label="Finish" info="Changes how shiny or matte the panel feels." value={state.theme.finish} options={["Satin", "Matte", "Soft Gloss"]} onChange={(value) => patchTheme({ finish: value as LanternTheme["finish"] })} />
            <Slider label="Grain" info="How visible the wood or surface texture is." value={state.theme.grain} onChange={(value) => patchTheme({ grain: value })} />
          </ControlGroup>
          <ControlGroup title="Lettering" icon={SlidersHorizontal} info="Controls how donor names are baked into the panel texture.">
            <LabeledSelect label="Style" info="Painted is flat, engraved sinks in, raised inlay catches more light." value={state.theme.lettering} options={["Engraved", "Painted", "Raised Inlay"]} onChange={(value) => patchTheme({ lettering: value as LanternTheme["lettering"] })} />
            <Slider label="Depth" info="The apparent depth of engraved or raised lettering." value={state.theme.letteringDepth} onChange={(value) => patchTheme({ letteringDepth: value })} />
          </ControlGroup>
        </>}
      </aside>

      <div className="studio-preview">
        <div className="studio-preview-bar">
          <div>
            <strong>{selectedProgram?.name ?? "No board selected"}</strong>
            <span>{programDonors.length} board names · {liveProgramDonors.length} live on {display.label}</span>
          </div>
          <button type="button" className="command-button secondary compact" onClick={useBoardOnDisplay} disabled={!selectedProgram}>
            <Monitor size={16} />
            Use on display
          </button>
        </div>
        <div className={`screen-preview ${orientationClass(display)}`}>
          <BabylonDonorWall state={state} screenId={display.id} previewProgramId={selectedProgram?.id} interactive />
        </div>
      </div>

      <aside className="properties-panel">
        <div className="panel-heading compact-heading">
          <div>
            <h2>Board properties</h2>
            <span className="muted">{display.orientation} · {display.resolution}</span>
          </div>
          <span className={selectedProgram?.active ? "state-dot active" : "state-dot"}>{selectedProgram?.active ? "Active" : "Draft"}</span>
        </div>
        <EditorTabs value={propertyTab} options={[["content", "Content"], ["design", "Design"], ["story", "Story"], ["names", "Names"], ["media", "Media"]]} onChange={(value) => setPropertyTab(value as typeof propertyTab)} />
        {propertyTab === "content" && <div className="property-tab-panel">
        <div className="editor-section-title">Program</div>
        <LabeledInput label="Board name" info="Name used in the schedule and control center." value={selectedProgram?.name ?? ""} onChange={(value) => patchProgram({ name: value })} />
        <label className="switch-row">
          <input type="checkbox" checked={selectedProgram?.active ?? false} onChange={(event) => patchProgram({ active: event.target.checked })} />
          <span>Available to schedules</span>
        </label>
        <div className="field"><span>Columns <InfoDot text="Choose a centered list or two balanced columns for this board." /></span><SegmentedControl value={String(selectedProgram?.columns ?? 1)} options={[["1", "1 column"], ["2", "2 columns"]]} onChange={(value) => patchProgram({ columns: Number(value) as 1 | 2 })} /></div>
        <LabeledInput label="Heading" info="Gold heading shown at the top of this board." value={selectedProgram?.heading ?? ""} onChange={(value) => patchProgram({ heading: value })} />
        <LabeledInput label="Title" info="Primary recognition title." value={selectedProgram?.subtitle ?? ""} onChange={(value) => patchProgram({ subtitle: value })} />
        <LabeledInput label="Supporting line" info="Short message below the title." value={selectedProgram?.description ?? ""} onChange={(value) => patchProgram({ description: value })} />
        <LabeledInput label="Footer" info="Closing gratitude line at the bottom of the board." value={selectedProgram?.footer ?? ""} onChange={(value) => patchProgram({ footer: value })} />
        </div>}

        {propertyTab === "design" && <div className="property-tab-panel">
        <div className="editor-section-title">Design</div>
        <LabeledSelect label="Board style" info="Choose the saved visual treatment used by the donor board." value={state.board.visualStyle} options={["chalkboard", "chalkboard-minimal", "gallery-plaque", "museum"]} optionLabels={{ chalkboard: "Chalkboard with dividers", "chalkboard-minimal": "Minimal chalkboard with dots", "gallery-plaque": "Gallery plaque", museum: "Museum information board" }} onChange={(value) => patchBoard({ visualStyle: value as LanternState["board"]["visualStyle"] })} />
        <LabeledSelect label="Donor font" info="Typeface used for donor names on this saved board." value={selectedProgram?.fontFamily ?? "Montserrat"} options={boardFontOptions} optionLabels={boardFontLabels} onChange={(value) => patchProgram({ fontFamily: value as DonorBoardProgram["fontFamily"] })} />
        <Slider label="Name size" info="Preferred donor-name size for this saved board." value={selectedProgram?.nameSize ?? 28} min={14} max={48} onChange={(value) => patchProgram({ nameSize: value })} />
        <Slider label="Layout scale" info="Makes donor text and spacing larger or smaller on this display." value={display.layoutScale} min={78} max={124} onChange={(value) => patchDisplay({ layoutScale: value })} />
        <Slider label="Brightness" info="Adjusts final brightness on this display without changing the theme." value={display.brightness} min={30} max={100} onChange={(value) => patchDisplay({ brightness: value })} />
        <label className="switch-row"><input type="checkbox" checked={selectedProgram?.showIcons ?? false} onChange={(event) => patchProgram({ showIcons: event.target.checked })} /><span>Show donor icons</span></label>
        <label className="switch-row"><input type="checkbox" checked={selectedProgram?.showSubtext ?? true} onChange={(event) => patchProgram({ showSubtext: event.target.checked })} /><span>Show donor subtext</span></label>
        <details className="board-presentation-advanced"><summary>Scrolling and background</summary><div className="property-tab-panel">
          <label className="switch-row"><input type="checkbox" checked={selectedProgram?.donorScrollEnabled ?? false} onChange={(event) => patchProgram({ donorScrollEnabled: event.target.checked })} /><span>Scrolling credits list</span></label>
          {(selectedProgram?.donorScrollEnabled ?? false) && <><div className="field"><span>Scroll direction</span><SegmentedControl value={selectedProgram?.donorScrollDirection ?? "vertical"} options={[["vertical", "Vertical"], ["horizontal", "Horizontal"]]} onChange={(value) => patchProgram({ donorScrollDirection: value as DonorBoardProgram["donorScrollDirection"] })} /></div><Slider label="Scroll speed" info="Speed of the continuous donor credits." value={selectedProgram?.donorScrollSpeed ?? 4} min={1} max={10} onChange={(value) => patchProgram({ donorScrollSpeed: value })} /></>}
          <div className="field"><span>Background</span><SegmentedControl value={selectedProgram?.backgroundMode ?? "board"} options={[["board", "Board"], ["image", "Image"]]} onChange={(value) => patchProgram({ backgroundMode: value as DonorBoardProgram["backgroundMode"] })} /></div>
        </div></details>

        </div>}

        {propertyTab === "story" && <div className="property-tab-panel">
        {display.orientation === "Landscape" && state.board.visualStyle === "museum" ? (
          <>
            <div className="editor-section-title">Feature story</div>
            <LabeledInput label="Hero heading" info="Primary segment of the landscape hero heading." value={state.board.landscapeHeadingPrimary} onChange={(value) => patchBoard({ landscapeHeadingPrimary: value })} />
            <LabeledInput label="Accent heading" info="Accent segment of the landscape hero heading." value={state.board.landscapeHeadingAccent} onChange={(value) => patchBoard({ landscapeHeadingAccent: value })} />
            <LabeledInput label="Hero subtitle" info="Supporting landscape headline." value={state.board.landscapeSubtitle} onChange={(value) => patchBoard({ landscapeSubtitle: value })} />
            <LabeledInput label="Story title" info="Headline for the featured story module." value={state.board.storyTitle} onChange={(value) => patchBoard({ storyTitle: value })} />
            <label className="field"><span>Story body</span><textarea value={state.board.storyBody} onChange={(event) => patchBoard({ storyBody: event.target.value })} /></label>
          </>
        ) : <div className="empty-inspector"><ImageIcon size={28} /><strong>Story layout unavailable</strong><span>Select a landscape display using the Museum information board style to edit its feature story.</span></div>}
        </div>}

        {propertyTab === "names" && <div className="property-tab-panel names-tab-panel">
        <div className="editor-section-title donor-section-heading">
          <span>Donors on board</span>
          <span>{programDonors.length}/{state.donors.length}</span>
        </div>
        <div className="mini-actions">
          <button type="button" onClick={() => patchProgram({ donorIds: state.donors.filter((donor) => donor.active).map((donor) => donor.id) })}>Select active</button>
          <button type="button" onClick={() => patchProgram({ donorIds: [] })}>Clear</button>
        </div>
        <div className="board-donor-picker">
          {donorPageItems.map((donor) => (
            <label key={donor.id}>
              <input type="checkbox" checked={selectedProgram?.donorIds.includes(donor.id) ?? false} onChange={(event) => toggleProgramDonor(donor.id, event.target.checked)} />
              <span>{donor.name}</span>
              {!donor.active && <small>Draft</small>}
            </label>
          ))}
        </div>
        <Pager page={donorPage} pageCount={donorPageCount} onChange={setDonorPage} />
        </div>}

        {propertyTab === "media" && <div className="property-tab-panel">
        <div className="editor-section-title">Background media</div>
        <MediaCropEditor display={display} patchDisplay={patchDisplay} chooseMedia={chooseMedia} />
        </div>}
      </aside>
    </section>
  );
}

function MediaCropEditor({
  display,
  patchDisplay,
  chooseMedia
}: {
  display: DisplayProfile;
  patchDisplay: (patch: Partial<DisplayProfile>) => void;
  chooseMedia: (file?: File) => void;
}) {
  const [draftCrop, setDraftCrop] = useState(display.backgroundCrop);
  const draftRef = useRef(display.backgroundCrop);
  const dragRef = useRef<{ clientX: number; clientY: number; crop: DisplayProfile["backgroundCrop"] } | null>(null);

  useEffect(() => {
    setDraftCrop(display.backgroundCrop);
    draftRef.current = display.backgroundCrop;
  }, [display.id, display.backgroundCrop]);

  const setCrop = (crop: DisplayProfile["backgroundCrop"], commit = true) => {
    draftRef.current = crop;
    setDraftCrop(crop);
    if (commit) patchDisplay({ backgroundCrop: crop });
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!display.backgroundImage) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { clientX: event.clientX, clientY: event.clientY, crop: draftRef.current };
  };

  const dragMedia = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const crop = {
      ...drag.crop,
      x: clamp(drag.crop.x + ((event.clientX - drag.clientX) / Math.max(bounds.width, 1)) * 100, -100, 100),
      y: clamp(drag.crop.y + ((event.clientY - drag.clientY) / Math.max(bounds.height, 1)) * 100, -100, 100)
    };
    setCrop(crop, false);
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    patchDisplay({ backgroundCrop: draftRef.current });
  };

  const zoomMedia = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!display.backgroundImage) return;
    event.preventDefault();
    event.stopPropagation();
    setCrop({ ...draftRef.current, scale: clamp(draftRef.current.scale + (event.deltaY > 0 ? -0.08 : 0.08), 0.5, 3) });
  };

  const mediaStyle = {
    transform: `translate(-50%, -50%) translate(${draftCrop.x}%, ${draftCrop.y}%) rotate(${draftCrop.rotation ?? 0}deg) scale(${draftCrop.scale})`
  };


  const removeMedia = () => {
    void deleteLanternMedia(display.backgroundMediaId);
    patchDisplay({
      style: "donor-wall",
      backgroundMode: "board",
      backgroundImage: undefined,
      backgroundMediaId: undefined,
      backgroundMediaType: undefined,
      backgroundMediaName: undefined,
      backgroundMediaAnimated: false,
      backgroundCrop: { scale: 1, x: 0, y: 0, rotation: 0 }
    });
  };

  return (
    <div className="media-editor">
      <label className="image-upload">
        <ImagePlus size={18} />
        <span>{display.backgroundImage ? "Replace media" : "Choose media"}</span>
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v,image/*,video/*" onChange={(event) => chooseMedia(event.target.files?.[0])} />
      </label>
      {display.backgroundImage && (
        <>
          <div className="media-file-row">
            <span title={display.backgroundMediaName}>{display.backgroundMediaName ?? (display.backgroundMediaType === "video" ? "Video background" : "Image background")}</span>
            <small>{display.backgroundMediaType === "video" ? "Movie" : display.backgroundMediaAnimated ? "Animated image" : "Image"}</small>
            <button type="button" className="icon-button danger-icon" onClick={removeMedia} title="Remove background media"><Trash2 size={16} /></button>
          </div>
          <div
            className={`crop-frame interactive ${orientationClass(display)}`}
            onPointerDown={startDrag}
            onPointerMove={dragMedia}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onWheel={zoomMedia}
            title="Drag to reposition. Use the mouse wheel to zoom."
          >
            {display.backgroundMediaType === "video" ? (
              <video src={display.backgroundImage} style={mediaStyle} autoPlay loop muted playsInline />
            ) : (
              <img src={display.backgroundImage} alt="Selected background crop" style={mediaStyle} draggable={false} />
            )}
            <div className="crop-grid" aria-hidden="true" />
          </div>
          <div className="media-transform-actions">
            <button type="button" className="icon-button" title="Rotate left 90 degrees" onClick={() => setCrop({ ...draftRef.current, rotation: (draftRef.current.rotation ?? 0) - 90 })}><RotateCcw size={16} /></button>
            <button type="button" className="icon-button" title="Rotate right 90 degrees" onClick={() => setCrop({ ...draftRef.current, rotation: (draftRef.current.rotation ?? 0) + 90 })}><RefreshCcw size={16} /></button>
            <button type="button" className="command-button secondary compact" onClick={() => setCrop({ scale: 1, x: 0, y: 0, rotation: 0 })}>Reset framing</button>
          </div>
          <Slider label="Zoom" info="Zoom the selected media inside the screen crop." value={Math.round(draftCrop.scale * 100)} min={50} max={300} onChange={(value) => setCrop({ ...draftRef.current, scale: value / 100 })} />
          <Slider label="Rotation" info="Rotate the selected media inside the screen crop." value={Math.round(draftCrop.rotation ?? 0)} min={-180} max={180} onChange={(value) => setCrop({ ...draftRef.current, rotation: value })} />
        </>
      )}
    </div>
  );
}

function AnnouncementsView({
  state,
  updateState,
  toggleAnnouncement
}: {
  state: LanternState;
  updateState: (updater: (current: LanternState) => LanternState) => void;
  toggleAnnouncement: () => void;
}) {
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(() => state.savedAnnouncements.some((item) => item.id === state.announcement.id) ? state.announcement.id : null);
  const [scheduleAnnouncementId, setScheduleAnnouncementId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scheduleEndDate, setScheduleEndDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().slice(0, 10);
  });
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleRecurrence, setScheduleRecurrence] = useState<"once" | "weekly">("once");
  const [scheduleDays, setScheduleDays] = useState<number[]>([new Date().getDay()]);
  const [deliveryScheduleOpen, setDeliveryScheduleOpen] = useState(false);
  const [scheduleHasEndDate, setScheduleHasEndDate] = useState(false);
  const [previewScreenId, setPreviewScreenId] = useState<ScreenId>(() => state.announcement.target === "all" ? firstDisplayId(state) : state.announcement.target);

  useEffect(() => {
    const openVisitorSchedule = (event: Event) => {
      const announcementId = (event as CustomEvent<string>).detail;
      if (!announcementId) return;
      setSelectedSavedId(announcementId);
      setScheduleAnnouncementId(announcementId);
    };
    window.addEventListener("lantern:schedule-announcement", openVisitorSchedule);
    return () => window.removeEventListener("lantern:schedule-announcement", openVisitorSchedule);
  }, []);

  const previewScreen = state.screens[previewScreenId] ?? Object.values(state.screens)[0];
  const selectedTargets = state.announcement.targets?.length ? state.announcement.targets : state.announcement.target === "all" ? Object.keys(state.screens) : [state.announcement.target];
  const previewLabel = state.announcement.target === "all"
    ? `All displays · previewing ${previewScreen.label}`
    : previewScreen.label;
  const isTicker = state.announcement.style === "News Ticker";
  const effectiveTimerPosition = isTicker && state.announcement.timerPosition === "announcement-right" ? "top-right" : state.announcement.timerPosition;
  const patchAnnouncement = (patch: Partial<LanternState["announcement"]>) => {
    updateState((current) => ({ ...current, announcement: { ...current.announcement, ...patch } }));
  };

  const toggleAnnouncementTarget = (screenId: ScreenId) => {
    const targets = selectedTargets.includes(screenId) ? selectedTargets.filter((id) => id !== screenId) : [...selectedTargets, screenId];
    if (!targets.length) return;
    patchAnnouncement({ targets, target: targets.length === Object.keys(state.screens).length ? "all" : targets[0] });
    if (!targets.includes(previewScreenId)) setPreviewScreenId(targets[0]);
  };

  const loadSavedAnnouncement = (id: string) => {
    const saved = state.savedAnnouncements.find((item) => item.id === id);
    if (!saved) return;
    setSelectedSavedId(id);
    updateState((current) => ({ ...current, announcement: { ...saved, active: false, startedAt: undefined } }));
  };

  const newAnnouncement = () => {
    const id = `announcement-${Date.now()}`;
    setSelectedSavedId(null);
    updateState((current) => ({
      ...current,
      announcement: {
        ...current.announcement,
        id,
        title: "Untitled announcement",
        message: "",
        active: false,
        startedAt: undefined
      }
    }));
  };

  const saveAnnouncement = () => {
    const id = selectedSavedId ?? state.announcement.id ?? `announcement-${Date.now()}`;
    const { active: _active, startedAt: _startedAt, ...saved } = { ...state.announcement, id };
    updateState((current) => {
      const exists = current.savedAnnouncements.some((item) => item.id === id);
      return {
        ...current,
        announcement: { ...current.announcement, id },
        savedAnnouncements: exists
          ? current.savedAnnouncements.map((item) => item.id === id ? saved : item)
          : [...current.savedAnnouncements, saved]
      };
    });
    setSelectedSavedId(id);
  };

  const deleteSavedAnnouncement = (announcementId = selectedSavedId) => {
    if (!announcementId) return;
    updateState((current) => {
      const remaining = current.savedAnnouncements.filter((item) => item.id !== announcementId);
      const next = remaining[0];
      return {
        ...current,
        savedAnnouncements: remaining,
        announcement: next
          ? { ...next, active: false, startedAt: undefined }
          : { ...current.announcement, id: `announcement-${Date.now()}`, title: "Untitled announcement", message: "", active: false, startedAt: undefined }
      };
    });
    const remaining = state.savedAnnouncements.filter((item) => item.id !== announcementId);
    setSelectedSavedId(remaining[0]?.id ?? null);
  };

  const duplicateSavedAnnouncement = (id: string) => {
    const source = state.savedAnnouncements.find((item) => item.id === id);
    if (!source) return;
    const copyId = `announcement-${Date.now()}`;
    const copy = { ...source, id: copyId, title: `${source.title || "Untitled announcement"} copy` };
    updateState((current) => ({
      ...current,
      savedAnnouncements: [...current.savedAnnouncements, copy],
      announcement: { ...copy, active: false, startedAt: undefined }
    }));
    setSelectedSavedId(copyId);
  };

  const addAnnouncementToCalendar = () => {
    const saved = state.savedAnnouncements.find((item) => item.id === scheduleAnnouncementId);
    if (!saved) return;
    const startMinutes = Number(scheduleTime.slice(0, 2)) * 60 + Number(scheduleTime.slice(3, 5));
    const duration = Math.max(1, saved.durationMinutes || 30);
    const endMinutes = Math.min(1439, startMinutes + duration);
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    const dateDay = new Date(`${scheduleDate}T12:00:00`).getDay();
    updateState((current) => ({
      ...current,
      schedules: [...current.schedules, {
        id: `schedule-${Date.now()}`,
        name: saved.title || "Scheduled announcement",
        target: saved.target,
        boardId: current.boardPrograms[0]?.id ?? "",
        contentType: "announcement",
        announcementId: saved.id,
        recurrence: scheduleRecurrence,
        scheduleDate: scheduleRecurrence === "once" ? scheduleDate : undefined,
        days: scheduleRecurrence === "once" ? [dateDay] : scheduleDays,
        startTime: scheduleTime,
        endTime,
        color: "#a95777",
        active: true
      }]
    }));
    setScheduleAnnouncementId(null);
  };

  const scheduleCurrentAnnouncement = () => {
    if (!scheduleDate || !scheduleTime || (scheduleRecurrence === "weekly" && !scheduleDays.length)) return;
    const announcementId = state.announcement.id || `announcement-${Date.now()}`;
    const { active: _active, startedAt: _startedAt, ...saved } = { ...state.announcement, id: announcementId };
    const startMinutes = timeToMinutes(scheduleTime);
    const duration = Math.max(1, state.announcement.durationMinutes || 30);
    const endTime = minutesToTime(Math.min(1439, startMinutes + duration));
    const dateDay = dateFromInputValue(scheduleDate).getDay();
    updateState((current) => {
      const savedAnnouncements = current.savedAnnouncements.some((item) => item.id === announcementId)
        ? current.savedAnnouncements.map((item) => item.id === announcementId ? saved : item)
        : [...current.savedAnnouncements, saved];
      return {
        ...current,
        announcement: { ...current.announcement, id: announcementId },
        savedAnnouncements,
        schedules: [...current.schedules, {
          id: `schedule-${Date.now()}`,
          name: saved.title || "Scheduled announcement",
          target: saved.target,
          boardId: current.boardPrograms[0]?.id ?? "",
          contentType: "announcement",
          announcementId,
          recurrence: scheduleRecurrence,
          scheduleDate,
          scheduleEndDate: scheduleRecurrence === "weekly" && scheduleHasEndDate ? scheduleEndDate : undefined,
          days: scheduleRecurrence === "once" ? [dateDay] : scheduleDays,
          startTime: scheduleTime,
          endTime,
          color: "#a95777",
          active: true
        }]
      };
    });
    setSelectedSavedId(announcementId);
    setDeliveryScheduleOpen(false);
  };

  const openAnnouncementDemo = () => {
    const isPortrait = previewScreen.orientation === "Portrait";
    const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    const popup = window.open(
      `${appUrl}#/announcement-demo/${previewScreen.id}`,
      "lantern-announcement-demo",
      `popup=yes,width=${isPortrait ? 620 : 1280},height=${isPortrait ? 940 : 760},left=90,top=50`
    );
    popup?.focus();
  };

  return (
    <section className="comms-workspace">
      <div className="workspace-tabbar"><span>Compose, save, schedule, and broadcast messages to your displays.</span></div>
      <div className="announcement-deck">
        <div className="form-panel announcement-form">
          <div className="panel-heading composer-heading"><div><p className="eyebrow">Message composer</p><h2>Create an announcement <InfoDot text="Short messages that temporarily appear on selected displays." /></h2><small>Write the message, choose where it appears, then preview or send it.</small></div>{state.announcement.active && <span className="state-dot active">Broadcasting</span>}</div>
          <section className="composer-section primary-section">
            <header><span>1</span><div><strong>Message</strong><small>Keep it short enough to read at a glance.</small></div></header>
            <div className="composer-message-grid"><LabeledInput label="Headline" info="Large headline shown on the announcement." value={state.announcement.title} onChange={(value) => patchAnnouncement({ title: value })} /><LabeledInput label="Supporting message" info="Supporting text below the headline." value={state.announcement.message} onChange={(value) => patchAnnouncement({ message: value })} /></div>
            <label className="field announcement-details-field"><span>Details <InfoDot text="Optional smaller text displayed in a bordered detail panel." /></span><textarea rows={4} value={state.announcement.details ?? ""} onChange={(event) => patchAnnouncement({ details: event.target.value })} placeholder="Add supporting details…" /></label>
            <div className="announcement-color-row"><ColorControl label="Text color" value={state.announcement.textColor ?? "#10131f"} onChange={(textColor) => patchAnnouncement({ textColor })} /><ColorControl label="Background" value={state.announcement.backgroundColor ?? "#f3efe0"} onChange={(backgroundColor) => patchAnnouncement({ backgroundColor })} /></div>
            {state.announcement.imageUrl && !isTicker && <div className="three-col compact-image-controls"><Slider label="Image X" info="Move the announcement image horizontally." value={state.announcement.imageX ?? 72} min={0} max={100} onChange={(imageX) => patchAnnouncement({ imageX })} /><Slider label="Image Y" info="Move the announcement image vertically." value={state.announcement.imageY ?? 50} min={0} max={100} onChange={(imageY) => patchAnnouncement({ imageY })} /><Slider label="Image size" info="Adjust the announcement image width." value={state.announcement.imageWidth ?? 22} min={5} max={70} onChange={(imageWidth) => patchAnnouncement({ imageWidth })} /></div>}
          </section>
          <section className="composer-section delivery-section">
            <header><span>3</span><div><strong>Delivery</strong><small>Choose the audience, layout, schedule, and how long it stays visible.</small></div></header>
            <div className="announcement-target-picker"><span>Send to</span>{Object.values(state.screens).map((screen) => <label key={screen.id}><input type="checkbox" checked={selectedTargets.includes(screen.id)} onChange={() => toggleAnnouncementTarget(screen.id)} />{screen.label}</label>)}</div>
            <div className="two-col">
              <LabeledSelect label="Layout" info="The announcement layout used on the display." value={state.announcement.style} options={["Ribbon", "Temporary Card", "Lower Third", "News Ticker"]} onChange={(value) => {
                const style = value as LanternState["announcement"]["style"];
                patchAnnouncement({
                  style,
                  layoutX: undefined,
                  layoutY: undefined,
                  layoutWidth: undefined,
                  ...(style === "News Ticker" && state.announcement.timerPosition === "announcement-right" ? { timerPosition: "top-right" as const } : {})
                });
              }} />
              <label className="field duration-field"><span>Show for <InfoDot text="Use 0 to keep it visible until someone ends it manually." /></span><div className="duration-input"><input aria-label="Announcement duration in minutes" type="number" min={0} max={1440} value={state.announcement.durationMinutes} onChange={(event) => patchAnnouncement({ durationMinutes: Number(event.target.value) || 0 })} /><b>min</b></div></label>
            </div>
            {isTicker && <div className="ticker-option-row">
              <LabeledSelect label="Ticker pace" info="Controls how quickly the announcement pans across the display." value={state.announcement.tickerSpeed ?? "standard"} options={["slow", "standard", "fast"]} optionLabels={{ slow: "Slow", standard: "Standard", fast: "Fast" }} onChange={(tickerSpeed) => patchAnnouncement({ tickerSpeed: tickerSpeed as NonNullable<LanternState["announcement"]["tickerSpeed"]> })} />
              <LabeledSelect label="Scroll direction" info="Choose which direction the news ticker travels." value={state.announcement.tickerDirection ?? "left"} options={["left", "right"]} optionLabels={{ left: "Right to left", right: "Left to right" }} onChange={(tickerDirection) => patchAnnouncement({ tickerDirection: tickerDirection as NonNullable<LanternState["announcement"]["tickerDirection"]> })} />
            </div>}
            <div className={`announcement-delivery-schedule${deliveryScheduleOpen ? " open" : ""}`}>
              <div className="announcement-delivery-schedule-head">
                <div><CalendarDays size={17} /><span><strong>When should it play?</strong><small>Add this announcement directly to the Schedule calendar.</small></span></div>
                <button type="button" className="command-button secondary compact" onClick={() => setDeliveryScheduleOpen((current) => !current)}>{deliveryScheduleOpen ? "Hide" : "Choose date"}</button>
              </div>
              {deliveryScheduleOpen && <div className="announcement-delivery-schedule-fields">
                <div className="two-col">
                  <label className="field calendar-input-field"><span>Play date</span><div><CalendarDays size={15} /><input type="date" aria-label="Announcement play date" value={scheduleDate} min={toDateInputValue(new Date())} onChange={(event) => setScheduleDate(event.target.value)} /></div></label>
                  <label className="field calendar-input-field"><span>Start time</span><div><Clock3 size={15} /><input type="time" aria-label="Announcement start time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} /></div></label>
                </div>
                <label className="switch-row"><input type="checkbox" checked={scheduleRecurrence === "weekly"} onChange={(event) => setScheduleRecurrence(event.target.checked ? "weekly" : "once")} /><span>Repeat every week</span></label>
                {scheduleRecurrence === "weekly" && <>
                  <div className="field"><span>Repeat on</span><div className="schedule-day-picker">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => <button type="button" key={day} className={scheduleDays.includes(index) ? "active" : ""} onClick={() => setScheduleDays((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])}>{day}</button>)}</div></div>
                  <label className="switch-row"><input type="checkbox" checked={scheduleHasEndDate} onChange={(event) => setScheduleHasEndDate(event.target.checked)} /><span>Use a date range</span></label>
                  {scheduleHasEndDate && <div className="two-col announcement-date-range">
                    <label className="field calendar-input-field"><span>Range starts</span><div><CalendarDays size={15} /><input type="date" aria-label="Announcement range start" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} /></div></label>
                    <label className="field calendar-input-field"><span>Range ends</span><div><CalendarDays size={15} /><input type="date" aria-label="Announcement range end" value={scheduleEndDate} min={scheduleDate} onChange={(event) => setScheduleEndDate(event.target.value)} /></div></label>
                  </div>}
                </>}
                <button type="button" className="command-button primary announcement-add-schedule" disabled={!scheduleDate || !scheduleTime || (scheduleRecurrence === "weekly" && (!scheduleDays.length || (scheduleHasEndDate && scheduleEndDate < scheduleDate)))} onClick={scheduleCurrentAnnouncement}><CalendarDays size={16} /> Add to schedule</button>
              </div>}
            </div>
            <div className="announcement-placement-controls">
              <div className="placement-control-heading"><span>Text box position</span><button type="button" onClick={() => patchAnnouncement({ layoutX: undefined, layoutY: undefined, layoutWidth: undefined })}><RotateCcw size={13} /> Use layout default</button></div>
              <div className="three-col">
                <Slider label="Text X" info="Horizontal center of the announcement text box." value={state.announcement.layoutX ?? 50} min={5} max={95} onChange={(layoutX) => patchAnnouncement({ layoutX })} />
                <Slider label="Text Y" info="Vertical center of the announcement text box." value={state.announcement.layoutY ?? (state.announcement.style === "Temporary Card" ? 50 : state.announcement.style === "News Ticker" ? 91 : 88)} min={5} max={95} onChange={(layoutY) => patchAnnouncement({ layoutY })} />
                <Slider label="Text width" info="Width of the draggable announcement text box." value={state.announcement.layoutWidth ?? (state.announcement.style === "News Ticker" ? 96 : state.announcement.style === "Ribbon" ? 90 : 78)} min={20} max={96} onChange={(layoutWidth) => patchAnnouncement({ layoutWidth })} />
              </div>
            </div>
          </section>
          <details className="composer-section optional-section">
            <summary><span>2</span><div><strong>Optional enhancements</strong><small>{isTicker ? "Countdown, sounds, and walk-on character" : "Image, countdown, sounds, and walk-on character"}</small></div><ChevronDown size={16} /></summary>
            <div className="optional-section-body">
              {!isTicker ? <div className="optional-image-control">
                <div><ImagePlus size={18} /><span><strong>Announcement image</strong><small>Add an optional PNG, JPG, GIF, or WebP to the message.</small></span></div>
                <label className="image-upload announcement-image-upload"><ImagePlus size={16} /><span>{state.announcement.imageUrl ? "Replace image" : "Add image"}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void readSharedImageFile(event.target.files?.[0], (imageUrl) => patchAnnouncement({ imageUrl, imageX: 72, imageY: 50, imageWidth: 22 }))} /></label>
                {state.announcement.imageUrl && <button type="button" className="icon-button danger-icon" onClick={() => patchAnnouncement({ imageUrl: undefined })} title="Remove announcement image"><Trash2 size={15} /></button>}
              </div> : <p className="ticker-image-note"><Megaphone size={16} /> News tickers keep the full width clear for readable moving text. Any saved announcement image is preserved and returns if you choose another layout.</p>}
              <div className="announcement-timer-controls">
                <LabeledSelect label="Countdown" info="Add a live countdown to the announcement." value={state.announcement.timerStyle} options={["off", "digital", "progress", "circular"]} optionLabels={{ off: "Off", digital: "Digital clock", progress: "Progress bar", circular: "Circular timer" }} onChange={(value) => patchAnnouncement({ timerStyle: value as LanternState["announcement"]["timerStyle"], ...(isTicker && state.announcement.timerPosition === "announcement-right" ? { timerPosition: "top-right" as const } : {}) })} />
                {state.announcement.timerStyle !== "off" && <><LabeledSelect label="Timer position" info={isTicker ? "Pin the timer to a screen corner so the ticker remains readable." : "Keep the timer beside the announcement or pin it to a screen corner."} value={effectiveTimerPosition} options={isTicker ? ["top-left", "top-right", "bottom-left", "bottom-right"] : ["announcement-right", "top-left", "top-right", "bottom-left", "bottom-right"]} optionLabels={{ "announcement-right": "Announcement right", "top-left": "Top left", "top-right": "Top right", "bottom-left": "Bottom left", "bottom-right": "Bottom right" }} onChange={(value) => patchAnnouncement({ timerPosition: value as LanternState["announcement"]["timerPosition"], timerX: undefined, timerY: undefined })} /><ColorControl label="Timer color" value={state.announcement.timerAccentColor} onChange={(timerAccentColor) => patchAnnouncement({ timerAccentColor })} /><ColorControl label="Timer track" value={state.announcement.timerTrackColor} onChange={(timerTrackColor) => patchAnnouncement({ timerTrackColor })} /></>}
              </div>
              {state.announcement.timerStyle !== "off" && effectiveTimerPosition !== "announcement-right" && <div className="announcement-placement-controls">
                <div className="placement-control-heading"><span>Timer position</span><button type="button" onClick={() => patchAnnouncement({ timerX: undefined, timerY: undefined })}><RotateCcw size={13} /> Use corner default</button></div>
                <div className="two-col">
                  <Slider label="Timer X" info="Horizontal center of the floating timer." value={state.announcement.timerX ?? (effectiveTimerPosition.endsWith("left") ? 17 : 83)} min={4} max={96} onChange={(timerX) => patchAnnouncement({ timerX })} />
                  <Slider label="Timer Y" info="Vertical center of the floating timer." value={state.announcement.timerY ?? (effectiveTimerPosition.startsWith("top") ? 15 : 84)} min={4} max={96} onChange={(timerY) => patchAnnouncement({ timerY })} />
                </div>
              </div>}
              <div className="announcement-character-editor">
                <div className="announcement-character-heading"><div><strong>Walk-on character</strong><span>Choose an image or 3D asset, then set its walk-in, wait, and exit path.</span></div><LabeledSelect label="Character" info="OBJ files are static. GLB and GLTF can include animation clips." value={state.announcement.character} options={["off", "inspector", "custom"]} optionLabels={{ off: "Off", inspector: "Built-in inspector", custom: "Custom image or 3D model" }} onChange={(value) => patchAnnouncement({ character: value as LanternState["announcement"]["character"] })} /></div>
                {state.announcement.character === "custom" && <>
                  <div className="character-asset-actions">
                    <label className="command-button secondary compact image-upload-button"><Upload size={15} /> {state.announcement.characterAssetName ? "Replace asset" : "Choose image or 3D file"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,.glb,.gltf,.obj" onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => patchAnnouncement({ characterAssetUrl: String(reader.result), characterAssetName: file.name, characterAssetKind: file.type.startsWith("image/") ? "image" : "model", characterPlayAnimation: /\.(glb|gltf)$/i.test(file.name) });
                      reader.readAsDataURL(file);
                    }} /></label>
                    <button type="button" className="command-button secondary compact" onClick={() => patchAnnouncement({ characterAssetUrl: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb", characterAssetName: "Khronos animated Fox.glb", characterAssetKind: "model", characterPlayAnimation: true })}><Box size={15} /> Use animated Fox example</button>
                  </div>
                  {state.announcement.characterAssetName && <div className="character-asset-status"><strong>{state.announcement.characterAssetName}</strong><span>{state.announcement.characterAssetKind === "image" ? "Image character" : /\.(obj)$/i.test(state.announcement.characterAssetName) ? "Static OBJ model" : "Animated 3D model"}</span></div>}
                  {state.announcement.characterAssetKind === "model" && !/\.obj$/i.test(state.announcement.characterAssetName ?? "") && <label className="switch-row"><input type="checkbox" checked={state.announcement.characterPlayAnimation ?? true} onChange={(event) => patchAnnouncement({ characterPlayAnimation: event.target.checked })} /><span>Play embedded walk animation while moving</span></label>}
                  <div className="two-col"><Slider label="Start off-screen" info="Starting horizontal position before the character enters." value={state.announcement.characterStartX ?? -18} min={-40} max={20} onChange={(characterStartX) => patchAnnouncement({ characterStartX })} /><Slider label="Stop point" info="Horizontal position where the character waits." value={state.announcement.characterStopX ?? 18} min={0} max={80} onChange={(characterStopX) => patchAnnouncement({ characterStopX })} /></div>
                  <div className="two-col"><Slider label="Walk time" info="Seconds used to move in and back out." value={state.announcement.characterWalkSeconds ?? 2} min={1} max={10} onChange={(characterWalkSeconds) => patchAnnouncement({ characterWalkSeconds })} /><Slider label="Wait time" info="Seconds the character waits at the stop point." value={state.announcement.characterWaitSeconds ?? 4} min={0} max={30} onChange={(characterWaitSeconds) => patchAnnouncement({ characterWaitSeconds })} /></div>
                  <p className="character-example-credit">Example: Khronos glTF Fox with Survey, Walk, and Run clips. Model CC0; rigging, animation, and glTF conversion credited under CC BY 4.0.</p>
                </>}
              </div>
              <div className="announcement-sfx-controls"><LabeledSelect label="Finish sound" info="Optional built-in sound played when the countdown ends." value={state.announcement.finishSfx} options={["off", "ding", "chime"]} optionLabels={{ off: "Off", ding: "Ding", chime: "Chime" }} onChange={(value) => patchAnnouncement({ finishSfx: value as LanternState["announcement"]["finishSfx"] })} /><Slider label="Sound volume" info="Volume for the built-in ding or chime." value={state.announcement.sfxVolume} onChange={(sfxVolume) => patchAnnouncement({ sfxVolume })} /><button type="button" className="command-button secondary compact preview-sfx-button" disabled={state.announcement.finishSfx === "off"} onClick={() => playAnnouncementSfx(state.announcement)}><Volume2 size={15} /> Test sound</button></div>
              <div className="sound-pickers"><SoundPicker label="Sound at start" value={state.announcement.startSoundUrl} onChange={(value) => patchAnnouncement({ startSoundUrl: value })} /><SoundPicker label="Sound at finish" value={state.announcement.endSoundUrl} onChange={(value) => patchAnnouncement({ endSoundUrl: value })} /></div>
            </div>
          </details>
          <div className="announcement-actions composer-actions"><div><small>{previewLabel} · {state.announcement.durationMinutes ? `${state.announcement.durationMinutes} minutes` : "Manual end"}</small></div><button className={state.announcement.active ? "command-button danger" : "command-button primary"} onClick={toggleAnnouncement}><Megaphone size={18} />{state.announcement.active ? "End announcement" : "Send announcement"}</button></div>
          <section className="saved-announcement-picker" aria-label="Saved announcements">
            <span><Save size={15} /> Saved announcements</span>
            <select aria-label="Choose saved announcement" value={selectedSavedId ?? ""} onChange={(event) => event.target.value ? loadSavedAnnouncement(event.target.value) : newAnnouncement()}>
              <option value="">Unsaved draft</option>
              {state.savedAnnouncements.map((item) => <option key={item.id} value={item.id}>{item.title || "Untitled announcement"}</option>)}
            </select>
            <small>{state.savedAnnouncements.length} saved</small>
            <div className="announcement-library-actions"><button type="button" className="command-button secondary compact" onClick={newAnnouncement}><Plus size={15} /> New</button><button type="button" className="command-button primary compact" onClick={saveAnnouncement}><Save size={15} /> {selectedSavedId ? "Save changes" : "Save draft"}</button></div>
          </section>
        </div>
        <div className="announcement-preview-card">
          <header className="announcement-preview-header">
            <div className="announcement-preview-tools"><label className="announcement-preview-display-select"><Monitor size={15} /><span>Preview format</span><select aria-label="Preview format" value={previewScreen.id} onChange={(event) => setPreviewScreenId(event.target.value as ScreenId)}>{Object.values(state.screens).map((screen) => <option key={screen.id} value={screen.id}>{screen.label} · {screen.orientation}</option>)}</select></label><div className="announcement-preview-aspect" role="group" aria-label="Announcement layout aspect"><button type="button" className={previewScreen.orientation === "Portrait" ? "active" : ""} onClick={() => { const screen = Object.values(state.screens).find((item) => item.orientation === "Portrait"); if (screen) setPreviewScreenId(screen.id); }}>Portrait</button><button type="button" className={previewScreen.orientation === "Landscape" ? "active" : ""} onClick={() => { const screen = Object.values(state.screens).find((item) => item.orientation === "Landscape"); if (screen) setPreviewScreenId(screen.id); }}>Landscape</button></div><div className="announcement-preview-header-actions"><div className="announcement-preview-actions"><button type="button" className="command-button secondary compact" onClick={openAnnouncementDemo}><ExternalLink size={15} /> Preview</button><button type="button" className="command-button primary compact" onClick={saveAnnouncement}><Save size={15} /> {selectedSavedId ? "Save changes" : "Save announcement"}</button></div><button className="icon-button" onClick={() => document.querySelector<HTMLElement>(".announcement-preview-stage")?.requestFullscreen()} title="Full screen preview"><Maximize2 size={16} /></button></div></div>
          </header>
          <p className="eyebrow">Live preview · {previewLabel}</p>
          <div className={`announcement-preview-stage ${orientationClass(previewScreen)}`}>
            <AnnouncementMonitorSurface state={state} screen={previewScreen} announcement={state.announcement} onPatch={patchAnnouncement} />
          </div>
          <div className="preview-meta"><span><Monitor size={15} />{previewScreen.label}</span><span><History size={15} />{state.announcement.durationMinutes ? `${state.announcement.durationMinutes} min` : "Manual"}</span></div>
        </div>
      </div>
      {scheduleAnnouncementId && createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setScheduleAnnouncementId(null); }}>
        <section className="editor-modal announcement-schedule-modal" role="dialog" aria-modal="true" aria-labelledby="announcement-schedule-title">
          <div className="editor-modal-head"><div><p className="eyebrow">Add to calendar</p><h2 id="announcement-schedule-title">{state.savedAnnouncements.find((item) => item.id === scheduleAnnouncementId)?.title}</h2></div><button className="icon-button" onClick={() => setScheduleAnnouncementId(null)}><X size={18} /></button></div>
          <div className="editor-modal-body announcement-schedule-body">
            <label className="field"><span>Repeats</span><select value={scheduleRecurrence} onChange={(event) => setScheduleRecurrence(event.target.value as "once" | "weekly")}><option value="once">One time</option><option value="weekly">Every week</option></select></label>
            <label className="field"><span>{scheduleRecurrence === "once" ? "Date" : "Starts on"}</span><input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} /></label>
            <label className="field"><span>Start time</span><input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} /></label>
            {scheduleRecurrence === "weekly" && <div className="field"><span>Repeat on</span><div className="schedule-day-picker">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => <button type="button" key={day} className={scheduleDays.includes(index) ? "active" : ""} onClick={() => setScheduleDays((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])}>{day}</button>)}</div></div>}
            <p className="schedule-modal-note"><Clock3 size={15} /> The event uses the announcement’s {state.savedAnnouncements.find((item) => item.id === scheduleAnnouncementId)?.durationMinutes || 30}-minute duration and target display.</p>
          </div>
          <div className="editor-modal-actions"><button className="command-button secondary" onClick={() => setScheduleAnnouncementId(null)}>Cancel</button><button className="command-button primary" disabled={scheduleRecurrence === "weekly" && !scheduleDays.length} onClick={addAnnouncementToCalendar}><CalendarDays size={16} /> Add to calendar</button></div>
        </section>
      </div>, document.body)}
    </section>
  );
}

const livePolygonClip = (frame: LanternState["live"]["frame"]) => {
  const points = frame.polygonPoints?.length
    ? frame.polygonPoints
    : [{ x: 12, y: 4 }, { x: 88, y: 4 }, { x: 100, y: 50 }, { x: 86, y: 96 }, { x: 14, y: 96 }, { x: 0, y: 50 }];
  return `polygon(${points.map((point) => `${point.x}% ${point.y}%`).join(", ")})`;
};

const liveSourceLabel = (source: LanternState["live"]["source"]) => source === "demo"
  ? "Test feed"
  : source === "screen"
    ? "Screen share"
    : source === "recording"
      ? "Recording"
    : "Camera";

function liveCompositionForDisplay(live: LanternState["live"], screenId: ScreenId): LanternState["live"] {
  const layout = live.displayLayouts?.[screenId];
  return layout ? { ...live, ...layout, frame: layout.frame ?? live.frame } : live;
}

function DirectLiveStage({
  state,
  screen,
  live,
  stream,
  mode,
  previewError,
  boardProgramId,
  boardViewMode = "2d",
  showBoard = true,
  interactive = true,
  onTrackingStatus,
  onFrameChange,
  onTitlePositionChange,
  onLowerThirdPositionChange
}: {
  state: LanternState;
  screen: DisplayProfile;
  live: LanternState["live"];
  stream: MediaStream | null;
  mode: "frame" | "crop";
  previewError: string | null;
  boardProgramId?: string;
  boardViewMode?: "2d" | "3d";
  showBoard?: boolean;
  interactive?: boolean;
  onTrackingStatus?: (status: TrackingRuntimeStatus) => void;
  onFrameChange: (frame: LanternState["live"]["frame"]) => void;
  onTitlePositionChange: (position: { x: number; y: number }) => void;
  onLowerThirdPositionChange: (position: { x: number; y: number }) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [frameDraft, setFrameDraft] = useState<LanternState["live"]["frame"] | null>(null);
  const frameDraftRef = useRef<LanternState["live"]["frame"] | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [confirmPolygonReset, setConfirmPolygonReset] = useState(false);
  const [controlHeld, setControlHeld] = useState(false);
  const displayLive = liveCompositionForDisplay(live, screen.id);
  const composedLive = normalizeBroadcastComposition(frameDraft ? { ...displayLive, frame: frameDraft } : displayLive);
  const scheduledBoard = resolveCurrentBoardSchedule(state, screen.id);
  // A manually chosen preview board is useful while editing; otherwise the studio
  // should faithfully show the board that is actually scheduled for this display.
  const backgroundBoardId = boardProgramId ?? scheduledBoard?.boardId;
  const hasBoardBackground = showBoard && Boolean(backgroundBoardId);
  const hasUnscheduledDisplayBackground = showBoard && !backgroundBoardId;
  const activeCostume = state.effectStudio.costumes.find((costume) => costume.id === composedLive.effects.costumeId);
  const activeCalibration = state.effectStudio.calibrationProfiles.find((profile) => profile.id === composedLive.effects.calibrationProfileId);
  const trackedCostumeRenderer = useMemo(() => composedLive.effects.costumeEnabled && activeCostume
    ? ((context: CanvasRenderingContext2D, frame: Parameters<typeof renderCostumeOverlay>[1]) => renderCostumeOverlay(context, frame, activeCostume, activeCalibration))
    : undefined, [activeCalibration, activeCostume, composedLive.effects.costumeEnabled]);
  const cropEdges = normalizeCropEdges(composedLive.frame.cropEdges);
  const interactionMode = controlHeld ? "crop" : mode;
  const dragRef = useRef<{
    kind: "move" | "resize" | "crop" | "crop-edge" | "point";
    edge?: string;
    pointIndex?: number;
    pointerId: number;
    x: number;
    y: number;
    frame: LanternState["live"]["frame"];
  } | null>(null);
  const textDragRef = useRef<{
    kind: "title" | "lower-third";
    pointerId: number;
    x: number;
    y: number;
    position: { x: number; y: number };
  } | null>(null);
  const updateFrameDraft = (frame: LanternState["live"]["frame"]) => {
    frameDraftRef.current = frame;
    setFrameDraft(frame);
  };

  useEffect(() => {
    if (!interactive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") setControlHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") setControlHeld(false);
    };
    const clearControl = () => setControlHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearControl);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearControl);
    };
  }, [interactive]);

  const polygonPoints = composedLive.frame.polygonPoints?.length
    ? composedLive.frame.polygonPoints
    : [{ x: 12, y: 4 }, { x: 88, y: 4 }, { x: 100, y: 50 }, { x: 86, y: 96 }, { x: 14, y: 96 }, { x: 0, y: 50 }];
  const polygonClip = `polygon(${polygonPoints.map((point) => `${point.x}% ${point.y}%`).join(", ")})`;

  const beginDrag = (event: React.PointerEvent<HTMLElement>, kind: "move" | "resize" | "crop" | "crop-edge" | "point", edge = "se", pointIndex?: number) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind, edge, pointIndex, pointerId: event.pointerId, x: event.clientX, y: event.clientY, frame: structuredClone(composedLive.frame) };
  };

  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || drag.pointerId !== event.pointerId) return;
    const bounds = stage.getBoundingClientRect();
    const dx = ((event.clientX - drag.x) / bounds.width) * 100;
    const dy = ((event.clientY - drag.y) / bounds.height) * 100;
    if (drag.kind === "point") {
      const frameBounds = (event.currentTarget.closest(".direct-live-frame") as HTMLElement | null)?.getBoundingClientRect();
      if (!frameBounds || drag.pointIndex === undefined) return;
      const points = drag.frame.polygonPoints?.length ? drag.frame.polygonPoints : polygonPoints;
      updateFrameDraft({
        ...drag.frame,
        polygonPoints: points.map((point, index) => index === drag.pointIndex ? {
          x: clamp(((event.clientX - frameBounds.left) / frameBounds.width) * 100, 0, 100),
          y: clamp(((event.clientY - frameBounds.top) / frameBounds.height) * 100, 0, 100)
        } : point)
      });
    } else if (drag.kind === "move") {
      updateFrameDraft({ ...drag.frame, x: clamp(drag.frame.x + dx, 0, 100 - drag.frame.width), y: clamp(drag.frame.y + dy, 0, 100 - drag.frame.height) });
    } else if (drag.kind === "resize") {
      let { x, y, width, height } = drag.frame;
      const edge = drag.edge ?? "se";
      const isCorner = edge.length === 2;
      const uniform = isCorner || ((drag.frame.maskShape === "circle" || drag.frame.maskShape === "polygon") && event.shiftKey);
      if (edge.includes("e")) width = clamp(drag.frame.width + dx, 10, 100 - x);
      if (edge.includes("s")) height = clamp(drag.frame.height + dy, 10, 100 - y);
      if (edge.includes("w")) {
        x = clamp(drag.frame.x + dx, 0, drag.frame.x + drag.frame.width - 10);
        width = drag.frame.width + drag.frame.x - x;
      }
      if (edge.includes("n")) {
        y = clamp(drag.frame.y + dy, 0, drag.frame.y + drag.frame.height - 10);
        height = drag.frame.height + drag.frame.y - y;
      }
      if (uniform) {
        const aspect = drag.frame.width / Math.max(1, drag.frame.height);
        if (Math.abs(dx) >= Math.abs(dy)) {
          height = clamp(width / aspect, 10, 100 - y);
          if (edge.includes("n")) y = drag.frame.y + drag.frame.height - height;
        } else {
          width = clamp(height * aspect, 10, 100 - x);
          if (edge.includes("w")) x = drag.frame.x + drag.frame.width - width;
        }
      }
      const maskShape = drag.frame.maskShape === "square" && !isCorner ? "rectangle" : drag.frame.maskShape;
      updateFrameDraft({ ...drag.frame, x, y, width, height, maskShape });
    } else if (drag.kind === "crop-edge") {
      const frameBounds = (event.currentTarget.closest(".direct-live-frame") as HTMLElement | null)?.getBoundingClientRect();
      if (!frameBounds) return;
      const edge = drag.edge ?? "se";
      const horizontal = ((event.clientX - drag.x) / Math.max(frameBounds.width, 1)) * 100;
      const vertical = ((event.clientY - drag.y) / Math.max(frameBounds.height, 1)) * 100;
      const next = normalizeCropEdges(drag.frame.cropEdges);
      if (edge.includes("w")) next.left = clamp(next.left + horizontal, 0, 90 - next.right);
      if (edge.includes("e")) next.right = clamp(next.right - horizontal, 0, 90 - next.left);
      if (edge.includes("n")) next.top = clamp(next.top + vertical, 0, 90 - next.bottom);
      if (edge.includes("s")) next.bottom = clamp(next.bottom - vertical, 0, 90 - next.top);
      updateFrameDraft({ ...drag.frame, cropEdges: next });
    } else {
      const frameBounds = (event.currentTarget.closest(".direct-live-frame") as HTMLElement | null)?.getBoundingClientRect();
      if (!frameBounds) return;
      const cropDx = ((event.clientX - drag.x) / Math.max(frameBounds.width, 1)) * 100;
      const cropDy = ((event.clientY - drag.y) / Math.max(frameBounds.height, 1)) * 100;
      updateFrameDraft({
        ...drag.frame,
        crop: {
          ...drag.frame.crop,
          x: clamp(drag.frame.crop.x - cropDx / drag.frame.crop.scale, -50, 50),
          y: clamp(drag.frame.crop.y - cropDy / drag.frame.crop.scale, -50, 50)
        }
      });
    }
  };

  const deletePolygonPoint = (index: number) => {
    if (polygonPoints.length <= 3) {
      setConfirmPolygonReset(true);
      return;
    }
    onFrameChange({ ...composedLive.frame, polygonPoints: polygonPoints.filter((_, pointIndex) => pointIndex !== index) });
    setSelectedPoint(null);
  };

  useEffect(() => {
    if (selectedPoint === null || composedLive.frame.maskShape !== "polygon") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      deletePolygonPoint(selectedPoint);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const finishDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const finalFrame = frameDraftRef.current;
    dragRef.current = null;
    frameDraftRef.current = null;
    setFrameDraft(null);
    if (finalFrame) onFrameChange(finalFrame);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const beginTextDrag = (event: React.PointerEvent<HTMLElement>, kind: "title" | "lower-third") => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    textDragRef.current = {
      kind,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      position: kind === "title" ? composedLive.titlePosition : composedLive.lowerThirdPosition
    };
  };

  const moveTextDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = textDragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || drag.pointerId !== event.pointerId) return;
    const bounds = stage.getBoundingClientRect();
    const position = {
      x: clamp(drag.position.x + ((event.clientX - drag.x) / Math.max(bounds.width, 1)) * 100, 0, 90),
      y: clamp(drag.position.y + ((event.clientY - drag.y) / Math.max(bounds.height, 1)) * 100, 0, 94)
    };
    if (drag.kind === "title") onTitlePositionChange(position);
    else onLowerThirdPositionChange(position);
  };

  const finishTextDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (textDragRef.current?.pointerId !== event.pointerId) return;
    textDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const zoomCrop = (event: WheelEvent) => {
      if (interactionMode !== "crop" || !(event.target instanceof Element) || !event.target.closest(".direct-live-frame")) return;
      event.preventDefault();
      const minimum = composedLive.frame.fitMode === "fit" ? .5 : 1;
      const scale = clamp(composedLive.frame.crop.scale + (event.deltaY < 0 ? .08 : -.08), minimum, 3);
      onFrameChange({ ...composedLive.frame, crop: { ...composedLive.frame.crop, scale } });
    };
    stage.addEventListener("wheel", zoomCrop, { passive: false });
    return () => stage.removeEventListener("wheel", zoomCrop);
  }, [composedLive.frame, interactionMode, onFrameChange]);

  return (
    <div className={`direct-live-stage-shell${interactive ? "" : " presentation"}`}>
      {interactive && <div className="direct-stage-toolbar">
        <span>{screen.label}</span>
        <strong>{interactionMode === "frame" ? "Drag to move · corner to resize" : `Pan, zoom & crop${controlHeld ? " · Control held" : ""}`}</strong>
      </div>}
      <div ref={stageRef} className={`direct-live-stage ${orientationClass(screen)}`}>
        <div className="direct-stage-board">
          {hasBoardBackground
            ? <BabylonDonorWall state={state} screenId={screen.id} previewProgramId={backgroundBoardId} interactive={interactive && boardViewMode === "3d"} fitToScreen viewMode={boardViewMode} />
            : hasUnscheduledDisplayBackground
              ? <div className="direct-unscheduled-backdrop"><span>No scheduled boards or events</span></div>
            : composedLive.backgroundMode === "none"
              ? <div className="broadcast-transparent-backdrop"><span>Transparent output</span></div>
              : <div className="broadcast-only-backdrop"><Radio size={24} /><span>Broadcast only</span></div>}
        </div>
        {!hasBoardBackground && !hasUnscheduledDisplayBackground && <BroadcastBackgroundLayer live={composedLive} orientation={screen.orientation} className="direct-broadcast-background" />}
        <div
          className={`direct-live-frame ${interactionMode === "crop" ? "crop-mode" : ""}`}
          style={{ left: `${composedLive.frame.x}%`, top: `${composedLive.frame.y}%`, width: `${composedLive.frame.width}%`, height: `${composedLive.frame.height}%` }}
          onPointerDown={(event) => {
            if (!interactive) return;
            beginDrag(event, event.ctrlKey || interactionMode === "crop" ? "crop" : "move");
          }}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <div className={`direct-live-content broadcast-frame-surface mask-${composedLive.frame.maskShape ?? "rectangle"}`} style={{
            ...(composedLive.frame.maskShape === "polygon" ? { clipPath: polygonClip } : {}),
            ...frameSurfaceStyle(composedLive)
          }}>
            <div className="broadcast-crop-viewport" style={{ clipPath: `inset(${cropEdges.top}% ${cropEdges.right}% ${cropEdges.bottom}% ${cropEdges.left}%)` }}>
              <div className="live-camera-transform" style={{ transform: `rotate(${composedLive.frame.rotation ?? 0}deg) scale(${composedLive.frame.mirrorX ? -1 : 1}, ${composedLive.frame.mirrorY ? -1 : 1})` }}>
                {stream ? <ChromaVideo stream={stream} chromaKey={composedLive.chromaKey} effects={composedLive.effects} crop={composedLive.frame.crop} fitMode={composedLive.frame.fitMode} onTrackingStatus={onTrackingStatus} renderTrackedOverlay={trackedCostumeRenderer} /> : composedLive.source === "demo" ? <div className="live-test-pattern compact"><strong>DIRECTOR LIVE</strong><span>Generated test feed</span></div> : <div className="direct-source-empty">{composedLive.source === "recording" ? <Video size={22} /> : <Camera size={22} />}<span>{previewError ?? "Connect the selected source to preview it here."}</span></div>}
              </div>
            </div>
          </div>
          {interactive && interactionMode === "frame" && ["n", "ne", "e", "se", "s", "sw", "w", "nw"].map((edge) => <div key={edge} className={`direct-resize-handle resize-${edge}`} title={`Resize ${edge}; hold Control to crop only this side`} onPointerDown={(event) => beginDrag(event, event.ctrlKey ? "crop-edge" : "resize", edge)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} />)}
          {interactive && interactionMode === "crop" && <div
            className="direct-crop-editor"
            aria-label="Camera image crop"
            style={{
              inset: `${cropEdges.top}% ${cropEdges.right}% ${cropEdges.bottom}% ${cropEdges.left}%`
            }}
            onPointerDown={(event) => beginDrag(event, "crop")}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            {["n", "e", "s", "w"].map((edge) => <div
              key={`crop-${edge}`}
              className={`direct-crop-edge crop-${edge}`}
              title={`Crop camera ${edge === "n" ? "top" : edge === "e" ? "right" : edge === "s" ? "bottom" : "left"} edge`}
              onPointerDown={(event) => beginDrag(event, "crop-edge", edge)}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
            />)}
            <span className="direct-crop-size">Camera image {Math.round(composedLive.frame.crop.scale * 100)}%</span>
          </div>}
          {interactive && interactionMode === "frame" && composedLive.frame.maskShape === "polygon" && <div className="polygon-editor" aria-label="Custom polygon points">
            {polygonPoints.map((point, index) => {
              const next = polygonPoints[(index + 1) % polygonPoints.length];
              return <Fragment key={`polygon-${index}`}>
                <button
                  type="button"
                  className={selectedPoint === index ? "polygon-point selected" : "polygon-point"}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  aria-label={`Polygon point ${index + 1}`}
                  title="Drag point · Delete key removes it"
                  onClick={(event) => { event.stopPropagation(); setSelectedPoint(index); }}
                  onPointerDown={(event) => { setSelectedPoint(index); beginDrag(event, "point", "", index); }}
                  onPointerMove={moveDrag}
                  onPointerUp={finishDrag}
                  onPointerCancel={finishDrag}
                />
                <button
                  type="button"
                  className="polygon-edge-insert"
                  style={{ left: `${(point.x + next.x) / 2}%`, top: `${(point.y + next.y) / 2}%` }}
                  aria-label={`Add point after point ${index + 1}`}
                  title="Add a point here"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    const nextPoints = [...polygonPoints];
                    nextPoints.splice(index + 1, 0, { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 });
                    onFrameChange({ ...live.frame, polygonPoints: nextPoints });
                    setSelectedPoint(index + 1);
                  }}
                />
              </Fragment>;
            })}
          </div>}
          {interactive && <span className="direct-frame-size">{Math.round(composedLive.frame.width)} × {Math.round(composedLive.frame.height)}</span>}
        </div>
        <div className="direct-broadcast-text direct-broadcast-title" aria-label={interactive ? "Move broadcast title" : "Broadcast title"} style={{ left: `${composedLive.titlePosition.x}%`, top: `${composedLive.titlePosition.y}%` }} onPointerDown={interactive ? (event) => beginTextDrag(event, "title") : undefined} onPointerMove={interactive ? moveTextDrag : undefined} onPointerUp={interactive ? finishTextDrag : undefined} onPointerCancel={interactive ? finishTextDrag : undefined}><strong>{composedLive.title}</strong></div>
        <div className="direct-broadcast-text direct-broadcast-lower-third" aria-label={interactive ? "Move broadcast lower third" : "Broadcast lower third"} style={{ left: `${composedLive.lowerThirdPosition.x}%`, top: `${composedLive.lowerThirdPosition.y}%` }} onPointerDown={interactive ? (event) => beginTextDrag(event, "lower-third") : undefined} onPointerMove={interactive ? moveTextDrag : undefined} onPointerUp={interactive ? finishTextDrag : undefined} onPointerCancel={interactive ? finishTextDrag : undefined}><span>{composedLive.lowerThird}</span></div>
      </div>
      {confirmPolygonReset && <LanternConfirmDialog
        eyebrow="Custom camera mask"
        title="Remove the custom polygon?"
        description="A polygon needs at least three points. Removing this point will return the camera mask to a rectangle."
        confirmLabel="Use rectangle"
        onCancel={() => setConfirmPolygonReset(false)}
        onConfirm={() => {
          setConfirmPolygonReset(false);
          setSelectedPoint(null);
          onFrameChange({ ...composedLive.frame, maskShape: "rectangle", polygonPoints: undefined });
        }}
      />}
    </div>
  );
}

function BlipsView({ state, updateState, onOpenSchedule }: {
  state: LanternState;
  updateState: (updater: (current: LanternState) => LanternState) => void;
  onOpenSchedule: (scheduleId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(state.savedBlips[0]?.id ?? "");
  const [draftBlip, setDraftBlip] = useState<LanternState["savedBlips"][number] | null>(null);
  const [pendingDeleteBlip, setPendingDeleteBlip] = useState<LanternState["savedBlips"][number] | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [runTargets, setRunTargets] = useState<ScreenId[]>(() => Object.keys(state.screens).slice(0, 1));
  const [runMinutes, setRunMinutes] = useState(2);
  const [scheduleDate, setScheduleDate] = useState(() => toDateInputValue(new Date()));
  const [scheduleTime, setScheduleTime] = useState(() => minutesToTime(Math.min(1430, new Date().getHours() * 60 + new Date().getMinutes() + 10)));
  const [scheduleTarget, setScheduleTarget] = useState<TargetScreen>(() => state.savedBlips[0]?.target ?? firstDisplayId(state));
  const [previewElapsedSeconds, setPreviewElapsedSeconds] = useState(0);
  const [bankFilter, setBankFilter] = useState<"all" | LanternState["savedBlips"][number]["kind"]>("all");
  const selected = draftBlip?.id === selectedId ? draftBlip : state.savedBlips.find((blip) => blip.id === selectedId) ?? state.savedBlips[0];
  const previewScreen = state.screens[selected?.target === "all" ? firstDisplayId(state) : selected?.target] ?? Object.values(state.screens)[0];
  const previewDurationSeconds = selected?.kind === "celebration" ? 3 : Math.max(3, (selected?.countdownSeconds ?? 0) + 3);
  const filteredBlips = bankFilter === "all" ? state.savedBlips : state.savedBlips.filter((blip) => blip.kind === bankFilter);
  const imageLibrary = useMemo(() => {
    const entries = [
      ...state.savedBlips.map((blip) => ({ name: blip.name, imageUrl: blip.imageUrl })),
      ...state.savedAnnouncements.map((announcement) => ({ name: announcement.title || "Announcement", imageUrl: announcement.imageUrl })),
      ...(draftBlip ? [{ name: draftBlip.name, imageUrl: draftBlip.imageUrl }] : [])
    ].filter((entry): entry is { name: string; imageUrl: string } => Boolean(entry.imageUrl));
    return [...new Map(entries.map((entry) => [entry.imageUrl, entry])).values()];
  }, [draftBlip, state.savedAnnouncements, state.savedBlips]);

  useEffect(() => {
    if (!selected && state.savedBlips[0]) setSelectedId(state.savedBlips[0].id);
  }, [selected, state.savedBlips]);

  useEffect(() => {
    setPreviewElapsedSeconds(0);
  }, [selected?.id]);

  useEffect(() => {
    setPreviewElapsedSeconds((current) => Math.min(current, previewDurationSeconds));
  }, [previewDurationSeconds]);

  const patchBlip = (patch: Partial<LanternState["savedBlips"][number]>) => {
    if (!selected) return;
    if (draftBlip?.id === selected.id) {
      setDraftBlip({ ...draftBlip, ...patch });
      return;
    }
    updateState((current) => ({ ...current, savedBlips: current.savedBlips.map((blip) => blip.id === selected.id ? { ...blip, ...patch } : blip) }));
  };
  const createBlip = (kind: "joke" | "quiz" | "celebration") => {
    const id = `blip-${Date.now()}`;
    const next: LanternState["savedBlips"][number] = {
      id, name: kind === "joke" ? "New joke" : kind === "quiz" ? "New quiz" : "New celebration", kind,
      headline: kind === "joke" ? "Joke break!" : kind === "quiz" ? "QUIZ TIME!" : "YOU DID IT!",
      prompt: kind === "celebration" ? "A museum explorer completed the challenge!" : "Type the question here…",
      answer: kind === "celebration" ? undefined : "Type the answer here…", subtext: "",
      target: firstDisplayId(state), durationMinutes: 2, countdownSeconds: kind === "celebration" ? 0 : 10,
      showCountdown: kind !== "celebration", ticking: kind === "quiz", startSfx: kind === "celebration" ? "level-up" : "bell",
      revealSfx: kind === "joke" ? "ba-dum-tss" : "applause", sfxVolume: 70,
      backgroundColor: kind === "quiz" ? "#28194c" : kind === "celebration" ? "#073b3d" : "#10243f",
      accentColor: kind === "quiz" ? "#f4c65f" : kind === "celebration" ? "#ffd166" : "#55d7de", motion: "pop"
    };
    setDraftBlip(next);
    setSelectedId(id);
  };
  const saveDraftBlip = () => {
    if (!draftBlip) return;
    updateState((current) => ({ ...current, savedBlips: [...current.savedBlips, draftBlip] }));
    setDraftBlip(null);
  };
  const cancelDraftBlip = () => {
    setDraftBlip(null);
    setSelectedId(state.savedBlips[0]?.id ?? "");
  };
  const duplicateBlip = () => {
    if (!selected) return;
    const copy = { ...selected, id: `blip-${Date.now()}`, name: `${selected.name} copy` };
    setDraftBlip(copy);
    setSelectedId(copy.id);
  };
  const deleteBlip = () => {
    if (!selected) return;
    if (draftBlip?.id === selected.id) {
      cancelDraftBlip();
      return;
    }
    setPendingDeleteBlip(selected);
  };
  const confirmDeleteBlip = () => {
    if (!pendingDeleteBlip) return;
    const remaining = state.savedBlips.filter((blip) => blip.id !== pendingDeleteBlip.id);
    updateState((current) => ({ ...current, savedBlips: remaining, schedules: current.schedules.filter((entry) => entry.blipId !== pendingDeleteBlip.id) }));
    setPendingDeleteBlip(null);
    setSelectedId(remaining[0]?.id ?? "");
  };
  const openRun = () => {
    if (!selected) return;
    setRunTargets(selected.target === "all" ? Object.keys(state.screens) : [selected.target]);
    setRunMinutes(selected.durationMinutes);
    setRunOpen(true);
  };
  const runNow = () => {
    if (!selected || !runTargets.length) return;
    updateState((current) => ({ ...current, activeBlip: { ...selected, target: runTargets.length === Object.keys(current.screens).length ? "all" : runTargets[0], targets: runTargets, durationMinutes: runMinutes, active: true, startedAt: new Date().toISOString() } }));
    setRunOpen(false);
  };
  const scheduleBlip = () => {
    if (!selected) return;
    const id = `schedule-${Date.now()}`;
    const start = timeToMinutes(scheduleTime);
    updateState((current) => ({ ...current, schedules: [...current.schedules, {
      id, name: selected.name, target: scheduleTarget, boardId: current.boardPrograms[0]?.id ?? "", contentType: "blip", blipId: selected.id,
      days: [new Date(`${scheduleDate}T12:00:00`).getDay()], recurrence: "once", scheduleDate, startTime: scheduleTime,
      endTime: minutesToTime(Math.min(1439, start + Math.max(1, Math.round(selected.durationMinutes * 60)))), color: selected.accentColor, active: true
    }] }));
    setScheduleOpen(false);
    onOpenSchedule(id);
  };
  const upload = async (file: File | undefined, field: "imageUrl" | "startSoundUrl" | "revealSoundUrl") => {
    if (!file) return;
    patchBlip({ [field]: await fileToDataUrl(file) });
  };

  if (!selected) return <section className="blips-empty"><Sparkles size={36} /><h2>Create your first Blip</h2><p>Start with a joke, quiz, or celebration.</p><div><button className="command-button primary" onClick={() => createBlip("joke")}>New joke</button><button className="command-button secondary" onClick={() => createBlip("quiz")}>New quiz</button><button className="command-button secondary" onClick={() => createBlip("celebration")}>New celebration</button></div></section>;

  return <section className="blips-workspace">
    <aside className="blip-bank">
      <header><div><p className="eyebrow">Saved bank</p><h2>Blips</h2></div><span title={draftBlip ? "One unsaved draft" : undefined}>{state.savedBlips.length}{draftBlip ? " + draft" : ""}</span></header>
      <div className="blip-create-row"><button onClick={() => createBlip("joke")}>+ Joke</button><button onClick={() => createBlip("quiz")}>+ Quiz</button><button onClick={() => createBlip("celebration")}>+ Celebration</button></div>
      <div className="blip-bank-filters" aria-label="Filter saved Blips">{(["all", "joke", "quiz", "celebration"] as const).map((filter) => <button type="button" key={filter} className={bankFilter === filter ? "active" : ""} aria-pressed={bankFilter === filter} onClick={() => setBankFilter(filter)}>{filter === "all" ? "All" : filter[0].toUpperCase() + filter.slice(1)}</button>)}</div>
      <div className="blip-bank-list">{filteredBlips.map((blip) => <button type="button" key={blip.id} className={blip.id === selected.id ? "selected" : ""} onClick={() => { setDraftBlip(null); setSelectedId(blip.id); }}><i style={{ background: blip.accentColor }} /><span><strong>{blip.name}</strong><small>{blip.kind} · {blip.durationMinutes} min</small></span><Play size={14} onClick={(event) => { event.stopPropagation(); setDraftBlip(null); setSelectedId(blip.id); setRunTargets(blip.target === "all" ? Object.keys(state.screens) : [blip.target]); setRunMinutes(blip.durationMinutes); setRunOpen(true); }} /></button>)}{!filteredBlips.length && <p className="blip-bank-empty">No {bankFilter === "all" ? "saved" : bankFilter} Blips yet.</p>}</div>
    </aside>
    <main className="blip-editor">
      <header><div><p className="eyebrow">{draftBlip ? "Unsaved draft" : `${selected.kind} blip`}</p><h2>{selected.name}</h2></div><div>{draftBlip ? <><button className="command-button secondary compact" onClick={cancelDraftBlip}>Cancel</button><button className="command-button primary compact" onClick={saveDraftBlip}>Save Blip</button></> : <><button className="command-button secondary compact" onClick={duplicateBlip}><ClipboardCopy size={14} /> Duplicate</button><button className="icon-button" onClick={deleteBlip} title="Delete Blip"><Trash2 size={16} /></button></>}</div></header>
      <div className="blip-editor-body">
        <div className="blip-fields">
          <div className="two-col"><LabeledInput label="Saved name" value={selected.name} onChange={(name) => patchBlip({ name })} /><LabeledSelect label="Type" value={selected.kind} options={["joke", "quiz", "celebration"]} optionLabels={{ joke: "Joke", quiz: "Quiz time", celebration: "Celebration" }} onChange={(kind) => patchBlip({ kind: kind as typeof selected.kind })} /></div>
          <LabeledInput label="Headline" value={selected.headline} onChange={(headline) => patchBlip({ headline })} />
          <label className="field"><span>{selected.kind === "celebration" ? "Message" : "Question / setup"}</span><textarea value={selected.prompt} onChange={(event) => patchBlip({ prompt: event.target.value })} /></label>
          {selected.kind !== "celebration" && <label className="field"><span>Answer / punchline</span><textarea value={selected.answer ?? ""} onChange={(event) => patchBlip({ answer: event.target.value })} /></label>}
          <LabeledInput label="Subtext (optional)" value={selected.subtext ?? ""} onChange={(subtext) => patchBlip({ subtext })} />
          <div className="two-col"><LabeledInput label="Countdown seconds" type="number" value={String(selected.countdownSeconds)} onChange={(value) => patchBlip({ countdownSeconds: Math.max(0, Number(value) || 0) })} /><LabeledInput label="Default run minutes" type="number" value={String(selected.durationMinutes)} onChange={(value) => patchBlip({ durationMinutes: Math.max(1, Number(value) || 1) })} /></div>
          <div className="blip-switches"><label><input type="checkbox" checked={selected.showCountdown} onChange={(event) => patchBlip({ showCountdown: event.target.checked })} /> Show countdown</label><label><input type="checkbox" checked={selected.ticking} onChange={(event) => patchBlip({ ticking: event.target.checked })} /> Ticking countdown</label></div>
          <div className="two-col"><LabeledSelect label="Opening SFX" value={selected.startSfx} options={["off", "bell", "applause", "level-up", "ba-dum-tss", "laughter"]} optionLabels={{ off: "Off", bell: "Bell", applause: "Applause", "level-up": "Level-up bwoosh", "ba-dum-tss": "Ba-dum-tss", laughter: "Laughter" }} onChange={(startSfx) => patchBlip({ startSfx: startSfx as typeof selected.startSfx })} /><LabeledSelect label="Reveal SFX" value={selected.revealSfx} options={["off", "bell", "applause", "level-up", "ba-dum-tss", "laughter"]} optionLabels={{ off: "Off", bell: "Bell", applause: "Applause", "level-up": "Level-up bwoosh", "ba-dum-tss": "Ba-dum-tss", laughter: "Laughter" }} onChange={(revealSfx) => patchBlip({ revealSfx: revealSfx as typeof selected.revealSfx })} /></div>
          <div className="blip-upload-row"><label className="command-button secondary compact"><Upload size={14} /> Custom opening sound<input type="file" accept="audio/*" onChange={(event) => void upload(event.target.files?.[0], "startSoundUrl")} /></label><label className="command-button secondary compact"><Upload size={14} /> Custom reveal sound<input type="file" accept="audio/*" onChange={(event) => void upload(event.target.files?.[0], "revealSoundUrl")} /></label></div>
          <div className="two-col"><label className="field"><span>Background</span><input type="color" value={selected.backgroundColor} onChange={(event) => patchBlip({ backgroundColor: event.target.value })} /></label><label className="field"><span>Accent</span><input type="color" value={selected.accentColor} onChange={(event) => patchBlip({ accentColor: event.target.value })} /></label></div>
          <div className="two-col"><LabeledSelect label="Motion" value={selected.motion} options={["slide", "pop", "gentle"]} optionLabels={{ slide: "Slide in/out", pop: "Playful pop", gentle: "Gentle fade" }} onChange={(motion) => patchBlip({ motion: motion as typeof selected.motion })} /><div className="blip-image-manager"><span className="field-label">Blip image</span>{selected.imageUrl && <div className="blip-image-current"><img src={selected.imageUrl} alt="Selected Blip asset" /><span><strong>Image selected</strong><small>Shown in the preview and when this Blip runs.</small></span><button type="button" className="icon-button" onClick={() => patchBlip({ imageUrl: undefined })} title="Remove image" aria-label="Remove image"><X size={15} /></button></div>}<div className="blip-image-actions">{imageLibrary.length > 0 && <label className="field"><span>Image library</span><select value={selected.imageUrl ?? ""} onChange={(event) => patchBlip({ imageUrl: event.target.value || undefined })}><option value="">No image</option>{imageLibrary.map((image) => <option value={image.imageUrl} key={image.imageUrl}>{image.name} image</option>)}</select></label>}<label className="image-upload command-button secondary compact"><ImagePlus size={14} /><span>{selected.imageUrl ? "Replace image" : "Add image"}</span><input type="file" accept="image/*" onChange={(event) => void upload(event.target.files?.[0], "imageUrl")} /></label></div></div></div>
        </div>
        <div className="blip-preview-column"><div className={`blip-preview-frame ${orientationClass(previewScreen)}`}><BabylonDonorWall state={state} screenId={previewScreen.id} fitToScreen viewMode="2d" /><BlipComposition blip={{ ...selected, active: true }} previewElapsedSeconds={previewElapsedSeconds} /></div><BlipPreviewTimeline blip={selected} orientation={orientationClass(previewScreen)} elapsedSeconds={previewElapsedSeconds} durationSeconds={previewDurationSeconds} onChange={setPreviewElapsedSeconds} /><p>{selected.kind === "celebration" ? "Preview the celebration moment before it goes live." : "Scrub the timeline to inspect the setup, countdown, and answer reveal."}</p></div>
      </div>
      <footer>{draftBlip ? <p className="field-note blip-draft-note">Save this draft before scheduling or running it.</p> : <><button className="command-button secondary" onClick={() => { setScheduleTarget(selected.target); setScheduleOpen(true); }}><CalendarDays size={16} /> Schedule</button>{state.activeBlip.active && state.activeBlip.id === selected.id && <button className="command-button secondary" onClick={() => updateState((current) => ({ ...current, activeBlip: { ...current.activeBlip, active: false } }))}><Square size={15} /> Stop</button>}<button className="command-button primary" onClick={openRun}><Play size={16} /> Run now</button></>}</footer>
    </main>
    {runOpen && createPortal(<div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setRunOpen(false)}><section className="editor-modal blip-run-modal"><div className="editor-modal-head"><div><p className="eyebrow">Go live now</p><h2>Run “{selected.name}”</h2></div><button className="icon-button" onClick={() => setRunOpen(false)}><X size={17} /></button></div><div className="blip-target-list">{Object.values(state.screens).map((screen) => <label key={screen.id}><input type="checkbox" checked={runTargets.includes(screen.id)} onChange={(event) => setRunTargets((current) => event.target.checked ? [...new Set([...current, screen.id])] : current.filter((id) => id !== screen.id))} /><span><strong>{screen.label}</strong><small>{screen.orientation} · {screen.resolution}</small></span></label>)}</div><LabeledInput label="How many minutes?" type="number" value={String(runMinutes)} onChange={(value) => setRunMinutes(Math.max(1, Number(value) || 1))} /><p className="field-note">Runs immediately without adding anything to the schedule. Broadcasts will cover it if both are live.</p><div className="editor-modal-actions"><button className="command-button secondary" onClick={() => setRunOpen(false)}>Cancel</button><button className="command-button primary" disabled={!runTargets.length} onClick={runNow}><Play size={15} /> Run Blip</button></div></section></div>, document.body)}
    {scheduleOpen && createPortal(<div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setScheduleOpen(false)}><section className="editor-modal blip-run-modal"><div className="editor-modal-head"><div><p className="eyebrow">Add to calendar</p><h2>Schedule “{selected.name}”</h2></div><button className="icon-button" title="Cancel scheduling" onClick={() => setScheduleOpen(false)}><X size={17} /></button></div><div className="two-col"><label className="field"><span>Date</span><input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} /></label><label className="field"><span>Start time</span><input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} /></label></div><LabeledSelect label="Display" value={scheduleTarget} options={["all", ...Object.keys(state.screens)]} optionLabels={{ all: "All Displays", ...Object.fromEntries(Object.values(state.screens).map((screen) => [screen.id, `${screen.label} (${screen.orientation})`])) }} onChange={(target) => setScheduleTarget(target as TargetScreen)} /><p className="field-note">The calendar event uses this Blip’s {selected.durationMinutes}-minute default duration. Nothing is added until you confirm.</p><div className="editor-modal-actions"><button className="command-button secondary" onClick={() => setScheduleOpen(false)}>Cancel</button><button className="command-button primary" onClick={scheduleBlip}><CalendarDays size={15} /> Add to schedule</button></div></section></div>, document.body)}
    {pendingDeleteBlip && createPortal(<div className="modal-backdrop destructive-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingDeleteBlip(null); }}><section className="editor-modal destructive-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-blip-title" aria-describedby="delete-blip-description"><div className="destructive-confirm-icon"><Trash2 size={22} /></div><div><p className="eyebrow">Delete saved Blip</p><h2 id="delete-blip-title">Delete “{pendingDeleteBlip.name}”?</h2><p id="delete-blip-description">This also removes its scheduled calendar occurrences. This action cannot be undone.</p></div><div className="editor-modal-actions"><button type="button" className="command-button secondary" onClick={() => setPendingDeleteBlip(null)}>Cancel</button><button type="button" className="command-button danger" onClick={confirmDeleteBlip}><Trash2 size={15} /> Delete Blip</button></div></section></div>, document.body)}
  </section>;
}

function BlipPreviewTimeline({ blip, orientation, elapsedSeconds, durationSeconds, onChange }: {
  blip: LanternState["savedBlips"][number];
  orientation: string;
  elapsedSeconds: number;
  durationSeconds: number;
  onChange: (seconds: number) => void;
}) {
  const hasReveal = blip.kind !== "celebration";
  const revealAt = Math.max(0, blip.countdownSeconds);
  const stage = !hasReveal
    ? "Celebration moment"
    : elapsedSeconds >= revealAt
      ? "Reveal"
      : elapsedSeconds <= .05
        ? "Opening"
        : "Countdown";
  const stageButtons = hasReveal
    ? [["Opening", 0], ["Countdown", Math.max(.1, revealAt / 2)], ["Reveal", Math.min(durationSeconds, revealAt + .1)]] as const
    : [["Moment", 0], ["Hold", Math.min(durationSeconds, 1.5)]] as const;
  return <section className={`blip-preview-timeline ${orientation}`} aria-label="Blip preview timeline">
    <header><span>Preview timeline</span><strong>{stage} · +{elapsedSeconds.toFixed(1)}s</strong></header>
    <input type="range" min="0" max={durationSeconds} step="0.1" value={elapsedSeconds} onChange={(event) => onChange(Number(event.target.value))} aria-label="Preview point in the Blip timeline" />
    <div className="blip-preview-beats">{stageButtons.map(([label, second]) => <button type="button" key={label} className={stage === (label === "Moment" || label === "Hold" ? "Celebration moment" : label) ? "active" : ""} onClick={() => onChange(second)}><span>{label}</span><small>+{second.toFixed(second % 1 ? 1 : 0)}s</small></button>)}</div>
    {hasReveal && <p>Answer appears at +{revealAt}s, then remains visible for the rest of the Blip.</p>}
  </section>;
}

function LivePreviewPanel({
  state,
  activeUserId,
  patchLive,
  updateState,
  startLive,
  startLiveStream,
  stopLive
}: {
  state: LanternState;
  activeUserId?: string;
  patchLive: (patch: Partial<LanternState["live"]>) => void;
  updateState: (updater: (current: LanternState) => LanternState) => void;
  startLive: () => void;
  startLiveStream: (stream: MediaStream, detail: string) => Promise<void>;
  stopLive: () => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [liveTab, setLiveTab] = useState<"setup" | "frame" | "effects">("setup");
  const [previewWindow, setPreviewWindow] = useState<Window | null>(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [phoneMode, setPhoneMode] = useState(false);
  const [sourcePromptOpen, setSourcePromptOpen] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [directMode, setDirectMode] = useState<"frame" | "crop">("frame");
  const [boardViewMode, setBoardViewMode] = useState<"2d" | "3d">("2d");
  const [removalMethod, setRemovalMethod] = useState<BackgroundRemovalMethod>(() => resolveBackgroundRemoval(state.live).method);
  const [chromaSamplerActive, setChromaSamplerActive] = useState(false);
  const [previewBoardId, setPreviewBoardId] = useState("assigned");
  const [popoutMode, setPopoutMode] = useState<"broadcast" | "selected" | "all">("selected");
  const [recordings, setRecordings] = useState<RecordingLibraryRecord[]>([]);
  const [recordingMenuOpen, setRecordingMenuOpen] = useState(false);
  const [trackingStatus, setTrackingStatus] = useState<TrackingRuntimeStatus>();
  const [recordingLibraryLoading, setRecordingLibraryLoading] = useState(true);
  const [recordingLibraryError, setRecordingLibraryError] = useState<string | null>(null);
  const [recordingPhase, setRecordingPhase] = useState<"idle" | "starting" | "recording" | "saving">("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [sendingRecordingId, setSendingRecordingId] = useState<string | null>(null);
  const recordingActive = recordingPhase === "starting" || recordingPhase === "recording";
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewLeaseRef = useRef<MediaDeviceLease | null>(null);
  const previewWindowRef = useRef<Window | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const recordingClickAtRef = useRef(0);
  const recorderStartedAtRef = useRef(0);
  const firstRecordingDataAtRef = useRef<number | undefined>(undefined);
  const recordingInputRef = useRef<MediaStream | null>(null);
  const demoRecordingCaptureRef = useRef<DemoRecordingCapture | null>(null);
  const recordingContextRef = useRef<{ source: LanternState["live"]["source"]; target: TargetScreen; targetLabel: string; screenIds: string[] } | null>(null);
  const recordingPlaybackRef = useRef<HTMLVideoElement | null>(null);
  const recordingPlaybackUrlRef = useRef<string | null>(null);
  const sourceRecordingPlaybackRef = useRef<HTMLVideoElement | null>(null);
  const sourceRecordingUrlRef = useRef<string | null>(null);
  const recordingMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { previewStreamRef.current = previewStream; }, [previewStream]);
  useEffect(() => {
    const userId = activeUserId ?? state.users[0]?.id ?? "local-user";
    const profile = resolveCalibrationProfile(state.effectStudio, userId, state.live.videoDeviceId, state.live.effects.calibrationProfileId);
    if (state.live.effects.calibrationProfileId === profile?.id) return;
    patchLive({ effects: { ...state.live.effects, calibrationProfileId: profile?.id } });
  }, [activeUserId, state.effectStudio, state.live.effects.calibrationProfileId, state.live.videoDeviceId, state.users]);
  useEffect(() => { previewWindowRef.current = previewWindow; }, [previewWindow]);

  useEffect(() => {
    if (!recordingActive) return;
    const timer = window.setInterval(() => setRecordingSeconds(Math.max(0, Math.floor((Date.now() - recordingStartedRef.current) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [recordingActive]);

  useEffect(() => {
    if (!recordingMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!recordingMenuRef.current?.contains(event.target as Node)) setRecordingMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRecordingMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [recordingMenuOpen]);

  useEffect(() => {
    let mounted = true;
    void recordingLibraryStore.list().then((items) => {
      if (!mounted) return;
      setRecordings(items);
      setRecordingLibraryLoading(false);
    }).catch(() => {
      if (!mounted) return;
      setRecordingLibraryError("Saved recordings could not be loaded. New captures will use the in-memory fallback.");
      setRecordingLibraryLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const refreshDevices = () => void navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => setDevices([]));
    refreshDevices();
    navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", refreshDevices);
      const previewLease = previewLeaseRef.current;
      previewLease?.release();
      previewLeaseRef.current = null;
      if (!previewLease) previewStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewWindowRef.current && !previewWindowRef.current.closed) previewWindowRef.current.close();
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      recordingInputRef.current?.getTracks().forEach((track) => track.stop());
      demoRecordingCaptureRef.current?.stop();
      recordingPlaybackRef.current?.pause();
      if (recordingPlaybackUrlRef.current) URL.revokeObjectURL(recordingPlaybackUrlRef.current);
      sourceRecordingPlaybackRef.current?.pause();
      if (sourceRecordingUrlRef.current) URL.revokeObjectURL(sourceRecordingUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!previewWindow) return;
    const watchWindow = window.setInterval(() => {
      if (previewWindow.closed) setPreviewWindow(null);
    }, 350);
    return () => window.clearInterval(watchWindow);
  }, [previewWindow]);

  const cameraDevices = devices.filter((device) => device.kind === "videoinput");
  const micDevices = devices.filter((device) => device.kind === "audioinput");
  const cameraOptions = deviceOptionList(cameraDevices, "Default camera", "Camera");
  const micOptions = deviceOptionList(micDevices, "Default mic", "Mic");
  const allScreens = Object.values(state.screens);
  const previewScreen = state.screens[state.live.target] ?? allScreens[0];
  const previewScreens = state.live.target === "all" ? allScreens : [previewScreen];
  const patchDisplayLayout = (screenId: ScreenId, patch: NonNullable<LanternState["live"]["displayLayouts"]>[string]) => patchLive({
    displayLayouts: { ...state.live.displayLayouts, [screenId]: { ...state.live.displayLayouts?.[screenId], ...patch } }
  });
  const selectedPreviewBoardId = previewBoardId === "assigned" ? undefined : previewBoardId;
  const selectedRecordingId = recordings.some((recording) => recording.id === state.live.recordingId)
    ? state.live.recordingId!
    : recordings[0]?.id ?? "";
  const selectedSourceRecording = recordings.find((recording) => recording.id === selectedRecordingId);
  const recordingSourceLabels = Object.fromEntries(recordings.map((recording) => [
    recording.id,
    `${recording.title} · ${formatCountdown(recording.durationSeconds)}`
  ]));
  const liveComposition = normalizeBroadcastComposition(state.live);
  const sourceCropEdges = normalizeCropEdges(liveComposition.frame.cropEdges);
  const backgroundRemoval = resolveBackgroundRemoval(state.live);
  const selectedRemovalMethod = backgroundRemoval.enabled ? backgroundRemoval.method : removalMethod;
  const selectedChromaPreset = CHROMA_KEY_PRESETS.find((preset) => preset.color.toLowerCase() === state.live.chromaKey.color.toLowerCase())?.id ?? "custom";
  const setBackgroundRemovalEnabled = (enabled: boolean) => {
    if (!enabled) {
      setRemovalMethod(backgroundRemoval.method);
      setChromaSamplerActive(false);
    }
    patchLive(createBackgroundRemovalPatch(state.live, enabled, selectedRemovalMethod));
  };
  const selectBackgroundRemovalMethod = (method: BackgroundRemovalMethod) => {
    setRemovalMethod(method);
    setChromaSamplerActive(false);
    if (backgroundRemoval.enabled) patchLive(createBackgroundRemovalPatch(state.live, true, method));
  };

  const stopRecordingSourcePlayback = () => {
    sourceRecordingPlaybackRef.current?.pause();
    sourceRecordingPlaybackRef.current = null;
    if (sourceRecordingUrlRef.current) URL.revokeObjectURL(sourceRecordingUrlRef.current);
    sourceRecordingUrlRef.current = null;
  };

  const stopPreviewStream = (force = false) => {
    if (recordingActive && !force) {
      setPreviewError("Stop the recording before disconnecting or changing its source.");
      return;
    }
    const lease = previewLeaseRef.current;
    previewLeaseRef.current = null;
    if (lease) lease.release();
    else previewStreamRef.current?.getTracks().forEach((track) => track.stop());
    stopRecordingSourcePlayback();
    previewStreamRef.current = null;
    setPreviewStream(null);
  };

  const startPreview = async (source = state.live.source, requestedRecordingId = state.live.recordingId) => {
    if (recordingActive) {
      setPreviewError("Stop the recording before changing its video source.");
      return false;
    }
    setPreviewError(null);
    if (source === "camera") {
      // A newly connected camera is always neutral until the operator enables
      // an effect. This also protects a freshly reopened studio from stale
      // persisted experiment settings.
      patchLive({
        chromaKey: { ...state.live.chromaKey, enabled: false },
        effects: {
          ...state.live.effects,
          background: "original",
          faceTracking: false,
          puppetPreview: false,
          trackingDebug: false,
          trackedPointsOverlay: false,
          glassesEnabled: false,
          hatEnabled: false,
          partyHatEnabled: false,
          costumeEnabled: false,
          handProp: "none"
        }
      });
    }
    if (source === "demo") {
      stopPreviewStream(true);
      return true;
    }
    if (source !== "recording" && (!window.isSecureContext || (!navigator.mediaDevices?.getUserMedia && !navigator.mediaDevices?.getDisplayMedia))) {
      setPreviewStream(null);
      setPreviewError("Camera and screen capture require a secure browser context. Open this app from its local app address.");
      return false;
    }
    setPreviewBusy(true);
    let pendingRecordingPlayback: HTMLVideoElement | null = null;
    let pendingRecordingUrl: string | null = null;
    try {
      let stream: MediaStream;
      let nextLease: MediaDeviceLease | null = null;
      if (source === "screen") {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: true });
      } else if (source === "recording") {
        const recordingId = requestedRecordingId || selectedRecordingId;
        const recording = recordings.find((item) => item.id === recordingId);
        if (!recording) throw new Error(recordingLibraryLoading ? "Saved recordings are still loading." : "No saved recording is available. Make a recording first, then select it here.");
        const sourcePlayback = await createRecordingSourcePlayback(recording);
        pendingRecordingUrl = sourcePlayback.objectUrl;
        pendingRecordingPlayback = sourcePlayback.playback;
        stream = sourcePlayback.stream;
      } else {
        nextLease = await mediaDeviceManager.acquire("broadcast:preview", {
          video: {
            deviceId: state.live.videoDeviceId,
            constraints: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
            fallbackToDefault: true,
            required: true
          },
          audio: {
            deviceId: state.live.audioDeviceId,
            constraints: { echoCancellation: true, noiseSuppression: true },
            fallbackToDefault: true,
            required: false
          }
        });
        stream = nextLease.stream;
        if (nextLease.issues.some((issue) => issue.kind === "audio")) {
          setPreviewError("Camera connected without microphone; choose another microphone if live audio is needed.");
        } else if (nextLease.fallbacks.length) {
          setPreviewError("A saved device was unavailable, so Broadcast connected to the browser default. Review the source selections before going live.");
        }
      }
      // A camera must remain usable when the optional microphone is missing or denied.
      if (source === "camera") {
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) throw new DOMException("No camera track was returned.", "NotFoundError");
      }
      stream.getVideoTracks().forEach((track) => track.addEventListener("ended", () => {
        setPreviewStream(null);
        setPreviewError(source === "screen" ? "Screen sharing ended. Choose a window again to resume." : source === "recording" ? "Recording playback ended. Select it again to resume." : "The camera stopped. Reconnect it or choose another camera.");
      }, { once: true }));
      const previousLease = previewLeaseRef.current;
      const previousStream = previewStreamRef.current;
      if (source === "screen" || source === "recording") {
        previousLease?.release();
        previewLeaseRef.current = null;
      } else {
        previewLeaseRef.current = nextLease;
      }
      if (!previousLease && previousStream && previousStream !== stream) previousStream.getTracks().forEach((track) => track.stop());
      stopRecordingSourcePlayback();
      if (pendingRecordingPlayback && pendingRecordingUrl) {
        sourceRecordingPlaybackRef.current = pendingRecordingPlayback;
        sourceRecordingUrlRef.current = pendingRecordingUrl;
        pendingRecordingPlayback = null;
        pendingRecordingUrl = null;
      }
      previewStreamRef.current = stream;
      setPreviewStream(stream);
      if (source !== "recording") {
        const nextDevices = await navigator.mediaDevices.enumerateDevices();
        setDevices(nextDevices);
      }
      return true;
    } catch (error) {
      pendingRecordingPlayback?.pause();
      if (pendingRecordingUrl) URL.revokeObjectURL(pendingRecordingUrl);
      const name = error instanceof DOMException ? error.name : "";
      if (source === "recording") {
        stopPreviewStream(true);
        setPreviewError(error instanceof Error ? error.message : "The selected recording could not be opened.");
      } else if (name === "NotAllowedError" || name === "SecurityError") {
        setPreviewError(source === "screen"
          ? "Screen sharing was cancelled or blocked. Click Open preview and choose Screen or window share to try again."
          : "Webcam access was blocked. Allow Camera and Microphone for 127.0.0.1 in the browser address bar, then click Try camera again.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setPreviewError(source === "screen" ? "No shareable screen or window was found." : "No webcam was found. Connect one and try again.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setPreviewError("The selected camera is already in use by another app. Close that app or choose a different camera.");
      } else {
        setPreviewError(source === "camera" ? formatMediaDeviceError(error, { kind: "video", deviceId: state.live.videoDeviceId }) : error instanceof Error ? error.message : "The video source could not be opened.");
      }
      return false;
    } finally {
      setPreviewBusy(false);
    }
  };

  const openPreviewWindow = () => {
    if (window.matchMedia("(max-width: 760px)").matches) {
      setPopupBlocked(false);
      setMobilePreviewOpen(true);
      return null;
    }
    if (previewWindow && !previewWindow.closed) {
      previewWindow.focus();
      return previewWindow;
    }
    const popup = window.open("", "lantern-live-presentation", "popup=yes,width=980,height=660,resizable=yes,scrollbars=no");
    if (!popup) {
      setPopupBlocked(true);
      return null;
    }
    setPopupBlocked(false);
    popup.document.head.innerHTML = '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
    popup.document.title = "Project Lantern Live Preview";
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => popup.document.head.appendChild(node.cloneNode(true)));
    popup.document.body.className = "live-preview-popout-body";
    popup.document.body.innerHTML = '<div id="lantern-live-preview-root"></div>';
    popup.addEventListener("beforeunload", () => setPreviewWindow(null), { once: true });
    setPreviewWindow(popup);
    popup.focus();
    return popup;
  };

  const selectSource = (source: LanternState["live"]["source"], openWindow = false) => {
    setSourcePromptOpen(false);
    if (recordingActive) {
      setPreviewError("Stop the recording before changing its source.");
      return;
    }
    patchLive({ source, usingCamera: source === "camera", recordingId: source === "recording" ? selectedRecordingId || undefined : state.live.recordingId });
    if (openWindow) openPreviewWindow();
    if (source === "demo") {
      stopPreviewStream(true);
      setPreviewError(null);
      return;
    }
    void startPreview(source, source === "recording" ? selectedRecordingId : undefined);
  };

  const handleOpenPreview = () => {
    if (state.live.source === "demo") {
      setSourcePromptOpen(true);
      return;
    }
    openPreviewWindow();
    void startPreview(state.live.source);
  };

  const startRecording = () => {
    if (recordingPhase !== "idle") return;
    if (typeof MediaRecorder === "undefined") {
      setPreviewError("This browser does not support local video recording.");
      return;
    }
    let recordingInput: MediaStream;
    if (previewStreamRef.current) {
      recordingInput = previewStreamRef.current.clone();
    } else if (state.live.source === "demo") {
      const capture = createDemoRecordingCapture(state.live.title, state.live.lowerThird);
      if (!capture) {
        setPreviewError("This browser cannot record the generated test feed. Connect a camera or shared window instead.");
        return;
      }
      demoRecordingCaptureRef.current = capture;
      recordingInput = capture.stream;
    } else {
      setPreviewError(state.live.source === "recording" ? "Select and play a saved recording before capturing it again." : "Connect the selected camera or shared window before recording.");
      setLiveTab("setup");
      return;
    }
    const preferredTypes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(recordingInput, mimeType ? { mimeType } : undefined);
    } catch (error) {
      recordingInput.getTracks().forEach((track) => track.stop());
      demoRecordingCaptureRef.current?.stop();
      demoRecordingCaptureRef.current = null;
      setPreviewError(error instanceof Error ? error.message : "Recording could not be started in this browser.");
      return;
    }
    recordingInputRef.current = recordingInput;
    recordingContextRef.current = {
      source: state.live.source,
      target: state.live.target,
      targetLabel: targetOptionLabels(state)[state.live.target] ?? labelForTarget(state.live.target),
      screenIds: state.live.target === "all" ? Object.keys(state.screens) : [state.live.target]
    };
    recordingChunksRef.current = [];
    recordingClickAtRef.current = performance.now();
    recorderStartedAtRef.current = 0;
    firstRecordingDataAtRef.current = undefined;
    recordingStartedRef.current = Date.now();
    setRecordingSeconds(0);
    setRecordingPhase("starting");
    setPreviewError(null);
    recorder.addEventListener("start", () => {
      recorderStartedAtRef.current = performance.now();
      recordingStartedRef.current = Date.now();
      setRecordingPhase("recording");
    }, { once: true });
    recorder.addEventListener("dataavailable", (event) => {
      if (!event.data.size) return;
      if (firstRecordingDataAtRef.current === undefined) firstRecordingDataAtRef.current = performance.now();
      recordingChunksRef.current.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      setRecordingPhase("saving");
      recordingInputRef.current?.getTracks().forEach((track) => track.stop());
      recordingInputRef.current = null;
      demoRecordingCaptureRef.current?.stop();
      demoRecordingCaptureRef.current = null;
      const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "video/webm" });
      if (!blob.size) {
        recordingContextRef.current = null;
        setPreviewError("The recorder stopped without producing video data. Try a shorter source path or another browser.");
        setRecordingPhase("idle");
        setRecordingSeconds(0);
        return;
      }
      const createdAt = new Date();
      const recordingContext = recordingContextRef.current ?? {
        source: state.live.source,
        target: state.live.target,
        targetLabel: targetOptionLabels(state)[state.live.target] ?? labelForTarget(state.live.target),
        screenIds: state.live.target === "all" ? Object.keys(state.screens) : [state.live.target]
      };
      void captureRecordingThumbnail(blob).then((thumbnailDataUrl) => recordingLibraryStore.save({
        id: `recording-${createdAt.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
        title: normalizeRecordingTitle(`Lantern Live ${createdAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`),
        createdAt: createdAt.toISOString(),
        durationSeconds: Math.max(1, Math.round((Date.now() - recordingStartedRef.current) / 1000)),
        mimeType: blob.type || "video/webm",
        sizeBytes: blob.size,
        source: recordingContext.source,
        sourceLabel: recordingContext.source === "demo" ? "Generated test feed" : recordingContext.source === "screen" ? "Shared screen/window" : recordingContext.source === "recording" ? "Saved recording" : "Camera",
        target: recordingContext.target,
        targetLabel: recordingContext.targetLabel,
        screenIds: recordingContext.screenIds,
        thumbnailDataUrl,
        timings: recordingTimingMetrics(
          recordingClickAtRef.current,
          recorderStartedAtRef.current || performance.now(),
          firstRecordingDataAtRef.current
        ),
        blob
      })).then((saved) => {
        setRecordings((current) => sortRecordingLibrary([saved, ...current.filter((item) => item.id !== saved.id)]));
        setRecordingLibraryError(saved.storage === "memory" ? "IndexedDB was unavailable. This recording is available for this session and can still be downloaded." : null);
      }).catch(() => {
        setRecordingLibraryError("The recording finished, but the browser could not save it to the local library.");
      }).finally(() => {
        recordingContextRef.current = null;
        setRecordingPhase("idle");
        setRecordingSeconds(0);
      });
    }, { once: true });
    recorder.addEventListener("error", () => {
      recordingInputRef.current?.getTracks().forEach((track) => track.stop());
      recordingInputRef.current = null;
      demoRecordingCaptureRef.current?.stop();
      demoRecordingCaptureRef.current = null;
      recordingContextRef.current = null;
      setRecordingPhase("idle");
      setPreviewError("The browser recorder encountered an error. The live preview remains connected.");
    }, { once: true });
    recorderRef.current = recorder;
    try {
      recorder.start(250);
    } catch (error) {
      recordingInput.getTracks().forEach((track) => track.stop());
      demoRecordingCaptureRef.current?.stop();
      demoRecordingCaptureRef.current = null;
      recordingInputRef.current = null;
      recordingContextRef.current = null;
      setRecordingPhase("idle");
      setPreviewError(error instanceof Error ? error.message : "Recording could not be started.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const downloadRecording = (item: RecordingLibraryRecord) => {
    const url = URL.createObjectURL(item.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${normalizeRecordingTitle(item.title).replace(/[\\/:*?"<>|]/g, "-")}.webm`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const renameRecording = async (item: RecordingLibraryRecord, title: string) => {
    const updated = await recordingLibraryStore.rename(item.id, title);
    if (!updated) return;
    setRecordings((current) => sortRecordingLibrary(current.map((recordingItem) => recordingItem.id === updated.id ? updated : recordingItem)));
  };

  const deleteRecording = async (item: RecordingLibraryRecord) => {
    await recordingLibraryStore.delete(item.id);
    const remaining = recordings.filter((recordingItem) => recordingItem.id !== item.id);
    setRecordings(remaining);
    if (state.live.recordingId === item.id) {
      if (state.live.source === "recording") stopPreviewStream(true);
      patchLive({ recordingId: remaining[0]?.id });
    }
  };

  const sendRecording = async (item: RecordingLibraryRecord) => {
    try {
      recordingPlaybackRef.current?.pause();
      if (recordingPlaybackUrlRef.current) URL.revokeObjectURL(recordingPlaybackUrlRef.current);
      const url = URL.createObjectURL(item.blob);
      recordingPlaybackUrlRef.current = url;
      const playback = document.createElement("video");
      playback.src = url;
      playback.loop = true;
      playback.playsInline = true;
      playback.preload = "auto";
      recordingPlaybackRef.current = playback;
      await playback.play();
      const stream = (playback as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
      if (!stream) throw new Error("Recorded-video output is not supported by this browser.");
      setSendingRecordingId(item.id);
      await startLiveStream(stream, `Playing recording: ${item.title}`);
    } catch (error) {
      setSendingRecordingId(null);
      setPreviewError(error instanceof Error ? error.message : "The recording could not be sent to the displays.");
    }
  };

  const endLivePresentation = () => {
    recordingPlaybackRef.current?.pause();
    recordingPlaybackRef.current = null;
    if (recordingPlaybackUrlRef.current) URL.revokeObjectURL(recordingPlaybackUrlRef.current);
    recordingPlaybackUrlRef.current = null;
    setSendingRecordingId(null);
    stopLive();
  };

  const beginLivePresentation = () => {
    if (previewStream && state.live.source !== "demo") {
      void startLiveStream(previewStream.clone(), state.live.source === "screen" ? "Using approved screen share." : state.live.source === "recording" ? `Playing saved recording: ${selectedSourceRecording?.title ?? "Recording"}.` : "Using approved camera preview.");
      return;
    }
    if (state.live.source === "recording") {
      setPreviewError("Select and play a saved recording before going live.");
      setLiveTab("setup");
      return;
    }
    void startLive();
  };

  const enablePhoneMode = () => {
    stopPreviewStream(true);
    patchLive({
      source: "camera",
      chromaKey: { ...state.live.chromaKey, enabled: false },
      effects: {
        ...state.live.effects,
        background: "original",
        faceTracking: false,
        puppetPreview: false,
        trackingDebug: false,
        trackedPointsOverlay: false,
        glassesEnabled: false,
        hatEnabled: false,
        partyHatEnabled: false,
        costumeEnabled: false,
        handProp: "none"
      }
    });
    setPhoneMode(true);
  };

  const popoutScreens = popoutMode === "all" ? allScreens : [previewScreen];
  const previewPortal = previewWindow && !previewWindow.closed && previewWindow.document.getElementById("lantern-live-preview-root")
    ? createPortal(
        <div className="live-preview-popout-shell">
          <header className="live-preview-popout-header">
            <div><span className={state.live.active ? "live-indicator active" : "live-indicator"} /> <strong>Broadcast / Stream</strong><small>{labelForTarget(state.live.target)}</small></div>
            <button type="button" className="icon-button" onClick={() => previewWindow.close()} title="Close preview"><X size={18} /></button>
          </header>
          <div className={`live-popout-grid ${popoutScreens.length > 1 ? "multiple" : "single"}`}>
            {popoutScreens.map((screen) => <DirectLiveStage
              key={screen.id}
              state={state}
              screen={screen}
              live={state.live}
              stream={previewStream}
              mode="frame"
              previewError={previewError}
              boardProgramId={selectedPreviewBoardId}
              showBoard={popoutMode !== "broadcast"}
              interactive={false}
              onFrameChange={(frame) => patchDisplayLayout(screen.id, { frame })}
              onTitlePositionChange={(titlePosition) => patchDisplayLayout(screen.id, { titlePosition })}
              onLowerThirdPositionChange={(lowerThirdPosition) => patchDisplayLayout(screen.id, { lowerThirdPosition })}
            />)}
          </div>
          <footer className="live-preview-popout-footer"><span>{liveSourceLabel(state.live.source)}</span><span>{state.live.active ? "On air" : "Preview"}</span></footer>
        </div>,
        previewWindow.document.getElementById("lantern-live-preview-root")!
      )
    : null;

  return (
    <div className="form-panel live-setup-panel">
      {phoneMode ? <section className="phone-broadcast" aria-label="Phone broadcast controls">
        <header className="phone-broadcast-head">
          <div><span className={state.live.active ? "live-indicator active" : "live-indicator"} /><div><strong>{state.live.active ? "LIVE" : "Phone broadcast"}</strong><small>{state.live.active ? `Broadcasting to ${labelForTarget(state.live.target)}` : "Quick camera setup"}</small></div></div>
          <button type="button" className="command-button secondary compact" onClick={() => setPhoneMode(false)}>Full studio</button>
        </header>
        <div className="phone-broadcast-preview"><DirectLiveStage state={state} screen={previewScreen} live={state.live} stream={previewStream} mode="frame" previewError={previewError} interactive={false} boardProgramId={selectedPreviewBoardId} onFrameChange={(frame) => patchDisplayLayout(previewScreen.id, { frame })} onTitlePositionChange={(titlePosition) => patchDisplayLayout(previewScreen.id, { titlePosition })} onLowerThirdPositionChange={(lowerThirdPosition) => patchDisplayLayout(previewScreen.id, { lowerThirdPosition })} /></div>
        <div className="phone-broadcast-fields">
          <LabeledInput label="Your name" value={state.live.title} onChange={(title) => patchLive({ title })} />
          <LabeledInput label="Message" value={state.live.lowerThird} onChange={(lowerThird) => patchLive({ lowerThird })} />
          <LabeledSelect label="Broadcast to" value={state.live.target} options={targetOptions(state)} optionLabels={targetOptionLabels(state)} onChange={(target) => patchLive({ target: target as TargetScreen })} />
          <label className="switch-row phone-background-removal"><input type="checkbox" checked={backgroundRemoval.enabled} onChange={(event) => setBackgroundRemovalEnabled(event.target.checked)} /><span>Remove background</span></label>
        </div>
        {previewError && <p className="phone-broadcast-error">{previewError}</p>}
        <footer className="phone-broadcast-actions">
          <button type="button" className={previewStream ? "command-button secondary" : "command-button primary"} disabled={previewBusy} onClick={previewStream ? () => stopPreviewStream() : () => void startPreview("camera")}><Camera size={17} />{previewStream ? "Camera on" : previewBusy ? "Opening camera…" : "Turn on camera"}</button>
          <button type="button" className={state.live.active ? "command-button danger" : "command-button primary"} onClick={state.live.active ? endLivePresentation : beginLivePresentation}>{state.live.active ? <Square size={17} /> : <Radio size={17} />}{state.live.active ? "End live" : "Broadcast"}</button>
        </footer>
      </section> : <>
      <div className="live-panel-heading">
        <div><h2>Broadcast / Stream Studio <InfoDot text="Preview camera, microphone, title, and target display before starting a broadcast." /></h2><span className={previewWindow && !previewWindow.closed ? "preview-window-status open" : "preview-window-status"}>{previewWindow && !previewWindow.closed ? "Preview window open" : "Preview window closed"}</span></div>
        <div className="live-heading-actions">
          <button type="button" className="command-button phone-mode-button" onClick={enablePhoneMode}><Smartphone size={16} /> I’m on my phone</button>
          <label className="compact-heading-select"><span>Pop-out</span><select aria-label="Pop-out preview content" value={popoutMode} onChange={(event) => setPopoutMode(event.target.value as typeof popoutMode)}><option value="broadcast">Broadcast only</option><option value="selected">Selected display + broadcast</option><option value="all">Both displays + broadcast</option></select></label>
          <button type="button" className="command-button secondary compact" onClick={openPreviewWindow}><PictureInPicture2 size={17} /><span className="desktop-preview-label">{previewWindow && !previewWindow.closed ? "Focus preview" : "Pop out preview"}</span><span className="mobile-preview-label">Preview</span></button>
          <button className={state.live.active ? "command-button danger compact" : "command-button primary compact"} onClick={state.live.active ? endLivePresentation : beginLivePresentation}>
            {state.live.active ? <Square size={17} /> : <Play size={17} />}
            {state.live.active ? "End broadcast" : "Start broadcast"}
          </button>
        </div>
      </div>
      <div className="live-studio-workspace">
      <section className="live-program-monitor" aria-label="Broadcast preview">
        <div className="live-program-monitor-head">
          <div><span className={state.live.active ? "live-indicator active" : "live-indicator"} /><strong>{state.live.active ? "Program output" : "Preview"}</strong><label className="monitor-display-select"><span className="sr-only">Preview display</span><select aria-label="Preview display" value={state.live.target} disabled={recordingActive} title={recordingActive ? "Stop recording before changing the selected display." : undefined} onChange={(event) => patchLive({ target: event.target.value as TargetScreen })}>{targetOptions(state).map((option) => <option key={option} value={option}>{targetOptionLabels(state)[option]}</option>)}</select></label></div>
          <div className="live-program-monitor-tools">
            <span className="monitor-source-label">{liveSourceLabel(state.live.source)}</span>
            <div className="preview-view-mode" role="group" aria-label="Board preview dimension"><button type="button" className={boardViewMode === "2d" ? "active" : ""} aria-pressed={boardViewMode === "2d"} onClick={() => setBoardViewMode("2d")}><Lock size={12} /> 2D</button><button type="button" className={boardViewMode === "3d" ? "active" : ""} aria-pressed={boardViewMode === "3d"} onClick={() => setBoardViewMode("3d")}><Rotate3d size={12} /> 3D</button></div>
            <div className="recording-control-cluster" ref={recordingMenuRef}>
              <button type="button" className={recordingActive ? "monitor-record-button recording" : "monitor-record-button"} disabled={recordingPhase === "starting" || recordingPhase === "saving"} onClick={recordingActive ? stopRecording : startRecording}>{recordingActive ? <Square size={12} /> : <Circle size={12} />}<span>{recordingPhase === "starting" ? "Starting…" : recordingPhase === "saving" ? "Saving…" : recordingActive ? `Stop ${formatCountdown(recordingSeconds)}` : "Record"}</span></button>
              <button type="button" className={recordingMenuOpen ? "monitor-library-button active" : "monitor-library-button"} aria-haspopup="dialog" aria-expanded={recordingMenuOpen} title="Open saved recording library" onClick={() => setRecordingMenuOpen((open) => !open)}><Video size={12} /><span>{recordings.length}</span><ChevronDown size={11} /></button>
              {recordingMenuOpen && <div className="recording-library-popover" role="dialog" aria-label="Recording controls and saved files">
                <div className="recording-popover-status"><strong>{recordingActive ? <><i className="recording-live-dot" /> Recording in progress</> : recordingPhase === "saving" ? "Finalizing recording" : "Local recordings"}</strong><small>{recordingActive ? "Preview and tracking stay live; source controls are locked." : "Hover a filename to preview its thumbnail."}</small></div>
                <p className="recording-safety-note">Captures use the approved source stream. Editor guides are excluded unless they are inside a shared-window source.</p>
                <RecordingLibrary compact recordings={recordings} loading={recordingLibraryLoading} error={recordingLibraryError} sendingId={sendingRecordingId} onSend={(recordingItem) => void sendRecording(recordingItem)} onDownload={downloadRecording} onRename={(recordingItem, title) => void renameRecording(recordingItem, title)} onDelete={(recordingItem) => void deleteRecording(recordingItem)} />
              </div>}
            </div>
          </div>
        </div>
        <div className={`persistent-live-preview ${previewScreens.length > 1 ? "multiple" : "single"}`}>{previewScreens.map((screen, index) => <DirectLiveStage key={screen.id} state={state} screen={screen} live={state.live} stream={previewStream} mode={directMode} previewError={previewError} boardProgramId={selectedPreviewBoardId} boardViewMode={boardViewMode} onTrackingStatus={index === 0 ? setTrackingStatus : undefined} onFrameChange={(frame) => patchDisplayLayout(screen.id, { frame })} onTitlePositionChange={(titlePosition) => patchDisplayLayout(screen.id, { titlePosition })} onLowerThirdPositionChange={(lowerThirdPosition) => patchDisplayLayout(screen.id, { lowerThirdPosition })} />)}</div>
      </section>
      <aside className="live-inspector" aria-label="Broadcast controls">
      <EditorTabs value={liveTab} options={[["setup", "Source"], ["frame", "Frame & crop"], ["effects", "Effects"]]} onChange={(value) => setLiveTab(value as typeof liveTab)} />
      {liveTab === "setup" && <div className="live-tab-panel setup-tab">
      <LabeledInput label="Title" info="The live presentation title shown on the lower third." value={state.live.title} onChange={(value) => patchLive({ title: value })} />
      <LabeledInput label="Lower third" info="The smaller caption shown under the title." value={state.live.lowerThird} onChange={(value) => patchLive({ lowerThird: value })} />
      <p className="direct-manipulation-hint text-layer-hint">Drag the title and lower-third text directly in either preview to place each one independently.</p>
      <div className="two-col">
        <LabeledSelect label="Preview board" info="Board shown behind the broadcast while setting up in this window and its previews." value={previewBoardId} options={["assigned", ...state.boardPrograms.map((program) => program.id)]} optionLabels={{ assigned: "Assigned board for each display", ...Object.fromEntries(state.boardPrograms.map((program) => [program.id, program.name])) }} onChange={setPreviewBoardId} />
        <LabeledSelect label="Video source" info={recordingActive ? "Stop recording before changing the approved source." : "Choose a camera, shared window, saved recording, or generated local test feed."} value={state.live.source} options={["demo", "camera", "screen", "recording"]} optionLabels={{ demo: "Generated test feed", camera: "Camera", screen: "Screen or window share", recording: "Saved recording" }} disabled={recordingActive} onChange={(value) => selectSource(value as LanternState["live"]["source"])} />
      </div>
      <div className="two-col">
        {state.live.source === "recording" ? <>
          <LabeledSelect label="Recording" info="Saved local video used for preview, pop-out, and live output." value={selectedRecordingId} options={recordings.map((recording) => recording.id)} optionLabels={recordingSourceLabels} disabled={recordingActive || recordingLibraryLoading || !recordings.length} onChange={(recordingId) => { patchLive({ recordingId }); void startPreview("recording", recordingId); }} />
          <div className="recording-source-audio"><Volume2 size={17} /><span><strong>Recording audio</strong><small>{selectedSourceRecording ? "Uses the audio embedded in the selected file." : recordingLibraryLoading ? "Loading saved recordings…" : "Record a video to make it available here."}</small></span></div>
        </> : <>
          <LabeledSelect label="Camera" info={recordingActive ? "Camera selection is locked while recording." : "Camera used for preview and live mode."} value={state.live.videoDeviceId ?? ""} options={cameraOptions.options} optionLabels={cameraOptions.labels} disabled={recordingActive} onChange={(value) => patchLive({ videoDeviceId: value || undefined })} />
          <LabeledSelect label="Microphone" info={recordingActive ? "Microphone selection is locked while recording." : "Microphone used for live mode when the browser allows it."} value={state.live.audioDeviceId ?? ""} options={micOptions.options} optionLabels={micOptions.labels} disabled={recordingActive} onChange={(value) => patchLive({ audioDeviceId: value || undefined })} />
        </>}
      </div>
      <section className={previewError || popupBlocked ? "source-connection-card error" : previewStream ? "source-connection-card ready" : "source-connection-card"}>
        <div className="source-connection-status">
          {previewStream ? <CheckCircle2 size={17} /> : previewError || popupBlocked ? <AlertTriangle size={17} /> : <Camera size={17} />}
          <div><strong>{previewBusy ? (state.live.source === "recording" ? "Opening recording…" : "Waiting for permission…") : previewStream ? "Video source connected" : state.live.source === "demo" ? "Test feed selected" : "Video source not connected"}</strong><span>{previewError ?? (popupBlocked ? "The browser blocked the preview window. Allow pop-ups, then try again." : previewStream ? "The selected source is ready for preview and broadcast." : state.live.source === "camera" ? "Start the camera to connect this source." : state.live.source === "screen" ? "Start sharing to choose a screen or window." : state.live.source === "recording" ? selectedSourceRecording ? `Play ${selectedSourceRecording.title} to preview it.` : "Make a recording first, then select it here." : "The generated feed is ready without a camera.")}</span></div>
        </div>
        {state.live.source !== "demo" && <button type="button" className={previewStream ? "command-button danger compact" : "command-button primary compact"} disabled={previewBusy || recordingActive || (state.live.source === "recording" && !selectedSourceRecording)} onClick={previewStream ? () => stopPreviewStream() : () => void startPreview(state.live.source, selectedRecordingId)}>
          {previewStream ? <Square size={15} /> : state.live.source === "recording" ? <Play size={15} /> : <Camera size={15} />}
          {recordingActive ? "Source locked while recording" : previewBusy ? (state.live.source === "recording" ? "Opening…" : "Connecting…") : previewStream ? (state.live.source === "camera" ? "Stop camera" : state.live.source === "screen" ? "Stop sharing" : "Stop recording preview") : previewError ? (state.live.source === "camera" ? "Try camera again" : state.live.source === "screen" ? "Try sharing again" : "Try recording again") : (state.live.source === "camera" ? "Start camera" : state.live.source === "screen" ? "Start sharing" : "Play recording")}
        </button>}
      </section>
      </div>}
      {liveTab === "frame" && <div className="live-frame-tab live-tab-panel">
        <div className="live-toolbox direct-frame-controls">
          <div className="direct-control-heading"><h3>Direct manipulation</h3><SegmentedControl value={directMode} options={[["frame", "Move & resize"], ["crop", "Pan, zoom & crop"]]} onChange={(value) => setDirectMode(value as typeof directMode)} /></div>
          <div className="field camera-source-fit"><span>Source fit <InfoDot text="Fill covers the camera panel. Fit keeps the whole camera or shared window visible." /></span><SegmentedControl value={liveComposition.frame.fitMode ?? "fill"} options={[["fill", "Fill frame"], ["fit", "Fit whole source"]]} onChange={(value) => patchLive({ frame: { ...state.live.frame, fitMode: value as "fit" | "fill", crop: { ...state.live.frame.crop, scale: value === "fit" ? Math.min(state.live.frame.crop.scale, 1) : Math.max(state.live.frame.crop.scale, 1) } } })} /></div>
          {directMode === "frame" ? <div className="four-col">
            <Slider label="Left" info="Video position from the left edge." value={state.live.frame.x} min={0} max={90} onChange={(value) => patchLive({ frame: { ...state.live.frame, x: Math.min(value, 100 - state.live.frame.width) } })} />
            <Slider label="Top" info="Video position from the top edge." value={state.live.frame.y} min={0} max={90} onChange={(value) => patchLive({ frame: { ...state.live.frame, y: Math.min(value, 100 - state.live.frame.height) } })} />
            <Slider label="Width" info="Video section width." value={state.live.frame.width} min={10} max={100 - state.live.frame.x} onChange={(value) => patchLive({ frame: { ...state.live.frame, width: value } })} />
            <Slider label="Height" info="Video section height." value={state.live.frame.height} min={10} max={100 - state.live.frame.y} onChange={(value) => patchLive({ frame: { ...state.live.frame, height: value } })} />
          </div> : <div className="camera-crop-controls">
            <div className="camera-zoom-control">
              <button type="button" className="icon-button" title="Zoom camera out" onClick={() => patchLive({ frame: { ...state.live.frame, crop: { ...state.live.frame.crop, scale: clamp(state.live.frame.crop.scale - .1, liveComposition.frame.fitMode === "fit" ? .5 : 1, 3) } } })}>−</button>
              <Slider label="Camera zoom" info="Make the camera image larger inside its frame. You can also use the mouse wheel over the preview." value={Math.round(state.live.frame.crop.scale * 100)} min={liveComposition.frame.fitMode === "fit" ? 50 : 100} max={300} onChange={(value) => patchLive({ frame: { ...state.live.frame, crop: { ...state.live.frame.crop, scale: value / 100 } } })} />
              <button type="button" className="icon-button" title="Zoom camera in" onClick={() => patchLive({ frame: { ...state.live.frame, crop: { ...state.live.frame.crop, scale: clamp(state.live.frame.crop.scale + .1, 1, 3) } } })}>+</button>
            </div>
            <div className="two-col">
              <Slider label="Pan left / right" info="Pan the camera image left or right inside its frame." value={state.live.frame.crop.x} min={-50} max={50} onChange={(value) => patchLive({ frame: { ...state.live.frame, crop: { ...state.live.frame.crop, x: value } } })} />
              <Slider label="Pan up / down" info="Pan the camera image vertically inside its frame." value={state.live.frame.crop.y} min={-50} max={50} onChange={(value) => patchLive({ frame: { ...state.live.frame, crop: { ...state.live.frame.crop, y: value } } })} />
            </div>
            <div className="four-col camera-edge-crop-controls">
              <Slider label="Crop top" info="Hide only the top edge of the camera source." value={sourceCropEdges.top} min={0} max={45} onChange={(top) => patchLive({ frame: { ...state.live.frame, cropEdges: normalizeCropEdges({ ...sourceCropEdges, top }) } })} />
              <Slider label="Crop right" info="Hide only the right edge of the camera source." value={sourceCropEdges.right} min={0} max={45} onChange={(right) => patchLive({ frame: { ...state.live.frame, cropEdges: normalizeCropEdges({ ...sourceCropEdges, right }) } })} />
              <Slider label="Crop bottom" info="Hide only the bottom edge of the camera source." value={sourceCropEdges.bottom} min={0} max={45} onChange={(bottom) => patchLive({ frame: { ...state.live.frame, cropEdges: normalizeCropEdges({ ...sourceCropEdges, bottom }) } })} />
              <Slider label="Crop left" info="Hide only the left edge of the camera source." value={sourceCropEdges.left} min={0} max={45} onChange={(left) => patchLive({ frame: { ...state.live.frame, cropEdges: normalizeCropEdges({ ...sourceCropEdges, left }) } })} />
            </div>
            <button type="button" className="command-button secondary compact reset-edge-crop" disabled={!Object.values(sourceCropEdges).some(Boolean)} onClick={() => patchLive({ frame: { ...state.live.frame, cropEdges: { top: 0, right: 0, bottom: 0, left: 0 } } })}><RotateCcw size={14} /> Reset edge crop</button>
          </div>}
          <div className="live-transform-controls"><LabeledSelect label="Mask" info="Choose the visible shape of the live source." value={state.live.frame.maskShape ?? "rectangle"} options={["rectangle", "square", "circle", "polygon"]} optionLabels={{ rectangle: "Rectangle", square: "Square", circle: "Circle", polygon: "Custom polygon" }} onChange={(value) => {
            const maskShape = value as NonNullable<LanternState["live"]["frame"]["maskShape"]>;
            const size = maskShape === "square" ? Math.min(state.live.frame.width, state.live.frame.height, 100 - state.live.frame.x, 100 - state.live.frame.y) : null;
            patchLive({ frame: { ...state.live.frame, maskShape, width: size ?? state.live.frame.width, height: size ?? state.live.frame.height, polygonPoints: maskShape === "polygon" ? (state.live.frame.polygonPoints?.length ? state.live.frame.polygonPoints : undefined) : state.live.frame.polygonPoints } });
          }} /><Slider label="Camera rotation" info="Rotate only the camera image inside its frame." value={state.live.frame.rotation ?? 0} min={-180} max={180} editableValue onChange={(rotation) => patchLive({ frame: { ...state.live.frame, rotation } })} /><label className="switch-row"><input type="checkbox" checked={state.live.frame.mirrorX ?? false} onChange={(event) => patchLive({ frame: { ...state.live.frame, mirrorX: event.target.checked } })} /><span>Mirror Camera (Left/Right)</span></label><label className="switch-row"><input type="checkbox" checked={state.live.frame.mirrorY ?? false} onChange={(event) => patchLive({ frame: { ...state.live.frame, mirrorY: event.target.checked } })} /><span>Flip Camera (Up/Down)</span></label></div>
          <label className="field camera-panel-color"><span>Camera panel color <InfoDot text="Visible behind fitted or independently cropped camera edges." /></span><input type="color" value={state.live.panelColor} onChange={(event) => patchLive({ panelColor: event.target.value })} /></label>
          <BroadcastCompositionControls live={state.live} onPatch={patchLive} />
          {(state.live.frame.maskShape === "circle" || state.live.frame.maskShape === "polygon") && <p className="direct-manipulation-hint">Hold Shift while dragging an edge to scale proportionally. Polygon points can be dragged anywhere; hover an edge midpoint to add a point.</p>}
        </div>
      </div>}
      {liveTab === "effects" && <div className="live-toolbox live-tab-panel effects-tab">
        <div className="effect-section-heading"><h3>Background Removal</h3><span>One local pipeline at a time</span></div>
        <label className="switch-row background-removal-toggle">
          <input type="checkbox" checked={backgroundRemoval.enabled} onChange={(event) => setBackgroundRemovalEnabled(event.target.checked)} />
          <span><strong>Background Removal</strong><small>{backgroundRemoval.enabled ? `On — ${selectedRemovalMethod === "chroma" ? "Chroma Key" : "Screenless Removal"}` : "Off — the camera background remains visible"}</small></span>
        </label>

        {backgroundRemoval.enabled && <div className="background-removal-methods">
          <div className="field removal-method-field"><span>Removal method</span><SegmentedControl value={selectedRemovalMethod} options={[["chroma", "Chroma Key"], ["screenless", "Screenless Removal"]]} onChange={(value) => selectBackgroundRemovalMethod(value as BackgroundRemovalMethod)} /></div>
          <p className="background-removal-help"><strong>Chroma Key</strong> removes a chosen backdrop color. <strong>Screenless Removal</strong> uses {SCREENLESS_REMOVAL_TECHNOLOGY.name} ({SCREENLESS_REMOVAL_TECHNOLOGY.model}) locally in this browser. They are separate pipelines and cannot be combined; camera frames are not sent to a background-removal service.</p>
        </div>}

        {backgroundRemoval.enabled && selectedRemovalMethod === "chroma" && <section className="effect-settings-card chroma-settings-card">
          <div className="effect-card-heading"><div><strong>Chroma Key</strong><span>Choose or sample the color of a physical backdrop</span></div><b>LOCAL</b></div>
          <div className="chroma-preset-row" role="group" aria-label="Chroma Key color presets">
            {CHROMA_KEY_PRESETS.map((preset) => <button type="button" key={preset.id} className={`chroma-preset-button${selectedChromaPreset === preset.id ? " selected" : ""}`} aria-pressed={selectedChromaPreset === preset.id} onClick={() => patchLive({ chromaKey: { ...state.live.chromaKey, color: preset.color } })}><i style={{ background: preset.color }} />{preset.label}</button>)}
            <label className={`chroma-preset-button chroma-custom-color${selectedChromaPreset === "custom" ? " selected" : ""}`}><i style={{ background: state.live.chromaKey.color }} /><span>Custom</span><input type="color" aria-label="Custom Chroma Key color" value={state.live.chromaKey.color} onChange={(event) => patchLive({ chromaKey: { ...state.live.chromaKey, color: event.target.value } })} /></label>
          </div>
          <ChromaKeySampler stream={previewStream} active={chromaSamplerActive} currentColor={state.live.chromaKey.color} onActiveChange={setChromaSamplerActive} onSample={(color) => patchLive({ chromaKey: { ...state.live.chromaKey, color } })} />
          <div className="three-col">
            <Slider label="Similarity" info="How close a pixel must be to the key color." value={Math.round(state.live.chromaKey.similarity * 100)} min={5} max={80} onChange={(value) => patchLive({ chromaKey: { ...state.live.chromaKey, similarity: value / 100 } })} />
            <Slider label="Edge feather" info="Softens the keyed edge without erasing the subject." value={Math.round(state.live.chromaKey.smoothness * 100)} min={1} max={40} onChange={(value) => patchLive({ chromaKey: { ...state.live.chromaKey, smoothness: value / 100 } })} />
            <Slider label="Spill cleanup" info="Removes reflected key color from hair and clothing." value={Math.round(state.live.chromaKey.spill * 100)} min={0} max={60} onChange={(value) => patchLive({ chromaKey: { ...state.live.chromaKey, spill: value / 100 } })} />
          </div>
        </section>}

        {backgroundRemoval.enabled && selectedRemovalMethod === "screenless" && <section className="effect-settings-card ai-settings-card">
          <div className="effect-card-heading"><div><strong>Screenless Removal</strong><span>{SCREENLESS_REMOVAL_TECHNOLOGY.name} runs person segmentation in this browser</span></div><b>LOCAL</b></div>
          <div className="field"><span>Background result <InfoDot text="Keep only the person, blur the room, or place a local image behind them." /></span><SegmentedControl value={state.live.effects.background} options={[["remove", "Remove"], ["blur", "Blur"], ["image", "Image"]]} onChange={(value) => patchLive({ chromaKey: { ...state.live.chromaKey, enabled: false }, effects: { ...state.live.effects, background: value as LanternState["live"]["effects"]["background"] } })} /></div>
          <div className="three-col ai-precision-controls">
            <Slider label="Edge precision" info="Raise this to reject more background; lower it to retain fine hair and hands." value={Math.round(state.live.effects.segmentationThreshold * 100)} min={20} max={75} onChange={(value) => patchLive({ effects: { ...state.live.effects, segmentationThreshold: value / 100 } })} />
            <Slider label="Edge feather" info="Smooths the transition around the segmented person." value={Math.round(state.live.effects.segmentationFeather * 100)} min={4} max={35} onChange={(value) => patchLive({ effects: { ...state.live.effects, segmentationFeather: value / 100 } })} />
            {state.live.effects.background === "blur" ? <Slider label="Background blur" info="Blur strength behind the segmented person." value={state.live.effects.blur} min={4} max={40} onChange={(value) => patchLive({ effects: { ...state.live.effects, blur: value } })} /> : <div className="effect-setting-note">Mask updates are stabilized between frames to reduce edge flicker.</div>}
          </div>
          {state.live.effects.background === "image" && <div className="background-image-status">
            {state.live.effects.backgroundImage && <img src={state.live.effects.backgroundImage} alt="Current screenless-removal background" />}
            <button type="button" className="command-button secondary compact" onClick={() => patchLive({ chromaKey: { ...state.live.chromaKey, enabled: false }, effects: { ...state.live.effects, background: "image", backgroundImage: `${import.meta.env.BASE_URL}assets/characters/friendly-zombie/03-backgrounds/friendly-zombie__background__halloween-garden__v01.png` } })}><Sparkles size={14} /> Friendly Halloween scene</button>
            <label className="image-upload"><ImagePlus size={17} /><span>{state.live.effects.backgroundImage ? "Replace background image" : "Choose background image"}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void readSharedImageFile(event.target.files?.[0], (backgroundImage) => patchLive({ effects: { ...state.live.effects, backgroundImage } }))} /></label>
            {state.live.effects.backgroundImage && <button type="button" className="command-button secondary compact" onClick={() => patchLive({ effects: { ...state.live.effects, backgroundImage: undefined } })}>Clear image</button>}
          </div>}
        </section>}

        <section className="effect-settings-card face-settings-card">
          <div className="effect-card-heading"><div><strong>Face effects</strong><span>Choose a friendly style, then turn on the camera preview.</span></div><b>{trackingStatus?.phase === "tracking" || trackingStatus?.phase === "degraded" ? `${Math.round(trackingStatus.renderedFps)} FPS` : trackingStatus?.phase === "detecting" || trackingStatus?.phase === "warming" ? "DETECTING" : "LOCAL"}</b></div>
          <label className="switch-row face-effect-toggle"><input type="checkbox" checked={state.live.effects.faceTracking} onChange={(event) => patchLive({ effects: { ...state.live.effects, faceTracking: event.target.checked, puppetPreview: event.target.checked && state.live.effects.puppetPreview, trackingDebug: event.target.checked && state.live.effects.trackingDebug, trackedPointsOverlay: event.target.checked && state.live.effects.trackedPointsOverlay } })} /><ScanFace size={16} /><span><strong>Face, body & hand tracking</strong><small>{trackingStatus?.phase === "detecting" || trackingStatus?.phase === "warming" ? "Detecting face…" : "Head, ears, eyes, mouth, shoulders, hands and fingers"}</small></span><InfoDot text="The local tracker warms once, stabilizes landmarks between frames, and adapts between 60 and 30 FPS when needed." /></label>
          <div className="phase4-effect-choice-grid">
            <div><span>Glasses</span><div className="accessory-options"><button type="button" className={!state.live.effects.glassesEnabled ? "selected" : ""} onClick={() => patchLive({ effects: { ...state.live.effects, glassesEnabled: false } })}>Off</button>{(["classic", "playful"] as const).map((style) => <button type="button" key={style} className={state.live.effects.glassesEnabled && (state.live.effects.glassesStyle ?? "classic") === style ? "selected" : ""} onClick={() => patchLive({ effects: { ...state.live.effects, glassesEnabled: true, glassesStyle: style, accessory: "glasses", faceTracking: true } })}><Glasses size={15} /> {style === "classic" ? "Classic" : "Playful"}</button>)}</div></div>
            <div><span>Hats</span><div className="accessory-options"><button type="button" className={!state.live.effects.hatEnabled ? "selected" : ""} onClick={() => patchLive({ effects: { ...state.live.effects, hatEnabled: false, partyHatEnabled: false } })}>Off</button>{(["party", "wizard"] as const).map((style) => <button type="button" key={style} className={state.live.effects.hatEnabled && (state.live.effects.hatStyle ?? "party") === style ? "selected" : ""} onClick={() => patchLive({ effects: { ...state.live.effects, hatEnabled: true, partyHatEnabled: style === "party", hatStyle: style, faceTracking: true } })}><PartyPopper size={15} /> {style === "party" ? "Party" : "Wizard"}</button>)}</div></div>
            <div><span>Hand prop</span><div className="accessory-options"><button type="button" className={!state.live.effects.handProp || state.live.effects.handProp === "none" ? "selected" : ""} onClick={() => patchLive({ effects: { ...state.live.effects, handProp: "none" } })}>Off</button>{(["wand", "dagger"] as const).map((prop) => <button type="button" key={prop} className={state.live.effects.handProp === prop ? "selected" : ""} onClick={() => patchLive({ effects: { ...state.live.effects, handProp: prop, handPropHand: state.live.effects.handPropHand ?? "right", faceTracking: true } })}><Sparkles size={15} /> {prop === "wand" ? "Wand" : "Dagger"}</button>)}</div></div>
          </div>
          {state.live.effects.handProp && state.live.effects.handProp !== "none" && <div className="accessory-options hand-prop-hand"><span>Holding hand</span>{(["left", "right"] as const).map((hand) => <button type="button" key={hand} className={(state.live.effects.handPropHand ?? "right") === hand ? "selected" : ""} onClick={() => patchLive({ effects: { ...state.live.effects, handPropHand: hand } })}>{hand === "left" ? "Left" : "Right"}</button>)}</div>}
          {state.live.effects.hatEnabled && state.live.effects.hatStyle === "wizard" && <div className="two-col wizard-rig-controls"><Slider label="Wizard springiness" info="How eagerly the three linked hat segments follow head movement." value={Math.round((state.live.effects.wizardSpringiness ?? .56) * 100)} min={0} max={100} onChange={(value) => patchLive({ effects: { ...state.live.effects, wizardSpringiness: value / 100 } })} /><Slider label="Wizard damping" info="How quickly the floppy tip settles after movement." value={Math.round((state.live.effects.wizardDamping ?? .7) * 100)} min={0} max={100} onChange={(value) => patchLive({ effects: { ...state.live.effects, wizardDamping: value / 100 } })} /></div>}
        </section>
        <EffectStudio
          studio={state.effectStudio}
          effects={state.live.effects}
          userId={activeUserId ?? state.users[0]?.id ?? "local-user"}
          deviceId={state.live.videoDeviceId}
          trackingStatus={trackingStatus}
          onStudioChange={(effectStudio) => updateState((current) => ({ ...current, effectStudio }))}
          onEffectsChange={(effects) => patchLive({ effects })}
        />
      </div>}
      </aside>
      </div>
      </>}
      {previewPortal}
      {mobilePreviewOpen && <div className="mobile-live-preview" role="dialog" aria-modal="true" aria-label="Live presentation preview">
        <header><div><span className={state.live.active ? "live-indicator active" : "live-indicator"} /><strong>Live presentation</strong><small>{previewScreen.label}</small></div><button type="button" className="icon-button" onClick={() => setMobilePreviewOpen(false)} title="Close preview"><X size={18} /></button></header>
        <div className="mobile-live-preview-stage"><DirectLiveStage state={state} screen={previewScreen} live={state.live} stream={previewStream} mode={directMode} previewError={previewError} boardProgramId={selectedPreviewBoardId} onFrameChange={(frame) => patchDisplayLayout(previewScreen.id, { frame })} onTitlePositionChange={(titlePosition) => patchDisplayLayout(previewScreen.id, { titlePosition })} onLowerThirdPositionChange={(lowerThirdPosition) => patchDisplayLayout(previewScreen.id, { lowerThirdPosition })} /></div>
        <footer><span>{liveSourceLabel(state.live.source)}</span><span>{state.live.active ? "On air" : "Preview"}</span></footer>
      </div>}
      {sourcePromptOpen && <div className="modal-backdrop preview-source-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourcePromptOpen(false); }}>
        <section className="preview-source-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-source-title">
          <div className="preview-source-head"><div><p className="eyebrow">Preview source</p><h2 id="preview-source-title">What do you want to preview?</h2></div><button type="button" className="icon-button" onClick={() => setSourcePromptOpen(false)} title="Close"><X size={18} /></button></div>
          <div className="preview-source-options">
            <button type="button" onClick={() => selectSource("camera", true)}><Camera size={24} /><strong>Use webcam</strong><span>Ask for camera and microphone access.</span></button>
            <button type="button" onClick={() => selectSource("screen", true)}><Monitor size={24} /><strong>Share a window</strong><span>Choose Zoom, Skype, or another screen.</span></button>
            <button type="button" disabled={!recordings.length} onClick={() => selectSource("recording", true)}><Play size={24} /><strong>Use recording</strong><span>{recordings.length ? `Play ${selectedSourceRecording?.title ?? "a saved recording"}.` : "No saved recordings yet."}</span></button>
            <button type="button" onClick={() => selectSource("demo", true)}><Video size={24} /><strong>Use test feed</strong><span>Open the generated preview without a camera.</span></button>
          </div>
        </section>
      </div>}
    </div>
  );
}

function AnnouncementMonitorSurface({
  state,
  screen,
  announcement,
  onPatch,
  startedAt,
  playOnComplete = false,
  demo = false
}: {
  state: LanternState;
  screen: DisplayProfile;
  announcement: LanternState["announcement"];
  onPatch?: (patch: Partial<LanternState["announcement"]>) => void;
  startedAt?: string;
  playOnComplete?: boolean;
  demo?: boolean;
}) {
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1, rotateX: -3, rotateY: 7 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; view: typeof view; pan: boolean } | null>(null);
  const resetView = () => setView({ x: 0, y: 0, zoom: 1, rotateX: -3, rotateY: 7 });
  useEffect(() => {
    // Every display format begins centered at its natural, maximum fitted size.
    setViewMode("2d");
    setEditing(false);
    resetView();
  }, [screen.id]);
  const setMode = (mode: "2d" | "3d") => {
    setViewMode(mode);
    resetView();
  };
  const beginViewDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest(".monitor-view-controls, .announcement-edit-handle, [contenteditable='true'], .announcement-image.editable")) return;
    // Clicking the display background clears the physical-editing chrome so the
    // user can inspect the actual board without handles and resize edges.
    if (editing) setEditing(false);
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, view, pan: viewMode === "2d" || event.shiftKey || event.button === 1 };
  };
  const moveViewDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (drag.pan) {
      setView({ ...drag.view, x: drag.view.x + dx, y: drag.view.y + dy });
    } else {
      setView({ ...drag.view, rotateX: clamp(drag.view.rotateX - dy * .1, -24, 24), rotateY: clamp(drag.view.rotateY + dx * .12, -28, 28) });
    }
  };
  const endViewDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const transform = viewMode === "3d"
    ? `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom}) rotateX(${view.rotateX}deg) rotateY(${view.rotateY}deg)`
    : `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})`;

  return <div className={`announcement-monitor${demo ? " demo" : ""} mode-${viewMode}${editing ? " editing" : ""}`}>
    <div className="monitor-view-controls">
      {onPatch && <button type="button" className={editing ? "active edit-toggle" : "edit-toggle"} onClick={() => setEditing((current) => !current)}><Pencil size={14} /> {editing ? "Finish editing" : "Edit"}</button>}
      <button type="button" className={viewMode === "2d" ? "active" : ""} onClick={() => setMode("2d")}><Monitor size={14} /> 2D</button>
      <button type="button" className={viewMode === "3d" ? "active" : ""} onClick={() => setMode("3d")}><Rotate3d size={14} /> 3D</button>
      <button type="button" onClick={() => setView((current) => ({ ...current, zoom: clamp(current.zoom - .12, .45, 2.5) }))} title="Zoom out"><ZoomOut size={14} /></button>
      <span>{Math.round(view.zoom * 100)}%</span>
      <button type="button" onClick={() => setView((current) => ({ ...current, zoom: clamp(current.zoom + .12, .45, 2.5) }))} title="Zoom in"><ZoomIn size={14} /></button>
      <button type="button" onClick={resetView} title="Reset view"><RotateCcw size={14} /></button>
    </div>
    <div className="announcement-monitor-viewport" onPointerDown={beginViewDrag} onPointerMove={moveViewDrag} onPointerUp={endViewDrag} onPointerCancel={endViewDrag} onWheel={(event) => {
      event.preventDefault();
      setView((current) => ({ ...current, zoom: clamp(current.zoom + (event.deltaY < 0 ? .1 : -.1), .45, 2.5) }));
    }}>
      <div className={`announcement-monitor-surface ${orientationClass(screen)}`} style={{ transform }}>
        <BabylonDonorWall state={state} screenId={screen.id} fitToScreen viewMode="2d" announcementCharacter={announcement.character} announcementActive announcementCharacterAsset={announcement} />
        <FixedAnnouncementComposition screen={screen} announcement={announcement} startedAt={startedAt} playOnComplete={playOnComplete} editing={editing} onPatch={onPatch} />
      </div>
    </div>
    <div className="monitor-view-hint">{editing ? <><Move size={13} /> Drag the text box, timer, or image · click text to edit</> : viewMode === "3d" ? <><Move3d size={13} /> Drag to orbit · Shift-drag to pan · wheel to zoom</> : <><Move size={13} /> Drag to pan · wheel to zoom</>}</div>
  </div>;
}

function FixedAnnouncementComposition({
  screen,
  announcement,
  startedAt,
  playOnComplete = false,
  editing = false,
  onPatch
}: {
  screen: DisplayProfile;
  announcement: LanternState["announcement"];
  startedAt?: string;
  playOnComplete?: boolean;
  editing?: boolean;
  onPatch?: (patch: Partial<LanternState["announcement"]>) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const portrait = screen.orientation === "Portrait";
  const designWidth = portrait ? 900 : 1600;
  const designHeight = portrait ? 1600 : 900;
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const updateScale = () => {
      const bounds = host.getBoundingClientRect();
      setScale(Math.min(bounds.width / designWidth, bounds.height / designHeight));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(host);
    return () => observer.disconnect();
  }, [designHeight, designWidth]);

  return <div ref={hostRef} className={`fixed-announcement-composition${editing ? " editable" : ""}`}>
    <div className={`announcement-fixed-canvas ${portrait ? "portrait" : "landscape"}`} style={{ width: designWidth, height: designHeight, transform: `translate(-50%, -50%) scale(${scale})` }}>
      <AnnouncementLayer announcement={announcement} preview startedAt={startedAt} playOnComplete={playOnComplete} editing={editing} onPatch={onPatch} />
    </div>
  </div>;
}

function AnnouncementLayer({
  announcement,
  preview = false,
  startedAt,
  playOnComplete = false,
  editing = false,
  onPatch
}: {
  announcement: LanternState["announcement"];
  preview?: boolean;
  startedAt?: string;
  playOnComplete?: boolean;
  editing?: boolean;
  onPatch?: (patch: Partial<LanternState["announcement"]>) => void;
}) {
  const manipulationRef = useRef<{
    pointerId: number;
    kind: "layout" | "image";
    edge: "move" | string;
    pointerX: number;
    pointerY: number;
    x: number;
    y: number;
    width: number;
  } | null>(null);
  const pendingPatchRef = useRef<Partial<LanternState["announcement"]> | null>(null);
  const patchFrameRef = useRef<number | null>(null);
  const isTicker = announcement.style === "News Ticker";
  const timerInAnnouncement = !isTicker && announcement.timerStyle !== "off" && announcement.timerPosition === "announcement-right";
  const floatingTimerPosition = isTicker && announcement.timerPosition === "announcement-right" ? "top-right" : announcement.timerPosition;
  const overlayClass = preview ? "announcement-display-overlay" : "announcement-overlay";
  const styleClass = announcement.style.toLowerCase().replace(/\s/g, "-");
  const defaultLayoutY = announcement.style === "Temporary Card" ? 50 : isTicker ? 91 : 88;
  const defaultLayoutWidth = isTicker ? 96 : announcement.style === "Ribbon" ? 90 : 78;
  const hasCustomLayout = announcement.layoutX !== undefined || announcement.layoutY !== undefined || announcement.layoutWidth !== undefined;
  const queuePatch = (patch: Partial<LanternState["announcement"]>) => {
    if (!onPatch) return;
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    if (patchFrameRef.current !== null) return;
    patchFrameRef.current = requestAnimationFrame(() => {
      patchFrameRef.current = null;
      const nextPatch = pendingPatchRef.current;
      pendingPatchRef.current = null;
      if (nextPatch) onPatch(nextPatch);
    });
  };
  useEffect(() => () => {
    if (patchFrameRef.current !== null) cancelAnimationFrame(patchFrameRef.current);
  }, []);
  const overlayStyle = {
    color: announcement.textColor ?? undefined,
    background: announcement.backgroundColor ?? undefined,
    ...(hasCustomLayout ? {
      top: `${announcement.layoutY ?? defaultLayoutY}%`,
      left: `${announcement.layoutX ?? 50}%`,
      right: "auto",
      bottom: "auto",
      width: `${announcement.layoutWidth ?? defaultLayoutWidth}%`,
      transform: "translate(-50%, -50%)"
    } : {})
  } as React.CSSProperties;
  const beginManipulation = (event: React.PointerEvent<HTMLElement>, kind: "layout" | "image", edge: "move" | string) => {
    if (!editing || !onPatch) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    manipulationRef.current = {
      pointerId: event.pointerId,
      kind,
      edge,
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: kind === "layout" ? announcement.layoutX ?? 50 : announcement.imageX ?? 72,
      y: kind === "layout" ? announcement.layoutY ?? defaultLayoutY : announcement.imageY ?? 50,
      width: kind === "layout" ? announcement.layoutWidth ?? defaultLayoutWidth : announcement.imageWidth ?? 22
    };
  };
  const moveManipulation = (event: React.PointerEvent<HTMLElement>) => {
    const drag = manipulationRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !onPatch) return;
    const bounds = event.currentTarget.closest(".announcement-fixed-canvas")?.getBoundingClientRect();
    if (!bounds) return;
    const dx = (event.clientX - drag.pointerX) / bounds.width * 100;
    const dy = (event.clientY - drag.pointerY) / bounds.height * 100;
    if (drag.edge === "move") {
      queuePatch(drag.kind === "layout"
        ? { layoutX: clamp(drag.x + dx, 0, 100), layoutY: clamp(drag.y + dy, 0, 100) }
        : { imageX: clamp(drag.x + dx, 0, 100), imageY: clamp(drag.y + dy, 0, 100) });
      return;
    }
    const horizontal = drag.edge.includes("e") ? dx : drag.edge.includes("w") ? -dx : 0;
    const width = clamp(drag.width + horizontal, drag.kind === "layout" ? 20 : 5, drag.kind === "layout" ? 96 : 70);
    const centerShift = drag.edge.includes("e") ? horizontal / 2 : drag.edge.includes("w") ? -horizontal / 2 : 0;
    queuePatch(drag.kind === "layout"
      ? { layoutWidth: width, layoutX: clamp(drag.x + centerShift, 0, 100) }
      : { imageWidth: width, imageX: clamp(drag.x + centerShift, 0, 100) });
  };
  const endManipulation = (event: React.PointerEvent<HTMLElement>) => {
    if (manipulationRef.current?.pointerId !== event.pointerId) return;
    manipulationRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const resizeHandles = (kind: "layout" | "image") => ["ne", "e", "se", "sw", "w", "nw"].map((edge) =>
    <span key={edge} className={`announcement-resize-handle direct-resize-handle resize-${edge}`} onPointerDown={(event) => beginManipulation(event, kind, edge)} onPointerMove={moveManipulation} onPointerUp={endManipulation} onPointerCancel={endManipulation} />
  );
  const editableText = (field: "title" | "message" | "details") => ({
    contentEditable: editing,
    suppressContentEditableWarning: true,
    onBlur: (event: React.FocusEvent<HTMLElement>) => onPatch?.({ [field]: event.currentTarget.textContent ?? "" })
  });
  const tickerLabel = [announcement.title, announcement.message, announcement.details].filter(Boolean).join(" · ");
  const tickerSpeed = announcement.tickerSpeed ?? "standard";
  const tickerDirection = announcement.tickerDirection ?? "left";

  return <>
    <div className={`${overlayClass} ${styleClass}${timerInAnnouncement ? " has-timer" : ""}${hasCustomLayout ? " custom-position" : ""}${editing ? " announcement-editable-element" : ""}`} style={overlayStyle} role={isTicker ? "status" : undefined} aria-atomic={isTicker ? "true" : undefined}>
      {editing && <><button type="button" className="announcement-edit-handle text-handle" title="Drag announcement text box" onPointerDown={(event) => beginManipulation(event, "layout", "move")} onPointerMove={moveManipulation} onPointerUp={endManipulation} onPointerCancel={endManipulation}><Move size={18} /></button>{resizeHandles("layout")}</>}
      {isTicker ? <>
        <span className="sr-only">{tickerLabel}</span>
        <div className="announcement-ticker-window" aria-hidden="true">
          <div className={`announcement-ticker-track pace-${tickerSpeed} direction-${tickerDirection}${editing ? " paused" : ""}`}>
            {[0, 1].map((copy) => <div className="announcement-ticker-segment" key={copy}>
              <strong {...(copy === 0 ? editableText("title") : {})}>{announcement.title || "Museum news"}</strong>
              <i aria-hidden="true" />
              <span {...(copy === 0 ? editableText("message") : {})}>{announcement.message || "Your scrolling announcement appears here."}</span>
              {announcement.details && <><i aria-hidden="true" /><small className="announcement-details" {...(copy === 0 ? editableText("details") : {})}>{announcement.details}</small></>}
            </div>)}
          </div>
        </div>
      </> : <>
        <strong {...editableText("title")}>{announcement.title || "Announcement title"}</strong>
        <span {...editableText("message")}>{announcement.message || "Your message appears here."}</span>
        {announcement.details && <small className="announcement-details" {...editableText("details")}>{announcement.details}</small>}
      </>}
      {timerInAnnouncement && <AnnouncementCountdown announcement={announcement} startedAt={startedAt} playOnComplete={playOnComplete} className="inside-announcement" />}
    </div>
    {announcement.imageUrl && !isTicker && <div className={`announcement-image-frame${editing ? " editable announcement-editable-element" : ""}`} style={{ left: `${announcement.imageX ?? 72}%`, top: `${announcement.imageY ?? 50}%`, width: `${announcement.imageWidth ?? 22}%` }}><img className="announcement-image" src={announcement.imageUrl} alt="" draggable={false} />{editing && <><button type="button" className="announcement-edit-handle image-handle" title="Drag announcement image" onPointerDown={(event) => beginManipulation(event, "image", "move")} onPointerMove={moveManipulation} onPointerUp={endManipulation} onPointerCancel={endManipulation}><Move size={18} /></button>{resizeHandles("image")}</>}</div>}
    {announcement.timerStyle !== "off" && !timerInAnnouncement && <AnnouncementCountdown announcement={announcement} startedAt={startedAt} playOnComplete={playOnComplete} className={`floating ${floatingTimerPosition}${announcement.timerX !== undefined || announcement.timerY !== undefined ? " custom-position" : ""}`} editing={editing} onPatch={onPatch} />}
  </>;
}

function AnnouncementCountdown({
  announcement,
  startedAt,
  playOnComplete,
  className,
  editing = false,
  onPatch
}: {
  announcement: LanternState["announcement"];
  startedAt?: string;
  playOnComplete: boolean;
  className: string;
  editing?: boolean;
  onPatch?: (patch: Partial<LanternState["announcement"]>) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const playedRef = useRef(false);
  const totalSeconds = Math.max(0, Math.round(announcement.durationMinutes * 60));
  const startTime = startedAt ? Date.parse(startedAt) : Number.NaN;
  const elapsedSeconds = Number.isFinite(startTime) ? Math.max(0, (now - startTime) / 1000) : 0;
  const remainingSeconds = Math.max(0, Math.ceil(totalSeconds - elapsedSeconds));
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
  const formatted = formatCountdown(remainingSeconds);
  const timerPosition = announcement.style === "News Ticker" && announcement.timerPosition === "announcement-right" ? "top-right" : announcement.timerPosition;
  const timerStyle = {
    "--timer-accent": announcement.timerAccentColor,
    "--timer-track": announcement.timerTrackColor,
    "--timer-progress": `${Math.max(0, Math.min(1, progress)) * 360}deg`,
    "--timer-progress-percent": `${Math.max(0, Math.min(1, progress)) * 100}%`,
    ...(announcement.timerX !== undefined || announcement.timerY !== undefined ? {
      left: `${announcement.timerX ?? (timerPosition.endsWith("left") ? 17 : 83)}%`,
      top: `${announcement.timerY ?? (timerPosition.startsWith("top") ? 15 : 84)}%`,
      right: "auto",
      bottom: "auto",
      transform: "translate(-50%, -50%)"
    } : {})
  } as React.CSSProperties;
  const dragTimer = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!editing || !onPatch || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bounds = event.currentTarget.closest(".announcement-fixed-canvas")?.getBoundingClientRect();
    if (!bounds) return;
    onPatch({
      timerX: clamp((event.clientX - bounds.left) / bounds.width * 100, 0, 100),
      timerY: clamp((event.clientY - bounds.top) / bounds.height * 100, 0, 100)
    });
  };
  const handle = editing && <button type="button" className="announcement-edit-handle timer-handle" title="Drag timer" onPointerDown={(event) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }} onPointerMove={dragTimer}><Move size={18} /></button>;

  useEffect(() => {
    setNow(Date.now());
    playedRef.current = false;
    if (!startedAt || totalSeconds <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [startedAt, totalSeconds]);

  useEffect(() => {
    if (!playOnComplete || !startedAt || totalSeconds <= 0 || remainingSeconds > 0 || playedRef.current) return;
    playedRef.current = true;
    playAnnouncementSfx(announcement);
  }, [announcement, playOnComplete, remainingSeconds, startedAt, totalSeconds]);

  if (announcement.timerStyle === "off") return null;

  if (announcement.timerStyle === "progress") {
    return <div className={`announcement-countdown progress-countdown ${className}${editing ? " announcement-editable-element" : ""}`} style={timerStyle} aria-label={`${formatted} remaining`}>{handle}<small>Time left</small><div className="countdown-progress-track"><i /></div><strong>{formatted}</strong></div>;
  }

  if (announcement.timerStyle === "circular") {
    return <div className={`announcement-countdown circular-countdown ${className}${editing ? " announcement-editable-element" : ""}`} style={timerStyle} aria-label={`${formatted} remaining`}>{handle}<div className="countdown-dial"><strong>{formatted}</strong></div><small>Time left</small></div>;
  }

  return <div className={`announcement-countdown digital-countdown ${className}${editing ? " announcement-editable-element" : ""}`} style={timerStyle} aria-label={`${formatted} remaining`}>{handle}<small>Time left</small><strong>{formatted}</strong></div>;
}

function formatCountdown(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field announcement-color-control"><span>{label}</span><div><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /><b>{value.toUpperCase()}</b></div></label>;
}

function SoundPicker({ label, value, onChange }: { label: string; value?: string; onChange: (value?: string) => void }) {
  const loadSound = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(typeof reader.result === "string" ? reader.result : undefined);
    reader.readAsDataURL(file);
  };
  return <div className="sound-picker"><span className="sound-picker-label"><Music2 size={14} />{label}</span><label className="sound-upload" title={value ? `Replace ${label.toLowerCase()}` : `Choose ${label.toLowerCase()}`}><Upload size={14} /><span>{value ? "Replace" : "Choose"}</span><input type="file" accept="audio/*" onChange={(event) => loadSound(event.target.files?.[0])} /></label><button type="button" className="icon-button" disabled={!value} onClick={() => value && playSound(value)} title="Preview sound"><Play size={15} /></button>{value && <button type="button" className="icon-button danger-icon" onClick={() => onChange(undefined)} title="Remove sound"><X size={15} /></button>}</div>;
}

function MediaStreamVideo({ stream, muted, className, elementRef }: { stream: MediaStream | null; muted: boolean; className?: string; elementRef?: { current: HTMLVideoElement | null } }) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = elementRef ?? localVideoRef;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [stream]);
  return <video ref={videoRef} autoPlay playsInline muted={muted} className={className} />;
}

type LightweightFace = { x: number; y: number; width: number; height: number };

function RoomFaceTrackingOverlay({ videoRef, enabled, mirrored }: { videoRef: { current: HTMLVideoElement | null }; enabled: boolean; mirrored: boolean }) {
  const [faces, setFaces] = useState<LightweightFace[]>([]);
  const [status, setStatus] = useState<"idle" | "tracking" | "unsupported">("idle");

  useEffect(() => {
    if (!enabled) {
      setFaces([]);
      setStatus("idle");
      return;
    }
    type BrowserFace = { boundingBox: { x: number; y: number; width: number; height: number } };
    type BrowserFaceDetector = { detect: (source: HTMLVideoElement) => Promise<BrowserFace[]> };
    type BrowserFaceDetectorConstructor = new (options?: { maxDetectedFaces?: number; fastMode?: boolean }) => BrowserFaceDetector;
    const Detector = (window as Window & { FaceDetector?: BrowserFaceDetectorConstructor }).FaceDetector;
    if (!Detector) {
      setStatus("unsupported");
      return;
    }
    const detector = new Detector({ maxDetectedFaces: 8, fastMode: true });
    let cancelled = false;
    let detecting = false;
    const detect = () => {
      const video = videoRef.current;
      if (cancelled || detecting || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
      detecting = true;
      void detector.detect(video).then((detected) => {
        if (cancelled) return;
        const scale = Math.max(video.clientWidth / video.videoWidth, video.clientHeight / video.videoHeight);
        const cropX = (video.videoWidth * scale - video.clientWidth) / 2;
        const cropY = (video.videoHeight * scale - video.clientHeight) / 2;
        setFaces(detected.map(({ boundingBox }) => ({
          x: boundingBox.x * scale - cropX,
          y: boundingBox.y * scale - cropY,
          width: boundingBox.width * scale,
          height: boundingBox.height * scale
        })));
        setStatus("tracking");
      }).catch(() => {
        if (!cancelled) setStatus("unsupported");
      }).finally(() => { detecting = false; });
    };
    detect();
    const interval = window.setInterval(detect, 350);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [enabled, videoRef]);

  if (!enabled) return null;
  return <div className="room-face-tracking" aria-live="polite">
    {faces.map((face, index) => <i key={`${index}-${Math.round(face.x)}-${Math.round(face.y)}`} className="room-face-box" style={{ left: mirrored ? undefined : face.x, right: mirrored ? face.x : undefined, top: face.y, width: face.width, height: face.height }} />)}
    <div className={status === "unsupported" ? "room-guest-count unsupported" : "room-guest-count"}><ScanFace size={15} /><span>{status === "unsupported" ? "Face tracking unavailable" : `${faces.length} guest${faces.length === 1 ? "" : "s"} in room`}</span></div>
  </div>;
}

function MediaStreamAudioOutput({ stream, muted, gain }: { stream: MediaStream | null; muted: boolean; gain: number }) {
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    if (!stream?.getAudioTracks().length) return;
    const AudioContextConstructor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    const source = context.createMediaStreamSource(stream);
    const outputGain = context.createGain();
    outputGain.gain.value = muted ? 0 : clamp(gain, 0, 2);
    source.connect(outputGain);
    outputGain.connect(context.destination);
    contextRef.current = context;
    gainRef.current = outputGain;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    return () => {
      source.disconnect();
      outputGain.disconnect();
      if (contextRef.current === context) contextRef.current = null;
      if (gainRef.current === outputGain) gainRef.current = null;
      if (context.state !== "closed") void context.close().catch(() => undefined);
    };
  }, [stream]);

  useEffect(() => {
    const context = contextRef.current;
    const outputGain = gainRef.current;
    if (!context || !outputGain) return;
    outputGain.gain.setTargetAtTime(muted ? 0 : clamp(gain, 0, 2), context.currentTime, 0.015);
  }, [gain, muted]);

  return null;
}

function ScreensView({
  state,
  activeUserId,
  selectedDisplayId,
  setSelectedDisplayId,
  openDisplays,
  updateState,
  initialEditingId,
  initialEditorTab,
  initialOpenRoomCamera = false,
  editorOnly = false,
  onClose
}: {
  state: LanternState;
  activeUserId?: string;
  selectedDisplayId: ScreenId;
  setSelectedDisplayId: (screenId: ScreenId) => void;
  openDisplays: () => void;
  updateState: (updater: (current: LanternState) => LanternState) => void;
  initialEditingId?: ScreenId;
  initialEditorTab?: "setup" | "room" | "names";
  initialOpenRoomCamera?: boolean;
  editorOnly?: boolean;
  onClose?: () => void;
}) {
  const [editingId, setEditingId] = useState<ScreenId | null>(initialEditingId ?? null);
  const [page, setPage] = useState(0);
  const [editorTab, setEditorTab] = useState<"setup" | "room" | "names">(initialEditorTab ?? "setup");
  const [rosterAddId, setRosterAddId] = useState("");
  const [draggedRosterDonorId, setDraggedRosterDonorId] = useState<string | null>(null);
  const [mediaDevices, setMediaDevices] = useState<MediaDeviceInfo[]>([]);
  const [availableMonitors, setAvailableMonitors] = useState<Array<{ id: number; name?: string; positionX: number; positionY: number; width: number; height: number }>>([]);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [displayNotice, setDisplayNotice] = useState<string | null>(null);
  const [roomScreenId, setRoomScreenId] = useState<ScreenId | null>(null);
  const [roomStream, setRoomStream] = useState<MediaStream | null>(null);
  const [roomMuted, setRoomMuted] = useState(false);
  const [roomAudioGain, setRoomAudioGain] = useState(1);
  const [roomPopoutWindow, setRoomPopoutWindow] = useState<Window | null>(null);
  const [editorPosition, setEditorPosition] = useState({ x: Math.max(8, window.innerWidth - 790), y: 72 });
  const [roomViewLayout, setRoomViewLayout] = useState(() => ({
    x: 48,
    y: 88,
    width: Math.min(720, window.innerWidth - 16),
    height: Math.min(520, window.innerHeight - 16)
  }));
  const editorDragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const editorDrawerRef = useRef<HTMLElement | null>(null);
  const roomViewDragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const roomViewResizeRef = useRef<{ pointerX: number; pointerY: number; width: number; height: number } | null>(null);
  const roomViewLayoutRef = useRef(roomViewLayout);
  const roomStreamRef = useRef<MediaStream | null>(null);
  const roomVideoRef = useRef<HTMLVideoElement | null>(null);
  const openedInitialRoomCameraRef = useRef(false);
  const roomLeaseRef = useRef<MediaDeviceLease | null>(null);
  const roomPopoutWindowRef = useRef<Window | null>(null);
  const editingScreen = editingId ? state.screens[editingId] : null;
  const screens = Object.values(state.screens);
  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(screens.length / pageSize));
  const pageScreens = screens.slice(page * pageSize, page * pageSize + pageSize);
  const rosterIds = editingScreen ? displayRosterIds(state, editingScreen) : [];
  const rosterDonors = rosterIds.map((id) => state.donors.find((donor) => donor.id === id)).filter((donor): donor is Donor => Boolean(donor));
  const availableRosterDonors = state.donors.filter((donor) => donor.active && !rosterIds.includes(donor.id));
  const selectedRosterAddId = availableRosterDonors.some((donor) => donor.id === rosterAddId) ? rosterAddId : availableRosterDonors[0]?.id ?? "";
  const roomScreen = roomScreenId ? state.screens[roomScreenId] : null;
  const activePreferences = state.userPreferences.find((preferences) => preferences.userId === activeUserId);
  const roomMirrored = roomScreen ? activePreferences?.roomMirrorByDisplay[roomScreen.id] ?? false : false;
  const roomCameras = mediaDevices.filter((device) => device.kind === "videoinput");
  const roomMics = mediaDevices.filter((device) => device.kind === "audioinput");
  const roomCameraOptions = deviceOptionList(roomCameras, "Default camera", "Camera");
  const roomMicOptions = deviceOptionList(roomMics, "Default mic", "Mic");
  const monitorOptions = ["", ...availableMonitors.map((monitor) => String(monitor.id))];
  const monitorLabels = Object.fromEntries([["", availableMonitors.length ? "Use current monitor" : "Current monitor (browser preview)"], ...availableMonitors.map((monitor) => [String(monitor.id), monitor.name?.trim() || `Monitor ${monitor.id + 1} · ${monitor.width}×${monitor.height}`])]);
  useEffect(() => {
    if (roomScreen) setRoomAudioGain(roomScreen.roomAudioGain ?? 1);
  }, [roomScreen?.id, roomScreen?.roomAudioGain]);
  const patchDisplay = (id: ScreenId, patch: Partial<DisplayProfile>) => {
    updateState((current) => ({ ...current, screens: { ...current.screens, [id]: { ...current.screens[id], ...patch } } }));
  };
  useEffect(() => {
    if (!(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return;
    void import("@tauri-apps/api/core").then(({ invoke }) => invoke<Array<{ id: number; name?: string; positionX: number; positionY: number; width: number; height: number }>>("available_displays")).then(setAvailableMonitors).catch(() => setAvailableMonitors([]));
  }, []);
  useEffect(() => {
    if (!editingId) return;
    const keepEditorOnScreen = () => {
      const bounds = editorDrawerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setEditorPosition((current) => {
        const x = clamp(current.x, 8, Math.max(8, window.innerWidth - bounds.width - 8));
        const y = clamp(current.y, 8, Math.max(8, window.innerHeight - bounds.height - 8));
        return x === current.x && y === current.y ? current : { x, y };
      });
    };
    const frame = window.requestAnimationFrame(keepEditorOnScreen);
    window.addEventListener("resize", keepEditorOnScreen);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", keepEditorOnScreen);
    };
  }, [editingId, editorTab]);
  const applyRoomViewLayout = (layout: typeof roomViewLayout) => {
    const bounded = {
      x: clamp(layout.x, 8, Math.max(8, window.innerWidth - layout.width - 8)),
      y: clamp(layout.y, 8, Math.max(8, window.innerHeight - layout.height - 8)),
      width: clamp(layout.width, 320, Math.max(320, window.innerWidth - 16)),
      height: clamp(layout.height, 260, Math.max(260, window.innerHeight - 16))
    };
    roomViewLayoutRef.current = bounded;
    setRoomViewLayout(bounded);
  };
  const persistRoomViewLayout = (screenId: ScreenId, layout = roomViewLayoutRef.current) => {
    if (!activeUserId) return;
    updateState((current) => ({
      ...current,
      userPreferences: current.userPreferences.map((preferences) => preferences.userId === activeUserId
        ? { ...preferences, roomWindows: { ...preferences.roomWindows, [screenId]: layout } }
        : preferences)
    }));
  };
  const toggleRoomMirror = (screenId: ScreenId) => {
    if (!activeUserId) return;
    updateState((current) => ({
      ...current,
      userPreferences: current.userPreferences.map((preferences) => preferences.userId === activeUserId
        ? { ...preferences, roomMirrorByDisplay: { ...preferences.roomMirrorByDisplay, [screenId]: !(preferences.roomMirrorByDisplay[screenId] ?? false) } }
        : preferences)
    }));
  };

  const chooseDisplayMedia = async (screen: DisplayProfile, file?: File) => {
    if (!file) return;
    const previousMediaId = screen.backgroundMediaId;
    const mediaId = await storeLanternMedia(file);
    if (previousMediaId) void deleteLanternMedia(previousMediaId);
    patchDisplay(screen.id, {
      style: "image",
      backgroundImage: URL.createObjectURL(file),
      backgroundMediaId: mediaId,
      backgroundMediaType: file.type.startsWith("video/") ? "video" : "image",
      backgroundMediaName: file.name,
      backgroundMediaAnimated: file.type === "image/gif" || file.type === "image/webp",
      backgroundCrop: { scale: 1, x: 0, y: 0, rotation: 0 }
    });
  };

  const setRoster = (screen: DisplayProfile, donorIds: string[]) => {
    patchDisplay(screen.id, { donorRosterConfigured: true, donorIds });
  };

  const moveRosterDonor = (screen: DisplayProfile, donorId: string, targetIndex: number) => {
    const currentIds = displayRosterIds(state, screen);
    const sourceIndex = currentIds.indexOf(donorId);
    if (sourceIndex < 0) return;
    const next = [...currentIds];
    next.splice(sourceIndex, 1);
    next.splice(clamp(targetIndex, 0, next.length), 0, donorId);
    setRoster(screen, next);
  };

  const addRosterDonor = (screen: DisplayProfile) => {
    if (!selectedRosterAddId) return;
    updateState((current) => {
      const currentScreen = current.screens[screen.id];
      const donorIds = displayRosterIds(current, currentScreen);
      return {
        ...current,
        donors: current.donors.map((donor) => donor.id === selectedRosterAddId
          ? { ...donor, displayIds: [...new Set([...(donor.displayIds ?? []), screen.id])] }
          : donor),
        screens: {
          ...current.screens,
          [screen.id]: {
            ...currentScreen,
            donorRosterConfigured: true,
            donorIds: [...new Set([...donorIds, selectedRosterAddId])],
            donorSubtextVisibility: {
              ...(currentScreen.donorSubtextVisibility ?? {}),
              [selectedRosterAddId]: currentScreen.donorSubtextVisibility?.[selectedRosterAddId] ?? false
            }
          }
        }
      };
    });
    setRosterAddId("");
  };

  const useAllActiveDonors = (screen: DisplayProfile) => {
    updateState((current) => {
      const donorIds = current.donors.filter((donor) => donor.active).map((donor) => donor.id);
      return {
        ...current,
        donors: current.donors.map((donor) => donor.active
          ? { ...donor, displayIds: [...new Set([...(donor.displayIds ?? []), screen.id])] }
          : donor),
        screens: {
          ...current.screens,
          [screen.id]: { ...current.screens[screen.id], donorRosterConfigured: true, donorIds }
        }
      };
    });
  };

  const setDonorSubtextVisibility = (screen: DisplayProfile, donorId: string, visible: boolean) => {
    patchDisplay(screen.id, {
      donorSubtextVisibility: { ...(screen.donorSubtextVisibility ?? {}), [donorId]: visible }
    });
  };

  useEffect(() => {
    void navigator.mediaDevices?.enumerateDevices().then(setMediaDevices).catch(() => setMediaDevices([]));
    return () => {
      const popup = roomPopoutWindowRef.current;
      roomPopoutWindowRef.current = null;
      if (popup && !popup.closed) popup.close();
      roomLeaseRef.current?.release();
      roomLeaseRef.current = null;
    };
  }, []);

  useEffect(() => { roomStreamRef.current = roomStream; }, [roomStream]);
  useEffect(() => { roomViewLayoutRef.current = roomViewLayout; }, [roomViewLayout]);
  useEffect(() => {
    if (!roomScreen) return;
    const saved = activePreferences?.roomWindows[roomScreen.id];
    if (saved) applyRoomViewLayout(saved);
  }, [activeUserId, roomScreen?.id]);

  useEffect(() => {
    const fitRoomView = () => applyRoomViewLayout(roomViewLayoutRef.current);
    window.addEventListener("resize", fitRoomView);
    return () => window.removeEventListener("resize", fitRoomView);
  }, []);

  const detectRoomDevices = async () => {
    setDeviceError(null);
    try {
      const permissionLease = await mediaDeviceManager.acquire("room:device-probe", {
        video: { required: false },
        audio: { required: false }
      });
      setMediaDevices(await navigator.mediaDevices.enumerateDevices());
      permissionLease.release();
    } catch (error) {
      setDeviceError(formatMediaDeviceError(error));
    }
  };

  const releaseRoomView = () => {
    roomLeaseRef.current?.release();
    roomLeaseRef.current = null;
    roomStreamRef.current = null;
    setRoomStream(null);
    setRoomScreenId(null);
  };

  const closeRoomView = () => {
    const popup = roomPopoutWindowRef.current;
    roomPopoutWindowRef.current = null;
    setRoomPopoutWindow(null);
    if (popup && !popup.closed) popup.close();
    releaseRoomView();
    if (editorOnly && initialOpenRoomCamera) onClose?.();
  };

  const popOutRoomView = (screen: DisplayProfile) => {
    const existing = roomPopoutWindowRef.current;
    if (existing && !existing.closed) {
      existing.document.title = `${screen.label} Room Camera · Project Lantern`;
      existing.focus();
      setRoomPopoutWindow(existing);
      return existing;
    }
    const popup = openRoomCameraPopout(window, document, screen.label);
    if (!popup) {
      setDisplayNotice("The browser blocked the separate camera window. Allow pop-ups for this site, then use Pop out in the camera panel to try again.");
      return null;
    }
    roomPopoutWindowRef.current = popup;
    popup.addEventListener("beforeunload", () => {
      if (roomPopoutWindowRef.current !== popup) return;
      roomPopoutWindowRef.current = null;
      setRoomPopoutWindow(null);
      releaseRoomView();
    }, { once: true });
    setRoomPopoutWindow(popup);
    return popup;
  };

  const openRoomView = async (screen: DisplayProfile, options: { popOut?: boolean } = { popOut: true }) => {
    if (options.popOut !== false) popOutRoomView(screen);
    const savedLayout = activePreferences?.roomWindows[screen.id];
    if (savedLayout) applyRoomViewLayout(savedLayout);
    setRoomScreenId(screen.id);
    const previousLease = roomLeaseRef.current;
    try {
      const lease = await mediaDeviceManager.acquire(`room:${screen.id}`, {
        video: {
          deviceId: screen.roomVideoDeviceId,
          constraints: { width: { ideal: 1280 }, height: { ideal: 720 } }
        },
        audio: screen.roomAudioEnabled === false ? false : {
          deviceId: screen.roomAudioDeviceId,
          required: false
        }
      });
      if (previousLease && previousLease.consumerId !== lease.consumerId) previousLease.release();
      roomLeaseRef.current = lease;
      roomStreamRef.current = lease.stream;
      setRoomScreenId(screen.id);
      setRoomStream(lease.stream);
      setMediaDevices(await navigator.mediaDevices.enumerateDevices());
      const messages = [
        ...lease.fallbacks.map((fallback) => `The assigned ${fallback.kind === "video" ? "camera" : "microphone"} was unavailable, so the default device is in use.`),
        ...lease.issues.map((issue) => formatMediaDeviceError(issue.error, { kind: issue.kind }))
      ];
      setDeviceError(messages.join(" ") || null);
    } catch (error) {
      if (!roomStreamRef.current) {
        setRoomScreenId(screen.id);
        setRoomStream(null);
      }
      setDeviceError(formatMediaDeviceError(error, { kind: "video", deviceId: screen.roomVideoDeviceId }));
    }
  };

  useEffect(() => {
    if (!initialOpenRoomCamera || openedInitialRoomCameraRef.current) return;
    const screen = state.screens[initialEditingId ?? selectedDisplayId];
    if (!screen?.roomVideoDeviceId) return;
    openedInitialRoomCameraRef.current = true;
    setEditingId(null);
    void openRoomView(screen, { popOut: false });
  }, [initialEditingId, initialOpenRoomCamera, openRoomView, selectedDisplayId, state.screens]);

  const addDisplay = () => {
    updateState((current) => {
      const nextNumber = Object.keys(current.screens).length + 1;
      const id = `display-${nextNumber}`;
      return { ...current, screens: { ...current.screens, [id]: makeDisplay(id, nextNumber) } };
    });
  };

  const deleteDisplay = (id: ScreenId) => {
    updateState((current) => {
      if (Object.keys(current.screens).length <= 1) return current;
      const screens = { ...current.screens };
      delete screens[id];
      return { ...current, screens };
    });
  };

  const identify = (screenId: ScreenId) => {
    if (!screens.some((screen) => screen.status !== "offline")) {
      setDisplayNotice("There are no open or connected displays to identify. Open a display window, then try again.");
      return;
    }
    const channel = new BroadcastChannel("project-lantern-host-v1");
    channel.postMessage({ type: "identify-screen", screenId } satisfies HostMessage);
    channel.close();
  };

  const roomPopoutRoot = roomPopoutWindow && !roomPopoutWindow.closed
    ? roomPopoutWindow.document.getElementById(ROOM_CAMERA_POPOUT_ROOT_ID)
    : null;
  const roomViewPanel = roomScreen
    ? <div className="room-view-shell">
        <header className="room-view-header" onPointerDown={roomPopoutRoot ? undefined : (event) => { if ((event.target as Element).closest("button, select, input")) return; roomViewDragRef.current = { pointerX: event.clientX, pointerY: event.clientY, x: roomViewLayoutRef.current.x, y: roomViewLayoutRef.current.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={roomPopoutRoot ? undefined : (event) => { const drag = roomViewDragRef.current; if (!drag) return; applyRoomViewLayout({ ...roomViewLayoutRef.current, x: drag.x + event.clientX - drag.pointerX, y: drag.y + event.clientY - drag.pointerY }); }} onPointerUp={roomPopoutRoot ? undefined : () => { roomViewDragRef.current = null; persistRoomViewLayout(roomScreen.id); }} onPointerCancel={roomPopoutRoot ? undefined : () => { roomViewDragRef.current = null; }}>
          <div><span className={roomStream ? "live-indicator active" : "live-indicator"} /><strong>{roomScreen.label}</strong><small>{roomStream ? "Camera Active" : "Camera inactive"} · {roomPopoutRoot ? "separate movable window" : "drag within app"}</small></div>
          <div>
            {!roomPopoutRoot && <button type="button" className="icon-button" onClick={() => popOutRoomView(roomScreen)} title="Pop out to a movable window"><ExternalLink size={18} /></button>}
            <button type="button" className={roomScreen.roomFaceTrackingEnabled ? "icon-button active" : "icon-button"} onClick={() => patchDisplay(roomScreen.id, { roomFaceTrackingEnabled: !(roomScreen.roomFaceTrackingEnabled ?? false) })} title={roomScreen.roomFaceTrackingEnabled ? "Turn off room tracking" : "Turn on room tracking"}><ScanFace size={18} /></button>
            <button type="button" className={roomMuted ? "icon-button active" : "icon-button"} onClick={() => setRoomMuted((current) => !current)} title={roomMuted ? "Unmute room audio" : "Mute room audio"}>{roomMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
            <button type="button" className={roomMirrored ? "icon-button active" : "icon-button"} onClick={() => toggleRoomMirror(roomScreen.id)} title={roomMirrored ? "Show room camera normally" : "Mirror room camera for monitoring"}><Rotate3d size={18} /></button>
            <button type="button" className="icon-button" onClick={closeRoomView} title="Close room view"><X size={18} /></button>
          </div>
        </header>
        <div className="room-view-device-controls">
          <label><span>Camera</span><select value={roomScreen.roomVideoDeviceId ?? ""} onChange={(event) => { const roomVideoDeviceId = event.target.value || undefined; patchDisplay(roomScreen.id, { roomVideoDeviceId }); void openRoomView({ ...roomScreen, roomVideoDeviceId }); }}>{roomCameraOptions.options.map((value) => <option key={value || "default"} value={value}>{roomCameraOptions.labels[value] ?? value}</option>)}</select></label>
          <label><span>Microphone</span><select value={roomScreen.roomAudioDeviceId ?? ""} onChange={(event) => { const roomAudioDeviceId = event.target.value || undefined; patchDisplay(roomScreen.id, { roomAudioDeviceId }); void openRoomView({ ...roomScreen, roomAudioDeviceId }); }}>{roomMicOptions.options.map((value) => <option key={value || "default"} value={value}>{roomMicOptions.labels[value] ?? value}</option>)}</select></label>
          <button type="button" className="icon-button" onClick={() => void detectRoomDevices()} title="Detect cameras and microphones"><RefreshCcw size={16} /></button>
        </div>
        <div className="room-view-video">
          {roomStream ? <><MediaStreamVideo stream={roomStream} muted className={roomMirrored ? "mirrored" : undefined} elementRef={roomVideoRef} /><RoomFaceTrackingOverlay videoRef={roomVideoRef} enabled={roomScreen.roomFaceTrackingEnabled ?? false} mirrored={roomMirrored} /><MediaStreamAudioOutput stream={roomStream} muted={roomMuted || roomScreen.roomAudioEnabled === false} gain={roomAudioGain} /></> : <div className="room-view-empty"><Camera size={34} /><strong>Room camera unavailable</strong><span>{deviceError ?? "Connecting to the camera assigned to this display…"}</span></div>}
        </div>
        <div className="room-audio-monitor"><AudioLevelMeter stream={roomStream} muted={roomMuted || roomScreen.roomAudioEnabled === false} gain={roomAudioGain} label="Room microphone" /><label><span>Gain</span><input type="range" min="0" max="2" step="0.05" value={roomAudioGain} onInput={(event) => setRoomAudioGain(Number(event.currentTarget.value))} onPointerUp={() => patchDisplay(roomScreen.id, { roomAudioGain })} onBlur={() => patchDisplay(roomScreen.id, { roomAudioGain })} /><output>{Math.round(roomAudioGain * 100)}%</output></label>{deviceError && roomStream && <p className="room-device-warning"><AlertTriangle size={13} /> {deviceError}</p>}</div>
        <footer className="room-view-footer"><span>{roomMuted || roomScreen.roomAudioEnabled === false ? "Audio muted" : `Room audio · ${Math.round(roomAudioGain * 100)}%`}</span><span>{roomMirrored ? "Mirrored monitor" : roomScreen.roomVideoDeviceId ? "Assigned camera" : "Default camera"}</span></footer>
      </div>
    : null;
  const roomPortal = roomScreen && roomViewPanel
    ? roomPopoutRoot
      ? createPortal(<main className="room-view-popout">{roomViewPanel}</main>, roomPopoutRoot)
      : <aside className="room-view-floating" style={{ left: roomViewLayout.x, top: roomViewLayout.y, width: roomViewLayout.width, height: roomViewLayout.height }}>
          {roomViewPanel}
          <button type="button" className="room-view-resize-handle" aria-label="Resize room view" title="Drag to resize" onPointerDown={(event) => { event.preventDefault(); roomViewResizeRef.current = { pointerX: event.clientX, pointerY: event.clientY, width: roomViewLayoutRef.current.width, height: roomViewLayoutRef.current.height }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const resize = roomViewResizeRef.current; if (!resize) return; applyRoomViewLayout({ ...roomViewLayoutRef.current, width: resize.width + event.clientX - resize.pointerX, height: resize.height + event.clientY - resize.pointerY }); }} onPointerUp={() => { roomViewResizeRef.current = null; persistRoomViewLayout(roomScreen.id); }} onPointerCancel={() => { roomViewResizeRef.current = null; }} />
        </aside>
    : null;

  return (
    <section className={editorOnly ? "display-workspace display-editor-overlay" : "display-workspace"}>
      <div className="section-commandbar"><div><strong>{Object.keys(state.screens).length} displays</strong><span>Wi-Fi shows attachment. Power controls whether content is live.</span></div><div className="button-row"><button className="command-button secondary" onClick={openDisplays}><Monitor size={17} /> Open test displays</button><button className="command-button primary" onClick={addDisplay}><Plus size={17} /> Add display</button></div></div>
      <div className="screens-grid managed compact-screen-grid">
        {pageScreens.map((screen) => (
          <article className={selectedDisplayId === screen.id ? "screen-card selected" : "screen-card"} key={screen.id}>
            <div className="screen-card-head"><div><h2>{screen.label}</h2><p>{screen.orientation} · {screen.resolution}</p></div><div className="screen-icon-actions"><span title={screen.status === "offline" ? "Display is not attached" : "Display attached"}>{screen.status === "offline" ? <WifiOff size={19} /> : <Wifi size={19} />}</span><button className={screen.enabled ? "icon-button live-toggle active" : "icon-button live-toggle"} onClick={() => patchDisplay(screen.id, { enabled: !screen.enabled })} title={screen.enabled ? "Take display offline" : "Make display live"}><Power size={17} /></button></div></div>
            <button className={`mini-preview ${orientationClass(screen)}`} onClick={() => setSelectedDisplayId(screen.id)}><BabylonDonorWall state={state} screenId={screen.id} /></button>
            <div className="screen-card-summary"><span>{labelForStyle(screen.style)}</span><span>{screen.donorScrollEnabled ? `Scrolling · ${screen.donorScrollSpeed ?? 4}/10` : `${screen.columns ?? 1} column${screen.columns === 2 ? "s" : ""}`}</span><span>{screen.roomVideoDeviceId ? "Room camera assigned" : "Default room camera"}</span></div>
            <div className="button-row screen-actions"><button className="icon-button" onClick={() => identify(screen.id)} title="Identify display"><Radio size={17} /></button><button className="icon-button" onClick={() => void openRoomView(screen)} title={`Pop out ${screen.label} room camera to a movable window`}><PictureInPicture2 size={17} /></button><button className="command-button secondary" onClick={() => { setSelectedDisplayId(screen.id); setEditingId(screen.id); setEditorTab("setup"); }}><Settings2 size={17} /> Edit</button><button className="icon-button danger-icon" onClick={() => deleteDisplay(screen.id)} title="Delete display"><Trash2 size={17} /></button></div>
          </article>
        ))}
      </div>
      <div className="collection-footer"><span>{screens.length} configured display{screens.length === 1 ? "" : "s"}</span><Pager page={page} pageCount={pageCount} onChange={setPage} /></div>
      {editingScreen && <aside ref={editorDrawerRef} className="screen-editor-drawer" style={{ left: editorPosition.x, top: editorPosition.y, right: "auto", bottom: "auto" }}>
        <button className="icon-button screen-editor-close" onClick={() => { setEditingId(null); onClose?.(); }} title="Close editor"><X size={18} /></button>
        <div className="panel-heading screen-editor-drag-handle" onPointerDown={(event) => { if ((event.target as Element).closest("button, input, select")) return; editorDragRef.current = { pointerX: event.clientX, pointerY: event.clientY, ...editorPosition }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const drag = editorDragRef.current; if (!drag) return; setEditorPosition({ x: clamp(drag.x + event.clientX - drag.pointerX, 8, Math.max(8, window.innerWidth - 320)), y: clamp(drag.y + event.clientY - drag.pointerY, 8, Math.max(8, window.innerHeight - 120)) }); }} onPointerUp={() => { editorDragRef.current = null; }} onPointerCancel={() => { editorDragRef.current = null; }}><div><p className="eyebrow">Display settings · drag to move</p><h2>{editingScreen.label}</h2></div></div>
        <EditorTabs value={editorTab} options={[["setup", "Configuration"], ["room", "Room camera"]]} onChange={(value) => setEditorTab(value as typeof editorTab)} />
        {editorTab === "setup" &&
        <div className="screen-editor-grid">
          <LabeledInput label="Display name" info="User-facing name for this physical display, such as Entrance Display - Portrait." value={editingScreen.label} onChange={(value) => patchDisplay(editingScreen.id, { label: value })} />
          <LabeledSelect label="Orientation" info="Physical screen orientation." value={editingScreen.orientation} options={["Portrait", "Landscape"]} onChange={(value) => patchDisplay(editingScreen.id, { orientation: value as DisplayProfile["orientation"], resolution: value === "Portrait" ? "1080 x 1920" : "1920 x 1080" })} />
          <LabeledSelect label="Default monitor" info="Desktop app: opens this display preview centered on the chosen monitor. Browser previews use their current window." value={String(editingScreen.defaultMonitorId ?? "")} options={monitorOptions} optionLabels={monitorLabels} onChange={(value) => patchDisplay(editingScreen.id, { defaultMonitorId: value === "" ? undefined : Number(value) })} />
          <div className="display-particle-controls">
            <label className="switch-row"><input type="checkbox" checked={editingScreen.particleAnimationEnabled ?? false} onChange={(event) => patchDisplay(editingScreen.id, { particleAnimationEnabled: event.target.checked })} /><span>Particle animation</span></label>
            {editingScreen.particleAnimationEnabled && <>
              <LabeledSelect label="Particle colors" info="Choose the particle color palette." value={editingScreen.particleColorStyle ?? "warm"} options={["warm", "primary"]} optionLabels={{ warm: "White + warm gold", primary: "Primary colors" }} onChange={(value) => patchDisplay(editingScreen.id, { particleColorStyle: value as DisplayProfile["particleColorStyle"] })} />
              <div className="two-col"><Slider label="Particle count" info="How many particles are visible." value={editingScreen.particleCount ?? 34} min={4} max={120} onChange={(value) => patchDisplay(editingScreen.id, { particleCount: value })} /><Slider label="Particle size" info="Average particle size." value={editingScreen.particleSize ?? 4} min={1} max={12} onChange={(value) => patchDisplay(editingScreen.id, { particleSize: value })} /></div>
              <Slider label="Dispersion" info="How widely particles are scattered across the board." value={editingScreen.particleSpread ?? 100} min={10} max={100} onChange={(value) => patchDisplay(editingScreen.id, { particleSpread: value })} />
              <LabeledSelect label="Drift direction" info="Sets the overall air-current direction." value={editingScreen.particleDriftDirection ?? "natural"} options={["natural", "left", "right", "up", "down", "wander"]} optionLabels={{ natural: "Natural", left: "Drift left", right: "Drift right", up: "Float up", down: "Fall down", wander: "Random wander" }} onChange={(value) => patchDisplay(editingScreen.id, { particleDriftDirection: value as DisplayProfile["particleDriftDirection"] })} />
              <div className="two-col"><Slider label="Drift speed" info="How quickly the particles travel." min={1} max={10} value={editingScreen.particleDriftSpeed ?? 4} onChange={(value) => patchDisplay(editingScreen.id, { particleDriftSpeed: value })} /><Slider label="Gravity" info="How strongly particles settle downward." min={0} max={10} value={editingScreen.particleGravity ?? 3} onChange={(value) => patchDisplay(editingScreen.id, { particleGravity: value })} /></div>
              <Slider label="Wander" info="How far particles deviate from their main direction." value={editingScreen.particleWander ?? 5} min={0} max={10} onChange={(value) => patchDisplay(editingScreen.id, { particleWander: value })} />
              <div className="two-col"><Slider label="Lifetime" info="Base time before each particle fades and restarts." value={editingScreen.particleLifetime ?? 12} min={2} max={30} onChange={(value) => patchDisplay(editingScreen.id, { particleLifetime: value })} /><Slider label="Lifetime range" info="Adds random variation around the base lifetime." value={editingScreen.particleLifetimeRange ?? 4} min={0} max={20} onChange={(value) => patchDisplay(editingScreen.id, { particleLifetimeRange: value })} /></div>
            </>}
          </div>
        </div>}
        {editorTab === "room" && <div className="room-device-editor">
          <div className="room-device-heading"><div><strong>Camera at this display</strong><span>Assign the USB camera and microphone facing the room.</span></div><button type="button" className="command-button secondary compact" onClick={() => void detectRoomDevices()}><RefreshCcw size={15} /> Detect devices</button></div>
          <LabeledSelect label="Room webcam" info="Camera physically facing visitors at this monitor." value={editingScreen.roomVideoDeviceId ?? ""} options={roomCameraOptions.options} optionLabels={roomCameraOptions.labels} onChange={(value) => patchDisplay(editingScreen.id, { roomVideoDeviceId: value || undefined })} />
          <LabeledSelect label="Room microphone" info="Microphone used to hear people near this monitor." value={editingScreen.roomAudioDeviceId ?? ""} options={roomMicOptions.options} optionLabels={roomMicOptions.labels} onChange={(value) => patchDisplay(editingScreen.id, { roomAudioDeviceId: value || undefined })} />
          <label className="switch-row"><input type="checkbox" checked={editingScreen.roomAudioEnabled ?? true} onChange={(event) => patchDisplay(editingScreen.id, { roomAudioEnabled: event.target.checked })} /><Volume2 size={16} /><span>Capture room audio</span></label>
          <label className="switch-row"><input type="checkbox" checked={editingScreen.roomFaceTrackingEnabled ?? false} onChange={(event) => patchDisplay(editingScreen.id, { roomFaceTrackingEnabled: event.target.checked })} /><ScanFace size={16} /><span><strong>Track room guests</strong><small>Lightweight face boxes and a guest count. Runs locally at a low refresh rate.</small></span></label>
          {deviceError && <div className="device-error"><AlertTriangle size={16} /><span>{deviceError}</span></div>}
          <button type="button" className="command-button primary" onClick={() => void openRoomView(editingScreen)}><PictureInPicture2 size={17} /> Pop out room camera</button>
        </div>}
        {false && <div className="display-roster-editor">
          <div className="display-roster-heading">
            <div><h2>Names on this display</h2><span>{rosterDonors.length} assigned · drag or use arrows to reorder</span></div>
            <button className="command-button secondary compact" onClick={() => useAllActiveDonors(editingScreen!)}>Use all active</button>
          </div>
          <div className="display-roster-add">
            <select aria-label="Donor to add" value={selectedRosterAddId} onChange={(event) => setRosterAddId(event.target.value)} disabled={!availableRosterDonors.length}>
              {availableRosterDonors.length
                ? availableRosterDonors.map((donor) => <option key={donor.id} value={donor.id}>{donor.name}</option>)
                : <option value="">All active donors are assigned</option>}
            </select>
            <button type="button" className="command-button primary compact" onClick={() => addRosterDonor(editingScreen!)} disabled={!selectedRosterAddId}><Plus size={15} /> Add name</button>
          </div>
          <div className="display-roster-list">
            {rosterDonors.map((donor, index) => (
              <article
                className={draggedRosterDonorId === donor.id ? "display-roster-row dragging" : "display-roster-row"}
                key={donor.id}
                draggable
                onDragStart={(event) => { setDraggedRosterDonorId(donor.id); event.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                onDrop={(event) => { event.preventDefault(); if (draggedRosterDonorId) moveRosterDonor(editingScreen!, draggedRosterDonorId, index); setDraggedRosterDonorId(null); }}
                onDragEnd={() => setDraggedRosterDonorId(null)}
              >
                <span className="display-roster-grip" title="Drag to reorder"><GripVertical size={16} /></span>
                <div className="display-roster-copy"><strong>{donor.name}</strong><small>{donor.subtext || donor.note || "No donor subtext entered"}</small></div>
                <div className="display-roster-order">
                  <button type="button" className="icon-button" disabled={index === 0} onClick={() => moveRosterDonor(editingScreen!, donor.id, index - 1)} title={`Move ${donor.name} up`}><ChevronUp size={15} /></button>
                  <button type="button" className="icon-button" disabled={index === rosterDonors.length - 1} onClick={() => moveRosterDonor(editingScreen!, donor.id, index + 1)} title={`Move ${donor.name} down`}><ChevronDown size={15} /></button>
                  <button type="button" className="icon-button danger-icon" onClick={() => setRoster(editingScreen!, rosterIds.filter((id) => id !== donor.id))} title={`Remove ${donor.name}`}><X size={15} /></button>
                </div>
              </article>
            ))}
            {!rosterDonors.length && <div className="display-roster-empty"><Users size={22} /><strong>No names assigned</strong><span>Add a donor from the list above.</span></div>}
          </div>
        </div>}
      </aside>}
      {roomPortal}
      {displayNotice && <LanternNotice message={displayNotice} onDismiss={() => setDisplayNotice(null)} />}
    </section>
  );
}

function ScheduleCalendarView({
  state,
  updateState,
  initialSelectedId,
  onEditDisplay,
  onEditAnnouncement
}: {
  state: LanternState;
  updateState: (updater: (current: LanternState) => LanternState) => void;
  initialSelectedId?: string | null;
  onEditDisplay: (target: TargetScreen) => void;
  onEditAnnouncement: (announcementId: string) => void;
}) {
  const dayLabels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const [viewMode, setViewMode] = useState<"week" | "month" | "agenda">(() => window.innerWidth <= 760 ? "agenda" : "week");
  const [compact, setCompact] = useState(() => window.innerWidth <= 760);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [displayFilter, setDisplayFilter] = useState<TargetScreen>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [draftEntry, setDraftEntry] = useState<ScheduleEntry | null>(null);
  const [draftIsNew, setDraftIsNew] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ScheduleEntry | null>(null);
  const [colorEditor, setColorEditor] = useState<{ original: string; draft: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id?: string; x: number; y: number; date?: Date; start?: number } | null>(null);
  const [previewEntry, setPreviewEntry] = useState<ScheduleEntry | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [editorPosition, setEditorPosition] = useState({ x: Math.max(12, window.innerWidth - 376), y: 132 });
  const editorDragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const weekScrollRef = useRef<HTMLDivElement | null>(null);
  const calendarPanRef = useRef<{ pointerId: number; y: number; scrollTop: number } | null>(null);
  const calendarDragRef = useRef<{
    id: string;
    sourceDate: string;
    mode: "move" | "resize-start" | "resize-end";
    pointerX: number;
    pointerY: number;
    start: number;
    end: number;
    dayWidth: number;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; sourceDate: string; start: number; end: number; dayDelta: number } | null>(null);
  const dragPreviewRef = useRef<typeof dragPreview>(null);
  const visibleSchedules = draftEntry && !draftIsNew
    ? state.schedules.map((entry) => entry.id === draftEntry.id ? draftEntry : entry)
    : state.schedules;
  const selected = draftEntry?.id === selectedId ? draftEntry : null;
  const selectedPreviewScreen = selected?.contentType === "board"
    ? state.screens[selected.target === "all" ? firstDisplayId(state) : selected.target]
    : undefined;
  const selectedPreviewProgram = selectedPreviewScreen
    ? state.boardPrograms.find((program) => program.id === selected?.boardId)
    : undefined;
  const selectedPreviewPosition = selectedPreviewScreen && !compact
    ? {
      left: editorPosition.x >= 356
        ? Math.max(8, editorPosition.x - 342)
        : Math.min(window.innerWidth - 334, editorPosition.x + 364),
      top: Math.max(70, editorPosition.y)
    }
    : undefined;
  useEffect(() => {
    if (initialSelectedId) {
      const entry = state.schedules.find((candidate) => candidate.id === initialSelectedId);
      setDraftEntry(entry ? { ...entry, days: [...entry.days] } : null);
      setDraftIsNew(false);
      setSelectedId(initialSelectedId);
    }
  }, [initialSelectedId]);
  const visibleMode = compact ? "agenda" : viewMode;
  const weekStart = startOfCalendarWeek(anchorDate);
  const filtered = visibleSchedules.filter((entry) => {
    const archivedLegacySeed = !entry.active
      && (entry.id === "schedule-portrait-board" || entry.id === "schedule-landscape-board");
    if (archivedLegacySeed) return false;
    return displayFilter === "all" || entry.target === "all" || entry.target === displayFilter;
  });
  // Keep a complete day canvas. The schedule can still open near 7 AM, but users
  // can scroll to early-morning and late-night slots even when nothing is booked there.
  const scheduleStartHour = 0;
  const scheduleEndHour = 24;
  const scheduleHourCount = Math.max(1, scheduleEndHour - scheduleStartHour);
  const scheduleStartMinutes = scheduleStartHour * 60;
  const scheduleEndMinutes = scheduleEndHour * 60;
  const hourHeight = clamp((viewportHeight - 280) / scheduleHourCount, 28, 58);
  const hours = Array.from({ length: scheduleHourCount + 1 }, (_, index) => scheduleStartHour + index);
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const monthDates = Array.from({ length: 42 }, (_, index) => addCalendarDays(startOfCalendarWeek(monthStart), index));
  const agendaDates = Array.from({ length: 14 }, (_, index) => addCalendarDays(anchorDate, index));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayEntries = filtered.filter((entry) => entry.active && entryOccursOnDate(entry, now));
  const onlineTodayEntries = todayEntries.filter((entry) => entry.target === "all"
    ? Object.values(state.screens).some((screen) => screen.status !== "offline")
    : state.screens[entry.target]?.status !== "offline");
  const liveEntries = onlineTodayEntries.filter((entry) => timeToMinutes(entry.startTime) <= nowMinutes && timeToMinutes(entry.endTime) > nowMinutes);
  const nextEntry = onlineTodayEntries.filter((entry) => timeToMinutes(entry.startTime) > nowMinutes).sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))[0];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    const resize = () => {
      setCompact(window.innerWidth <= 760);
      setViewportHeight(window.innerHeight);
    };
    window.addEventListener("resize", resize);
    return () => { window.clearInterval(timer); window.removeEventListener("resize", resize); };
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("blur", close); };
  }, [contextMenu]);

  useEffect(() => {
    if (visibleMode !== "week") return;
    const frame = window.requestAnimationFrame(() => { if (weekScrollRef.current) weekScrollRef.current.scrollTop = 7 * hourHeight; });
    return () => window.cancelAnimationFrame(frame);
  }, [visibleMode]);

  const patchEntry = (id: string, patch: Partial<ScheduleEntry>) => {
    if (draftEntry?.id === id) {
      setDraftEntry({ ...draftEntry, ...patch });
      return;
    }
    updateState((current) => ({
      ...current,
      schedules: current.schedules.map((entry) => entry.id === id ? { ...entry, ...patch } : entry)
    }));
  };
  const removeEntry = (id: string) => {
    if (draftEntry?.id === id && draftIsNew) {
      setDraftEntry(null);
      setDraftIsNew(false);
      setSelectedId(null);
      setPendingDelete(null);
      return;
    }
    updateState((current) => ({ ...current, schedules: current.schedules.filter((entry) => entry.id !== id) }));
    if (selectedId === id) setSelectedId(null);
    if (draftEntry?.id === id) setDraftEntry(null);
    setPendingDelete(null);
  };
  const confirmRemoveEntry = (entry: ScheduleEntry) => {
    setPendingDelete(entry);
  };
  const duplicateEntry = (entry: ScheduleEntry) => {
    const id = `schedule-${Date.now()}`;
    setDraftEntry({ ...entry, id, name: `${entry.name} copy`, target: entry.target === "all" ? firstDisplayId(state) : entry.target, days: [...entry.days] });
    setDraftIsNew(true);
    setSelectedId(id);
  };
  const addEntry = (contentType: "board" | "announcement" | "blip" | "broadcast", slot?: { date: Date; start: number }) => {
    const saved = state.savedAnnouncements[0];
    const savedBlip = state.savedBlips[0];
    const id = `schedule-${Date.now()}`;
    const currentMinutes = new Date();
    const roundedNow = Math.min(1380, Math.round((currentMinutes.getHours() * 60 + currentMinutes.getMinutes()) / 15) * 15);
    const start = slot?.start ?? roundedNow;
    const eventDate = toDateInputValue(slot?.date ?? currentMinutes);
    const draft: ScheduleEntry = {
      id,
      name: contentType === "announcement" ? saved?.title ?? "Scheduled announcement" : contentType === "blip" ? savedBlip?.name ?? "Scheduled Blip" : contentType === "broadcast" ? "Scheduled broadcast" : "New scheduled board",
      target: displayFilter === "all" ? firstDisplayId(state) : displayFilter,
      boardId: state.boardPrograms[0]?.id ?? "board-classic",
      contentType,
      broadcastMode: contentType === "broadcast" ? "recorded" : undefined,
      announcementId: contentType === "announcement" ? saved?.id : undefined,
      blipId: contentType === "blip" ? savedBlip?.id : undefined,
      days: slot ? [slot.date.getDay()] : [1, 2, 3, 4, 5],
      recurrence: slot ? "once" : undefined,
      scheduleDate: eventDate,
      scheduleEndDate: eventDate,
      startTime: minutesToTime(start),
      endTime: minutesToTime(Math.min(1440, start + 60)),
      color: contentType === "announcement" ? "#b45a78" : contentType === "blip" ? savedBlip?.accentColor ?? "#16a6a1" : contentType === "broadcast" ? "#d17928" : "#4f63cf",
      active: true
    };
    setDraftEntry(draft);
    setDraftIsNew(true);
    setSelectedId(id);
  };

  const closeEditor = () => {
    setDraftEntry(null);
    setDraftIsNew(false);
    setSelectedId(null);
    setColorEditor(null);
  };

  const saveEntry = () => {
    if (draftEntry) {
      updateState((current) => ({
        ...current,
        schedules: draftIsNew
          ? [...current.schedules, draftEntry]
          : current.schedules.map((entry) => entry.id === draftEntry.id ? draftEntry : entry)
      }));
      setDraftEntry(null);
      setDraftIsNew(false);
    }
    setSelectedId(null);
    setColorEditor(null);
  };

  const validScheduleColor = (value: string, fallback: string) => {
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(trimmed)) return `#${trimmed.slice(1).split("").map((part) => `${part}${part}`).join("")}`.toUpperCase();
    return fallback;
  };
  const previewScheduleColor = (entry: ScheduleEntry) => entry.id === selectedId && colorEditor
    ? validScheduleColor(colorEditor.draft, colorEditor.original)
    : entry.color ?? "#5f55bd";

  useEffect(() => {
    if (!colorEditor || !selected) return;
    const commit = () => {
      patchEntry(selected.id, { color: validScheduleColor(colorEditor.draft, colorEditor.original) });
      setColorEditor(null);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".schedule-color-picker, .schedule-color-trigger")) return;
      commit();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setColorEditor(null);
      if (event.key === "Enter") commit();
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [colorEditor, selected?.id]);
  const entriesForDate = (date: Date) => filtered.filter((entry) => entryOccursOnDate(entry, date)).sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const conflictFor = (entry: ScheduleEntry, date: Date) => entry.active && filtered.some((candidate) =>
    candidate.id !== entry.id && candidate.active && entryOccursOnDate(candidate, date)
    && (entry.contentType ?? "board") === (candidate.contentType ?? "board")
    && scheduleTargetsConflict(entry.target, candidate.target)
    && timeToMinutes(candidate.startTime) < timeToMinutes(entry.endTime)
    && timeToMinutes(candidate.endTime) > timeToMinutes(entry.startTime)
  );
  const displayIsOffline = (entry: ScheduleEntry) => entry.target === "all"
    ? Object.values(state.screens).every((screen) => screen.status === "offline")
    : state.screens[entry.target]?.status === "offline";
  const movePeriod = (direction: -1 | 1) => {
    const next = new Date(anchorDate);
    if (visibleMode === "month") next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + direction * (visibleMode === "week" ? 7 : 14));
    setAnchorDate(next);
  };
  const periodLabel = visibleMode === "month"
    ? anchorDate.toLocaleDateString([], { month: "long", year: "numeric" })
    : visibleMode === "agenda"
      ? `${anchorDate.toLocaleDateString([], { month: "short", day: "numeric" })} – ${addCalendarDays(anchorDate, 13).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`
      : `${weekStart.toLocaleDateString([], { month: "short", day: "numeric" })} – ${addCalendarDays(weekStart, 6).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;

  const beginDrag = (event: React.PointerEvent<HTMLElement>, entry: ScheduleEntry, date: Date, mode: "move" | "resize-start" | "resize-end") => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const columns = event.currentTarget.closest(".week-columns")?.getBoundingClientRect();
    const drag = {
      id: entry.id,
      sourceDate: toDateInputValue(date),
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      start: timeToMinutes(entry.startTime),
      end: timeToMinutes(entry.endTime),
      dayWidth: (columns?.width ?? 700) / 7
    };
    calendarDragRef.current = drag;
    const preview = { id: entry.id, sourceDate: drag.sourceDate, start: drag.start, end: drag.end, dayDelta: 0 };
    dragPreviewRef.current = preview;
    setDragPreview(preview);
    if (draftEntry?.id !== entry.id) {
      setDraftEntry({ ...entry, days: [...entry.days] });
      setDraftIsNew(false);
    }
    setSelectedId(entry.id);
  };
  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = calendarDragRef.current;
    if (!drag) return;
    event.preventDefault();
    const minuteDelta = Math.round((((event.clientY - drag.pointerY) / hourHeight) * 60) / 15) * 15;
    const sourceIndex = Math.round((dateFromInputValue(drag.sourceDate).getTime() - weekStart.getTime()) / 86400000);
    const dayDelta = drag.mode === "move" ? clamp(Math.round((event.clientX - drag.pointerX) / drag.dayWidth), -sourceIndex, 6 - sourceIndex) : 0;
    let start = drag.start;
    let end = drag.end;
    if (drag.mode === "move") {
      const duration = drag.end - drag.start;
      start = clamp(drag.start + minuteDelta, 0, 1440 - duration);
      end = start + duration;
    } else if (drag.mode === "resize-start") start = clamp(drag.start + minuteDelta, 0, drag.end - 15);
    else end = clamp(drag.end + minuteDelta, drag.start + 15, 1440);
    const preview = { id: drag.id, sourceDate: drag.sourceDate, start, end, dayDelta };
    dragPreviewRef.current = preview;
    setDragPreview(preview);
  };
  const finishDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = calendarDragRef.current;
    const preview = dragPreviewRef.current;
    if (!drag || !preview) return;
    event.preventDefault();
    const entry = visibleSchedules.find((item) => item.id === drag.id);
    if (entry) {
      const patch: Partial<ScheduleEntry> = { startTime: minutesToTime(preview.start), endTime: minutesToTime(preview.end) };
      if (drag.mode === "move" && preview.dayDelta) {
        const sourceDate = dateFromInputValue(drag.sourceDate);
        const targetDate = addCalendarDays(sourceDate, preview.dayDelta);
        const sourceDay = sourceDate.getDay();
        patch.days = [...new Set([...entry.days.filter((day) => day !== sourceDay), targetDate.getDay()])];
        if (entry.recurrence === "once" || entry.scheduleDate) patch.scheduleDate = toDateInputValue(targetDate);
      }
      const changed = patch.startTime !== entry.startTime
        || patch.endTime !== entry.endTime
        || patch.scheduleDate !== undefined
        || patch.days !== undefined;
      if (changed) updateState((current) => ({
        ...current,
        schedules: current.schedules.map((candidate) => candidate.id === entry.id ? { ...candidate, ...patch } : candidate)
      }));
      setDraftEntry((current) => ({ ...(current?.id === entry.id ? current : entry), ...patch, days: patch.days ?? [...entry.days] }));
      setDraftIsNew(false);
      setSelectedId(entry.id);
    }
    calendarDragRef.current = null;
    dragPreviewRef.current = null;
    setDragPreview(null);
  };
  const eventStyle = (entry: ScheduleEntry, date: Date, lane: number, laneCount: number): React.CSSProperties => {
    const start = timeToMinutes(entry.startTime);
    const end = timeToMinutes(entry.endTime);
    const preview = dragPreview?.id === entry.id && dragPreview.sourceDate === toDateInputValue(date) ? dragPreview : null;
    const visualStart = preview?.start ?? start;
    const visualEnd = preview?.end ?? end;
    return {
      top: `${((visualStart - scheduleStartMinutes) / 60) * hourHeight}px`,
      height: `${Math.max(24, ((visualEnd - visualStart) / 60) * hourHeight)}px`,
      left: `calc(${(lane / laneCount) * 100}% + 2px)`,
      width: `calc(${100 / laneCount}% - 4px)`,
      transform: preview ? `translateX(${preview.dayDelta * ((document.querySelector(".week-columns")?.getBoundingClientRect().width ?? 700) / 7)}px)` : undefined,
      "--event-color": previewScheduleColor(entry),
      zIndex: preview ? 9 : undefined
    } as React.CSSProperties;
  };
  const quickActions = (entry: ScheduleEntry) => <div className="schedule-quick-actions" aria-label={`Actions for ${entry.name}`}>
    <button type="button" title="Duplicate" onClick={(event) => { event.stopPropagation(); duplicateEntry(entry); }}><Plus size={13} /></button>
    <button type="button" title={entry.active ? "Disable" : "Enable"} onClick={(event) => { event.stopPropagation(); patchEntry(entry.id, { active: !entry.active }); }}>{entry.active ? <Power size={13} /> : <Play size={13} />}</button>
    <button type="button" className="danger" title="Delete" onClick={(event) => { event.stopPropagation(); confirmRemoveEntry(entry); }}><Trash2 size={13} /></button>
  </div>;
  const openEditorAt = (id: string, originX?: number, originY?: number) => {
    const entry = visibleSchedules.find((candidate) => candidate.id === id);
    const shouldPlace = draftEntry?.id !== id;
    if (shouldPlace && !compact && originX !== undefined && originY !== undefined) {
      const editorWidth = 352;
      const gap = 16;
      const x = originX + gap + editorWidth <= window.innerWidth - 8
        ? originX + gap
        : Math.max(8, originX - editorWidth - gap);
      setEditorPosition({ x, y: clamp(originY - 24, 70, Math.max(70, window.innerHeight - 620)) });
    }
    if (entry && draftEntry?.id !== id) {
      setDraftEntry({ ...entry, days: [...entry.days] });
      setDraftIsNew(false);
    }
    setSelectedId(id);
  };
  const openEditor = (id: string, event: React.MouseEvent<HTMLElement>) => openEditorAt(id, event.clientX, event.clientY);
  const openContextMenu = (event: React.MouseEvent, entry: ScheduleEntry) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ id: entry.id, x: event.clientX, y: event.clientY });
  };
  const openCalendarContextMenu = (event: React.MouseEvent, date: Date) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const start = clamp(scheduleStartMinutes + Math.round(((event.clientY - bounds.top) / hourHeight) * 4) * 15, scheduleStartMinutes, scheduleEndMinutes - 15);
    setContextMenu({ x: event.clientX, y: event.clientY, date, start });
  };

  return <section className="schedule-overhaul">
    <header className="schedule-commandbar">
      <div className="schedule-navigation">
        <button type="button" className="command-button secondary compact" onClick={() => setAnchorDate(new Date())}>Today</button>
        <button type="button" className="icon-button" title="Previous period" onClick={() => movePeriod(-1)}><ChevronLeft size={18} /></button>
        <button type="button" className="icon-button" title="Next period" onClick={() => movePeriod(1)}><ChevronRight size={18} /></button>
        <strong>{periodLabel}</strong>
        <label className="calendar-date-picker"><CalendarDays size={14} /><input type="date" aria-label="Choose calendar date" value={toDateInputValue(anchorDate)} onChange={(event) => event.target.value && setAnchorDate(dateFromInputValue(event.target.value))} /></label>
      </div>
      <div className="schedule-command-actions">
        <div className="calendar-view-switch" aria-label="Calendar view">{(["week", "month", "agenda"] as const).map((option) => <button type="button" key={option} className={visibleMode === option ? "active" : ""} disabled={compact && option !== "agenda"} onClick={() => setViewMode(option)}>{option[0].toUpperCase() + option.slice(1)}</button>)}</div>
        <label className="calendar-selector"><Monitor size={14} /><select aria-label="Display filter" value={displayFilter} onChange={(event) => setDisplayFilter(event.target.value as TargetScreen)}><option value="all">All Displays</option>{Object.values(state.screens).map((screen) => <option key={screen.id} value={screen.id}>{screen.label} ({screen.orientation})</option>)}</select></label>
        <button type="button" className="command-button secondary compact" onClick={() => addEntry("board")}><Plus size={15} /> Board</button>
        <button type="button" className="command-button primary compact" onClick={() => addEntry("announcement")}><Megaphone size={15} /> Announcement</button>
        <button type="button" className="command-button secondary compact" onClick={() => addEntry("blip")}><Sparkles size={15} /> Blip</button>
        <button type="button" className="command-button secondary compact" onClick={() => addEntry("broadcast")}><Radio size={15} /> Broadcast</button>
      </div>
    </header>
    <div className="schedule-status-strip">
      <div className={`schedule-live-summary${liveEntries.length ? " active" : ""}`}><Radio size={14} /><span>{liveEntries.length ? "Live now" : "Nothing live now"}</span>{liveEntries.slice(0, 2).map((entry) => <button key={entry.id} onClick={() => openEditorAt(entry.id)}>{entry.name}</button>)}</div>
      <div className="schedule-next-summary"><Clock3 size={14} /><span>Next up</span>{nextEntry ? <button onClick={() => openEditorAt(nextEntry.id)}><strong>{nextEntry.startTime}</strong> {nextEntry.name}</button> : <small>No more events today</small>}</div>
      <div className="schedule-type-legend"><span><i className="board" /> Donor board</span><span><i className="announcement" /> Announcement</span><span><i className="blip" /> Blip</span><span><i className="broadcast" /> Broadcast</span><span><AlertTriangle size={12} /> Same-type conflict</span></div>
    </div>
    <div className={`schedule-view-container ${visibleMode}`}>
      {visibleMode === "week" && <div className="week-calendar schedule-week" style={{ "--calendar-hour": `${hourHeight}px`, "--calendar-hours": scheduleHourCount } as React.CSSProperties}>
        <div className="week-header"><div />{dayLabels.map((label, index) => { const date = addCalendarDays(weekStart, index); return <div className={isSameCalendarDate(date, now) ? "today" : ""} key={label}><span>{label.slice(0, 3)}</span><strong>{date.getDate()}</strong></div>; })}</div>
        <div className="week-scroll" ref={weekScrollRef} onPointerDown={(event) => { if ((event.target as Element).closest(".schedule-entry, button, input, select")) return; calendarPanRef.current = { pointerId: event.pointerId, y: event.clientY, scrollTop: event.currentTarget.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const pan = calendarPanRef.current; if (!pan || pan.pointerId !== event.pointerId) return; event.currentTarget.scrollTop = Math.max(0, pan.scrollTop - (event.clientY - pan.y)); }} onPointerUp={(event) => { if (calendarPanRef.current?.pointerId === event.pointerId) { calendarPanRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); } }} onPointerCancel={() => { calendarPanRef.current = null; }}><div className="calendar-pan-dots" aria-hidden="true"><i /><i /><i /></div><div className="time-gutter">{hours.map((hour) => <span key={hour} style={{ top: `${(hour - scheduleStartHour) * hourHeight}px` }}>{formatHour(hour)}</span>)}</div><div className="week-columns">
          {dayLabels.map((label, index) => { const date = addCalendarDays(weekStart, index); const entries = entriesForDate(date); const today = isSameCalendarDate(date, now); return <div className={`week-day-column${today ? " is-today" : ""}`} key={label} onContextMenu={(event) => openCalendarContextMenu(event, date)}>{hours.map((hour) => <i key={hour} style={{ top: `${(hour - scheduleStartHour) * hourHeight}px` }} />)}{today && nowMinutes >= scheduleStartMinutes && nowMinutes <= scheduleEndMinutes && <div className="calendar-now-line" style={{ top: `${((nowMinutes - scheduleStartMinutes) / 60) * hourHeight}px` }}><span>Now</span></div>}{entries.map((entry) => {
            const lane = scheduleLane(entry, entries);
            const conflict = conflictFor(entry, date);
            const live = today && entry.active && timeToMinutes(entry.startTime) <= nowMinutes && timeToMinutes(entry.endTime) > nowMinutes;
            const offline = displayIsOffline(entry);
            return <button type="button" key={entry.id} className={`calendar-event layer-${entry.contentType ?? "board"}${entry.active ? "" : " disabled"}${offline ? " display-offline" : ""}${conflict ? " conflict" : ""}${live ? " live" : ""}${selectedId === entry.id ? " selected" : ""}${dragPreview?.id === entry.id ? " dragging" : ""}`} style={eventStyle(entry, date, lane.index, lane.count)} onClick={(event) => openEditor(entry.id, event)} onContextMenu={(event) => openContextMenu(event, entry)} onPointerDown={(event) => beginDrag(event, entry, date, "move")} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} aria-label={`${entry.name}, ${entry.startTime} to ${entry.endTime}${offline ? ", target display offline" : ""}`} title="Drag to move. Drag the top or bottom edge to resize.">
              <span className="calendar-resize-handle top" onPointerDown={(event) => beginDrag(event, entry, date, "resize-start")} />
              <strong>{entry.contentType === "announcement" ? <Megaphone size={11} /> : entry.contentType === "blip" ? <Sparkles size={11} /> : entry.contentType === "broadcast" ? <Radio size={11} /> : <Monitor size={11} />}{entry.name}{conflict && <AlertTriangle size={10} />}</strong><span>{minutesToTime(dragPreview?.id === entry.id ? dragPreview.start : timeToMinutes(entry.startTime))}–{minutesToTime(dragPreview?.id === entry.id ? dragPreview.end : timeToMinutes(entry.endTime))}</span><small><b>{entry.contentType === "announcement" ? "Announcement" : entry.contentType === "blip" ? "Blip" : entry.contentType === "broadcast" ? "Broadcast" : "Board"}</b> · {offline ? "Display offline" : live ? "Live now" : targetOptionLabels(state)[entry.target]}</small>
              <span className="calendar-resize-handle bottom" onPointerDown={(event) => beginDrag(event, entry, date, "resize-end")} />
            </button>;
          })}</div>; })}
        </div></div>
      </div>}
      {visibleMode === "month" && <div className="month-calendar"><div className="month-weekdays">{dayLabels.map((label) => <span key={label}>{label.slice(0, 3)}</span>)}</div><div className="month-grid">{monthDates.map((date) => { const entries = entriesForDate(date); return <section key={toDateInputValue(date)} className={`month-day${date.getMonth() !== anchorDate.getMonth() ? " outside" : ""}${isSameCalendarDate(date, now) ? " today" : ""}`}><button type="button" className="month-day-number" onClick={() => { setAnchorDate(date); setViewMode("agenda"); }}>{date.getDate()}</button><div className="month-events">{entries.slice(0, 3).map((entry) => { const conflict = conflictFor(entry, date); const offline = displayIsOffline(entry); return <button type="button" key={entry.id} className={`month-event layer-${entry.contentType ?? "board"}${entry.active ? "" : " disabled"}${offline ? " display-offline" : ""}${conflict ? " conflict" : ""}`} aria-label={`${entry.name}${offline ? ", target display offline" : ""}`} onClick={(event) => openEditor(entry.id, event)}><i style={{ background: entry.color ?? "#5f55bd" }} /><span>{entry.startTime}</span><strong>{entry.name}</strong>{offline ? <WifiOff size={10} /> : conflict && <AlertTriangle size={10} />}</button>; })}{entries.length > 3 && <button type="button" className="month-more" onClick={() => { setAnchorDate(date); setViewMode("agenda"); }}>+{entries.length - 3} more</button>}</div></section>; })}</div></div>}
      {visibleMode === "agenda" && <div className="agenda-calendar">{agendaDates.map((date) => { const entries = entriesForDate(date); return <section className={`agenda-day${isSameCalendarDate(date, now) ? " today" : ""}`} key={toDateInputValue(date)}><header><div><span>{date.toLocaleDateString([], { weekday: "short" })}</span><strong>{date.getDate()}</strong></div><p>{date.toLocaleDateString([], { month: "long", year: "numeric" })}</p></header><div className="agenda-events">{entries.length ? entries.map((entry) => { const conflict = conflictFor(entry, date); const offline = displayIsOffline(entry); const live = !offline && isSameCalendarDate(date, now) && entry.active && timeToMinutes(entry.startTime) <= nowMinutes && timeToMinutes(entry.endTime) > nowMinutes; return <article key={entry.id} className={`agenda-event layer-${entry.contentType ?? "board"}${entry.active ? "" : " disabled"}${offline ? " display-offline" : ""}${conflict ? " conflict" : ""}${live ? " live" : ""}`} aria-label={`${entry.name}${offline ? ", target display offline" : ""}`} onClick={(event) => openEditor(entry.id, event)}><div className="agenda-event-time"><strong>{entry.startTime}</strong><span>{entry.endTime}</span></div><i style={{ background: entry.color ?? "#5f55bd" }} /><div className="agenda-event-copy"><strong>{entry.contentType === "announcement" ? <Megaphone size={14} /> : entry.contentType === "blip" ? <Sparkles size={14} /> : entry.contentType === "broadcast" ? <Radio size={14} /> : <Monitor size={14} />}{entry.name}</strong><span>{targetOptionLabels(state)[entry.target]} · {entry.contentType === "announcement" ? "Announcement" : entry.contentType === "blip" ? "Blip" : entry.contentType === "broadcast" ? "Broadcast" : "Donor board"}{live ? " · Live now" : ""}</span>{offline ? <small><WifiOff size={12} /> Target display offline</small> : conflict && <small><AlertTriangle size={12} /> Same-type conflict on this display</small>}</div>{quickActions(entry)}</article>; }) : <p className="agenda-empty">No scheduled content</p>}</div></section>; })}</div>}
    </div>
    {selected && createPortal(<>{selectedPreviewScreen && selectedPreviewPosition && <aside className="schedule-event-board-preview" style={selectedPreviewPosition} aria-label={`Preview of ${selectedPreviewProgram?.name ?? "selected board"}`}>
      <header><div><p className="eyebrow">Board preview</p><strong>{selectedPreviewProgram?.name ?? "Selected board"}</strong><span>{selectedPreviewScreen.label} · {selectedPreviewScreen.orientation}</span></div><Monitor size={16} /></header>
      <div className={`schedule-preview-surface ${orientationClass(selectedPreviewScreen)}`}><BabylonDonorWall state={state} screenId={selectedPreviewScreen.id} fitToScreen viewMode="2d" previewProgramId={selected.boardId} /></div>
    </aside>}<aside className="schedule-event-editor" style={compact ? undefined : { left: editorPosition.x, top: editorPosition.y }} role="dialog" aria-modal="false" aria-labelledby="schedule-event-editor-title">
      <header className="schedule-event-editor-header" onPointerDown={(event) => { if (compact || (event.target as Element).closest("button")) return; editorDragRef.current = { pointerX: event.clientX, pointerY: event.clientY, ...editorPosition }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const drag = editorDragRef.current; if (!drag) return; const editorHeight = event.currentTarget.parentElement?.getBoundingClientRect().height ?? 610; setEditorPosition({ x: clamp(drag.x + event.clientX - drag.pointerX, 8, Math.max(8, window.innerWidth - 360)), y: clamp(drag.y + event.clientY - drag.pointerY, 70, Math.max(70, window.innerHeight - editorHeight - 8)) }); }} onPointerUp={() => { editorDragRef.current = null; }} onPointerCancel={() => { editorDragRef.current = null; }}><div><p className="eyebrow">Schedule item · drag title to move</p><h2 id="schedule-event-editor-title">{draftIsNew ? "New event" : "Edit event"}</h2></div><button type="button" className="icon-button" title={draftIsNew ? "Discard new event" : "Cancel edits and close"} onClick={closeEditor}><X size={17} /></button></header>
      <div className="schedule-event-editor-body">
        {!draftIsNew && quickActions(selected)}
        <div className="schedule-name-color-row">
          <LabeledInput label="Name" info="Event label shown in the calendar." value={selected.name} onChange={(name) => patchEntry(selected.id, { name })} />
          <div className="schedule-color-control">
            <span>Color</span>
            <button type="button" className="schedule-color-trigger" aria-haspopup="dialog" aria-expanded={Boolean(colorEditor)} title="Choose calendar color" onClick={() => setColorEditor((current) => current ? null : { original: selected.color ?? "#5f55bd", draft: selected.color ?? "#5f55bd" })}><i style={{ background: previewScheduleColor(selected) }} /><span>{previewScheduleColor(selected)}</span></button>
            {colorEditor && <div className="schedule-color-picker" role="dialog" aria-label="Calendar color picker">
              <div className="schedule-color-options">{["#4F63CF", "#16A6A1", "#B45A78", "#D17928", "#8E61C7", "#C3463B", "#2D7D46", "#596579"].map((color) => <button type="button" key={color} title={color} aria-label={`Preview ${color}`} className={validScheduleColor(colorEditor.draft, colorEditor.original) === color ? "selected" : ""} style={{ background: color }} onClick={() => setColorEditor({ ...colorEditor, draft: color })} />)}</div>
              <label><span>Hex color</span><input value={colorEditor.draft} onChange={(event) => setColorEditor({ ...colorEditor, draft: event.target.value })} maxLength={7} spellCheck={false} /></label>
              <div className="schedule-color-picker-actions"><button type="button" onClick={() => setColorEditor(null)}>Cancel</button><button type="button" className="primary" onClick={() => { patchEntry(selected.id, { color: validScheduleColor(colorEditor.draft, colorEditor.original) }); setColorEditor(null); }}>Apply</button></div>
            </div>}
          </div>
        </div>
        <div className="two-col"><label className="field"><span>Starts</span><input type="time" value={selected.startTime} onChange={(event) => patchEntry(selected.id, { startTime: event.target.value })} /></label><label className="field"><span>Ends</span><input type="time" value={selected.endTime} onChange={(event) => patchEntry(selected.id, { endTime: event.target.value })} /></label></div>
        {selected.contentType === "announcement" ? state.savedAnnouncements.length ? <><LabeledSelect label="Announcement" info="Saved announcement to broadcast." value={selected.announcementId ?? state.savedAnnouncements[0].id} options={state.savedAnnouncements.map((item) => item.id)} optionLabels={Object.fromEntries(state.savedAnnouncements.map((item) => [item.id, item.title || "Untitled announcement"]))} onChange={(announcementId) => { const item = state.savedAnnouncements.find((candidate) => candidate.id === announcementId); patchEntry(selected.id, { announcementId, name: item?.title ?? selected.name }); }} /><button type="button" className="command-button secondary compact" onClick={() => selected.announcementId && onEditAnnouncement(selected.announcementId)}><Pencil size={14} /> Edit announcement</button></> : <p className="field-note">Create a saved announcement before scheduling one.</p> : selected.contentType === "blip" ? state.savedBlips.length ? <LabeledSelect label="Blip" info="Saved Blip to run during this calendar event." value={selected.blipId ?? state.savedBlips[0].id} options={state.savedBlips.map((item) => item.id)} optionLabels={Object.fromEntries(state.savedBlips.map((item) => [item.id, item.name]))} onChange={(blipId) => { const item = state.savedBlips.find((candidate) => candidate.id === blipId); patchEntry(selected.id, { blipId, name: item?.name ?? selected.name, color: item?.accentColor ?? selected.color }); }} /> : <p className="field-note">Create a saved Blip before scheduling one.</p> : selected.contentType === "broadcast" ? <><LabeledSelect label="Broadcast source" info="Recorded video is the default scheduled broadcast source." value={selected.broadcastMode ?? "recorded"} options={["recorded", "live"]} optionLabels={{ recorded: "Recorded broadcast video", live: "Live feed" }} onChange={(value) => patchEntry(selected.id, { broadcastMode: value as ScheduleEntry["broadcastMode"] })} />{(selected.broadcastMode ?? "recorded") === "recorded" ? <label className="image-upload command-button secondary compact"><Upload size={15} /><span>{selected.broadcastVideoName ?? "Choose recorded broadcast video"}</span><input type="file" accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => patchEntry(selected.id, { broadcastVideoUrl: String(reader.result), broadcastVideoName: file.name }); reader.readAsDataURL(file); }} /></label> : <LabeledInput label="Presenter" info="User responsible for starting this live broadcast." value={selected.presenterName ?? ""} onChange={(presenterName) => patchEntry(selected.id, { presenterName })} />}</> : <ScheduleBoardPicker programs={state.boardPrograms} value={selected.boardId} onChange={(boardId) => patchEntry(selected.id, { boardId })} />}
        <LabeledSelect label="Display" info="Display targeted by this event." value={selected.target === "all" ? firstDisplayId(state) : selected.target} options={scheduleTargetOptions(state)} optionLabels={targetOptionLabels(state)} onChange={(target) => { const nextTarget = target as ScreenId; patchEntry(selected.id, { target: nextTarget }); setDisplayFilter(nextTarget); }} /><div className="field"><span>Display on</span><div className="schedule-days">{dayLabels.map((label, index) => { const day = (index + 1) % 7; return <button type="button" className={selected.days.includes(day) ? "selected" : ""} key={label} onClick={() => { const days = selected.days.includes(day) ? selected.days.filter((value) => value !== day) : [...selected.days, day]; patchEntry(selected.id, { days, recurrence: "weekly", scheduleDate: selected.scheduleDate ?? toDateInputValue(new Date()) }); }}>{label.slice(0, 1)}</button>; })}</div></div><div className="two-col schedule-date-range"><label className="field"><span>From date</span><input type="date" value={selected.scheduleDate ?? ""} onChange={(event) => patchEntry(selected.id, { scheduleDate: event.target.value || undefined, recurrence: event.target.value ? "weekly" : selected.recurrence })} /></label><label className="field"><span>To date</span><input type="date" min={selected.scheduleDate} value={selected.scheduleEndDate ?? ""} onChange={(event) => patchEntry(selected.id, { scheduleEndDate: event.target.value || undefined, recurrence: "weekly" })} /></label></div><div className="schedule-editor-actions"><button type="button" className="command-button secondary" onClick={closeEditor}>Cancel</button><button type="button" className="command-button primary schedule-save-button" onClick={saveEntry}>Save event</button></div>
      </div>
    </aside></>, document.body)}
    {contextMenu && createPortal(<div className="calendar-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()} role="menu">{contextMenu.id ? (() => { const entry = visibleSchedules.find((item) => item.id === contextMenu.id); return entry ? <><button type="button" onClick={() => { openEditorAt(entry.id); setContextMenu(null); }}><Pencil size={14} /> Edit event</button><button type="button" onClick={() => { setPreviewEntry(entry); setContextMenu(null); }}><Eye size={14} /> Preview on display</button>{entry.contentType === "announcement" ? <button type="button" disabled={!entry.announcementId} onClick={() => { if (entry.announcementId) onEditAnnouncement(entry.announcementId); setContextMenu(null); }}><Megaphone size={14} /> Edit announcement</button> : <button type="button" onClick={() => { onEditDisplay(entry.target); setContextMenu(null); }}><Palette size={14} /> Edit display</button>}<button type="button" onClick={() => { duplicateEntry(entry); setContextMenu(null); }}><Plus size={14} /> Duplicate</button><button type="button" className="danger" onClick={() => { confirmRemoveEntry(entry); setContextMenu(null); }}><Trash2 size={14} /> Delete</button></> : null; })() : <><button type="button" onClick={() => { if (contextMenu.date !== undefined && contextMenu.start !== undefined) addEntry("board", { date: contextMenu.date, start: contextMenu.start }); setContextMenu(null); }}><Plus size={14} /> Add board here</button><button type="button" onClick={() => { if (contextMenu.date !== undefined && contextMenu.start !== undefined) addEntry("announcement", { date: contextMenu.date, start: contextMenu.start }); setContextMenu(null); }}><Megaphone size={14} /> Add announcement here</button><button type="button" onClick={() => { if (contextMenu.date !== undefined && contextMenu.start !== undefined) addEntry("blip", { date: contextMenu.date, start: contextMenu.start }); setContextMenu(null); }}><Sparkles size={14} /> Add Blip here</button></>}</div>, document.body)}
    {pendingDelete && createPortal(<div className="modal-backdrop destructive-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingDelete(null); }}><section className="editor-modal destructive-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-schedule-title" aria-describedby="delete-schedule-description"><div className="destructive-confirm-icon"><Trash2 size={22} /></div><div><p className="eyebrow">Delete scheduled content</p><h2 id="delete-schedule-title">Delete “{pendingDelete.name}”?</h2><p id="delete-schedule-description">This removes the event from the calendar. The underlying board, announcement, Blip, or recording will remain available.</p></div><div className="editor-modal-actions"><button type="button" className="command-button secondary" onClick={() => setPendingDelete(null)}>Cancel</button><button type="button" className="command-button danger" onClick={() => removeEntry(pendingDelete.id)}><Trash2 size={15} /> Delete event</button></div></section></div>, document.body)}
    {previewEntry && (() => { const screenId = previewEntry.target === "all" ? (displayFilter === "all" ? Object.keys(state.screens)[0] : displayFilter) : previewEntry.target; const screen = state.screens[screenId]; const savedAnnouncement = previewEntry.contentType === "announcement" ? state.savedAnnouncements.find((item) => item.id === previewEntry.announcementId) : undefined; const announcement = savedAnnouncement ? { ...savedAnnouncement, active: true } : undefined; const savedBlip = previewEntry.contentType === "blip" ? state.savedBlips.find((item) => item.id === previewEntry.blipId) : undefined; const blip = savedBlip ? { ...savedBlip, active: true } as LanternState["activeBlip"] : undefined; return screen && createPortal(<div className="modal-backdrop schedule-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewEntry(null); }}><section className="editor-modal schedule-display-preview" role="dialog" aria-modal="true" aria-labelledby="schedule-preview-title"><div className="editor-modal-head"><div><p className="eyebrow">Scheduled display preview</p><h2 id="schedule-preview-title">{screen.label} · {previewEntry.startTime}–{previewEntry.endTime}</h2></div><button type="button" className="icon-button" title="Close preview" onClick={() => setPreviewEntry(null)}><X size={18} /></button></div><div className={`schedule-preview-surface ${orientationClass(screen)}`}><BabylonDonorWall state={state} screenId={screen.id} fitToScreen viewMode="2d" previewProgramId={previewEntry.contentType === "board" ? previewEntry.boardId : undefined} announcementActive={Boolean(announcement)} announcementCharacter={announcement?.character} announcementCharacterAsset={announcement} />{announcement && <FixedAnnouncementComposition screen={screen} announcement={announcement} startedAt={`${toDateInputValue(anchorDate)}T${previewEntry.startTime}:00`} />}{blip && <BlipComposition blip={blip} startedAt={new Date(Date.now() - Math.max(0, blip.countdownSeconds - 3) * 1000).toISOString()} />}</div><p className="field-note">Previewing the content scheduled for this event on {screen.label}.</p></section></div>, document.body); })()}
  </section>;
}

function ScheduleView({
  state,
  updateState,
  onEditDisplay,
  onEditAnnouncement
}: {
  state: LanternState;
  updateState: (updater: (current: LanternState) => LanternState) => void;
  onEditDisplay: (target: TargetScreen) => void;
  onEditAnnouncement: (announcementId: string) => void;
}) {
  const days = [
    [1, "Monday"],
    [2, "Tuesday"],
    [3, "Wednesday"],
    [4, "Thursday"],
    [5, "Friday"],
    [6, "Saturday"],
    [0, "Sunday"]
  ] as const;
  const [selectedId, setSelectedId] = useState<string | null>(state.schedules[0]?.id ?? null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [calendarFilter, setCalendarFilter] = useState<TargetScreen>("all");
  const [calendarNow, setCalendarNow] = useState(() => new Date());
  const [inspectorPosition, setInspectorPosition] = useState({ x: Math.max(24, window.innerWidth - 370), y: 150 });
  const inspectorDragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    id: string;
    sourceDay: number;
    mode: "move" | "resize-start" | "resize-end";
    startTime: string;
    endTime: string;
    dayDelta: number;
    dayWidth: number;
  } | null>(null);
  const calendarDragRef = useRef<{
    id: string;
    sourceDay: number;
    mode: "move" | "resize-start" | "resize-end";
    clientX: number;
    clientY: number;
    startMinutes: number;
    endMinutes: number;
    dayWidth: number;
  } | null>(null);
  const dragPreviewRef = useRef<typeof dragPreview>(null);
  const selected = state.schedules.find((entry) => entry.id === selectedId) ?? null;
  const hours = Array.from({ length: 17 }, (_, index) => index + 6);
  const calendarHourHeight = clamp((window.innerHeight - 210) / 17, 24, 44);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setDate(weekStart.getDate() + weekOffset * 7);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("blur", close); };
  }, [contextMenu]);

  useEffect(() => {
    const timer = window.setInterval(() => setCalendarNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const moveInspector = (event: React.PointerEvent<HTMLElement>) => {
    const drag = inspectorDragRef.current;
    if (!drag) return;
    setInspectorPosition({
      x: clamp(drag.x + event.clientX - drag.pointerX, 8, Math.max(8, window.innerWidth - 350)),
      y: clamp(drag.y + event.clientY - drag.pointerY, 72, Math.max(72, window.innerHeight - 160))
    });
  };

  const patchEntry = (id: string, patch: Partial<ScheduleEntry>) => {
    updateState((current) => ({ ...current, schedules: current.schedules.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) }));
  };

  const toggleDay = (entry: ScheduleEntry, day: number) => {
    const nextDays = entry.days.includes(day) ? entry.days.filter((value) => value !== day) : [...entry.days, day];
    patchEntry(entry.id, { days: nextDays });
  };

  const addSchedule = (contentType: "board" | "announcement") => {
    const boardId = state.boardPrograms[0]?.id ?? "board-classic";
    const savedAnnouncement = state.savedAnnouncements[0];
    const id = `schedule-${Date.now()}`;
    updateState((current) => ({
      ...current,
      schedules: [...current.schedules, {
        id,
        name: contentType === "announcement" ? savedAnnouncement?.title ?? "Scheduled announcement" : "New scheduled board",
        target: firstDisplayId(current),
        boardId,
        contentType,
        announcementId: contentType === "announcement" ? savedAnnouncement?.id : undefined,
        days: [1, 2, 3, 4, 5],
        startTime: "09:00",
        endTime: "10:00",
        message: "",
        color: contentType === "announcement" ? "#a95777" : "#5f55bd",
        active: true
      }]
    }));
    setSelectedId(id);
  };

  const removeSchedule = (id: string) => updateState((current) => ({ ...current, schedules: current.schedules.filter((entry) => entry.id !== id) }));

  const duplicateSchedule = (entry: ScheduleEntry) => {
    const id = `schedule-${Date.now()}`;
    updateState((current) => ({ ...current, schedules: [...current.schedules, { ...entry, id, name: `${entry.name} copy` }] }));
    setSelectedId(id);
  };

  const eventPosition = (entry: ScheduleEntry) => {
    const start = timeToMinutes(entry.startTime);
    const end = timeToMinutes(entry.endTime);
    return { top: `${((start - 360) / 60) * calendarHourHeight}px`, height: `${Math.max(26, ((end - start) / 60) * calendarHourHeight)}px` };
  };

  const beginCalendarDrag = (event: React.PointerEvent<HTMLElement>, entry: ScheduleEntry, sourceDay: number, mode: "move" | "resize-start" | "resize-end") => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const columns = event.currentTarget.closest(".week-columns")?.getBoundingClientRect();
    const drag = {
      id: entry.id,
      sourceDay,
      mode,
      clientX: event.clientX,
      clientY: event.clientY,
      startMinutes: timeToMinutes(entry.startTime),
      endMinutes: timeToMinutes(entry.endTime),
      dayWidth: (columns?.width ?? 700) / 7
    };
    calendarDragRef.current = drag;
    const preview = { id: entry.id, sourceDay, mode, startTime: entry.startTime, endTime: entry.endTime, dayDelta: 0, dayWidth: drag.dayWidth };
    dragPreviewRef.current = preview;
    setDragPreview(preview);
    setSelectedId(entry.id);
  };

  const moveCalendarDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = calendarDragRef.current;
    if (!drag) return;
    event.preventDefault();
    const minuteDelta = Math.round((((event.clientY - drag.clientY) / calendarHourHeight) * 60) / 15) * 15;
    const sourceIndex = days.findIndex(([day]) => day === drag.sourceDay);
    const dayDelta = drag.mode === "move" ? clamp(Math.round((event.clientX - drag.clientX) / drag.dayWidth), -sourceIndex, 6 - sourceIndex) : 0;
    let startMinutes = drag.startMinutes;
    let endMinutes = drag.endMinutes;
    if (drag.mode === "move") {
      const duration = drag.endMinutes - drag.startMinutes;
      startMinutes = clamp(drag.startMinutes + minuteDelta, 360, 1380 - duration);
      endMinutes = startMinutes + duration;
    } else if (drag.mode === "resize-start") {
      startMinutes = clamp(drag.startMinutes + minuteDelta, 360, drag.endMinutes - 15);
    } else {
      endMinutes = clamp(drag.endMinutes + minuteDelta, drag.startMinutes + 15, 1380);
    }
    const preview = {
      id: drag.id,
      sourceDay: drag.sourceDay,
      mode: drag.mode,
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(endMinutes),
      dayDelta,
      dayWidth: drag.dayWidth
    };
    dragPreviewRef.current = preview;
    setDragPreview(preview);
  };

  const finishCalendarDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = calendarDragRef.current;
    const preview = dragPreviewRef.current;
    if (!drag || !preview) return;
    event.preventDefault();
    const entry = state.schedules.find((item) => item.id === drag.id);
    if (entry) {
      const patch: Partial<ScheduleEntry> = { startTime: preview.startTime, endTime: preview.endTime };
      if (drag.mode === "move" && preview.dayDelta !== 0) {
        const sourceIndex = days.findIndex(([day]) => day === drag.sourceDay);
        const targetDay = days[sourceIndex + preview.dayDelta][0];
        patch.days = [...new Set([...entry.days.filter((day) => day !== drag.sourceDay), targetDay])]
          .sort((a, b) => days.findIndex(([day]) => day === a) - days.findIndex(([day]) => day === b));
      }
      patchEntry(entry.id, patch);
    }
    calendarDragRef.current = null;
    dragPreviewRef.current = null;
    setDragPreview(null);
  };

  const eventVisualPosition = (entry: ScheduleEntry, day: number, lane: number, laneCount: number): React.CSSProperties => {
    const laneGap = 2;
    const base = {
      ...eventPosition(entry),
      left: `calc(${(lane / laneCount) * 100}% + ${laneGap}px)`,
      width: `calc(${100 / laneCount}% - ${laneGap * 2}px)`,
      "--event-color": entry.color ?? "#5f55bd"
    } as React.CSSProperties;
    if (!dragPreview || dragPreview.id !== entry.id || dragPreview.sourceDay !== day) return base;
    const originalStart = timeToMinutes(entry.startTime);
    const previewStart = timeToMinutes(dragPreview.startTime);
    const previewEnd = timeToMinutes(dragPreview.endTime);
    return {
      ...base,
      height: `${Math.max(26, ((previewEnd - previewStart) / 60) * calendarHourHeight)}px`,
      transform: `translate(${dragPreview.dayDelta * dragPreview.dayWidth}px, ${((previewStart - originalStart) / 60) * calendarHourHeight}px)`,
      zIndex: 8
    };
  };


  return (
    <section className="schedule-layout calendar-workspace">
      <div className="calendar-commandbar">
        <div className="calendar-nav"><button type="button" className="command-button secondary" onClick={() => setWeekOffset(0)}>Today</button><button type="button" className="icon-button" title="Previous week" onClick={() => setWeekOffset((current) => current - 1)}><ChevronLeft size={18} /></button><button type="button" className="icon-button" title="Next week" onClick={() => setWeekOffset((current) => current + 1)}><ChevronRight size={18} /></button><strong>{weekStart.toLocaleDateString([], { month: "long", year: "numeric" })}</strong><label className="calendar-selector"><CalendarDays size={14} /><select aria-label="Calendar" value={calendarFilter} onChange={(event) => setCalendarFilter(event.target.value as TargetScreen)}><option value="all">All calendars</option>{Object.values(state.screens).map((screen) => <option key={screen.id} value={screen.id}>{screen.label}</option>)}</select></label></div>
        <div className="button-row"><span className="compact-status">{state.schedules.filter((entry) => entry.active).length} active</span><button className="command-button secondary compact" onClick={() => addSchedule("board")}><Plus size={16} /> Add board</button><button className="command-button primary" onClick={() => addSchedule("announcement")}><Megaphone size={17} /> Schedule announcement</button></div>
      </div>
      <div className="week-and-inspector">
        <div className="week-calendar" style={{ "--calendar-hour": `${calendarHourHeight}px` } as React.CSSProperties}>
          <div className="week-header"><div />{days.map(([day, label], index) => { const date = new Date(weekStart); date.setDate(weekStart.getDate() + index); return <div key={day}><span>{label.slice(0, 3)}</span><strong>{date.getDate()}</strong></div>; })}</div>
          <div className="week-scroll">
            <div className="time-gutter">{hours.map((hour) => <span key={hour} style={{ top: `${(hour - 6) * calendarHourHeight}px` }}>{formatHour(hour)}</span>)}</div>
            <div className="week-columns">
              {days.map(([day], dayIndex) => { const dayEntries = state.schedules.filter((entry) => entry.days.includes(day) && (calendarFilter === "all" || entry.target === "all" || entry.target === calendarFilter)); const columnDate = new Date(weekStart); columnDate.setDate(weekStart.getDate() + dayIndex); const isToday = columnDate.toDateString() === calendarNow.toDateString(); const nowMinutes = calendarNow.getHours() * 60 + calendarNow.getMinutes(); return <div className={`week-day-column${isToday ? " is-today" : ""}`} key={day}>{hours.map((hour) => <i key={hour} style={{ top: `${(hour - 6) * calendarHourHeight}px` }} />)}{isToday && nowMinutes >= 360 && nowMinutes <= 1380 && <div className="calendar-now-line" style={{ top: `${((nowMinutes - 360) / 60) * calendarHourHeight}px` }}><span>Now</span></div>}{dayEntries.map((entry) => {
                const preview = dragPreview?.id === entry.id && dragPreview.sourceDay === day ? dragPreview : null;
                const lane = scheduleLane(entry, dayEntries);
                return <button
                  key={entry.id}
                  className={`calendar-event layer-${entry.contentType ?? "board"}${selectedId === entry.id ? " selected" : ""}${preview ? " dragging" : ""}`}
                  style={eventVisualPosition(entry, day, lane.index, lane.count)}
                  onClick={() => setSelectedId(entry.id)}
                  onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setSelectedId(entry.id); setContextMenu({ id: entry.id, x: event.clientX, y: event.clientY }); }}
                  onPointerDown={(event) => beginCalendarDrag(event, entry, day, "move")}
                  onPointerMove={moveCalendarDrag}
                  onPointerUp={finishCalendarDrag}
                  onPointerCancel={finishCalendarDrag}
                  title="Drag to move. Drag either edge to change the start or end time."
                >
                  <span className="calendar-resize-handle top" onPointerDown={(event) => beginCalendarDrag(event, entry, day, "resize-start")} aria-hidden="true" />
                  <strong>{entry.contentType === "announcement" && <Megaphone size={12} />}{entry.name}</strong>
                  <span>{preview ? `${preview.startTime} - ${preview.endTime}` : `${entry.startTime} - ${entry.endTime}`}</span>
                  <small>{entry.contentType === "announcement" ? "Announcement" : "Donor board"} · {targetOptionLabels(state)[entry.target]}</small>
                  <span className="calendar-resize-handle bottom" onPointerDown={(event) => beginCalendarDrag(event, entry, day, "resize-end")} aria-hidden="true" />
                </button>;
              })}</div>; })}
            </div>
          </div>
        </div>
        {selected && <aside className="calendar-inspector floating" style={{ left: inspectorPosition.x, top: inspectorPosition.y }}>
          <>
            <div className="panel-heading floating-window-handle" onPointerDown={(event) => { if ((event.target as Element).closest("button")) return; inspectorDragRef.current = { pointerX: event.clientX, pointerY: event.clientY, ...inspectorPosition }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={moveInspector} onPointerUp={() => { inspectorDragRef.current = null; }} onPointerCancel={() => { inspectorDragRef.current = null; }}><div><p className="eyebrow">Schedule item · drag to move</p><h2>Edit event</h2></div><div className="panel-icon-actions"><button className="icon-button danger-icon" onClick={() => { removeSchedule(selected.id); setSelectedId(null); }} title="Delete event"><Trash2 size={17} /></button><button className="icon-button" onClick={() => setSelectedId(null)} title="Close editor"><X size={17} /></button></div></div>
            <LabeledInput label="Name" info="Event label shown in the calendar." value={selected.name} onChange={(value) => patchEntry(selected.id, { name: value })} />
            <div className="two-col"><label className="field"><span>Starts</span><input type="time" value={selected.startTime} onChange={(event) => patchEntry(selected.id, { startTime: event.target.value })} /></label><label className="field"><span>Ends</span><input type="time" value={selected.endTime} onChange={(event) => patchEntry(selected.id, { endTime: event.target.value })} /></label></div>
            <LabeledSelect label="Content" info="Choose whether this calendar item displays a donor board or a saved announcement." value={selected.contentType ?? "board"} options={["board", "announcement"]} optionLabels={{ board: "Donor board", announcement: "Saved announcement" }} onChange={(value) => {
              const contentType = value as "board" | "announcement";
              const saved = state.savedAnnouncements[0];
              patchEntry(selected.id, {
                contentType,
                announcementId: contentType === "announcement" ? selected.announcementId ?? saved?.id : undefined,
                name: contentType === "announcement" && saved && selected.contentType !== "announcement" ? saved.title : selected.name
              });
            }} />
            {selected.contentType === "announcement" ? state.savedAnnouncements.length ? <>
              <LabeledSelect label="Announcement" info="Saved announcement that fires during this calendar event." value={selected.announcementId ?? state.savedAnnouncements[0].id} options={state.savedAnnouncements.map((item) => item.id)} optionLabels={Object.fromEntries(state.savedAnnouncements.map((item) => [item.id, item.title || "Untitled announcement"]))} onChange={(value) => {
                const saved = state.savedAnnouncements.find((item) => item.id === value);
                patchEntry(selected.id, { announcementId: value, name: saved?.title ?? selected.name });
              }} />
              <button type="button" className="command-button secondary schedule-edit-content" onClick={() => selected.announcementId && onEditAnnouncement(selected.announcementId)}><Pencil size={15} /> Edit full announcement</button>
            </> : <div className="schedule-empty-library"><Megaphone size={18} /><span>Create and save an announcement before scheduling it.</span></div> : <LabeledSelect label="Board" info="Donor board shown during this event." value={selected.boardId} options={state.boardPrograms.map((program) => program.id)} optionLabels={Object.fromEntries(state.boardPrograms.map((program) => [program.id, program.name]))} onChange={(value) => patchEntry(selected.id, { boardId: value })} />}
            <LabeledSelect label="Display" info="Target display for this event." value={selected.target === "all" ? firstDisplayId(state) : selected.target} options={scheduleTargetOptions(state)} optionLabels={targetOptionLabels(state)} onChange={(value) => patchEntry(selected.id, { target: value as ScreenId })} />
            <div className="schedule-color-row"><label className="field"><span>Calendar color</span><input type="color" value={selected.color ?? "#5f55bd"} onChange={(event) => patchEntry(selected.id, { color: event.target.value })} /></label>{selected.contentType !== "announcement" && <button className="command-button secondary" onClick={() => onEditDisplay(selected.target)}><Palette size={15} /> Edit display</button>}</div>
            {selected.contentType !== "announcement" && <LabeledInput label="Message" info="Optional message shown with the scheduled board." value={selected.message ?? ""} onChange={(value) => patchEntry(selected.id, { message: value })} />}
            <div className="field"><span>Repeats</span><div className="schedule-days">{days.map(([day, label]) => <button className={selected.days.includes(day) ? "selected" : ""} key={day} onClick={() => toggleDay(selected, day)}>{label.slice(0, 1)}</button>)}</div></div>
            <label className="switch-row"><input type="checkbox" checked={selected.active} onChange={(event) => patchEntry(selected.id, { active: event.target.checked })} /><span>Active on displays</span></label>
          </>
        </aside>}
      </div>
      {contextMenu && (() => { const entry = state.schedules.find((item) => item.id === contextMenu.id); return entry ? <div className="calendar-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()} role="menu"><button onClick={() => { setSelectedId(entry.id); setContextMenu(null); }}><Pencil size={14} /> Edit event</button>{entry.contentType === "announcement" ? <button disabled={!entry.announcementId} onClick={() => { if (entry.announcementId) onEditAnnouncement(entry.announcementId); setContextMenu(null); }}><Megaphone size={14} /> Edit announcement</button> : <button onClick={() => { onEditDisplay(entry.target); setContextMenu(null); }}><Palette size={14} /> Edit display</button>}<button onClick={() => { duplicateSchedule(entry); setContextMenu(null); }}><Plus size={14} /> Duplicate</button><button className="danger" onClick={() => { removeSchedule(entry.id); setSelectedId(null); setContextMenu(null); }}><Trash2 size={14} /> Delete</button></div> : null; })()}
    </section>
  );
}

function scheduleLane(entry: ScheduleEntry, entries: ScheduleEntry[]) {
  // Calendar lanes represent displays, rather than every item that happens to
  // touch an event's time range. A long board used to inherit a lane for each
  // short announcement or blip within it, reducing normal all-day schedules
  // to unreadable slivers. Items for a display deliberately share its lane;
  // their timing and content treatment still make short overlays identifiable.
  const targets = [...new Set(entries.map((candidate) => candidate.target))].sort();
  const index = targets.indexOf(entry.target);
  return { index: Math.max(0, index), count: Math.max(1, targets.length) };
}

function timeToMinutes(value: string) { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }
function formatHour(hour: number) { return `${hour % 12 || 12}:00 ${hour >= 12 ? "PM" : "AM"}`; }
function minutesToTime(value: number) { const minutes = clamp(Math.round(value), 0, 1439); return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }
function startOfCalendarWeek(value: Date) { const date = new Date(value.getFullYear(), value.getMonth(), value.getDate()); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date; }
function addCalendarDays(value: Date, amount: number) { const date = new Date(value); date.setDate(date.getDate() + amount); return date; }
function isSameCalendarDate(left: Date, right: Date) { return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate(); }
function toDateInputValue(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function dateFromInputValue(value: string) { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); }
function entryOccursOnDate(entry: ScheduleEntry, date: Date) {
  if (entry.recurrence === "once") return entry.scheduleDate ? entry.scheduleDate === toDateInputValue(date) : false;
  const value = toDateInputValue(date);
  if (entry.scheduleDate && value < entry.scheduleDate) return false;
  if (entry.scheduleEndDate && value > entry.scheduleEndDate) return false;
  return entry.days.includes(date.getDay());
}
function scheduleTargetsConflict(left: TargetScreen, right: TargetScreen) { return left === "all" || right === "all" || left === right; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

function RecognitionSettingsView({ state, updateState }: { state: LanternState; updateState: (updater: (current: LanternState) => LanternState) => void }) {
  const changeVocabulary = (kind: "tiers" | "categories" | "tags", next: string[], previous?: string, replacement?: string) => {
    updateState((current) => ({
      ...current,
      recognitionSettings: { ...current.recognitionSettings, [kind]: next },
      donors: current.donors.map((donor) => {
        if (kind === "tiers" && previous && donor.tier === previous) return { ...donor, tier: replacement ?? next[0] ?? donor.tier };
        if (kind === "categories" && previous && donor.category === previous) return { ...donor, category: replacement ?? next[0] ?? donor.category };
        if (kind === "tags" && previous) return { ...donor, tags: replacement ? (donor.tags ?? []).map((tag) => tag === previous ? replacement : tag) : (donor.tags ?? []).filter((tag) => tag !== previous) };
        return donor;
      })
    }));
  };

  return (
    <section className="settings-workspace">
      <section className="appearance-settings" aria-labelledby="appearance-heading">
        <div>
          <p className="eyebrow">Site appearance</p>
          <h2 id="appearance-heading">Choose the control portal theme</h2>
          <span>This changes the editor and dashboard only. Museum board designs keep their saved colors.</span>
        </div>
        <label className="appearance-select">
          <span>Control portal theme</span>
          <select
            aria-label="Control portal theme"
            value={state.recognitionSettings.appearance}
            onChange={(event) => updateState((current) => ({
              ...current,
              recognitionSettings: {
                ...current.recognitionSettings,
                appearance: event.target.value as LanternState["recognitionSettings"]["appearance"]
              }
            }))}
          >
            <option value="dark">Dark — Low-glare classic</option>
            <option value="light">Light — Bright and familiar</option>
            <option value="ocean">Ocean — Calm blue and teal</option>
            <option value="warm">Warm — Soft cream and coral</option>
            <option value="contrast">High contrast — Maximum distinction</option>
            <option value="sparkle">Sparkle Unicorn — Neon rainbow magic</option>
          </select>
        </label>
      </section>
      <div className="settings-intro">
        <div>
          <p className="eyebrow">Recognition controls</p>
          <h2>Donor vocabulary</h2>
        </div>
        <div className="settings-summary-strip" aria-label="Vocabulary totals">
          <span><b>{state.recognitionSettings.tiers.length}</b> tiers</span>
          <span><b>{state.recognitionSettings.categories.length}</b> categories</span>
          <span><b>{state.recognitionSettings.tags.length}</b> tags</span>
        </div>
      </div>
      <div className="settings-columns">
        <VocabularyEditor title="Tiers" description="Recognition levels" values={state.recognitionSettings.tiers} onChange={(next, previous, replacement) => changeVocabulary("tiers", next, previous, replacement)} />
        <VocabularyEditor title="Categories" description="Donor types" values={state.recognitionSettings.categories} onChange={(next, previous, replacement) => changeVocabulary("categories", next, previous, replacement)} />
        <VocabularyEditor title="Tags" description="Search labels" values={state.recognitionSettings.tags} onChange={(next, previous, replacement) => changeVocabulary("tags", next, previous, replacement)} />
      </div>
      <GivingProgramsEditor state={state} updateState={updateState} />
    </section>
  );
}

function GivingProgramsEditor({ state, updateState }: { state: LanternState; updateState: (updater: (current: LanternState) => LanternState) => void }) {
  const [expandedId, setExpandedId] = useState("");
  const orderedPrograms = [...state.givingPrograms].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const patchProgram = (programId: string, patch: Partial<GivingProgram>) => updateState((current) => {
    if (patch.name !== undefined && !patch.name.trim()) return current;
    const previousProgram = current.givingPrograms.find((program) => program.id === programId);
    return {
      ...current,
      givingPrograms: current.givingPrograms.map((program) => program.id === programId ? { ...program, ...patch } : program),
      donors: (patch.name || patch.classLabel) && previousProgram
        ? current.donors.map((donor) => donor.givingProgramId === programId ? {
            ...donor,
            tags: (donor.tags ?? []).map((tag) => tag === previousProgram.name && patch.name
              ? patch.name
              : tag === previousProgram.classLabel && patch.classLabel
                ? patch.classLabel
                : tag)
          } : donor)
        : current.donors
    };
  });
  const renameLevel = (programId: string, levelId: string, name: string) => updateState((current) => {
    if (!name.trim()) return current;
    const program = current.givingPrograms.find((candidate) => candidate.id === programId);
    const previous = program?.levels.find((candidate) => candidate.id === levelId)?.name;
    return {
      ...current,
      givingPrograms: current.givingPrograms.map((candidate) => candidate.id === programId ? {
        ...candidate,
        levels: candidate.levels.map((level) => level.id === levelId ? { ...level, name } : level)
      } : candidate),
      donors: current.donors.map((donor) => donor.givingProgramId === programId && donor.givingLevelId === levelId ? {
        ...donor,
        tier: name || donor.tier,
        tags: (donor.tags ?? []).map((tag) => tag === `${previous} Level` ? `${name} Level` : tag)
      } : donor),
      donorGroups: current.donorGroups.map((group) => group.id === `group-toy-${levelId}` ? { ...group, name: `${name} Level` } : group),
      boardPrograms: current.boardPrograms.map((board) => board.givingProgramId === programId ? {
        ...board,
        panels: board.panels?.map((panel) => panel.donorTierFilter?.includes(previous ?? "") ? {
          ...panel,
          donorTierFilter: panel.donorTierFilter.map((tier) => tier === previous ? name : tier)
        } : panel)
      } : board),
      recognitionSettings: {
        ...current.recognitionSettings,
        tiers: current.recognitionSettings.tiers.map((tier) => tier === previous ? name : tier)
      }
    };
  });
  const patchLevel = (programId: string, levelId: string, patch: Partial<GivingLevel>) => updateState((current) => ({
    ...current,
    givingPrograms: current.givingPrograms.map((program) => program.id === programId ? {
      ...program,
      levels: program.levels.map((level) => level.id === levelId ? { ...level, ...patch } : level)
    } : program)
  }));
  const moveProgram = (programId: string, direction: -1 | 1) => updateState((current) => {
    const ordered = [...current.givingPrograms].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    const index = ordered.findIndex((program) => program.id === programId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return current;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    return { ...current, givingPrograms: ordered.map((program, displayOrder) => ({ ...program, displayOrder })) };
  });
  const moveLevel = (programId: string, levelId: string, direction: -1 | 1) => updateState((current) => ({
    ...current,
    givingPrograms: current.givingPrograms.map((program) => {
      if (program.id !== programId) return program;
      const levels = [...program.levels].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      const index = levels.findIndex((level) => level.id === levelId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= levels.length) return program;
      [levels[index], levels[target]] = [levels[target], levels[index]];
      return { ...program, levels: levels.map((level, displayOrder) => ({ ...level, displayOrder })) };
    })
  }));
  const addProgram = () => {
    const id = `giving-program-${Date.now()}`;
    const program: GivingProgram = {
      id,
      name: "New Giving Program",
      classLabel: "Recognition class",
      classYear: String(new Date().getFullYear()),
      description: "Describe this giving program.",
      fundDesignation: "General support",
      invitation: "",
      impactStatement: "",
      goodDeedPrompt: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      website: "",
      address: "",
      levels: [],
      active: true,
      displayOrder: state.givingPrograms.length,
      allowOneTimeQualification: false
    };
    updateState((current) => ({ ...current, givingPrograms: [...current.givingPrograms, program] }));
    setExpandedId(id);
  };
  const addLevel = (programId: string) => {
    const levelId = `level-${Date.now()}`;
    updateState((current) => ({ ...current, givingPrograms: current.givingPrograms.map((program) => program.id === programId ? {
      ...program,
      levels: [...program.levels, { id: levelId, name: "New Level", annualPledge: 1000, years: 1, description: "Describe this level.", color: "#5f65b8", minAmount: 1000, displayOrder: program.levels.length, active: true }]
    } : program) }));
  };

  return <section className="giving-program-settings" aria-labelledby="giving-programs-heading">
    <header><div><p className="eyebrow">Connected pledge settings</p><h2 id="giving-programs-heading">Giving programs and levels</h2><span>Programs configured here appear automatically in donor profiles and linked board tools.</span></div><button type="button" className="command-button primary" onClick={addProgram}><Plus size={15} /> Add program</button></header>
    <div className="giving-program-list">{orderedPrograms.map((program, programIndex) => {
      const expanded = expandedId === program.id;
      const levels = [...program.levels].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      return <article className={`giving-program-card${program.active === false ? " archived" : ""}`} key={program.id}>
        <div className="giving-program-card-head"><button type="button" className="giving-program-expand" onClick={() => setExpandedId(expanded ? "" : program.id)} aria-expanded={expanded}><ChevronRight size={16} /><span><strong>{program.name}</strong><small>{program.active === false ? "Archived" : `${program.levels.filter((level) => level.active !== false).length} active levels`}</small></span></button><div><button type="button" className="icon-button" disabled={programIndex === 0} onClick={() => moveProgram(program.id, -1)} title="Move program up"><ChevronUp size={14} /></button><button type="button" className="icon-button" disabled={programIndex === orderedPrograms.length - 1} onClick={() => moveProgram(program.id, 1)} title="Move program down"><ChevronDown size={14} /></button><button type="button" className={program.active === false ? "command-button secondary compact" : "command-button danger compact"} onClick={() => patchProgram(program.id, { active: program.active === false })}>{program.active === false ? "Restore" : "Archive"}</button></div></div>
        {expanded && <div className="giving-program-body">
          <div className="editor-form-grid giving-program-fields"><LabeledInput label="Program name" info="Public and editor label used anywhere this program is selected." value={program.name} onChange={(name) => patchProgram(program.id, { name })} /><LabeledInput label="Class label" info="Data-driven cohort label shown on recognition boards." value={program.classLabel} onChange={(classLabel) => patchProgram(program.id, { classLabel })} /><LabeledInput label="Class year" info="Default pledge cohort/start year." value={program.classYear} onChange={(classYear) => patchProgram(program.id, { classYear })} /><LabeledInput label="Fund designation" info="Where this program's support is directed." value={program.fundDesignation} onChange={(fundDesignation) => patchProgram(program.id, { fundDesignation })} /><label className="field span-two"><span>Description</span><textarea value={program.description} onChange={(event) => patchProgram(program.id, { description: event.target.value })} /></label><label className="switch-row span-two"><input type="checkbox" checked={program.allowOneTimeQualification ?? false} onChange={(event) => patchProgram(program.id, { allowOneTimeQualification: event.target.checked })} /><span>Allow one-time pledges to qualify for linked program boards</span></label></div>
          <div className="giving-levels-head"><div><strong>Program levels</strong><small>Configure labels, amount rules, defaults, term, order, and availability.</small></div><button type="button" className="command-button secondary compact" onClick={() => addLevel(program.id)}><Plus size={14} /> Add level</button></div>
          <div className="giving-level-list">{levels.map((level, levelIndex) => <section className={`giving-level-card${level.active === false ? " archived" : ""}`} key={level.id}><header><span><strong>{level.name}</strong><small>{level.active === false ? "Archived" : level.maxAmount == null ? `${(level.minAmount ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" })}+` : `${(level.minAmount ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" })}–${level.maxAmount.toLocaleString("en-US", { style: "currency", currency: "USD" })}`}</small></span><div><button type="button" className="icon-button" disabled={levelIndex === 0} onClick={() => moveLevel(program.id, level.id, -1)} title="Move level up"><ChevronUp size={14} /></button><button type="button" className="icon-button" disabled={levelIndex === levels.length - 1} onClick={() => moveLevel(program.id, level.id, 1)} title="Move level down"><ChevronDown size={14} /></button><button type="button" className="icon-button" onClick={() => patchLevel(program.id, level.id, { active: level.active === false })} title={level.active === false ? "Restore level" : "Archive level"}>{level.active === false ? <RefreshCcw size={14} /> : <Trash2 size={14} />}</button></div></header><div className="giving-level-fields"><LabeledInput label="Label" info="Public name for this level." value={level.name} onChange={(name) => renameLevel(program.id, level.id, name)} /><CurrencyInput label="Annual amount default" value={level.annualPledge} onChange={(annualPledge) => patchLevel(program.id, level.id, { annualPledge: annualPledge ?? 0 })} /><CurrencyInput label="Minimum / threshold" value={level.minAmount} onChange={(minAmount) => patchLevel(program.id, level.id, { minAmount })} /><CurrencyInput label="Maximum (optional)" value={level.maxAmount} onChange={(maxAmount) => patchLevel(program.id, level.id, { maxAmount })} /><PledgeTermControl donor={level} defaultYears={1} onChange={(next) => patchLevel(program.id, level.id, { years: next.pledgeYears ?? 1 })} /><label className="field span-two"><span>Description</span><textarea value={level.description} onChange={(event) => patchLevel(program.id, level.id, { description: event.target.value })} /></label></div></section>)}</div>
        </div>}
      </article>;
    })}</div>
  </section>;
}

function VocabularyEditor({ title, description, values, onChange }: { title: string; description: string; values: string[]; onChange: (values: string[], previous?: string, replacement?: string) => void }) {
  const singularTitle = title === "Categories" ? "category" : title.toLocaleLowerCase().replace(/s$/, "");
  const [selectedValue, setSelectedValue] = useState(values[0] ?? "");
  const [editValue, setEditValue] = useState(values[0] ?? "");
  const [newValue, setNewValue] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  useEffect(() => {
    if (values.includes(selectedValue)) return;
    const nextSelected = values[0] ?? "";
    setSelectedValue(nextSelected);
    setEditValue(nextSelected);
  }, [selectedValue, values]);
  const select = (value: string) => {
    setSelectedValue(value);
    setEditValue(value);
  };
  const save = () => {
    const clean = editValue.trim();
    if (!selectedValue || !clean || (clean !== selectedValue && values.some((value) => value.toLocaleLowerCase() === clean.toLocaleLowerCase()))) return;
    onChange(values.map((value) => value === selectedValue ? clean : value), selectedValue, clean);
    setSelectedValue(clean);
    setEditValue(clean);
  };
  const remove = () => {
    if (!selectedValue || values.length <= 1) return;
    const selectedIndex = values.indexOf(selectedValue);
    const nextValues = values.filter((value) => value !== selectedValue);
    const nextSelected = nextValues[Math.min(Math.max(selectedIndex, 0), nextValues.length - 1)] ?? "";
    onChange(nextValues, selectedValue);
    setSelectedValue(nextSelected);
    setEditValue(nextSelected);
    setDeletePending(false);
  };
  const add = () => {
    const clean = newValue.trim();
    if (!clean || values.some((value) => value.toLocaleLowerCase() === clean.toLocaleLowerCase())) return;
    onChange([...values, clean]);
    setSelectedValue(clean);
    setEditValue(clean);
    setNewValue("");
  };
  return (
    <section className="vocabulary-panel">
      <div className="vocabulary-panel-head">
        <div>
          <h2>{title}</h2>
          <span>{description}</span>
        </div>
        <b>{values.length}</b>
      </div>
      <div className="vocabulary-select-row">
        <label><span>Selected {singularTitle}</span><select aria-label={`Select ${singularTitle}`} value={selectedValue} onChange={(event) => select(event.target.value)}>{values.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <div className="vocabulary-edit-actions">
          <label><span>Edit selected</span><input value={editValue} aria-label={`Edit selected ${singularTitle}`} onChange={(event) => setEditValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(); } }} /></label>
          <button type="button" className="command-button secondary" onClick={save} disabled={!selectedValue || !editValue.trim() || editValue.trim() === selectedValue}>Save</button>
          <button type="button" className="icon-button danger-icon" onClick={() => setDeletePending(true)} disabled={values.length <= 1} title={selectedValue ? `Delete ${selectedValue}` : `Delete selected ${singularTitle}`}><Trash2 size={14} /></button>
        </div>
      </div>
      {deletePending && <div className="gift-delete-confirm"><span>Delete “{selectedValue}”? This cannot be undone.</span><div><button type="button" className="command-button secondary compact" onClick={() => setDeletePending(false)}>Cancel</button><button type="button" className="command-button danger compact" onClick={remove}>Delete</button></div></div>}
      <details className="vocabulary-add">
        <summary className="command-button secondary compact"><Plus size={14} /> Add new {singularTitle}</summary>
        <div>
        <input value={newValue} onChange={(event) => setNewValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder={`New ${singularTitle}`} />
        <button type="button" className="command-button primary" onClick={add}><Plus size={14} /> Add new</button>
        </div>
      </details>
    </section>
  );
}

function RevisionsView({ state }: { state: LanternState }) {
  const [tag, setTag] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const entries = codeChangelog.map((entry) => ({ ...entry, kind: "code" as const }));
  const tags = useMemo(() => Array.from(new Set(entries.flatMap((entry) => entry.areas))).sort((a, b) => a.localeCompare(b)), [entries]);
  const filteredEntries = tag === "all" ? entries : entries.filter((entry) => entry.areas.includes(tag));
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;
  const githubRoot = "https://github.com/ijustcreate/project-lantern";
  const githubFileUrl = (file: string) => `${githubRoot}/blob/main/${file.split("/").map(encodeURIComponent).join("/")}`;

  return (
    <section className="revision-workspace">
      <AuditHistoryPanel auditHistory={state.auditHistory} title="Operational audit history" />
      <div className="revision-hero">
        <div>
          <p className="eyebrow">Version control</p>
          <h2>Project changelog</h2>
          <span>Browse code changes, implementation details, and verification history.</span>
          <div className="revision-filters">
            <label>Tag<select value={tag} onChange={(event) => setTag(event.target.value)}><option value="all">All tags</option>{tags.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            {tag !== "all" && <button type="button" onClick={() => setTag("all")}>Clear filter</button>}
          </div>
        </div>
        <div className="revision-orb"><History size={24} /><strong>{filteredEntries.length}</strong><small>Changes</small></div>
      </div>
      <div className="revision-list github-log">
        {filteredEntries.map((revision) => (
          <article className="revision-row changelog-row" key={revision.id}>
            <div className="change-kind-icon code">{"<>"}</div>
            <button type="button" className="change-main change-open" onClick={() => setSelectedId(revision.id)} aria-label={`Open details for ${revision.title}`}>
              <div className="change-title"><strong>{revision.title}</strong><code>{revision.id}</code></div>
              <p>{revision.summary}</p>
              <div className="change-meta"><span>{revision.author}</span><span>{revision.createdAt}</span><span>Open for details</span></div>
            </button>
            <ChevronRight size={18} className="change-open-icon" />
          </article>
        ))}
        {!filteredEntries.length && <div className="revision-empty"><History size={24} /><strong>No changes match this tag</strong><button type="button" onClick={() => setTag("all")}>Show all changes</button></div>}
      </div>
      <div className="collection-footer"><span>{filteredEntries.length} of {entries.length} code changes</span><span>Scroll to browse the complete history</span></div>
      {selected && createPortal(
        <div className="modal-backdrop changelog-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
          <section className="changelog-detail-modal" role="dialog" aria-modal="true" aria-labelledby="changelog-detail-title">
            <header><div><p className="eyebrow">Code change · {selected.id}</p><h2 id="changelog-detail-title">{selected.title}</h2></div><button type="button" className="icon-button" onClick={() => setSelectedId(null)} title="Close"><X size={18} /></button></header>
            <div className="changelog-detail-body">
              <section><h3>What changed</h3><p>{selected.summary}</p></section>
              <section><h3>Verification</h3><p>{selected.tests}</p></section>
              <section><h3>Tags</h3><div className="changelog-detail-tags">{selected.areas.map((area) => <button type="button" key={area} onClick={() => { setTag(area); setSelectedId(null); }}>{area}</button>)}</div></section>
              <section><h3>Changed files</h3><div className="changelog-file-links">{selected.files.map((file) => <a key={file} href={githubFileUrl(file)} target="_blank" rel="noreferrer"><code>{file}</code><ExternalLink size={14} /></a>)}</div></section>
            </div>
            <footer><span>{selected.author} · {selected.createdAt}</span><a className="command-button secondary" href={`${githubRoot}/commits/main`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> GitHub history</a></footer>
          </section>
        </div>,
        document.body
      )}
    </section>
  );
}

function BlipComposition({ blip, startedAt, previewElapsedSeconds }: { blip: LanternState["activeBlip"]; startedAt?: string; previewElapsedSeconds?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (previewElapsedSeconds !== undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [previewElapsedSeconds]);
  const elapsed = previewElapsedSeconds ?? Math.max(0, (now - Date.parse(startedAt ?? new Date().toISOString())) / 1000);
  const remaining = Math.max(0, Math.ceil(blip.countdownSeconds - elapsed));
  const revealed = blip.kind === "celebration" || elapsed >= blip.countdownSeconds;
  return <div className={`blip-overlay blip-${blip.kind} motion-${blip.motion}${revealed ? " revealed" : ""}`} style={{ "--blip-background": blip.backgroundColor, "--blip-accent": blip.accentColor } as React.CSSProperties}>
    <div className="blip-glow" />
    <article>
      {blip.imageUrl && <div className="blip-image"><img src={blip.imageUrl} alt="" /></div>}
      <div className="blip-copy"><span className="blip-kicker">{blip.kind === "celebration" ? "Museum moment" : blip.kind === "quiz" ? "Think fast" : "Just for fun"}</span><h1>{blip.headline}</h1><p className="blip-prompt">{blip.prompt}</p>{blip.subtext && <small>{blip.subtext}</small>}
        {blip.kind !== "celebration" && <div className={`blip-answer${revealed ? " visible" : ""}`} aria-live="polite"><span>{blip.kind === "quiz" ? "Answer" : "Punchline"}</span><strong>{revealed ? blip.answer : "Get ready…"}</strong></div>}
      </div>
      {!revealed && blip.showCountdown && <div className="blip-countdown"><strong>{remaining}</strong><span>seconds</span><i style={{ "--countdown-progress": `${Math.max(0, Math.min(1, remaining / Math.max(1, blip.countdownSeconds))) * 360}deg` } as React.CSSProperties} /></div>}
    </article>
  </div>;
}

function AnnouncementDemoApp({ screenId }: { screenId: ScreenId }) {
  const [state, setState] = useState<LanternState>(() => loadLanternState());
  const [demoStartedAt, setDemoStartedAt] = useState(() => new Date().toISOString());
  const screen = state.screens[screenId] ?? Object.values(state.screens)[0];
  const patchAnnouncement = (patch: Partial<LanternState["announcement"]>) => {
    setState((current) => {
      const next = { ...current, announcement: { ...current.announcement, ...patch } };
      publishState(next);
      return next;
    });
  };

  useEffect(() => {
    let mounted = true;
    void loadSharedLanternState()
      .catch(() => null)
      .then((shared) => {
        const local = loadLanternState();
        return hydrateLanternMedia(shared ? mergeSharedLanternState(local, shared) : local);
      })
      .then((hydrated) => mounted && setState(hydrated));
    const channel = createHostChannel((message) => {
      if (message.type === "state-update") setState(message.state);
    });
    return () => {
      mounted = false;
      channel.close();
    };
  }, []);

  return (
    <div className={`display-shell announcement-demo-shell ${orientationClass(screen)}`}>
      <AnnouncementMonitorSurface state={state} screen={screen} announcement={state.announcement} onPatch={patchAnnouncement} startedAt={demoStartedAt} playOnComplete demo />
      <div className="display-chrome"><span>Announcement demo</span><span>{screen.label}</span></div>
      <div className="announcement-demo-toolbar">
        <span><Clock3 size={15} /> Demo preview</span>
        <button type="button" onClick={() => setDemoStartedAt(new Date().toISOString())}><RotateCcw size={15} /> Restart timer</button>
        <button type="button" disabled={state.announcement.finishSfx === "off"} onClick={() => playAnnouncementSfx(state.announcement)}><Volume2 size={15} /> Test SFX</button>
        <button type="button" onClick={() => window.close()}><X size={15} /> Close</button>
      </div>
    </div>
  );
}

function DisplayWallApp({ screenIds }: { screenIds: ScreenId[] }) {
  const state = loadLanternState();
  const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href;
  const screens = screenIds.map((screenId) => state.screens[screenId]).filter(Boolean);
  return <main className={`display-wall-shell count-${screens.length}`}>
    <header>
      <div><strong>Lantern display wall</strong><span>{screens.length} outputs opened together</span></div>
      <div><span>Browser-safe one-click view</span><button type="button" onClick={() => window.close()}><X size={16} /> Close wall</button></div>
    </header>
    <div className="display-wall-grid">
      {screens.map((screen) => <section className={`display-wall-tile ${orientationClass(screen)}`} key={screen.id}>
        <span>{screen.label} · {screen.orientation}</span>
        <iframe src={`${appUrl}#/display/${encodeURIComponent(screen.id)}`} title={`${screen.label} display output`} allow="autoplay; fullscreen" />
      </section>)}
    </div>
  </main>;
}

function DisplayApp({ screenId }: { screenId: ScreenId }) {
  const [state, setState] = useState<LanternState>(() => loadLanternState());
  const [fps, setFps] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [identify, setIdentify] = useState(false);
  const [fitToScreen, setFitToScreen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [displayMenu, setDisplayMenu] = useState<{ x: number; y: number } | null>(null);
  const [scheduleNow, setScheduleNow] = useState(() => new Date());
  const scheduledSoundRef = useRef<ResolvedScheduledAnnouncement | null>(null);
  const blipSoundKeyRef = useRef("");
  const identifyTimerRef = useRef<number | null>(null);
  const receivedStateUpdateRef = useRef(false);
  const heartbeatStateRef = useRef({ fps, liveActive: state.live.active, liveTarget: state.live.target });
  const screen = state.screens[screenId] ?? Object.values(state.screens)[0];
  const showIdentity = useCallback(() => {
    if (identifyTimerRef.current) window.clearTimeout(identifyTimerRef.current);
    setIdentify(true);
    identifyTimerRef.current = window.setTimeout(() => {
      setIdentify(false);
      identifyTimerRef.current = null;
    }, 8000);
  }, []);

  useEffect(() => {
    let mounted = true;
    void loadSharedLanternState()
      .catch(() => null)
      .then((shared) => {
        const local = loadLanternState();
        return hydrateLanternMedia(shared ? mergeSharedLanternState(local, shared) : local);
      })
      // A display can receive a live update before its shared-state bootstrap
      // finishes. Never let that older bootstrap result roll the display back.
      .then((hydrated) => mounted && !receivedStateUpdateRef.current && setState(hydrated));
    return () => {
      mounted = false;
      if (identifyTimerRef.current) window.clearTimeout(identifyTimerRef.current);
    };
  }, []);

  useEffect(() => attachDisplayVideoReceiver(screenId, setStream), [screenId]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setScheduleNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    heartbeatStateRef.current = { fps, liveActive: state.live.active, liveTarget: state.live.target };
  }, [fps, state.live.active, state.live.target]);

  useEffect(() => {
    const channel = createHostChannel((message) => {
      if (message.type === "state-update") {
        receivedStateUpdateRef.current = true;
        setState(message.state);
      }
      if (message.type === "identify-screen" && message.screenId === screenId) {
        showIdentity();
      }
    });

    const heartbeat = () => {
      const latest = heartbeatStateRef.current;
      channel.post({
        type: "display-heartbeat",
        screenId,
        fps: latest.fps,
        status: latest.liveActive && targetIncludes(latest.liveTarget, screenId) ? "live" : "ready",
        timestamp: new Date().toISOString()
      });
    };

    const timer = window.setInterval(heartbeat, 1600);
    heartbeat();
    return () => {
      window.clearInterval(timer);
      channel.close();
    };
  }, [screenId, showIdentity]);

  const showLive = state.live.active && targetIncludes(state.live.target, screenId);
  const liveComposition = normalizeBroadcastComposition(liveCompositionForDisplay(state.live, screenId));
  const liveCropEdges = normalizeCropEdges(liveComposition.frame.cropEdges);
  const displayCostume = state.effectStudio.costumes.find((costume) => costume.id === liveComposition.effects.costumeId);
  const displayCalibration = state.effectStudio.calibrationProfiles.find((profile) => profile.id === liveComposition.effects.calibrationProfileId);
  const displayCostumeRenderer = useMemo(() => liveComposition.effects.costumeEnabled && displayCostume
    ? ((context: CanvasRenderingContext2D, frame: Parameters<typeof renderCostumeOverlay>[1]) => renderCostumeOverlay(context, frame, displayCostume, displayCalibration))
    : undefined, [displayCalibration, displayCostume, liveComposition.effects.costumeEnabled]);
  const scheduledBroadcast = showLive ? null : resolveScheduledBroadcast(state, screenId, scheduleNow);
  const broadcastActive = showLive || Boolean(scheduledBroadcast);
  const immediateBlipExpiresAt = state.activeBlip.startedAt && state.activeBlip.durationMinutes > 0
    ? Date.parse(state.activeBlip.startedAt) + state.activeBlip.durationMinutes * 60_000
    : null;
  const immediateBlipIsCurrent = immediateBlipExpiresAt === null || scheduleNow.getTime() < immediateBlipExpiresAt;
  const immediateBlip = state.activeBlip.active && immediateBlipIsCurrent && (state.activeBlip.targets?.length ? state.activeBlip.targets.includes(screenId) : targetIncludes(state.activeBlip.target, screenId)) ? { key: `${state.activeBlip.id}-${state.activeBlip.startedAt}`, blip: state.activeBlip, startedAt: state.activeBlip.startedAt ?? scheduleNow.toISOString() } : null;
  const displayBlip = broadcastActive ? null : immediateBlip ?? resolveScheduledBlip(state, screenId, scheduleNow);
  const immediateAnnouncementExpiresAt = state.announcement.startedAt && state.announcement.durationMinutes > 0
    ? Date.parse(state.announcement.startedAt) + state.announcement.durationMinutes * 60_000
    : null;
  const immediateAnnouncementIsCurrent = immediateAnnouncementExpiresAt === null || scheduleNow.getTime() < immediateAnnouncementExpiresAt;
  const showAnnouncement = !broadcastActive && !displayBlip && state.announcement.active && immediateAnnouncementIsCurrent && (state.announcement.targets?.length ? state.announcement.targets.includes(screenId) : targetIncludes(state.announcement.target, screenId));
  const scheduledAnnouncement = broadcastActive || displayBlip || showAnnouncement ? null : resolveScheduledAnnouncement(state, screenId, scheduleNow);
  const scheduledMessage = activeScheduleMessage(state, screenId, scheduleNow);
  const scheduledBoard = resolveCurrentBoardSchedule(state, screenId, scheduleNow);
  const displayHasScheduledContent = Boolean(scheduledBoard || scheduledBroadcast || displayBlip || showAnnouncement || scheduledAnnouncement);
  const nextScheduledContent = resolveNextScheduledContent(state, screenId, scheduleNow);

  useEffect(() => {
    if (!displayBlip || blipSoundKeyRef.current === displayBlip.key) return;
    blipSoundKeyRef.current = displayBlip.key;
    if (displayBlip.blip.startSoundUrl) playSound(displayBlip.blip.startSoundUrl, displayBlip.blip.sfxVolume);
    else playBlipSfx(displayBlip.blip.startSfx, displayBlip.blip.sfxVolume);
    if (displayBlip.blip.kind === "celebration") {
      window.setTimeout(() => displayBlip.blip.revealSoundUrl ? playSound(displayBlip.blip.revealSoundUrl!, displayBlip.blip.sfxVolume) : playBlipSfx(displayBlip.blip.revealSfx, displayBlip.blip.sfxVolume), 650);
    }
  }, [displayBlip?.key]);

  useEffect(() => {
    if (!displayBlip || displayBlip.blip.kind === "celebration") return;
    const elapsed = Math.max(0, (Date.now() - Date.parse(displayBlip.startedAt)) / 1000);
    const revealIn = Math.max(0, displayBlip.blip.countdownSeconds - elapsed) * 1000;
    const revealTimer = window.setTimeout(() => displayBlip.blip.revealSoundUrl ? playSound(displayBlip.blip.revealSoundUrl!, displayBlip.blip.sfxVolume) : playBlipSfx(displayBlip.blip.revealSfx, displayBlip.blip.sfxVolume), revealIn);
    const tickTimer = displayBlip.blip.ticking && revealIn > 0 ? window.setInterval(() => playBlipSfx("bell", Math.min(24, displayBlip.blip.sfxVolume)), 1000) : undefined;
    const stopTicks = tickTimer ? window.setTimeout(() => window.clearInterval(tickTimer), revealIn) : undefined;
    return () => { window.clearTimeout(revealTimer); if (tickTimer) window.clearInterval(tickTimer); if (stopTicks) window.clearTimeout(stopTicks); };
  }, [displayBlip?.key]);

  useEffect(() => {
    const previous = scheduledSoundRef.current;
    if (previous && previous.key !== scheduledAnnouncement?.key) {
      if (previous.announcement.endSoundUrl) playSound(previous.announcement.endSoundUrl);
      playAnnouncementSfx(previous.announcement);
    }
    if (scheduledAnnouncement && previous?.key !== scheduledAnnouncement.key && scheduledAnnouncement.announcement.startSoundUrl) {
      playSound(scheduledAnnouncement.announcement.startSoundUrl);
    }
    scheduledSoundRef.current = scheduledAnnouncement;
  }, [scheduledAnnouncement?.key]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      }
    } catch {
      setFitToScreen(true);
    } finally {
      setDisplayMenu(null);
    }
  };

  return (
    <div
      className={`display-shell ${orientationClass(screen)}${fitToScreen ? " fit-board" : ""}${showLive && liveComposition.backgroundMode === "none" ? " transparent-live-background" : ""}`}
      onClick={() => setDisplayMenu(null)}
      onContextMenu={(event) => {
        event.preventDefault();
        setDisplayMenu({
          x: Math.max(8, Math.min(event.clientX, window.innerWidth - 250)),
          y: Math.max(8, Math.min(event.clientY, window.innerHeight - 230))
        });
      }}
    >
      {scheduledBoard && <BabylonDonorWall
          state={state}
          screenId={screenId}
          onFps={setFps}
          fitToScreen={fitToScreen}
          viewMode="2d"
          announcementCharacter={(showAnnouncement ? state.announcement : scheduledAnnouncement?.announcement)?.character ?? "off"}
          announcementCharacterAsset={showAnnouncement ? state.announcement : scheduledAnnouncement?.announcement}
          announcementActive={Boolean(showAnnouncement || scheduledAnnouncement)}
        />}
      {!displayHasScheduledContent && <IdleDisplayNotice upcoming={nextScheduledContent} presentation />}
      {displayBlip && <BlipComposition blip={displayBlip.blip} startedAt={displayBlip.startedAt} />}
      {showAnnouncement && (
        <FixedAnnouncementComposition screen={screen} announcement={state.announcement} startedAt={state.announcement.startedAt} />
      )}
      {!showAnnouncement && scheduledAnnouncement && (
        <FixedAnnouncementComposition screen={screen} announcement={scheduledAnnouncement.announcement} startedAt={scheduledAnnouncement.startedAt} />
      )}
      {!broadcastActive && !displayBlip && !showAnnouncement && !scheduledAnnouncement && scheduledMessage && (
        <div className="announcement-overlay ribbon">
          <strong>{scheduledMessage.name}</strong>
          <span>{scheduledMessage.message}</span>
        </div>
      )}
      {scheduledBroadcast?.broadcastVideoUrl && <video className="scheduled-broadcast-video" src={scheduledBroadcast.broadcastVideoUrl} autoPlay loop playsInline />}
      {showLive && !scheduledBoard && <BroadcastBackgroundLayer live={liveComposition} orientation={screen.orientation} className="live-broadcast-background" />}
      {showLive && (
        <div className={`live-overlay broadcast-frame-surface mask-${liveComposition.frame.maskShape ?? "rectangle"}`} style={{ left: `${liveComposition.frame.x}%`, top: `${liveComposition.frame.y}%`, width: `${liveComposition.frame.width}%`, height: `${liveComposition.frame.height}%`, clipPath: liveComposition.frame.maskShape === "polygon" ? livePolygonClip(liveComposition.frame) : undefined, ...frameSurfaceStyle(liveComposition) }}>
          <div className="broadcast-crop-viewport" style={{ clipPath: `inset(${liveCropEdges.top}% ${liveCropEdges.right}% ${liveCropEdges.bottom}% ${liveCropEdges.left}%)` }}>
            <div className="live-camera-transform" style={{ transform: `rotate(${liveComposition.frame.rotation ?? 0}deg) scale(${liveComposition.frame.mirrorX ? -1 : 1}, ${liveComposition.frame.mirrorY ? -1 : 1})` }}>
              <ChromaVideo stream={stream} chromaKey={liveComposition.chromaKey} effects={liveComposition.effects} crop={liveComposition.frame.crop} fitMode={liveComposition.frame.fitMode} renderTrackedOverlay={displayCostumeRenderer} />
            </div>
          </div>
          {!stream && <div className="video-waiting">Waiting for local video signal</div>}
        </div>
      )}
      {showLive && <div className="live-broadcast-text live-broadcast-title" style={{ left: `${liveComposition.titlePosition.x}%`, top: `${liveComposition.titlePosition.y}%` }}><strong>{liveComposition.title}</strong></div>}
      {showLive && <div className="live-broadcast-text live-broadcast-lower-third" style={{ left: `${liveComposition.lowerThirdPosition.x}%`, top: `${liveComposition.lowerThirdPosition.y}%` }}><span>{liveComposition.lowerThird}</span></div>}
      {identify && (
        <div className="identify-flash">
          <Monitor size={44} />
          <strong>{screen.label}</strong>
          <span>{screen.orientation} · {screen.resolution}</span>
          <small>Revision {state.revision}</small>
        </div>
      )}
      {displayMenu && (
        <div className="display-context-menu" style={{ left: displayMenu.x, top: displayMenu.y }} onClick={(event) => event.stopPropagation()}>
          <div className="display-context-menu-title"><Monitor size={16} /><strong>Display controls</strong></div>
          <button type="button" onClick={() => { setFitToScreen((current) => !current); setDisplayMenu(null); }}>
            <ScanFace size={17} />
            <span>{fitToScreen ? "Show full board" : "Fit board to screen"}</span>
            <small>{fitToScreen ? "On" : "Off"}</small>
          </button>
          <button type="button" onClick={() => void toggleFullscreen()}>
            {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            <span>{isFullscreen ? "Exit TV presentation" : "Present on TV (no borders)"}</span>
          </button>
          <button type="button" onClick={() => { showIdentity(); setDisplayMenu(null); }}>
            <Radio size={17} />
            <span>Identify display</span>
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            <RefreshCcw size={17} />
            <span>Reload display</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ControlGroup({ title, icon: Icon, info, children }: { title: string; icon: typeof Settings2; info: string; children: React.ReactNode }) {
  return (
    <div className="control-group">
      <h2>
        <Icon size={18} />
        {title}
        <InfoDot text={info} />
      </h2>
      {children}
    </div>
  );
}

function Slider({
  label,
  info,
  value,
  onChange,
  min = 0,
  max = 100,
  editableValue = false
}: {
  label: string;
  info?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  editableValue?: boolean;
}) {
  return (
    <label className="field slider-field">
      <span>
        {label}
        {info && <InfoDot text={info} />}
      </span>
      {editableValue
        ? <input className="slider-number-input" type="number" aria-label={`${label} value`} min={min} max={max} step={1} value={value} onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }} />
        : <b>{Number.isInteger(value) ? value : value.toFixed(1)}</b>}
      <input type="range" min={min} max={max} step={1} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function LabeledSelect({
  label,
  info,
  value,
  options,
  optionLabels,
  disabled = false,
  onChange
}: {
  label: string;
  info?: string;
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {info && <InfoDot text={info} />}
      </span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? labelForTarget(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function LabeledInput({ label, info, value, type = "text", onChange }: { label: string; info?: string; value: string; type?: React.HTMLInputTypeAttribute; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>
        {label}
        {info && <InfoDot text={info} />}
      </span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function playAnnouncementSfx(announcement: LanternState["announcement"]) {
  if (announcement.finishSfx === "off") return;
  playSound(announcementSfxSources[announcement.finishSfx], announcement.sfxVolume);
}

function playSound(source: string, volume = 85) {
  const audio = new Audio(source);
  audio.volume = Math.max(0, Math.min(1, volume / 100));
  void audio.play().catch(() => undefined);
}

function playBlipSfx(effect: LanternState["activeBlip"]["startSfx"], volume = 70) {
  if (effect === "off") return;
  if (effect === "bell") return playSound(announcementSfxSources.ding, volume);
  if (effect === "applause" || effect === "laughter") return playSound(announcementSfxSources.chime, volume);
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const notes = effect === "level-up" ? [330, 440, 660, 880] : [120, 90, 220];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * (effect === "level-up" ? .11 : .16);
      oscillator.type = effect === "level-up" ? "sine" : index === notes.length - 1 ? "triangle" : "square";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(Math.max(.015, volume / 650), start);
      gain.gain.exponentialRampToValueAtTime(.001, start + .2);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + .21);
    });
    window.setTimeout(() => void context.close(), 1200);
  } catch {
    // Displays remain silent when browser audio policy blocks synthesized effects.
  }
}

async function readSharedImageFile(file: File | undefined, onLoad: (value: string) => void) {
  if (!file) return;
  try {
    onLoad(await uploadLanternAsset(file));
  } catch {
    readImageFile(file, onLoad);
  }
}

function readImageFile(file: File | undefined, onLoad: (value: string) => void) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" && onLoad(reader.result);
  reader.readAsDataURL(file);
}

function DisplayPicker({ state, value, onChange }: { state: LanternState; value: ScreenId; onChange: (value: ScreenId) => void }) {
  return (
    <div className="segmented display-picker" role="group" aria-label="Display preview">
      {Object.values(state.screens).map((screen) => (
        <button type="button" key={screen.id} className={value === screen.id ? "selected" : ""} aria-pressed={value === screen.id} onClick={() => onChange(screen.id)}>
          {screen.label}
        </button>
      ))}
    </div>
  );
}

function Pager({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  return <div className="pager" aria-label="Pagination"><button type="button" className="icon-button" disabled={page <= 0} onClick={() => onChange(page - 1)} title="Previous page"><ChevronLeft size={16} /></button><span><b>{page + 1}</b> / {pageCount}</span><button type="button" className="icon-button" disabled={page >= pageCount - 1} onClick={() => onChange(page + 1)} title="Next page"><ChevronRight size={16} /></button></div>;
}

function SegmentedControl({ value, options, onChange }: { value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <div className="segmented" role="group">
      {options.map(([id, label]) => (
        <button type="button" key={id} className={value === id ? "selected" : ""} aria-pressed={value === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function EditorTabs({ value, options, onChange }: { value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <div className="editor-tabs" role="tablist">
      {options.map(([id, label]) => (
        <button
          type="button"
          role="tab"
          key={id}
          aria-selected={value === id}
          className={value === id ? "selected" : ""}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function InfoDot({ text }: { text: string }) {
  return (
    <span className="info-dot" title={text} role="img" aria-label={text} tabIndex={0}>
      <Info size={12} />
    </span>
  );
}

function useHashView(): [View, (view: View) => void] {
  const getView = () => {
    const next = window.location.hash.replace("#/", "") as View;
    return navItems.some((item) => item.id === next) ? next : "dashboard";
  };
  const [view, setViewState] = useState<View>(getView);

  useEffect(() => {
    const onHashChange = () => setViewState(getView());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setView = (next: View) => {
    window.location.hash = `#/${next}`;
    setViewState(next);
  };

  return [view, setView];
}

function applyHeartbeat(state: LanternState, heartbeat: DisplayHeartbeat): LanternState {
  const screen = state.screens[heartbeat.screenId] ?? makeDisplay(heartbeat.screenId, Object.keys(state.screens).length + 1);
  return {
    ...state,
    screens: {
      ...state.screens,
      [heartbeat.screenId]: {
        ...screen,
        fps: heartbeat.fps,
        status: heartbeat.status,
        lastHeartbeat: new Date(heartbeat.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })
      }
    }
  };
}

function makeDisplay(id: string, number: number): DisplayProfile {
  const portrait = number === 1;
  return {
    id,
    label: `Display ${number}`,
    orientation: portrait ? "Portrait" : "Landscape",
    resolution: portrait ? "1080 x 1920" : "1920 x 1080",
    assignment: "Test window",
    style: "donor-wall",
    backgroundCrop: { scale: 1, x: 0, y: 0 },
    layoutScale: 100,
    brightness: 72,
    currentRevision: 18,
    renderer: "WebGL2",
    quality: number === 1 ? "Balanced" : "Showcase",
    fps: 0,
    status: "offline",
    donorScrollEnabled: false,
    donorScrollSpeed: 4
  };
}

function firstDisplayId(state: LanternState) {
  return Object.keys(state.screens)[0] ?? "display-1";
}

function orientationClass(screen: DisplayProfile) {
  return screen.orientation === "Portrait" ? "portrait" : "landscape";
}

function targetOptions(state: LanternState) {
  return ["all", ...Object.keys(state.screens)];
}

function scheduleTargetOptions(state: LanternState) {
  return Object.keys(state.screens);
}

function targetOptionLabels(state: LanternState) {
  return Object.fromEntries(targetOptions(state).map((target) => {
    const screen = state.screens[target];
    return [target, target === "all" ? "All displays" : screen ? `${screen.label} (${screen.orientation})` : target];
  }));
}

function deviceOptionList(devices: MediaDeviceInfo[], defaultLabel: string, fallbackName: string) {
  const options = [""];
  const labels: Record<string, string> = { "": defaultLabel };
  devices.forEach((device, index) => {
    if (!device.deviceId || options.includes(device.deviceId)) return;
    options.push(device.deviceId);
    labels[device.deviceId] = device.label || `${fallbackName} ${index + 1}`;
  });
  return { options, labels };
}

function labelForTarget(target: string) {
  return target === "all" ? "All displays" : target;
}

function labelForStyle(style: DisplayStyle) {
  return styleOptions.find(([id]) => id === style)?.[1] ?? style;
}

function displayRosterIds(state: LanternState, screen: DisplayProfile) {
  const board = state.boardPrograms.find((program) => program.id === screen.boardProgramId) ?? state.boardPrograms[0];
  return (board?.donorIds ?? []).filter((id) => state.donors.some((donor) => donor.id === id && donor.active));
}

function donorSubtextVisibleForDisplay(screen: DisplayProfile, donorId: string) {
  return screen.donorSubtextVisibility?.[donorId] ?? screen.showSubtext ?? false;
}

function titleFor(view: View) {
  switch (view) {
    case "brigade":
      return "Toy Soldier Brigade";
    case "donors":
      return "Donors";
    case "theme":
      return "Board Editor";
    case "schedule":
      return "Schedule";
      case "announcements":
        return "Announcements";
      case "live":
        return "Broadcast / Stream";
    case "revisions":
      return "Revision History";
    case "bugs":
      return "Bugs";
    case "settings":
      return "Settings";
    default:
      return "Dashboard";
  }
}

interface ResolvedScheduledAnnouncement {
  key: string;
  announcement: LanternState["announcement"];
  startedAt: string;
}

interface ResolvedBlip {
  key: string;
  blip: LanternState["activeBlip"];
  startedAt: string;
}

interface ResolvedScheduledBroadcast {
  key: string;
  broadcastVideoUrl: string;
}

function scheduleMatchesDate(entry: ScheduleEntry, now: Date) {
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (entry.recurrence === "once" && entry.scheduleDate) return entry.scheduleDate === localDate;
  if (entry.scheduleDate && localDate < entry.scheduleDate) return false;
  if (entry.scheduleEndDate && localDate > entry.scheduleEndDate) return false;
  return entry.days.includes(now.getDay());
}

function resolveCurrentBoardSchedule(state: LanternState, screenId: ScreenId, now = new Date()) {
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return state.schedules?.find((entry) =>
    (entry.contentType ?? "board") === "board"
    && entry.active
    && scheduleMatchesDate(entry, now)
    && (entry.target === "all" || entry.target === screenId)
    && time >= entry.startTime
    && time < entry.endTime
  );
}

function TypographyNumberField({ label, info, value, min, max, step = 1, suffix, onChange }: { label: string; info?: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (value: number) => void }) {
  const adjust = (direction: -1 | 1) => {
    const precision = step < 1 ? Math.max(0, String(step).split(".")[1]?.length ?? 0) : 0;
    const next = Math.max(min, Math.min(max, Number((value + direction * step).toFixed(precision))));
    onChange(next);
  };
  return <label className="field typography-number-field"><span>{label}{info && <InfoDot text={info} />}</span><div><button type="button" className="typography-stepper" aria-label={`Decrease ${label}`} title={`Decrease ${label}`} disabled={value <= min} onClick={() => adjust(-1)}><Minus size={12} /></button><input type="number" aria-label={label} min={min} max={max} step={step} value={value} onChange={(event) => { const next = event.currentTarget.valueAsNumber; if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next))); }} /><b>{suffix}</b><button type="button" className="typography-stepper" aria-label={`Increase ${label}`} title={`Increase ${label}`} disabled={value >= max} onClick={() => adjust(1)}><Plus size={12} /></button></div></label>;
}

function resolveNextScheduledContent(state: LanternState, screenId: ScreenId, now = new Date()) {
  const schedules = state.schedules ?? [];
  for (let offset = 0; offset <= 31; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const candidates = schedules
      .filter((entry) => entry.active && (entry.target === "all" || entry.target === screenId) && scheduleMatchesDate(entry, date))
      .map((entry) => {
        const startsAt = new Date(date);
        const [hours, minutes] = entry.startTime.split(":").map(Number);
        startsAt.setHours(hours, minutes, 0, 0);
        return { entry, startsAt };
      })
      .filter((candidate) => candidate.startsAt.getTime() > now.getTime())
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
    if (candidates[0]) return candidates[0];
  }
  return null;
}

function IdleDisplayNotice({ upcoming, presentation = false, onAddSchedule }: { upcoming: ReturnType<typeof resolveNextScheduledContent>; presentation?: boolean; onAddSchedule?: () => void }) {
  const type = upcoming?.entry.contentType === "blip"
    ? "Pop-up"
    : upcoming?.entry.contentType === "announcement"
      ? "Announcement"
      : upcoming?.entry.contentType === "broadcast"
        ? "Broadcast"
        : "Board";
  const when = upcoming?.startsAt.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  return <div className={`display-idle-notice${presentation ? " presentation" : ""}`}>
    <Clock3 size={presentation ? 26 : 18} aria-hidden="true" />
    <div><strong>Nothing scheduled</strong>{upcoming ? <span>Next {type.toLowerCase()}: <b>{upcoming.entry.name}</b><small>{when}</small></span> : <span>No upcoming board or pop-up</span>}{onAddSchedule && <button type="button" className="command-button secondary compact idle-schedule-button" onClick={onAddSchedule}><CalendarDays size={14} /> Add schedule</button>}</div>
  </div>;
}

function resolveActiveBoardProgram(state: LanternState, screenId: ScreenId, now = new Date()) {
  const scheduled = resolveCurrentBoardSchedule(state, screenId, now);
  if (scheduled) {
    const program = state.boardPrograms.find((candidate) => candidate.id === scheduled.boardId && candidate.active);
    if (program) return program;
  }
  const assignedId = state.screens[screenId]?.boardProgramId;
  return state.boardPrograms.find((candidate) => candidate.id === assignedId)
    ?? state.boardPrograms.find((candidate) => candidate.active && candidate.orientation === state.screens[screenId]?.orientation)
    ?? state.boardPrograms[0];
}

function resolveDisplayedBoardProgramId(state: LanternState, screenId: ScreenId, now = new Date()) {
  return resolveActiveBoardProgram(state, screenId, now)?.id ?? "";
}

function resolveScheduledAnnouncement(state: LanternState, screenId: ScreenId, now = new Date()): ResolvedScheduledAnnouncement | null {
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const entry = state.schedules?.find((item) =>
    item.contentType === "announcement"
    && item.active
    && item.announcementId
    && scheduleMatchesDate(item, now)
    && (item.target === "all" || item.target === screenId)
    && time >= item.startTime
    && time < item.endTime
  );
  if (!entry?.announcementId) return null;
  const saved = state.savedAnnouncements.find((item) => item.id === entry.announcementId);
  if (!saved) return null;
  const startMinutes = timeToMinutes(entry.startTime);
  const endMinutes = timeToMinutes(entry.endTime);
  const startedAt = new Date(now);
  startedAt.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return {
    key: `${entry.id}-${dateKey}`,
    startedAt: startedAt.toISOString(),
    announcement: {
      ...saved,
      active: true,
      target: entry.target,
      startedAt: startedAt.toISOString(),
      durationMinutes: Math.max(1, (endMinutes - startMinutes) / 60)
    }
  };
}

function resolveScheduledBlip(state: LanternState, screenId: ScreenId, now = new Date()): ResolvedBlip | null {
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const entry = state.schedules?.find((item) => item.contentType === "blip" && item.active && item.blipId && scheduleMatchesDate(item, now) && (item.target === "all" || item.target === screenId) && time >= item.startTime && time < item.endTime);
  if (!entry?.blipId) return null;
  const saved = state.savedBlips.find((item) => item.id === entry.blipId);
  if (!saved) return null;
  const startMinutes = timeToMinutes(entry.startTime);
  const endMinutes = timeToMinutes(entry.endTime);
  const startedAt = new Date(now);
  startedAt.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return { key: `${entry.id}-${dateKey}`, startedAt: startedAt.toISOString(), blip: { ...saved, active: true, target: entry.target, startedAt: startedAt.toISOString(), durationMinutes: Math.max(1 / 60, (endMinutes - startMinutes) / 60) } };
}

function resolveScheduledBroadcast(state: LanternState, screenId: ScreenId, now = new Date()): ResolvedScheduledBroadcast | null {
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const entry = state.schedules?.find((item) => item.contentType === "broadcast" && (item.broadcastMode ?? "recorded") === "recorded" && item.active && item.broadcastVideoUrl && scheduleMatchesDate(item, now) && (item.target === "all" || item.target === screenId) && time >= item.startTime && time < item.endTime);
  if (!entry?.broadcastVideoUrl) return null;
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return { key: `${entry.id}-${dateKey}`, broadcastVideoUrl: entry.broadcastVideoUrl };
}

function activeScheduleMessage(state: LanternState, screenId: ScreenId, now = new Date()) {
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return state.schedules?.find((entry) => (entry.contentType ?? "board") === "board" && entry.active && entry.message && scheduleMatchesDate(entry, now) && (entry.target === "all" || entry.target === screenId) && time >= entry.startTime && time < entry.endTime);
}

function statusLabel(status: string) {
  switch (status) {
    case "ready":
      return "Ready";
    case "live":
      return "Live";
    case "warning":
      return "Warning";
    default:
      return "Offline";
  }
}
