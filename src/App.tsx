import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  GripVertical,
  Move,
  Move3d,
  Glasses,
  Circle,
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
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Square,
  ArrowUpRight,
  Star,
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
import {
  createHostChannel,
  deleteLanternMedia,
  enableSharedStatePersistence,
  fitWarnings,
  hydrateLanternMedia,
  loadLanternState,
  loadSharedLanternState,
  nextRevision,
  openDisplayWindows,
  publishState,
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
  BoardPanelType,
  Donor,
  DonationRecord,
  HostMessage,
  LanternState,
  LanternTheme,
  ScreenId,
  TargetScreen,
  ScheduleEntry
} from "./types";
import { invoke } from "@tauri-apps/api/core";
import codeChangelog from "./changelog.json";

type View = "dashboard" | "donors" | "theme" | "schedule" | "announcements" | "live" | "screens" | "revisions" | "bugs" | "settings";

const navItems: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "donors", label: "Donors", icon: Users },
  { id: "theme", label: "Board Editor", icon: Palette },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "announcements", label: "Announcements", icon: Megaphone },
  { id: "live", label: "Broadcast / Stream", icon: Radio },
  { id: "screens", label: "Screens", icon: Monitor },
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

const donorIconOptions: NonNullable<Donor["icon"]>[] = ["none", "star", "heart", "leaf", "sparkle", "diamond", "crown", "laurel", "sun", "hand"];
const donorIconLabels: Record<NonNullable<Donor["icon"]>, string> = {
  none: "No icon",
  star: "Star",
  heart: "Heart",
  leaf: "Leaf",
  sparkle: "Sparkle",
  diamond: "Diamond",
  crown: "Crown",
  laurel: "Laurel",
  sun: "Sun",
  hand: "Helping hand"
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

  const displayMatch = window.location.hash.match(/^#\/display\/([^/?#]+)/);
  if (displayMatch) {
    return <DisplayApp screenId={decodeURIComponent(displayMatch[1])} />;
  }

  return <ControlCenter />;
}

function ControlCenter() {
  const [state, setState] = useState<LanternState>(() => loadLanternState());
  const [view, setView] = useHashView();
  const [query, setQuery] = useState("");
  const [selectedDisplayId, setSelectedDisplayId] = useState<ScreenId>(() => firstDisplayId(loadLanternState()));
  const [videoStatus, setVideoStatus] = useState("Idle");
  const [donorSetupOpen, setDonorSetupOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [bugCapture, setBugCapture] = useState<BugAttachment[]>([]);
  const [bugCaptureStatus, setBugCaptureStatus] = useState("");
  const [ideasOpen, setIdeasOpen] = useState(true);
  const [displayEditorTab, setDisplayEditorTab] = useState<"setup" | "room" | "names">("setup");
  const videoBridge = useRef<DirectorVideoBridge | null>(null);
  const showIdeas = false;

  useEffect(() => {
    let mounted = true;
    void (async () => {
      let loaded = loadLanternState();
      try {
        loaded = await loadSharedLanternState() ?? loaded;
      } catch {
        // The local browser copy remains usable whenever the shared service is unavailable.
      }
      const hydrated = await hydrateLanternMedia(loaded);
      const sharedImages = await shareLanternImages(hydrated);
      if (!mounted) return;
      setState(sharedImages);
      enableSharedStatePersistence();
      publishState(sharedImages);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
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
  }, []);

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

  const updateState = useCallback((updater: (current: LanternState) => LanternState) => {
    setState((current) => {
      const next = updater(current);
      publishState(next);
      return next;
    });
  }, []);

  const warnings = useMemo(() => fitWarnings(state), [state]);
  const filteredDonors = useMemo(
    () =>
      state.donors.filter((donor) => {
        const group = state.donorGroups.find((item) => item.id === donor.groupId)?.name ?? "";
        const haystack = `${donor.name} ${donor.tier} ${donor.category} ${donor.note} ${donor.subtext ?? ""} ${(donor.tags ?? []).join(" ")} ${group} ${donor.donationType ?? ""} ${donor.amount ?? ""}`.toLowerCase();
        return haystack.includes(query.toLowerCase());
      }),
    [query, state.donors, state.donorGroups]
  );

  const openDisplays = async () => {
    publishState(state);
    await openDisplayWindows(Object.values(state.screens));
    window.setTimeout(() => publishState(state), 700);
  };

  const publishRevision = () => {
    updateState((current) => nextRevision(current, "Validated display-specific scene bundles"));
  };

  const restoreDonorWall = () => {
    videoBridge.current?.stop("all");
    updateState((current) => ({
      ...current,
      announcement: { ...current.announcement, active: false },
      live: { ...current.live, active: false }
    }));
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
    updateState((current) => ({ ...current, live: { ...current.live, active: true } }));
    await videoBridge.current?.start(state.live.target, state.live.source, state.live.videoDeviceId, state.live.audioDeviceId);
    await Promise.all(
      Object.values(state.screens)
        .filter((screen) => targetIncludes(state.live.target, screen.id))
        .map((screen) => videoBridge.current?.connect(screen.id))
    );
  };

  const startLiveStream = async (stream: MediaStream, detail: string) => {
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
    const channel = new BroadcastChannel("project-lantern-host-v1");
    channel.postMessage({ type: "identify-screen", screenId } satisfies HostMessage);
    channel.close();
  };

  const openDisplayEditor = (screenId: ScreenId, tab: "setup" | "room" | "names" = "setup") => {
    setSelectedDisplayId(screenId);
    setDisplayEditorTab(tab);
    setView("screens");
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
    setView("announcements");
  };

  useEffect(() => {
    if (view !== "donors") setDonorSetupOpen(false);
  }, [view]);

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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-aurora" aria-hidden="true" />
        <button className="brand-lockup" onClick={() => setView("dashboard")} title="Return to Dashboard" aria-label="Children's Museum of Stockton — return to Dashboard">
          <img className="museum-brand-image" src={`${import.meta.env.BASE_URL}assets/childrens-museum-stockton.png`} alt="Children's Museum of Stockton" />
        </button>
        <nav className="nav-list">
          {navItems.filter((item) => item.id !== "revisions" && item.id !== "bugs" && item.id !== "screens").map((item) => {
            const index = navItems.findIndex((candidate) => candidate.id === item.id);
            const Icon = item.icon;
            return (
              <button className={view === item.id ? "nav-item active" : "nav-item"} key={item.id} onClick={() => setView(item.id)} title={item.label} aria-current={view === item.id ? "page" : undefined}>
                <span className="nav-icon"><Icon size={18} /></span>
                <span className="nav-copy"><b>{item.label}</b><small>0{index + 1}</small></span>
              </button>
            );
          })}
        </nav>
        <nav className="nav-list nav-utility-list" aria-label="History and support">
          {navItems.filter((item) => item.id === "revisions" || item.id === "bugs").map((item) => {
            const index = navItems.findIndex((candidate) => candidate.id === item.id);
            const Icon = item.icon;
            return (
              <button className={view === item.id ? "nav-item active" : "nav-item"} key={item.id} onClick={() => setView(item.id)} title={item.label} aria-current={view === item.id ? "page" : undefined}>
                <span className="nav-icon"><Icon size={18} /></span>
                <span className="nav-copy"><b>{item.label}</b><small>0{index + 1}</small></span>
              </button>
            );
          })}
        </nav>
        <div className="system-card">
          <span className="system-pulse"><Activity size={14} /></span>
          <div><strong>System ready</strong><small>{Object.values(state.screens).filter((screen) => screen.status !== "offline").length}/{Object.keys(state.screens).length} displays linked</small></div>
        </div>
      </aside>

      <main className={`main-panel${showIdeas ? ideasOpen ? " ideas-open" : " ideas-collapsed" : ""}`}>
        <header className={view === "dashboard" ? "topbar dashboard-topbar" : "topbar"}>
          <div className="page-identity">
            <p className="eyebrow"><span>Lantern control</span><i />Published {state.publishedAt}</p>
            <h1>{titleFor(view)}</h1>
          </div>
          <div className="topbar-actions">
            {view === "dashboard" && (
              <>
              <button className="header-operation-button" onClick={addDonor} title="Add a test or production donor">
                <Plus size={16} /><span>Add donor</span>
              </button>
              <button className="header-operation-button" onClick={openAnnouncementComposer} title="Create a new announcement">
                <Megaphone size={16} /><span>Announce</span>
              </button>
              <button className="header-operation-button" onClick={() => setView("live")} title="Open the broadcast and streaming studio">
                <Radio size={16} /><span>Broadcast / Stream</span>
              </button>
              <button className="command-button secondary help-launch-button" onClick={() => setHelpOpen(true)} title="Open the Project Lantern walkthrough">
                <BookOpen size={18} />
                How to use
              </button>
              </>
            )}
            <button className="command-button secondary" onClick={restoreDonorWall} title="Stop live video and announcements, then return every display to its scheduled donor board">
              <RotateCcw size={18} />
              Restore boards
            </button>
            <button className="command-button primary" onClick={publishRevision} title="Publish the current donor, board, and schedule changes to all displays">
              <Send size={18} />
              Publish
            </button>
          </div>
        </header>
        <nav className="mobile-primary-nav" aria-label="Primary navigation">
          {navItems.filter((item) => ["dashboard", "donors", "theme", "schedule", "announcements", "live", "settings"].includes(item.id)).map((item) => {
            const Icon = item.icon;
            return <button type="button" key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined}><Icon size={17} /><span>{item.label}</span></button>;
          })}
        </nav>

        {view === "dashboard" && (
          <Dashboard
            state={state}
            selectedDisplayId={selectedDisplayId}
            setSelectedDisplayId={setSelectedDisplayId}
            openDisplays={openDisplays}
            updateState={updateState}
            addDisplay={addDisplay}
            deleteDisplay={deleteDisplay}
            identifyDisplay={identifyDisplay}
            editDisplay={(screenId) => {
              setSelectedDisplayId(screenId);
              setView("theme");
            }}
            editRoomCamera={(screenId) => openDisplayEditor(screenId, "room")}
          />
        )}
        {view === "donors" && (
          <DonorsView
            state={state}
            query={query}
            setQuery={setQuery}
            donors={filteredDonors}
            warnings={warnings}
            updateState={updateState}
            addDonor={addDonor}
            donorSetupOpen={donorSetupOpen}
            closeDonorSetup={() => setDonorSetupOpen(false)}
          />
        )}
        {view === "theme" && <ThemeStudio state={state} selectedDisplayId={selectedDisplayId} setSelectedDisplayId={setSelectedDisplayId} updateState={updateState} />}
        {view === "schedule" && <ScheduleCalendarView
          state={state}
          updateState={updateState}
          onEditDisplay={(target) => { setSelectedDisplayId(target === "all" ? firstDisplayId(state) : target); setView("theme"); }}
          onEditAnnouncement={(announcementId) => {
            const saved = state.savedAnnouncements.find((item) => item.id === announcementId);
            if (saved) updateState((current) => ({ ...current, announcement: { ...saved, active: false, startedAt: undefined } }));
            setView("announcements");
          }}
        />}
        {view === "announcements" && (
          <AnnouncementsView state={state} updateState={updateState} toggleAnnouncement={toggleAnnouncement} />
        )}
        {view === "live" && (
          <section className="comms-workspace go-live-workspace">
            <LivePreviewPanel
              state={state}
              patchLive={(patch) => updateState((current) => ({ ...current, live: { ...current.live, ...patch } }))}
              startLive={startLive}
              startLiveStream={startLiveStream}
              stopLive={stopLive}
            />
          </section>
        )}
        {view === "screens" && <ScreensView state={state} selectedDisplayId={selectedDisplayId} setSelectedDisplayId={setSelectedDisplayId} openDisplays={openDisplays} updateState={updateState} initialEditingId={selectedDisplayId} initialEditorTab={displayEditorTab} />}
        {view === "revisions" && <RevisionsView state={state} updateState={updateState} />}
        {view === "bugs" && <BugsView onNewBug={() => void openBugReport()} />}
        {view === "settings" && <RecognitionSettingsView state={state} updateState={updateState} />}
        {showIdeas && <IdeasDrawer page={view} open={ideasOpen} onToggle={() => setIdeasOpen((current) => !current)} />}
      </main>
      {helpOpen && <HelpCenterModal onClose={() => setHelpOpen(false)} />}
      <button className="bug-report-fab" onClick={() => void openBugReport()} title="Report a bug"><Bug size={19} /><span>Bug</span></button>
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
type AgentWorkEntry = { at: string; author: string; kind: "analysis" | "proposal" | "change" | "test" | "handoff"; note: string };
type BugRecord = { bugId: string; summary: string; details: string; fixTips: string; tags: string[]; status: BugStatus; createdAt: string; updatedAt: string; attachments: string[]; folder: string; evidence?: BugEvidence[]; agentWork?: AgentWorkEntry[] };
const WEB_BUGS_KEY = "project-lantern-bug-catalog";
const BUG_USERS_KEY = "project-lantern-bug-users";
const ACTIVE_BUG_USER_KEY = "project-lantern-active-bug-user";
const BUG_API_ENDPOINT = (import.meta.env.VITE_LANTERN_BUG_ENDPOINT as string | undefined)?.trim()
  || (import.meta.env.DEV ? "/__lantern/bugs" : "");
function isTauri() { return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window; }
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
        const capture = await invoke<BugAttachment>("capture_bug_snip");
        setAttachments((current) => [...current, capture]);
      } else {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          setStatus("Screen capture is not available in this browser. Use Add files to attach a screenshot.");
          return;
        }
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const video = document.createElement("video");
        video.srcObject = stream;
        await video.play();
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        stream.getTracks().forEach((track) => track.stop());
        setAttachments((current) => [...current, { name: `screen-capture-${Date.now()}.png`, dataUrl: canvas.toDataURL("image/png") }]);
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
        summary, details, fixTips,
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
          location: window.location.href
        },
        recentEvents: getRecentClientEvents()
      };
      let reportPath: string;
      if (isTauri()) {
        reportPath = await invoke<string>("save_bug_report", { report: payload });
      } else {
        const bugs = readWebBugs();
        const now = new Date().toISOString();
        const randomDigits = crypto.getRandomValues(new Uint32Array(1))[0].toString().padStart(10, "0").slice(-10);
        const bugId = `BUG-${randomDigits}`;
        const record: BugRecord = { bugId, summary, details, fixTips, tags: payload.tags, status: "open", createdAt: now, updatedAt: now, attachments: attachments.map((item) => item.name), evidence: attachments, agentWork: [], folder: `.lantern/bugs/${bugId}` };
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
        <label className="field"><span>Brief description <b>*</b> <InfoDot text="In one sentence, say what went wrong and where. A good example is: “Schedule screen goes blank after I press Publish.”" /></span><input autoFocus value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What went wrong?" /></label>
        <label className="field"><span>Details <InfoDot text="Tell us the steps you took, what you expected to happen, and what actually happened. Include whether it happens every time or only sometimes." /></span><textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="What were you doing? What happened? What did you expect?" /></label>
        <label className="field"><span>Tips on how to fix <InfoDot text="Optional: share anything that may help investigate, such as when the problem started, a possible cause, or a workaround you found. It is completely fine to leave this blank." /></span><textarea value={fixTips} onChange={(event) => setFixTips(event.target.value)} placeholder="Optional clues, suspected cause, or suggested solution" /></label>
        <BugTagInput
          tags={tags}
          available={[...state.recognitionSettings.tags, ...knownBugTags]}
          onChange={setTags}
        />
        <div className="bug-attachments-head"><div><strong>Attached evidence <InfoDot text="A screenshot, GIF, video, or small log file can show the exact problem. Please avoid including passwords, private donor information, or anything sensitive." /></strong><small>Capture a region, paste an image, or add files.</small></div><div className="bug-evidence-actions"><button className="command-button secondary compact" onClick={() => void captureSnip()} title="Capture a screen region"><Camera size={15} /> Capture</button><label className="command-button secondary compact"><ImagePlus size={15} /> Add files<input type="file" multiple accept="image/*,video/*,.mov,.mpeg,.mpg,.mp4,.webm,.txt,.log,.json,.zip" onChange={(event) => event.target.files && void addFiles(event.target.files)} /></label></div></div>
        <div className="bug-thumbnails">
          {attachments.map((attachment, index) => <figure key={`${attachment.name}-${index}`}><div>{attachment.dataUrl.startsWith("data:image/") ? <img src={attachment.dataUrl} alt="" /> : <span><Upload size={22} /></span>}<button className="bug-attachment-remove" onClick={() => setAttachments((current) => current.filter((_, item) => item !== index))} title="Remove attachment"><X size={13} /></button>{attachment.dataUrl.startsWith("data:image/") && <button className="bug-attachment-edit" onClick={() => setEditingAttachment(index)} title="Annotate image" aria-label={`Annotate ${attachment.name}`}><Pencil size={13} /></button>}</div><figcaption>{attachment.name}</figcaption></figure>)}
          {!attachments.length && <div className="bug-empty-attachments"><Camera size={22} /><span>Screenshots will appear here</span></div>}
        </div>
        <div className="bug-diagnostics-note"><Activity size={16} /><span>App state, version, platform, recent client errors, and application logs are included automatically for Codex. <InfoDot text="This technical information helps reproduce the problem. You do not need to understand it or collect it yourself." /></span></div>
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

function BugsView({ onNewBug }: { onNewBug: () => void }) {
  const [bugs, setBugs] = useState<BugRecord[]>([]);
  const [selected, setSelected] = useState<BugRecord | null>(null);
  const [viewingEvidence, setViewingEvidence] = useState<BugEvidence | null>(null);
  const [listWidth, setListWidth] = useState(45);
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const splitDrag = useRef<{ startX: number; startWidth: number; containerWidth: number } | null>(null);
  const [sort, setSort] = useState<"newest" | "oldest" | "status">("newest");
  const [statusFilters, setStatusFilters] = useState<BugStatus[]>([]);
  const [users, setUsers] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BUG_USERS_KEY) ?? "[]") as string[];
      return Array.from(new Set(["Felix", ...saved.filter(Boolean)]));
    } catch {
      return ["Felix"];
    }
  });
  const [activeUser, setActiveUser] = useState(() => localStorage.getItem(ACTIVE_BUG_USER_KEY) || "Felix");
  const [commentTab, setCommentTab] = useState<"user" | "ai">("user");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    if (isTauri()) {
      try { setBugs(await invoke<BugRecord[]>("list_bug_reports")); }
      catch (error) { setMessage(`Could not load bugs: ${String(error)}`); }
      return;
    }
    const local = readWebBugs();
    setBugs(local);
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
      setMessage("");
    } catch {
      setMessage("Shared bug service unavailable. Reports on this device are still available and can be exported.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { localStorage.setItem(BUG_USERS_KEY, JSON.stringify(users)); }, [users]);
  useEffect(() => { localStorage.setItem(ACTIVE_BUG_USER_KEY, activeUser); }, [activeUser]);
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
  const visible = useMemo(() => bugs.filter((bug) => !statusFilters.length || statusFilters.includes(bug.status)).sort((a, b) => {
    if (sort === "status") return a.status.localeCompare(b.status);
    return sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt);
  }), [bugs, statusFilters, sort]);
  const toggleStatusFilter = (status: BugStatus) => {
    setStatusFilters((current) => current.includes(status) ? current.filter((value) => value !== status) : [...current, status]);
  };
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
  const counts = { open: bugs.filter((bug) => bug.status === "open").length, testing: bugs.filter((bug) => bug.status === "ready-for-test").length, closed: bugs.filter((bug) => bug.status === "closed" || bug.status === "verified").length };
  const addUser = () => {
    const name = window.prompt("New user name");
    if (!name?.trim()) return;
    const normalized = name.trim();
    setUsers((current) => current.some((user) => user.toLowerCase() === normalized.toLowerCase()) ? current : [...current, normalized]);
    setActiveUser(normalized);
  };
  const addComment = () => {
    if (!selected || !comment.trim()) return;
    const replyLabel = replyTo === null ? "" : `Reply to ${selected.agentWork?.[replyTo]?.author ?? "comment"}: `;
    setSelected({ ...selected, agentWork: [...(selected.agentWork ?? []), { at: new Date().toISOString(), author: activeUser, kind: "handoff", note: `${replyLabel}${comment.trim()}` }] });
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
      <div><label className="bug-user-picker"><Users size={15} /><span>User</span><select aria-label="Current user" value={activeUser} onChange={(event) => { if (event.target.value === "__new__") addUser(); else setActiveUser(event.target.value); }}>{users.map((user) => <option key={user} value={user}>{user}</option>)}<option value="__new__">+ Add new user…</option></select></label><button className="command-button secondary" onClick={() => void exportAll()}><Download size={16} /> Export all</button><button className="command-button primary" onClick={onNewBug}><Plus size={16} /> Report bug</button></div>
    </div>
    <div className="bug-metrics"><article><Bug /><span><b>{counts.open}</b>Open</span></article><article><BadgeCheck /><span><b>{counts.testing}</b>Ready for test</span></article><article><CheckCircle2 /><span><b>{counts.closed}</b>Verified / closed</span></article></div>
    <div className="bugs-controls"><div className="bug-filter-pills" aria-label="Filter bugs by status"><button className={!statusFilters.length ? "active" : ""} aria-pressed={!statusFilters.length} onClick={() => setStatusFilters([])}>All</button>{(["open", "in-progress", "ready-for-test", "verified", "closed"] as const).map((value) => <button className={statusFilters.includes(value) ? "active" : ""} aria-pressed={statusFilters.includes(value)} key={value} onClick={() => toggleStatusFilter(value)}>{value.replace(/-/g, " ")}</button>)}</div><label>Sort <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="status">Status</option></select></label></div>
    <div className="bugs-layout" style={{ gridTemplateColumns: `${listWidth}fr 8px ${100 - listWidth}fr` }}>
      <div className="bug-list">{visible.map((bug) => <button className={selected?.bugId === bug.bugId ? "bug-row active" : "bug-row"} key={bug.bugId} onClick={() => setSelected({ ...bug })}><span className={`bug-status-dot ${bug.status}`} /><span><small>{bug.bugId} · {bug.status.replace(/-/g, " ")}</small><strong>{bug.summary}</strong><em>{bug.tags.join(" · ") || "No tags"} · {bug.attachments.length} attachment{bug.attachments.length === 1 ? "" : "s"}</em></span><ChevronRight size={17} /></button>)}{!visible.length && <div className="bugs-empty"><Bug size={28} /><strong>No bugs here</strong><span>New reports will appear in this catalogue.</span></div>}</div>
      <div className="bugs-splitter" role="separator" aria-label="Resize bug list and selected bug" onPointerDown={(event) => {
        const container = event.currentTarget.parentElement;
        if (!container) return;
        splitDrag.current = { startX: event.clientX, startWidth: listWidth, containerWidth: container.getBoundingClientRect().width };
        document.body.classList.add("bugs-resizing");
        event.preventDefault();
      }}><GripVertical size={15} /></div>
      <aside className="bug-detail">{selected ? <>
        <div className="bug-detail-scroll">
          <div className="bug-detail-head"><span>Selected bug · {selected.bugId}</span><button className="icon-button" onClick={() => setSelected(null)}><X size={16} /></button></div>
          <label className="field"><span>Summary</span><input value={selected.summary} onChange={(e) => setSelected({ ...selected, summary: e.target.value })} /></label>
          <label className="field"><span>Status</span><select value={selected.status} onChange={(e) => setSelected({ ...selected, status: e.target.value as BugStatus })}><option value="open">Open</option><option value="in-progress">In progress</option><option value="ready-for-test">Ready for test</option><option value="verified">Verified</option><option value="closed">Closed</option></select></label>
          <label className="field"><span>Details</span><textarea value={selected.details} onChange={(e) => setSelected({ ...selected, details: e.target.value })} /></label>
          <label className="field"><span>Fix / test notes</span><textarea value={selected.fixTips} onChange={(e) => setSelected({ ...selected, fixTips: e.target.value })} /></label>
          <div className="bug-detail-evidence"><strong>Evidence</strong><div>{selected.evidence?.map((item, i) => <button type="button" key={i} onClick={() => setViewingEvidence(item)}>{item.dataUrl?.startsWith("data:image/") ? <img src={item.dataUrl} alt={item.name} title={item.name} /> : <><ImageIcon size={15} />{item.path ?? item.name}</>}</button>)}{!selected.evidence?.length && selected.attachments.map((name) => <span key={name}><ImageIcon size={15} />{name}</span>)}</div></div>
          <div className="agent-work-log">
            <div className="bug-comment-tabs" role="tablist" aria-label="Bug discussion"><button type="button" role="tab" aria-selected={commentTab === "user"} className={commentTab === "user" ? "active" : ""} onClick={() => { setCommentTab("user"); setReplyTo(null); }}>User comments</button><button type="button" role="tab" aria-selected={commentTab === "ai"} className={commentTab === "ai" ? "active" : ""} onClick={() => { setCommentTab("ai"); setReplyTo(null); }}>AI comments</button></div>
            {discussionEntries.length ? discussionEntries.map(({ entry, index }) => <article key={`${entry.at}-${index}`} className={replyTo === index ? "replying" : ""}><header><b>{commentTab === "user" ? "comment" : entry.kind}</b><span>{entry.author === "You" ? "Felix" : entry.author} · {new Date(entry.at).toLocaleString()}</span></header><p>{entry.note}</p><button type="button" className="work-log-reply" onClick={() => { setReplyTo(index); if (commentTab === "ai") setCommentTab("user"); }}><MessageSquare size={12} /> Reply</button></article>) : <small>No {commentTab === "user" ? "user comments" : "AI comments"} yet.</small>}
            {commentTab === "user" && <div className="bug-comment-composer">{replyTo !== null && <div className="reply-context">Replying to {selected.agentWork?.[replyTo]?.author}<button onClick={() => setReplyTo(null)}><X size={12} /></button></div>}<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={replyTo === null ? `Comment as ${activeUser}…` : `Reply as ${activeUser}…`} /><button type="button" className="command-button secondary compact" disabled={!comment.trim()} onClick={addComment}><Send size={14} /> {replyTo === null ? "Add comment" : "Reply"}</button></div>}
          </div>
        </div>
        <footer className="bug-detail-actions"><button className="command-button primary" onClick={() => void save(selected)}><Save size={16} /> Save changes</button></footer>
      </> : <div className="bugs-empty"><Pencil size={26} /><strong>Select a bug</strong><span>Open it here to edit details or move it to Ready for test.</span></div>}</aside>
    </div>
    {message && <div className="bugs-message">{message}</div>}
    {selected && viewingEvidence && <EvidenceViewer bugId={selected.bugId} evidence={viewingEvidence} onClose={() => setViewingEvidence(null)} />}
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
    title: "Run recognition displays with confidence",
    copy: "Project Lantern keeps donor content, screen layouts, schedules, and live announcements together in one control center.",
    points: ["Build the content", "Preview the result", "Publish to your displays"],
    accent: "01",
    image: `${import.meta.env.BASE_URL}assets/help/dashboard.png`,
    imageAlt: "Recognition OS dashboard showing display previews and publishing controls",
    callout: "Your control center"
  },
  {
    kicker: "Start here",
    title: "Connect and check your screens",
    copy: "Open Screens to name each display, choose its orientation, and confirm that it is attached. The Dashboard status pills show what is ready at a glance.",
    points: ["Open display windows", "Confirm each screen says Attached", "Select a screen before editing"],
    accent: "02",
    image: `${import.meta.env.BASE_URL}assets/help/dashboard.png`,
    imageAlt: "Dashboard showing the connected display cards and screen controls",
    callout: "Check display status here"
  },
  {
    kicker: "People",
    title: "Add and organize donors",
    copy: "Use Donors to create recognition profiles. Add a name, giving details, group, optional story, and a visual treatment for special recognition.",
    points: ["Choose Add donor", "Complete the guided setup", "Keep Active enabled to show the donor"],
    accent: "03",
    image: `${import.meta.env.BASE_URL}assets/help/donors.png`,
    imageAlt: "Donors workspace showing recognition profiles and donor tools",
    callout: "Add and manage profiles"
  },
  {
    kicker: "Design",
    title: "Build the recognition board",
    copy: "In Board Editor, select a display and arrange headings, donor lists, messages, stories, and footers. The canvas is your live layout preview.",
    points: ["Choose the target display", "Add and reorder panels", "Adjust colors, type, and background media"],
    accent: "04",
    image: `${import.meta.env.BASE_URL}assets/help/board-editor.png`,
    imageAlt: "Board Editor with layout controls and a live recognition board preview",
    callout: "Design with a live preview"
  },
  {
    kicker: "Timing",
    title: "Schedule what appears when",
    copy: "Schedule lets you place boards and saved announcements on a calendar. Set the target screen, start time, and duration, then check for overlaps.",
    points: ["Create a schedule entry", "Pick a board or announcement", "Review conflicts before publishing"],
    accent: "05",
    image: `${import.meta.env.BASE_URL}assets/help/schedule.png`,
    imageAlt: "Schedule workspace showing the recognition content calendar",
    callout: "Plan content by time"
  },
  {
    kicker: "Broadcast / Stream",
    title: "Publish, announce, and broadcast",
    copy: "Publish sends the current revision to your displays. Announcements can temporarily take over a screen, while Broadcast / Stream supports camera, screen-share, and presentation content.",
    points: ["Preview before publishing", "Use Announcements for time-sensitive messages", "Use Restore to return to the donor wall"],
    accent: "06",
    image: `${import.meta.env.BASE_URL}assets/help/announcements.png`,
    imageAlt: "Announcements workspace with message controls and a display preview",
    callout: "Preview before going live"
  },
  {
    kicker: "Good practice",
    title: "A simple operating rhythm",
    copy: "Prepare content early, verify every target display, publish once, and watch the screen status. Revisions give you a safe record of recent changes.",
    points: ["Edit → preview → publish", "Check legibility from viewing distance", "Use Revisions when you need to roll back"],
    accent: "07",
    image: `${import.meta.env.BASE_URL}assets/help/broadcast.png`,
    imageAlt: "Broadcast and Stream workspace for live presentation content",
    callout: "Present with confidence"
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
            <p className="eyebrow">Project Lantern learning center</p>
            <h2 id="help-modal-title">How to use Recognition OS</h2>
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
                  <div className="help-slide-browser-bar" aria-hidden="true"><i /><i /><i /><span>Recognition OS</span></div>
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
              <p>Follow this checklist whenever you prepare a recognition display.</p>
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
  openDisplays,
  updateState,
  addDisplay,
  deleteDisplay,
  identifyDisplay,
  editDisplay,
  editRoomCamera
}: {
  state: LanternState;
  selectedDisplayId: ScreenId;
  setSelectedDisplayId: (screenId: ScreenId) => void;
  openDisplays: () => void;
  updateState: (updater: (current: LanternState) => LanternState) => void;
  addDisplay: () => void;
  deleteDisplay: (screenId: ScreenId) => void;
  identifyDisplay: (screenId: ScreenId) => void;
  editDisplay: (screenId: ScreenId) => void;
  editRoomCamera: (screenId: ScreenId) => void;
}) {
  const displays = Object.values(state.screens);
  const [preview3d, setPreview3d] = useState<Record<string, boolean>>({});
  const [previewReset, setPreviewReset] = useState<Record<string, number>>({});
  const previewGridClass = displays.length === 1
    ? "single"
    : displays.length === 2
      ? "pair"
      : "multiple";

  return (
    <section className="dashboard-grid">
      <div className="workband">
        <div className="preview-stage">
          <div className="dashboard-display-commandbar">
            <div><strong>{displays.length} display{displays.length === 1 ? "" : "s"}</strong><span>Manage, preview, and open every recognition display.</span></div>
            <div className="button-row"><button className="command-button secondary compact" onClick={openDisplays}><Monitor size={16} /> Open displays</button><button className="command-button primary compact" onClick={addDisplay}><Plus size={16} /> Add display</button></div>
          </div>
          <div className={`dashboard-display-grid ${previewGridClass}`} data-display-count={displays.length}>
            {displays.map((screen) => {
              const activeBoard = resolveActiveBoardProgram(state, screen.id);
              const liveMessage = resolveScheduledAnnouncement(state, screen.id)?.announcement;
              return (
              <article className="dashboard-display-tile" key={screen.id}>
                <header className="dashboard-display-label">
                  <div>
                    <div className="dashboard-display-heading">
                      <strong>{screen.label}</strong>
                      <span className="dashboard-assignment-pill board" title={`Active board: ${activeBoard?.name ?? "No board assigned"}`}>Board · {activeBoard?.name ?? "None"}</span>
                      {liveMessage && <span className="dashboard-assignment-pill live" title={`Live scheduled message: ${liveMessage.title || "Untitled message"}`}>Live · {liveMessage.title || "Message"}</span>}
                    </div>
                    <span>{screen.orientation} · {screen.resolution}</span>
                  </div>
                  <div className="dashboard-display-status"><span title={screen.status === "offline" ? "Display is not attached" : "Display attached"}>{screen.status === "offline" ? <WifiOff size={17} /> : <Wifi size={17} />}</span><button className={screen.enabled ? "icon-button live-toggle active" : "icon-button live-toggle"} onClick={() => updateState((current) => ({ ...current, screens: { ...current.screens, [screen.id]: { ...current.screens[screen.id], enabled: !current.screens[screen.id].enabled } } }))} title={screen.enabled ? "Take display offline" : "Make display live"}><Power size={15} /></button></div>
                </header>
                <div className={`dashboard-display-preview ${orientationClass(screen)} mode-${preview3d[screen.id] ? "3d" : "2d"}`}>
                  <button type="button" className={`preview-dimension-toggle${preview3d[screen.id] ? " active" : ""}`} onClick={() => setPreview3d((current) => ({ ...current, [screen.id]: !current[screen.id] }))} title={preview3d[screen.id] ? "Lock this preview to a straight-on 2D view" : "Unlock tilt and rotation for a 3D view"}>{preview3d[screen.id] ? <Unlock size={14} /> : <Lock size={14} />}<span>{preview3d[screen.id] ? "3D" : "2D"}</span></button>
                  <BabylonDonorWall state={state} screenId={screen.id} interactive fitToScreen viewMode={preview3d[screen.id] ? "3d" : "2d"} resetKey={previewReset[screen.id] ?? 0} />
                  <button type="button" className="preview-reset-button" onClick={() => setPreviewReset((current) => ({ ...current, [screen.id]: (current[screen.id] ?? 0) + 1 }))}><RotateCcw size={13} /> Reset view</button>
                </div>
                <div className="dashboard-display-summary"><span>{labelForStyle(screen.style)}</span><span>{screen.donorScrollEnabled ? `Scrolling · ${screen.donorScrollSpeed ?? 4}/10` : `${screen.columns ?? 1} column${screen.columns === 2 ? "s" : ""}`}</span><span>{screen.roomVideoDeviceId ? "Room camera assigned" : "Default room camera"}</span></div>
                <div className="button-row dashboard-display-actions"><button className="icon-button" onClick={() => identifyDisplay(screen.id)} title="Identify display"><Radio size={17} /></button><button className="icon-button" onClick={() => editRoomCamera(screen.id)} title={`Configure ${screen.label} room camera`}><Camera size={17} /></button><button className="command-button secondary compact" onClick={() => editDisplay(screen.id)}><Settings2 size={16} /> Edit</button><button className="icon-button danger-icon" disabled={displays.length <= 1} onClick={() => deleteDisplay(screen.id)} title="Delete display"><Trash2 size={17} /></button></div>
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
  query,
  setQuery,
  donors,
  warnings,
  updateState,
  addDonor,
  donorSetupOpen,
  closeDonorSetup
}: {
  state: LanternState;
  query: string;
  setQuery: (query: string) => void;
  donors: Donor[];
  warnings: string[];
  updateState: (updater: (current: LanternState) => LanternState) => void;
  addDonor: () => void;
  donorSetupOpen: boolean;
  closeDonorSetup: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Donor | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"manual" | "az" | "za">("manual");
  const [page, setPage] = useState(0);
  const [editTab, setEditTab] = useState<"profile" | "recognition" | "appearance" | "history" | "displays">("profile");
  const [createdDonorName, setCreatedDonorName] = useState<string | null>(null);
  const allTags = Array.from(new Set([...state.recognitionSettings.tags, ...state.donors.flatMap((donor) => donor.tags ?? [])])).sort();
  const visibleDonors = donors
    .filter((donor) => (tagFilter === "all" || donor.tags?.includes(tagFilter)) && (groupFilter === "all" || donor.groupId === groupFilter) && (typeFilter === "all" || donor.donationType === typeFilter))
    .sort((a, b) => sortOrder === "manual" ? 0 : a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * (sortOrder === "az" ? 1 : -1));
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(visibleDonors.length / pageSize));
  const pageDonors = visibleDonors.slice(page * pageSize, page * pageSize + pageSize);

  useEffect(() => setPage(0), [query, tagFilter, groupFilter, typeFilter, sortOrder]);
  useEffect(() => setPage((current) => Math.min(current, pageCount - 1)), [pageCount]);
  useEffect(() => {
    if (!createdDonorName) return;
    const timer = window.setTimeout(() => setCreatedDonorName(null), 4200);
    return () => window.clearTimeout(timer);
  }, [createdDonorName]);
  const addGroup = () => {
    const name = window.prompt("Name this donor group");
    if (!name?.trim()) return;
    updateState((current) => ({ ...current, donorGroups: [...current.donorGroups, { id: `group-${Date.now()}`, name: name.trim(), color: "#8e7cc3" }] }));
  };

  const editDonor = (donor: Donor) => {
    setEditingId(donor.id);
    setDraft({ ...donor });
    setEditTab("profile");
  };

  const saveDonor = () => {
    if (!draft) return;
    updateState((current) => ({
      ...current,
      donors: current.donors.map((donor) => (donor.id === draft.id ? draft : donor)),
      recognitionSettings: { ...current.recognitionSettings, tags: [...new Set([...current.recognitionSettings.tags, ...(draft.tags ?? [])])].sort() }
    }));
    setEditingId(null);
    setDraft(null);
  };

  const deleteDonor = (id: string) => {
    updateState((current) => ({ ...current, donors: current.donors.filter((donor) => donor.id !== id) }));
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
  };

  const donorIsOnDisplay = (donor: Donor, screen: DisplayProfile) => {
    if (screen.donorRosterConfigured) return Boolean(donor.displayIds?.includes(screen.id) && screen.donorIds?.includes(donor.id));
    const program = state.boardPrograms.find((item) => item.id === screen.boardProgramId) ?? state.boardPrograms[0];
    return Boolean(donor.displayIds?.includes(screen.id) && (!program || program.donorIds.includes(donor.id)) && (!screen.donorIds?.length || screen.donorIds.includes(donor.id)));
  };

  const toggleDonorDisplay = (donorId: string, screenId: ScreenId) => {
    updateState((current) => {
      const donor = current.donors.find((item) => item.id === donorId);
      const screen = current.screens[screenId];
      if (!donor || !screen) return current;
      const program = current.boardPrograms.find((item) => item.id === screen.boardProgramId) ?? current.boardPrograms[0];
      const isOn = screen.donorRosterConfigured
        ? Boolean(donor.displayIds?.includes(screenId) && screen.donorIds?.includes(donorId))
        : Boolean(donor.displayIds?.includes(screenId) && (!program || program.donorIds.includes(donorId)) && (!screen.donorIds?.length || screen.donorIds.includes(donorId)));
      const nextDisplayIds = isOn
        ? (donor.displayIds ?? []).filter((id) => id !== screenId)
        : [...new Set([...(donor.displayIds ?? []), screenId])];
      const donorRemainsOnSharedBoard = Boolean(program && Object.values(current.screens).some((otherScreen) =>
        otherScreen.id !== screenId && (otherScreen.boardProgramId ?? current.boardPrograms[0]?.id) === program.id && nextDisplayIds.includes(otherScreen.id)
      ));

      return {
        ...current,
        donors: current.donors.map((item) => item.id === donorId ? { ...item, displayIds: nextDisplayIds } : item),
        boardPrograms: program ? current.boardPrograms.map((item) => item.id === program.id
          ? {
              ...item,
              donorIds: isOn && !donorRemainsOnSharedBoard
                ? item.donorIds.filter((id) => id !== donorId)
                : !isOn
                  ? [...new Set([...item.donorIds, donorId])]
                  : item.donorIds
            }
          : item) : current.boardPrograms,
        screens: {
          ...current.screens,
          [screenId]: screen.donorRosterConfigured || screen.donorIds?.length
            ? { ...screen, donorRosterConfigured: true, donorIds: isOn ? (screen.donorIds ?? []).filter((id) => id !== donorId) : [...new Set([...(screen.donorIds ?? []), donorId])] }
            : screen
        }
      };
    });
  };

  const createDonor = (donor: Donor) => {
    updateState((current) => {
      const assignedScreens = Object.values(current.screens).filter((screen) => donor.displayIds?.includes(screen.id));
      const assignedBoardIds = new Set(assignedScreens.map((screen) => screen.boardProgramId ?? current.boardPrograms[0]?.id).filter(Boolean));

      return {
        ...current,
        donors: [donor, ...current.donors],
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
        <select className="toolbar-select" aria-label="Sort donors" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)} title="Choose how donor names are ordered"><option value="manual">Manual order</option><option value="az">Name A–Z</option><option value="za">Name Z–A</option></select>
        <button className="command-button primary" onClick={addDonor}>
          <Plus size={18} />
          Add donor
        </button>
      </div>

      <div className="donor-groups-row"><button className={groupFilter === "all" ? "group-chip selected" : "group-chip"} onClick={() => setGroupFilter("all")}>All donors <b>{state.donors.length}</b></button>{state.donorGroups.map((group) => <button className={groupFilter === group.id ? "group-chip selected" : "group-chip"} style={{ "--group-color": group.color } as React.CSSProperties} key={group.id} onClick={() => setGroupFilter(group.id)}>{group.name} <b>{state.donors.filter((donor) => donor.groupId === group.id).length}</b></button>)}<button className="group-chip add" onClick={addGroup}><Plus size={14} /> New group</button></div>

      {createdDonorName && <div className="donor-created-banner" role="status"><CheckCircle2 size={17} /><span><strong>{createdDonorName}</strong> is set up and ready.</span><button type="button" className="icon-button" onClick={() => setCreatedDonorName(null)} title="Dismiss"><X size={14} /></button></div>}

      <div className="donor-card-list">
        {pageDonors.map((donor) => {
          const activeDraft = editingId === donor.id && draft ? draft : donor;
          const editing = false;
          return (
            <article
              className={editing ? "donor-card editing" : "donor-card"}
              key={donor.id}
              draggable={!editing && sortOrder === "manual"}
              onDragStart={() => setDraggedId(donor.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => moveDonor(donor.id)}
            >
              <button className="icon-button drag-button" title="Drag to reorder">
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
                      <select value={activeDraft.icon ?? "none"} onChange={(event) => setDraft({ ...activeDraft, icon: event.target.value as Donor["icon"] })}>{["none", "star", "heart", "leaf"].map((icon) => <option key={icon}>{icon}</option>)}</select>
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
                    <div className="donor-title-row"><strong>{donor.name}</strong><div className="donor-display-toggles" aria-label={`${donor.name} display assignments`}>{Object.values(state.screens).map((screen) => {
                      const isOn = donorIsOnDisplay(donor, screen);
                      const boardName = state.boardPrograms.find((program) => program.id === screen.boardProgramId)?.name ?? state.boardPrograms[0]?.name ?? "No board";
                      return <label className={`screen-toggle-chip${isOn ? " on" : " off"}`} title={`${screen.label} · ${boardName} · ${isOn ? "On" : "Off"}`} key={screen.id} onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={screen.label} checked={isOn} onChange={() => toggleDonorDisplay(donor.id, screen.id)} /><Monitor size={11} /><span>{screen.label}</span></label>;
                    })}</div></div>
                    <span>{donor.tier} - {donor.category} - Gift {donor.donationDate ?? donor.since}</span>
                    <small>{donor.donationType ?? "Cash"}{donor.amount ? ` · $${donor.amount.toLocaleString()}` : ""} · {donor.basicInfo || donor.note}</small>
                    {!!donor.tags?.length && <div className="donor-meta-row">{donor.tags.map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}</div>}
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
                    <span className={donor.active ? "state-dot active" : "state-dot"}>{donor.active ? "Active" : "Draft"}</span>
                    <button className="icon-button" onClick={() => editDonor(donor)} title="Edit donor">
                      <Pencil size={18} />
                    </button>
                    <button className="icon-button danger-icon" onClick={() => deleteDonor(donor.id)} title="Delete donor">
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

      {draft && editingId && createPortal(<div className="modal-backdrop donor-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditingId(null); setDraft(null); } }}>
        <section className="editor-modal donor-editor-modal" role="dialog" aria-modal="true" aria-labelledby="donor-editor-title">
          <div className="editor-modal-head"><div><p className="eyebrow">Recognition profile</p><h2 id="donor-editor-title">Edit donor</h2></div><button className="icon-button" onClick={() => { setEditingId(null); setDraft(null); }} title="Close editor"><X size={18} /></button></div>
          <EditorTabs value={editTab} options={[["profile", "Profile"], ["recognition", "Recognition"], ["appearance", "Appearance"], ["history", "Gift history"], ["displays", "Displays"]]} onChange={(value) => setEditTab(value as typeof editTab)} />
          <div className="editor-modal-body donor-editor-body">
            {editTab === "profile" && <div className="editor-form-grid"><LabeledInput label="Name" info="Donor or organization display name." value={draft.name} onChange={(name) => setDraft({ ...draft, name })} /><LabeledInput label="Donation date" info="Enter an exact date or only a year." value={draft.donationDate ?? draft.since} onChange={(donationDate) => setDraft({ ...draft, donationDate, since: donationDate })} /><LabeledSelect label="Tier" info="Recognition tier." value={draft.tier} options={state.recognitionSettings.tiers} onChange={(tier) => setDraft({ ...draft, tier })} /><LabeledSelect label="Category" info="Donor category." value={draft.category} options={state.recognitionSettings.categories} onChange={(category) => setDraft({ ...draft, category })} /><label className="field span-two"><span>Basic public information <InfoDot text="Short summary used in donor lists." /></span><textarea value={draft.basicInfo ?? ""} onChange={(event) => setDraft({ ...draft, basicInfo: event.target.value })} /></label><label className="field span-two"><span>Expanded donor story <InfoDot text="Longer story shown on the donor profile." /></span><textarea className="expanded-copy" value={draft.expandedInfo ?? ""} onChange={(event) => setDraft({ ...draft, expandedInfo: event.target.value })} /></label><label className="switch-row span-two"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>{draft.active ? "Active on recognition boards" : "Saved as draft"}</span></label></div>}
            {editTab === "recognition" && <div className="editor-form-grid"><LabeledSelect label="Donation type" info="Kind of contribution." value={draft.donationType ?? "Cash"} options={["Cash", "In-kind", "Sponsorship", "Legacy", "Volunteer"]} onChange={(donationType) => setDraft({ ...draft, donationType: donationType as Donor["donationType"] })} /><CurrencyInput label="Contribution amount" value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} /><LabeledSelect label="Group" info="Organizational group." value={draft.groupId ?? ""} options={["", ...state.donorGroups.map((group) => group.id)]} optionLabels={{ "": "No group", ...Object.fromEntries(state.donorGroups.map((group) => [group.id, group.name])) }} onChange={(groupId) => setDraft({ ...draft, groupId: groupId || undefined })} /><LabeledInput label="Internal note" info="Internal recognition description." value={draft.note} onChange={(note) => setDraft({ ...draft, note })} /><LabeledInput label="Display subtext" info="Optional line shown below the name." value={draft.subtext ?? ""} onChange={(subtext) => setDraft({ ...draft, subtext })} /><TagEditor selected={draft.tags ?? []} available={allTags} onChange={(tags) => setDraft({ ...draft, tags })} /></div>}
            {editTab === "appearance" && <DonorAppearanceEditor donor={draft} onChange={setDraft} />}
            {editTab === "history" && <DonationHistoryEditor donor={draft} onChange={(donations) => setDraft({ ...draft, donations })} />}
            {editTab === "displays" && <div className="display-assignment-grid">{Object.values(state.screens).map((screen) => <label className={draft.displayIds?.includes(screen.id) ? "display-assignment selected" : "display-assignment"} key={screen.id}><input type="checkbox" checked={draft.displayIds?.includes(screen.id) ?? false} onChange={(event) => setDraft({ ...draft, displayIds: event.target.checked ? [...(draft.displayIds ?? []), screen.id] : (draft.displayIds ?? []).filter((id) => id !== screen.id) })} /><Monitor size={20} /><span><strong>{screen.label}</strong><small>{screen.orientation} · {screen.resolution}</small></span></label>)}</div>}
          </div>
          <div className="editor-modal-actions"><button className="command-button secondary" onClick={() => { setEditingId(null); setDraft(null); }}>Cancel</button><button className="command-button primary" onClick={saveDonor}><Save size={17} /> Save changes</button></div>
        </section>
      </div>, document.body)}
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
    const parsed = Number(raw.replace(/[^0-9.]/g, ""));
    onChange(raw.trim() === "" || !Number.isFinite(parsed) ? undefined : Math.max(0, parsed));
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
        onFocus={() => { setFocused(true); setDraftValue(value == null || value === 0 ? "" : String(value)); }}
        onChange={(event) => {
          const clean = event.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
          setDraftValue(clean.replace(/^0+(?=\d)/, ""));
        }}
        onBlur={() => { commit(draftValue); setFocused(false); }}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      />
      {value != null && value > 0 && <button type="button" className="currency-clear" onMouseDown={(event) => event.preventDefault()} onClick={() => { setDraftValue(""); onChange(undefined); }} title="Clear amount"><X size={13} /></button>}
    </div>
  </label>;
}

function DonorAppearanceEditor({ donor, onChange }: { donor: Donor; onChange: (donor: Donor) => void }) {
  const font = donor.fontOverride ?? "Montserrat";
  const nameColor = donor.nameColor || "#f5f2eb";
  const accentColor = donor.accentColor || "#d9a657";
  const animation = donor.animation ?? "none";
  const highlight = donor.highlight ?? "none";
  const icon = donor.icon ?? "none";

  return <div className="donor-appearance-editor">
    <div
      className={`donor-appearance-preview highlight-${highlight} animation-${animation}`}
      style={{ "--donor-name-color": nameColor, "--donor-accent-color": accentColor, fontFamily: `${font}, sans-serif` } as React.CSSProperties}
    >
      {icon !== "none" && <span className="appearance-preview-icon">{donorIconGlyph(icon)}</span>}
      <span><strong>{donor.name || "Donor name"}</strong>{donor.subtext && <small>{donor.subtext}</small>}</span>
    </div>
    <div className="editor-form-grid appearance-controls">
      <LabeledSelect
        label="Font override"
        info="Use a unique typeface for this donor, or inherit the display font."
        value={donor.fontOverride ?? ""}
        options={["", ...boardFontOptions]}
        optionLabels={{ "": "Use display font", ...boardFontLabels }}
        onChange={(fontOverride) => onChange({ ...donor, fontOverride: (fontOverride || undefined) as Donor["fontOverride"] })}
      />
      <LabeledSelect
        label="Subtle animation"
        info="Animations are deliberately restrained for readable public displays."
        value={animation}
        options={["none", "gentle-pulse", "soft-glow", "shimmer"]}
        optionLabels={{ none: "None", "gentle-pulse": "Gentle pulse", "soft-glow": "Soft glow", shimmer: "Slow shimmer" }}
        onChange={(value) => onChange({ ...donor, animation: value as Donor["animation"] })}
      />
      <ColorOverrideField label="Name color" value={donor.nameColor} fallback="#f5f2eb" onChange={(nameColor) => onChange({ ...donor, nameColor })} />
      <ColorOverrideField label="Accent color" value={donor.accentColor} fallback="#d9a657" onChange={(accentColor) => onChange({ ...donor, accentColor })} />
      <LabeledSelect
        label="Highlight"
        info="Add a restrained accent behind or below this donor."
        value={highlight}
        options={["none", "underline", "soft-box"]}
        optionLabels={{ none: "None", underline: "Fine underline", "soft-box": "Soft highlight" }}
        onChange={(value) => onChange({ ...donor, highlight: value as Donor["highlight"] })}
      />
      <div className="field span-two">
        <span>Recognition icon <InfoDot text="Shown when donor icons are enabled for the display." /></span>
        <div className="donor-icon-picker" role="radiogroup" aria-label="Recognition icon">
          {donorIconOptions.map((option) => <button type="button" role="radio" aria-checked={icon === option} className={icon === option ? "selected" : ""} key={option} onClick={() => onChange({ ...donor, icon: option })} title={donorIconLabels[option]}>
            <b>{donorIconGlyph(option)}</b><small>{donorIconLabels[option]}</small>
          </button>)}
        </div>
      </div>
      <div className="field span-two custom-donor-icon-field">
        <span>Custom donor override <InfoDot text="Optional JPG or PNG used instead of the display's circle, diamond, or dash. It only appears when donor icons are enabled." /></span>
        <div className="custom-donor-icon-row">
          {donor.customIconImage && <img src={donor.customIconImage} alt="" />}
          <label className="image-upload compact"><Upload size={15} /><span>{donor.customIconImage ? "Replace image" : "Choose JPG or PNG"}</span><input type="file" accept="image/png,image/jpeg" onChange={(event) => void readSharedImageFile(event.target.files?.[0], (customIconImage) => onChange({ ...donor, customIconImage }))} /></label>
          {donor.customIconImage && <button type="button" className="icon-button danger-icon" onClick={() => onChange({ ...donor, customIconImage: undefined })} title="Remove custom donor icon"><Trash2 size={15} /></button>}
        </div>
      </div>
      <button type="button" className="command-button secondary appearance-reset" onClick={() => onChange({ ...donor, fontOverride: undefined, nameColor: undefined, accentColor: undefined, highlight: "none", animation: "none", icon: "none", customIconImage: undefined })}>Use display defaults</button>
    </div>
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

function donorIconGlyph(icon: NonNullable<Donor["icon"]>) {
  return ({ none: "—", star: "★", heart: "♥", leaf: "❧", sparkle: "✦", diamond: "◆", crown: "♛", laurel: "❦", sun: "☀", hand: "⌁" } as const)[icon];
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

function DonationHistoryEditor({ donor, onChange }: { donor: Donor; onChange: (donations: DonationRecord[]) => void }) {
  const donations = donor.donations ?? [];
  const patchGift = (id: string, patch: Partial<DonationRecord>) => onChange(donations.map((gift) => gift.id === id ? { ...gift, ...patch } : gift));
  const addGift = () => onChange([...donations, { id: `gift-${Date.now()}`, date: donor.donationDate ?? donor.since, amount: 0, type: donor.donationType ?? "Cash", note: "" }]);
  return <div className="gift-history"><div className="gift-history-head"><div><strong>Repeat donations</strong><small>Keep each contribution as a separate record.</small></div><button type="button" className="command-button secondary" onClick={addGift}><Plus size={15} /> Add gift</button></div>{donations.map((gift) => <div className="gift-history-row" key={gift.id}><input aria-label="Gift date" value={gift.date} onChange={(event) => patchGift(gift.id, { date: event.target.value })} placeholder="YYYY or YYYY-MM-DD" /><input aria-label="Gift amount" type="number" min={0} value={gift.amount || ""} onChange={(event) => patchGift(gift.id, { amount: event.target.value === "" ? 0 : Math.max(0, Number(event.target.value)) })} /><select aria-label="Gift type" value={gift.type} onChange={(event) => patchGift(gift.id, { type: event.target.value as DonationRecord["type"] })}>{["Cash", "In-kind", "Sponsorship", "Legacy", "Volunteer"].map((type) => <option key={type}>{type}</option>)}</select><input aria-label="Gift note" value={gift.note ?? ""} onChange={(event) => patchGift(gift.id, { note: event.target.value })} placeholder="Optional note" /><button type="button" className="icon-button danger-icon" onClick={() => onChange(donations.filter((item) => item.id !== gift.id))} title="Remove gift"><Trash2 size={15} /></button></div>)}{!donations.length && <div className="empty-gift-history"><History size={22} /><span>No repeat donations recorded yet.</span></div>}</div>;
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
    donationDate: String(currentYear),
    note: "",
    basicInfo: "",
    expandedInfo: "",
    subtext: "",
    tags: [],
    donationType: "Cash",
    donations: [],
    displayIds: [],
    icon: "none"
  }));

  const steps = [
    { label: "Profile", detail: "Who to recognize" },
    { label: "Recognition", detail: "Contribution details" },
    { label: "Placement", detail: "Displays and status" }
  ];
  const donationDate = draft.donationDate ?? draft.since;
  const donationYear = Number(donationDate.slice(0, 4));
  const nameError = draft.name.trim() ? "" : "Enter the donor or organization name.";
  const sinceError = /^(\d{4}|\d{4}-\d{2}-\d{2})$/.test(donationDate) && donationYear >= 1800 && donationYear <= currentYear + 1
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
      since: donationDate.trim(),
      donationDate: donationDate.trim(),
      note: draft.note.trim(),
      basicInfo: draft.basicInfo?.trim() || draft.note.trim(),
      expandedInfo: draft.expandedInfo?.trim(),
      subtext: draft.subtext?.trim(),
      tags: draft.tags ?? [],
      donations: draft.amount ? [{ id: `gift-${Date.now()}`, date: donationDate.trim(), amount: draft.amount, type: draft.donationType ?? "Cash", note: draft.note.trim() }] : []
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
                <span>Donation date <b>Required</b></span>
                <input value={donationDate} onChange={(event) => setDraft({ ...draft, since: event.target.value, donationDate: event.target.value })} placeholder="2026 or 2026-07-22" />
                <small className="field-guidance">Enter an exact date or only the year.</small>
                {attempted && sinceError && <small className="field-error" role="alert">{sinceError}</small>}
              </label>
              <LabeledSelect label="Recognition tier" info="Controls how this donor is grouped by level of support." value={draft.tier} options={state.recognitionSettings.tiers} onChange={(tier) => setDraft({ ...draft, tier })} />
              <LabeledSelect label="Donor category" info="Describes the kind of donor being recognized." value={draft.category} options={state.recognitionSettings.categories} onChange={(category) => setDraft({ ...draft, category })} />
              <LabeledSelect label="Group" info="Optional collection used to organize and filter donors." value={draft.groupId ?? ""} options={["", ...state.donorGroups.map((group) => group.id)]} optionLabels={{ "": "No group", ...Object.fromEntries(state.donorGroups.map((group) => [group.id, group.name])) }} onChange={(groupId) => setDraft({ ...draft, groupId: groupId || undefined })} />
            </div>
          )}

          {step === 1 && (
            <div className="editor-form-grid setup-form-grid">
              <LabeledSelect label="Donation type" info="The kind of contribution being recognized." value={draft.donationType ?? "Cash"} options={["Cash", "In-kind", "Sponsorship", "Legacy", "Volunteer"]} onChange={(donationType) => setDraft({ ...draft, donationType: donationType as Donor["donationType"] })} />
              <CurrencyInput label="Contribution amount" value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} />
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
              <LabeledSelect label="Recognition icon" info="Optional symbol shown when a board has donor icons enabled." value={draft.icon ?? "none"} options={donorIconOptions} optionLabels={donorIconLabels} onChange={(icon) => setDraft({ ...draft, icon: icon as Donor["icon"] })} />
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
                <div className="setup-review-card"><span>Profile</span><strong>{draft.name.trim()}</strong><small>{draft.tier} · {draft.category} · Gift {donationDate}</small></div>
                <div className="setup-review-card"><span>Recognition</span><strong>{draft.donationType}{draft.amount ? ` · $${draft.amount.toLocaleString()}` : ""}</strong><small>{groupName} · {draft.icon === "none" ? "No icon" : `${draft.icon} icon`}</small></div>
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

const boardPanelTypes: BoardPanelType[] = ["heading", "supporters-heading", "donors", "message", "story", "footer", "image"];

function boardPanelLabel(type: BoardPanelType) {
  return ({ heading: "Heading", "supporters-heading": "Subheader", donors: "Donor list", message: "Message", story: "Feature story", footer: "Footer", image: "Image / PNG" })[type];
}

function defaultBoardPanels(program: LanternState["boardPrograms"][number]): BoardPanel[] {
  return [
    { id: `${program.id}-heading`, type: "heading", title: [program.heading, program.subtitle].filter(Boolean).join(" "), size: "standard", x: 4, y: 4, width: 92, height: 22 },
    { id: `${program.id}-supporters-heading`, type: "supporters-heading", title: "Our supporters", size: "compact", x: 5, y: 29, width: 90, height: 7 },
    { id: `${program.id}-donors`, type: "donors", title: "", size: "feature", columns: program.columns, x: 5, y: 36, width: 90, height: 45 },
    { id: `${program.id}-footer`, type: "footer", title: program.footer, size: "compact", x: 5, y: 84, width: 90, height: 11 }
  ];
}

function createBoardPanel(type: BoardPanelType, position = { x: 30, y: 35 }): BoardPanel {
  const id = `${type}-${Date.now()}`;
  const templates: Record<BoardPanelType, BoardPanel> = {
    heading: { id, type, title: "OUR GENEROUS DONORS", size: "standard" },
    "supporters-heading": { id, type, title: "Our supporters", size: "compact" },
    donors: { id, type, title: "", size: "feature", columns: 2 },
    message: { id, type, eyebrow: "A NOTE OF GRATITUDE", title: "Your support makes discovery possible", body: "Thank you for investing in our community.", size: "standard" },
    story: { id, type, eyebrow: "FEATURED STORY", title: "A brighter future, built together", body: "Share a short story about the impact your supporters made possible.", size: "standard" },
    footer: { id, type, title: "TOGETHER, WE MAKE A DIFFERENCE.", size: "compact" },
    image: { id, type, title: "Image", size: "standard", imageFit: "contain" }
  };
  const dimensions: Record<BoardPanelType, { width: number; height: number }> = {
    heading: { width: 54, height: 20 }, "supporters-heading": { width: 70, height: 8 }, donors: { width: 70, height: 44 }, message: { width: 48, height: 24 },
    story: { width: 55, height: 30 }, footer: { width: 70, height: 12 }, image: { width: 34, height: 32 }
  };
  const { width, height } = dimensions[type];
  return { ...templates[type], x: Math.max(0, Math.min(100 - width, position.x)), y: Math.max(0, Math.min(100 - height, position.y)), width, height };
}

function ThemeStudio({
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
  const [selectedProgramId, setSelectedProgramId] = useState(() => resolveDisplayedBoardProgramId(state, display.id));
  const [selectedPanelId, setSelectedPanelId] = useState("");
  const [newPanelType, setNewPanelType] = useState<BoardPanelType>("message");
  const [placingPanelType, setPlacingPanelType] = useState<BoardPanelType | null>(null);
  const [donorPage, setDonorPage] = useState(0);
  const [boardEditorZoom, setBoardEditorZoom] = useState(1);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [particleEditorOpen, setParticleEditorOpen] = useState(false);
  const [particleEditorPosition, setParticleEditorPosition] = useState(() => ({
    x: Math.max(16, window.innerWidth - 450),
    y: 130
  }));
  const particleEditorDragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const selectedProgram = state.boardPrograms.find((program) => program.id === selectedProgramId) ?? state.boardPrograms[0];
  const boardDisplay = selectedProgram ? { ...display, orientation: selectedProgram.orientation } : display;
  const panels = selectedProgram?.panels?.length ? selectedProgram.panels : selectedProgram ? defaultBoardPanels(selectedProgram) : [];
  const selectedPanel = panels.find((panel) => panel.id === selectedPanelId);
  const donorPageSize = 8;
  const donorPageCount = Math.max(1, Math.ceil(state.donors.length / donorPageSize));
  const donorPageItems = state.donors.slice(donorPage * donorPageSize, donorPage * donorPageSize + donorPageSize);
  const moveParticleEditor = (event: React.PointerEvent<HTMLElement>) => {
    const drag = particleEditorDragRef.current;
    if (!drag) return;
    setParticleEditorPosition({
      x: clamp(drag.x + event.clientX - drag.pointerX, 8, Math.max(8, window.innerWidth - 410)),
      y: clamp(drag.y + event.clientY - drag.pointerY, 72, Math.max(72, window.innerHeight - 120))
    });
  };

  useEffect(() => {
    if (!selectedProgram || selectedProgram.panels?.length) return;
    const migrated = defaultBoardPanels(selectedProgram);
    updateState((current) => ({
      ...current,
      boardPrograms: current.boardPrograms.map((program) => program.id === selectedProgram.id ? { ...program, panels: migrated } : program)
    }));
    setSelectedPanelId("");
  }, [selectedProgram?.id, selectedProgram?.panels?.length, updateState]);

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
    if (!selectedProgram?.panels?.length || selectedProgram.panels.some((panel) => panel.type === "supporters-heading")) return;
    const donorPanel = selectedProgram.panels.find((panel) => panel.type === "donors");
    if (!donorPanel) return;
    const headingHeight = Math.min(8, Math.max(5, (donorPanel.height ?? 45) * .16));
    const heading: BoardPanel = {
      id: `${donorPanel.id}-heading`, type: "supporters-heading", title: donorPanel.title || "Our supporters", size: "compact",
      fontFamily: donorPanel.fontFamily, fontSize: donorPanel.donorHeadingSize ?? Math.round((donorPanel.fontSize ?? display.nameSize ?? 28) * .62),
      x: donorPanel.x, y: donorPanel.y, width: donorPanel.width, height: headingHeight
    };
    const migrated = selectedProgram.panels.flatMap((panel) => panel.id === donorPanel.id
      ? [{ ...panel, title: "", fontSize: panel.donorNameSize ?? panel.fontSize ?? display.nameSize ?? 28, y: (panel.y ?? 0) + headingHeight, height: Math.max(4, (panel.height ?? 45) - headingHeight) }, heading]
      : [panel]);
    patchProgram({ panels: migrated });
  }, [selectedProgram?.id, selectedProgram?.panels, display.nameSize]);

  useEffect(() => {
    setSelectedPanelId("");
  }, [selectedProgramId]);

  useEffect(() => {
    if (!selectedProgram?.panels?.some((panel) => panel.type === "heading" && (panel.eyebrow || panel.body))) return;
    patchProgram({
      panels: selectedProgram.panels.map((panel) => panel.type === "heading"
        ? { ...panel, title: [panel.eyebrow, panel.title].filter(Boolean).join(" "), eyebrow: undefined, body: undefined }
        : panel)
    });
  }, [selectedProgram?.id, selectedProgram?.panels]);

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
    const nextPanels = panels.map((panel) => panel.id === panelId ? { ...panel, ...patch } : panel);
    const nextPanel = nextPanels.find((panel) => panel.id === panelId);
    const legacyPatch = nextPanel?.type === "heading"
      ? { heading: "", subtitle: nextPanel.title, description: "" }
      : nextPanel?.type === "footer"
        ? { footer: nextPanel.title }
        : nextPanel?.type === "donors"
          ? { columns: nextPanel.columns && nextPanel.columns <= 2 ? nextPanel.columns as 1 | 2 : selectedProgram.columns }
          : {};
    patchProgram({ panels: nextPanels, ...legacyPatch });
  };

  const addPanel = (type = newPanelType, position?: { x: number; y: number }) => {
    const panel = createBoardPanel(type, position);
    patchProgram({ panels: [...panels, panel] });
    setSelectedPanelId(panel.id);
    setPlacingPanelType(null);
  };

  const removePanel = (panelId: string) => {
    if (panels.length <= 1) return;
    const index = panels.findIndex((panel) => panel.id === panelId);
    const nextPanels = panels.filter((panel) => panel.id !== panelId);
    patchProgram({ panels: nextPanels });
    setSelectedPanelId("");
  };

  const duplicateProgram = () => {
    if (!selectedProgram) return;
    const id = `board-${Date.now()}`;
    const clonedPanels = panels.map((panel, index) => ({ ...panel, id: `${id}-${panel.type}-${index}` }));
    updateState((current) => ({
      ...current,
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
      panels: defaultBoardPanels({ ...selectedProgram, id, name: "Untitled board" })
    };
    updateState((current) => ({ ...current, boardPrograms: [...current.boardPrograms, next] }));
    setSelectedProgramId(id);
  };

  const deleteProgram = () => {
    if (state.boardPrograms.length <= 1 || !selectedProgram) return;
    if (!window.confirm(`Delete “${selectedProgram.name}”? This cannot be undone.`)) return;
    const remaining = state.boardPrograms.filter((program) => program.id !== selectedProgram.id);
    updateState((current) => ({
      ...current,
      boardPrograms: current.boardPrograms.filter((program) => program.id !== selectedProgram.id),
      screens: Object.fromEntries(Object.entries(current.screens).map(([id, screen]) => [id, screen.boardProgramId === selectedProgram.id ? { ...screen, boardProgramId: remaining[0]?.id } : screen])) as LanternState["screens"]
    }));
    setSelectedProgramId(remaining[0]?.id ?? "");
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

  const useBoardOnDisplay = () => {
    if (!selectedProgram) return;
    updateState((current) => ({
      ...current,
      donors: current.donors.map((donor) => selectedProgram.donorIds.includes(donor.id)
        ? { ...donor, displayIds: [...new Set([...(donor.displayIds ?? []), display.id])] }
        : donor),
      boardPrograms: current.boardPrograms.map((program) => program.id === selectedProgram.id ? { ...program, active: true } : program),
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

  const chooseBoardBackground = async (file?: File) => {
    if (!file) return;
    try {
      const backgroundImage = await uploadLanternAsset(file);
      void deleteLanternMedia(display.backgroundMediaId);
      patchDisplay({
        backgroundImage,
        backgroundMediaId: undefined,
        backgroundMediaType: "image",
        backgroundMediaName: file.name,
        backgroundMediaAnimated: file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif"),
        backgroundCrop: { scale: 1, x: 0, y: 0, rotation: 0 }
      });
    } catch {
      const mediaId = await storeLanternMedia(file);
      void deleteLanternMedia(display.backgroundMediaId);
      patchDisplay({
        backgroundImage: URL.createObjectURL(file),
        backgroundMediaId: mediaId,
        backgroundMediaType: "image",
        backgroundMediaName: file.name,
        backgroundMediaAnimated: file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif"),
        backgroundCrop: { scale: 1, x: 0, y: 0, rotation: 0 }
      });
    }
  };

  const removeBoardBackground = () => {
    void deleteLanternMedia(display.backgroundMediaId);
    patchDisplay({
      backgroundImage: undefined,
      backgroundMediaId: undefined,
      backgroundMediaType: undefined,
      backgroundMediaName: undefined,
      backgroundMediaAnimated: undefined,
      backgroundCrop: { scale: 1, x: 0, y: 0, rotation: 0 }
    });
  };

  const toggleProgramDonor = (donorId: string, checked: boolean) => {
    if (!selectedProgram) return;
    patchProgram({ donorIds: checked ? [...new Set([...selectedProgram.donorIds, donorId])] : selectedProgram.donorIds.filter((id) => id !== donorId) });
  };

  const renameDonor = (donorId: string, name: string) => {
    updateState((current) => ({ ...current, donors: current.donors.map((donor) => donor.id === donorId ? { ...donor, name } : donor) }));
  };

  const saveBoard = async () => {
    setSaveStatus("saving");
    try {
      publishState(state);
      await saveSharedLanternState(state);
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 2600);
    } catch {
      setSaveStatus("error");
    }
  };

  if (!selectedProgram) return <div className="empty-inspector"><strong>No boards available</strong></div>;

  return (
    <section className="board-builder">
      <div className="board-builder-toolbar">
        <div className="board-select-cluster">
          <label className="builder-select"><span>Board</span><select value={selectedProgram.id} onChange={(event) => setSelectedProgramId(event.target.value)}>{state.boardPrograms.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
          <button type="button" className="command-button secondary compact" onClick={duplicateProgram}>Duplicate current</button>
          <button type="button" className="command-button secondary compact" onClick={createProgram}><Plus size={16} /> New</button>
          <button type="button" className="icon-button danger-icon" onClick={deleteProgram} disabled={state.boardPrograms.length <= 1} title="Delete saved board"><Trash2 size={16} /></button>
        </div>
        <div className="board-save-cluster">
          <button type="button" className="command-button primary compact" disabled={saveStatus === "saving"} onClick={() => void saveBoard()}><Save size={16} /> {saveStatus === "saving" ? "Saving…" : "Save board"}</button>
          <span className={`board-save-status ${saveStatus}`} role="status">{saveStatus === "saved" ? "Saved for everyone" : saveStatus === "error" ? "Could not save — try again" : ""}</span>
        </div>
      </div>

      <div className="board-builder-workspace">
        <main className="direct-board-stage" onPointerDown={(event) => {
          if (!(event.target as Element).closest(".direct-board-canvas")) setSelectedPanelId("");
        }}>
          <div className="board-stage-meta"><span><strong>{selectedProgram.name}</strong> · Click any panel or text to edit</span><div className="mobile-board-zoom" aria-label="Board preview zoom"><button type="button" onClick={() => setBoardEditorZoom((value) => clamp(value - .15, .75, 1.75))}>−</button><button type="button" onClick={() => setBoardEditorZoom(1)}>{Math.round(boardEditorZoom * 100)}%</button><button type="button" onClick={() => setBoardEditorZoom((value) => clamp(value + .15, .75, 1.75))}>+</button></div></div>
          <DirectBoardCanvas
            state={state}
            display={boardDisplay}
            program={selectedProgram}
            panels={panels}
            selectedPanelId={selectedPanel?.id ?? ""}
            onSelect={setSelectedPanelId}
            onPatch={patchPanel}
            onRemove={removePanel}
            onRenameDonor={renameDonor}
            placingPanelType={placingPanelType}
            onBeginPlace={setPlacingPanelType}
            onAdd={addPanel}
            editorZoom={boardEditorZoom}
          />
        </main>

        <aside className="board-panel-inspector">
          <div className="inspector-sticky-head"><div><p className="eyebrow">{selectedPanel ? "Selected panel" : "Selection"}</p><h2>{selectedPanel ? boardPanelLabel(selectedPanel.type) : "Board selected"}</h2>{!selectedPanel && <span className="inspector-selection-note">Select a panel to modify or edit it.</span>}</div></div>
          <div className="board-inspector-scroll">
            {selectedPanel ? <div className="inspector-block">
              <div className="panel-position-grid">
                {(["x", "y", "width", "height"] as const).map((field) => <label className="field" key={field}><span>{field === "width" ? "W" : field === "height" ? "H" : field.toUpperCase()} (%)</span><input type="number" min={field === "width" || field === "height" ? 4 : 0} max={100} step="0.5" value={Math.round((selectedPanel[field] ?? 0) * 10) / 10} onChange={(event) => {
                  const value = Number(event.target.value);
                  const limit = field === "x" ? 100 - (selectedPanel.width ?? 4) : field === "y" ? 100 - (selectedPanel.height ?? 4) : field === "width" ? 100 - (selectedPanel.x ?? 0) : 100 - (selectedPanel.y ?? 0);
                  patchPanel(selectedPanel.id, { [field]: Math.max(field === "width" || field === "height" ? 4 : 0, Math.min(limit, value)) });
                }} /></label>)}
              </div>
              {selectedPanel.type !== "image" && <LabeledSelect label="Panel font" info="Typeface used only by this panel." value={selectedPanel.fontFamily ?? display.fontFamily ?? "Montserrat"} options={boardFontOptions} optionLabels={boardFontLabels} onChange={(fontFamily) => patchPanel(selectedPanel.id, { fontFamily: fontFamily as BoardPanel["fontFamily"] })} />}
              {selectedPanel.type !== "image" && <div className="panel-type-row"><Slider label="Font size" info="Changes the text size for the selected panel without changing its box." value={selectedPanel.fontSize ?? (selectedPanel.type === "heading" ? 32 : selectedPanel.type === "donors" ? display.nameSize ?? 28 : 24)} min={8} max={72} onChange={(fontSize) => patchPanel(selectedPanel.id, { fontSize })} /><ColorOverrideField label="Font color" value={selectedPanel.textColor} fallback={selectedPanel.type === "supporters-heading" || selectedPanel.type === "footer" ? "#D9A657" : "#F5F2EB"} onChange={(textColor) => patchPanel(selectedPanel.id, { textColor })} /></div>}
              {selectedPanel.type === "donors" && <>
                <div className="donor-divider-controls">
                  <div className="two-col">
                    <Slider label="Line thickness" info="Sets the thickness of the lines between donor names. Choose 0 to hide them." value={selectedPanel.donorDividerThickness ?? 1} min={0} max={6} onChange={(donorDividerThickness) => patchPanel(selectedPanel.id, { donorDividerThickness })} />
                    <Slider label="Line visibility" info="Sets how faint or strong the divider lines appear." value={selectedPanel.donorDividerOpacity ?? 18} min={0} max={100} onChange={(donorDividerOpacity) => patchPanel(selectedPanel.id, { donorDividerOpacity })} />
                  </div>
                  <ColorOverrideField label="Line color" value={selectedPanel.donorDividerColor} fallback="#D9A657" onChange={(donorDividerColor) => patchPanel(selectedPanel.id, { donorDividerColor })} />
                </div>
                <div className="field"><span>Names in each row</span><SegmentedControl value={String(selectedPanel.columns ?? selectedProgram.columns)} options={[["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]]} onChange={(value) => patchPanel(selectedPanel.id, { columns: Number(value) as BoardPanel["columns"] })} /></div>
                <Slider label="Rows" info="Sets how many donor rows fit inside this panel." value={selectedPanel.rows ?? Math.max(1, Math.ceil(selectedProgram.donorIds.length / (selectedPanel.columns ?? selectedProgram.columns)))} min={1} max={12} onChange={(rows) => patchPanel(selectedPanel.id, { rows })} />
                <div className="mini-actions"><button type="button" onClick={() => patchProgram({ donorIds: state.donors.filter((donor) => donor.active).map((donor) => donor.id) })}>Use active</button><button type="button" onClick={() => patchProgram({ donorIds: [] })}>Clear</button></div>
                <div className="board-donor-picker compact-picker">{donorPageItems.map((donor) => <label key={donor.id}><input type="checkbox" checked={selectedProgram.donorIds.includes(donor.id)} onChange={(event) => toggleProgramDonor(donor.id, event.target.checked)} /><span>{donor.name}</span></label>)}</div>
                <Pager page={donorPage} pageCount={donorPageCount} onChange={setDonorPage} />
              </>}
              {selectedPanel.type === "footer" && <div className="field"><span>Footer icons</span><SegmentedControl value={selectedPanel.footerIconPlacement ?? "left"} options={[["left", "Left side"], ["both", "Both sides"]]} onChange={(footerIconPlacement) => patchPanel(selectedPanel.id, { footerIconPlacement: footerIconPlacement as BoardPanel["footerIconPlacement"] })} /></div>}
              {selectedPanel.type === "image" && <><label className="command-button secondary compact image-upload-button"><Upload size={15} /> Choose PNG or image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void readSharedImageFile(file, (imageUrl) => patchPanel(selectedPanel.id, { imageUrl })); }} /></label><LabeledSelect label="Image fit" info="Contain keeps the whole image visible; cover fills the panel." value={selectedPanel.imageFit ?? "contain"} options={["contain", "cover"]} optionLabels={{ contain: "Contain", cover: "Cover" }} onChange={(imageFit) => patchPanel(selectedPanel.id, { imageFit: imageFit as BoardPanel["imageFit"] })} /></>}
            </div> : <>
            <details className="inspector-details" open><summary>Board design</summary><div className="inspector-block">
              <LabeledInput label="Board name" info="Name used in schedules and display controls." value={selectedProgram.name} onChange={(name) => patchProgram({ name })} />
              <div className="field"><span>Format <InfoDot text="Saved with this board and applied when the board is assigned to a display." /></span><SegmentedControl value={selectedProgram.orientation} options={[["Portrait", "Portrait"], ["Landscape", "Landscape"]]} onChange={(orientation) => patchProgram({ orientation: orientation as DisplayProfile["orientation"] })} /></div>
              <label className="switch-row"><input type="checkbox" checked={display.showFrame ?? true} onChange={(event) => patchDisplay({ showFrame: event.target.checked })} /><span>Show board frame</span></label>
              <div className="board-background-controls">
                <label className="command-button secondary compact image-upload-button"><ImagePlus size={15} /> {display.backgroundImage ? "Replace background" : "Add background image"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void chooseBoardBackground(event.target.files?.[0])} /></label>
                {display.backgroundImage && <button type="button" className="command-button danger compact" onClick={removeBoardBackground}><Trash2 size={15} /> Remove background</button>}
              </div>
              {display.backgroundImage && <>
                <Slider label="Background scale" info="Zoom the background image behind the board." value={Math.round(display.backgroundCrop.scale * 100)} min={50} max={300} onChange={(value) => patchDisplay({ backgroundCrop: { ...display.backgroundCrop, scale: value / 100 } })} />
                <Slider label="Background pan X" info="Move the background image horizontally." value={display.backgroundCrop.x} min={-100} max={100} onChange={(x) => patchDisplay({ backgroundCrop: { ...display.backgroundCrop, x } })} />
                <Slider label="Background pan Y" info="Move the background image vertically." value={display.backgroundCrop.y} min={-100} max={100} onChange={(y) => patchDisplay({ backgroundCrop: { ...display.backgroundCrop, y } })} />
              </>}
              <LabeledSelect label="Text finish" info="Cut brass adds a metallic face, beveled edge, and dimensional highlight." value={display.textFinish ?? "flat"} options={["flat", "cut-brass"]} optionLabels={{ flat: "Flat color", "cut-brass": "Cut-out brass" }} onChange={(textFinish) => patchDisplay({ textFinish: textFinish as DisplayProfile["textFinish"] })} />
              <label className="switch-row"><input type="checkbox" checked={display.textShadowEnabled ?? false} onChange={(event) => patchDisplay({ textShadowEnabled: event.target.checked })} /><span>Shadow under text</span></label>
              {display.textShadowEnabled && <>
                <Slider label="Shadow strength" info="Controls how dark and pronounced the text shadow appears." value={display.textShadowStrength ?? 55} min={0} max={100} onChange={(textShadowStrength) => patchDisplay({ textShadowStrength })} />
                <Slider label="Shadow angle" info="Sets the direction the shadow falls, in degrees." value={display.textShadowAngle ?? 135} min={0} max={360} onChange={(textShadowAngle) => patchDisplay({ textShadowAngle })} />
                <Slider label="Shadow distance" info="Sets how far the text appears lifted from the board." value={display.textShadowDistance ?? 5} min={0} max={16} onChange={(textShadowDistance) => patchDisplay({ textShadowDistance })} />
              </>}
              <label className="switch-row"><input type="checkbox" checked={display.showIcons ?? false} onChange={(event) => patchDisplay({ showIcons: event.target.checked })} /><span>Show donor icons</span></label>
              <div className="particle-editor-launch">
                <label className="switch-row"><input type="checkbox" checked={display.particleAnimationEnabled ?? false} onChange={(event) => { patchDisplay({ particleAnimationEnabled: event.target.checked }); if (!event.target.checked) setParticleEditorOpen(false); }} /><span>Animate board particles</span></label>
                <button type="button" className="command-button secondary compact" disabled={!display.particleAnimationEnabled} onClick={() => setParticleEditorOpen(true)}><SlidersHorizontal size={15} /> Adjust particles</button>
              </div>
              <p className="field-note">Donor subtext is controlled per name in Displays &gt; Assigned names.</p>
              <label className="switch-row"><input type="checkbox" checked={selectedProgram.active} onChange={(event) => patchProgram({ active: event.target.checked })} /><span>Available to schedules</span></label>
            </div></details></>}
          </div>
        </aside>
      </div>
      {particleEditorOpen && display.particleAnimationEnabled && createPortal(<aside className="particle-editor-popup" style={{ left: particleEditorPosition.x, top: particleEditorPosition.y }} aria-label="Particle settings">
        <header className="particle-editor-popup-header" onPointerDown={(event) => {
          if ((event.target as Element).closest("button")) return;
          particleEditorDragRef.current = { pointerX: event.clientX, pointerY: event.clientY, ...particleEditorPosition };
          event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={moveParticleEditor} onPointerUp={() => { particleEditorDragRef.current = null; }} onPointerCancel={() => { particleEditorDragRef.current = null; }}>
          <div><p className="eyebrow">Board effects</p><h2>Adjust particles</h2></div>
          <button type="button" className="icon-button" onClick={() => setParticleEditorOpen(false)} title="Close particle settings"><X size={17} /></button>
        </header>
        <div className="particle-editor-popup-body">
          <section className="particle-settings-group">
            <h3>Appearance</h3>
            <LabeledSelect label="Particle colors" info="Warm uses white and gold; primary uses classic red, yellow, and blue." value={display.particleColorStyle ?? "warm"} options={["warm", "primary"]} optionLabels={{ warm: "White + warm gold", primary: "Primary colors" }} onChange={(particleColorStyle) => patchDisplay({ particleColorStyle: particleColorStyle as DisplayProfile["particleColorStyle"] })} />
            <div className="two-col"><Slider label="Particle count" info="How many particles are visible." value={display.particleCount ?? 34} min={4} max={120} onChange={(particleCount) => patchDisplay({ particleCount })} /><Slider label="Particle size" info="Average particle size." value={display.particleSize ?? 4} min={1} max={12} onChange={(particleSize) => patchDisplay({ particleSize })} /></div>
            <Slider label="Dispersion" info="How widely particles are scattered across the board." value={display.particleSpread ?? 100} min={10} max={100} onChange={(particleSpread) => patchDisplay({ particleSpread })} />
          </section>
          <section className="particle-settings-group">
            <h3>Motion</h3>
            <LabeledSelect label="Drift direction" info="Sets the overall air-current direction." value={display.particleDriftDirection ?? "natural"} options={["natural", "left", "right", "up", "down", "wander"]} optionLabels={{ natural: "Natural", left: "Drift left", right: "Drift right", up: "Float up", down: "Fall down", wander: "Random wander" }} onChange={(particleDriftDirection) => patchDisplay({ particleDriftDirection: particleDriftDirection as DisplayProfile["particleDriftDirection"] })} />
            <div className="two-col"><Slider label="Drift speed" info="How quickly the dust moves across the board." value={display.particleDriftSpeed ?? 4} min={1} max={10} onChange={(particleDriftSpeed) => patchDisplay({ particleDriftSpeed })} /><Slider label="Gravity" info="How strongly particles settle toward the bottom of the board." value={display.particleGravity ?? 3} min={0} max={10} onChange={(particleGravity) => patchDisplay({ particleGravity })} /></div>
            <Slider label="Wander" info="How far particles deviate from their main direction." value={display.particleWander ?? 5} min={0} max={10} onChange={(particleWander) => patchDisplay({ particleWander })} />
          </section>
          <section className="particle-settings-group">
            <h3>Timing</h3>
            <div className="two-col"><Slider label="Lifetime" info="Base time before each particle fades and restarts." value={display.particleLifetime ?? 12} min={2} max={30} onChange={(particleLifetime) => patchDisplay({ particleLifetime })} /><Slider label="Lifetime range" info="Adds random variation around the base lifetime." value={display.particleLifetimeRange ?? 4} min={0} max={20} onChange={(particleLifetimeRange) => patchDisplay({ particleLifetimeRange })} /></div>
          </section>
        </div>
      </aside>, document.body)}
    </section>
  );
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
  editorZoom
}: {
  state: LanternState;
  display: DisplayProfile;
  program: LanternState["boardPrograms"][number];
  panels: BoardPanel[];
  selectedPanelId: string;
  onSelect: (id: string) => void;
  onPatch: (id: string, patch: Partial<BoardPanel>) => void;
  onRemove: (id: string) => void;
  onRenameDonor: (id: string, name: string) => void;
  placingPanelType: BoardPanelType | null;
  onBeginPlace: (type: BoardPanelType | null) => void;
  onAdd: (type?: BoardPanelType, position?: { x: number; y: number }) => void;
  editorZoom: number;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
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
  const commitText = (panel: BoardPanel, field: "eyebrow" | "title" | "body", value: string) => onPatch(panel.id, { [field]: value });
  const beginManipulation = (event: React.PointerEvent, panel: BoardPanel, mode: "move" | "resize", edge = "") => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(panel.id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const initial = { x: panel.x ?? 0, y: panel.y ?? 0, width: panel.width ?? 30, height: panel.height ?? 20 };
    const move = (pointer: PointerEvent) => {
      const dx = (pointer.clientX - startX) / rect.width * 100;
      const dy = (pointer.clientY - startY) / rect.height * 100;
      if (mode === "move") {
        onPatch(panel.id, { x: Math.max(0, Math.min(100 - initial.width, initial.x + dx)), y: Math.max(0, Math.min(100 - initial.height, initial.y + dy)) });
        return;
      }
      let { x, y, width, height } = initial;
      if (edge.includes("e")) width = Math.max(4, Math.min(100 - x, initial.width + dx));
      if (edge.includes("s")) height = Math.max(4, Math.min(100 - y, initial.height + dy));
      if (edge.includes("w")) { const nextX = Math.max(0, Math.min(initial.x + initial.width - 4, initial.x + dx)); width = initial.width + initial.x - nextX; x = nextX; }
      if (edge.includes("n")) { const nextY = Math.max(0, Math.min(initial.y + initial.height - 4, initial.y + dy)); height = initial.height + initial.y - nextY; y = nextY; }
      onPatch(panel.id, { x, y, width, height });
    };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  const placePanel = (event: React.PointerEvent) => {
    if (!placingPanelType || !canvasRef.current || (event.target as Element).closest(".direct-board-panel, .board-context-menu")) return;
    const rect = canvasRef.current.getBoundingClientRect();
    onAdd(placingPanelType, { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 });
  };
  const backgroundScale = display.backgroundCrop?.scale ?? 1;
  const particleCount = display.particleCount ?? 34;
  const shadowRadians = (display.textShadowAngle ?? 135) * Math.PI / 180;
  const shadowDistance = display.textShadowDistance ?? 5;
  const prioritizeMoveHandle = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const candidate = panels.find((panel) => {
      const left = rect.left + ((panel.x ?? 5) / 100) * rect.width + 4;
      const bottom = rect.top + (((panel.y ?? 5) + (panel.height ?? 18)) / 100) * rect.height - 4;
      return event.clientX >= left && event.clientX <= left + 29 && event.clientY >= bottom - 27 && event.clientY <= bottom;
    });
    if (candidate && !(event.target as Element).closest(`[data-panel-id="${candidate.id}"] .panel-move-handle`)) beginManipulation(event, candidate, "move");
  };
  return <div ref={canvasRef} className={`direct-board-canvas ${display.orientation.toLowerCase()} ${state.board.visualStyle}${display.showFrame === false ? " no-frame" : ""}${placingPanelType ? " placing-panel" : ""}${display.textFinish === "cut-brass" ? " finish-cut-brass" : ""}${display.textShadowEnabled ? " text-shadow-enabled" : ""}`} style={{
    fontFamily: display.fontFamily ?? "Montserrat",
    "--board-editor-zoom": editorZoom,
    "--board-text-shadow-x": `${Math.cos(shadowRadians) * shadowDistance}px`,
    "--board-text-shadow-y": `${Math.sin(shadowRadians) * shadowDistance}px`,
    "--board-text-shadow-blur": `${1 + (display.textShadowStrength ?? 55) / 28}px`,
    "--board-text-shadow-alpha": Math.min(.62, .1 + (display.textShadowStrength ?? 55) / 165)
  } as React.CSSProperties} onPointerDownCapture={prioritizeMoveHandle} onPointerDown={(event) => { if (!placingPanelType && !(event.target as Element).closest(".direct-board-panel, .board-context-menu")) onSelect(""); placePanel(event); }} onContextMenu={(event) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setContextMenu({ x: Math.max(6, Math.min(event.clientX - rect.left, rect.width - 168)), y: Math.max(6, Math.min(event.clientY - rect.top, rect.height - 286)) }); }}>
    {display.backgroundImage && <div className="direct-board-background"><img src={display.backgroundImage} alt="" style={{ width: `${backgroundScale * 100}%`, height: `${backgroundScale * 100}%`, objectPosition: `${display.backgroundCrop?.x ?? 50}% ${display.backgroundCrop?.y ?? 50}%` }} /></div>}
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
      {panels.map((panel, index) => <section key={panel.id} data-panel-id={panel.id} className={`direct-board-panel panel-${panel.type} panel-${panel.size}${panel.id === selectedPanelId ? " selected" : ""}`} style={{
        left: `${panel.x ?? 5}%`,
        top: `${panel.y ?? index * 20 + 5}%`,
        width: `${panel.width ?? 90}%`,
        height: `${panel.height ?? 18}%`,
        zIndex: index + 2,
        fontFamily: panel.fontFamily ?? display.fontFamily ?? "Montserrat",
        "--panel-text-color": panel.textColor ?? (panel.type === "supporters-heading" || panel.type === "footer" ? "#d9a657" : "#f5f2eb"),
        "--panel-font-size": `${panel.fontSize ?? (panel.type === "heading" ? 32 : panel.type === "donors" ? display.nameSize ?? 28 : 24)}px`,
        "--donor-name-size": `${panel.fontSize ?? display.nameSize ?? 28}px`,
        "--donor-divider-color": panel.donorDividerColor ?? "#d9a657",
        "--donor-divider-thickness": `${panel.donorDividerThickness ?? 1}px`,
        "--donor-divider-opacity": `${panel.donorDividerOpacity ?? 18}%`
      } as React.CSSProperties} onClick={(event) => { event.stopPropagation(); onSelect(panel.id); }}>
        <button type="button" className="panel-move-handle" title="Drag to move panel" aria-label="Drag to move panel" onPointerDown={(event) => beginManipulation(event, panel, "move")}><Move size={16} /></button>
        <button type="button" className="panel-remove-handle" title="Remove panel" aria-label="Remove panel" disabled={panels.length === 1} onClick={(event) => { event.stopPropagation(); onRemove(panel.id); }}><Trash2 size={15} /></button>
        {["n", "ne", "e", "se", "s", "sw", "w", "nw"].map((edge) => <span key={edge} className={`panel-resize-handle resize-${edge}`} onPointerDown={(event) => beginManipulation(event, panel, "resize", edge)} />)}
        {panel.type === "heading" && <EditableBoardText className="board-title" value={panel.title} onCommit={(value) => commitText(panel, "title", value)} />}
        {panel.type === "supporters-heading" && <EditableBoardText className="board-section-title" value={panel.title} onCommit={(value) => commitText(panel, "title", value)} />}
        {panel.type === "donors" && <div className="direct-donor-grid" style={{ gridTemplateColumns: `repeat(${panel.columns ?? program.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${panel.rows ?? Math.max(1, Math.ceil(donors.length / (panel.columns ?? program.columns)))}, minmax(0, 1fr))` }}>{donors.slice(0, (panel.rows ?? Math.max(1, Math.ceil(donors.length / (panel.columns ?? program.columns)))) * (panel.columns ?? program.columns)).map((donor) => <div
          className={`direct-donor-name donor-custom highlight-${donor.highlight ?? "none"} animation-${donor.animation ?? "none"}`}
          style={{ "--donor-name-color": donor.nameColor || "#f5f2eb", "--donor-accent-color": donor.accentColor || "#d9a657", fontFamily: `${donor.fontOverride || display.fontFamily || "Montserrat"}, sans-serif` } as React.CSSProperties}
          key={donor.id}
        >{display.showIcons && <span className="donor-mark">{donorIconGlyph(donor.icon && donor.icon !== "none" ? donor.icon : "star")}</span>}<EditableBoardText value={donor.name} onCommit={(value) => onRenameDonor(donor.id, value)} />{donorSubtextVisibleForDisplay(display, donor.id) && donor.subtext && <small>{donor.subtext}</small>}</div>)}{!donors.length && <button className="empty-board-action" type="button">Select donors in the inspector</button>}</div>}
        {panel.type === "message" && <><EditableBoardText className="board-eyebrow" value={panel.eyebrow ?? ""} onCommit={(value) => commitText(panel, "eyebrow", value)} /><EditableBoardText className="board-message-title" value={panel.title} onCommit={(value) => commitText(panel, "title", value)} /><EditableBoardText className="board-copy" value={panel.body ?? ""} onCommit={(value) => commitText(panel, "body", value)} /></>}
        {panel.type === "story" && <><div className="direct-story-image" style={state.board.storyImageUrl ? { backgroundImage: `url(${state.board.storyImageUrl})` } : undefined}><ImageIcon size={22} /></div><div><EditableBoardText className="board-eyebrow" value={panel.eyebrow ?? ""} onCommit={(value) => commitText(panel, "eyebrow", value)} /><EditableBoardText className="board-message-title" value={panel.title} onCommit={(value) => commitText(panel, "title", value)} /><EditableBoardText className="board-copy" value={panel.body ?? ""} onCommit={(value) => commitText(panel, "body", value)} /></div></>}
        {panel.type === "image" && <div className={`direct-image-panel fit-${panel.imageFit ?? "contain"}`}>{panel.imageUrl ? <img src={panel.imageUrl} alt="" /> : <><ImagePlus size={28} /><span>Choose an image in the right menu</span></>}</div>}
        {panel.type === "footer" && <div className={`direct-footer-line icons-${panel.footerIconPlacement ?? "left"}`}><span /><span>♡</span><EditableBoardText value={panel.title} onCommit={(value) => commitText(panel, "title", value)} />{panel.footerIconPlacement === "both" && <span className="footer-heart">♡</span>}<span /></div>}
      </section>)}
    </div>
    {placingPanelType && <div className="placement-hint"><Plus size={14} /> Click where the {boardPanelLabel(placingPanelType).toLowerCase()} should go</div>}
    {contextMenu && <div ref={contextMenuRef} className="board-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}><strong>Add panel</strong>{boardPanelTypes.map((type) => <button key={type} type="button" onClick={() => { onBeginPlace(type); setContextMenu(null); }}>{boardPanelLabel(type)}</button>)}</div>}
  </div>;
}

function EditableBoardText({ value, onCommit, className = "" }: { value: string; onCommit: (value: string) => void; className?: string }) {
  return <div className={`editable-board-text ${className}`} contentEditable suppressContentEditableWarning role="textbox" tabIndex={0} onFocus={(event) => { const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(event.currentTarget); selection?.removeAllRanges(); selection?.addRange(range); }} onBlur={(event) => onCommit(event.currentTarget.textContent?.trim() ?? "")} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}>{value}</div>;
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
  const displayDonorIds = displayRosterIds(state, display);
  const liveProgramDonors = (display.donorRosterConfigured ? state.donors : programDonors).filter(
    (donor) => donor.active && donor.displayIds?.includes(display.id) && displayDonorIds.includes(donor.id)
  ).sort((a, b) => display.donorRosterConfigured ? displayDonorIds.indexOf(a.id) - displayDonorIds.indexOf(b.id) : 0);
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
        <LabeledSelect label="Donor font" info="Typeface used for donor names on this display." value={display.fontFamily ?? "Montserrat"} options={boardFontOptions} optionLabels={boardFontLabels} onChange={(value) => patchDisplay({ fontFamily: value as DisplayProfile["fontFamily"] })} />
        <Slider label="Name size" info="Preferred donor-name size; the renderer still shrinks safely when needed." value={display.nameSize ?? 28} min={14} max={48} onChange={(value) => patchDisplay({ nameSize: value })} />
        <Slider label="Layout scale" info="Makes donor text and spacing larger or smaller on this display." value={display.layoutScale} min={78} max={124} onChange={(value) => patchDisplay({ layoutScale: value })} />
        <Slider label="Brightness" info="Adjusts final brightness on this display without changing the theme." value={display.brightness} min={30} max={100} onChange={(value) => patchDisplay({ brightness: value })} />
        <label className="switch-row"><input type="checkbox" checked={display.showIcons ?? false} onChange={(event) => patchDisplay({ showIcons: event.target.checked })} /><span>Show donor icons</span></label>
        <p className="field-note">Choose subtext separately for each donor in Displays &gt; Assigned names.</p>

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
  const previewScreen = state.screens[previewScreenId] ?? Object.values(state.screens)[0];
  const selectedTargets = state.announcement.targets?.length ? state.announcement.targets : state.announcement.target === "all" ? Object.keys(state.screens) : [state.announcement.target];
  const previewLabel = state.announcement.target === "all"
    ? `All displays · previewing ${previewScreen.label}`
    : previewScreen.label;
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
            {state.announcement.imageUrl && <div className="three-col compact-image-controls"><Slider label="Image X" info="Move the announcement image horizontally." value={state.announcement.imageX ?? 72} min={0} max={100} onChange={(imageX) => patchAnnouncement({ imageX })} /><Slider label="Image Y" info="Move the announcement image vertically." value={state.announcement.imageY ?? 50} min={0} max={100} onChange={(imageY) => patchAnnouncement({ imageY })} /><Slider label="Image size" info="Adjust the announcement image width." value={state.announcement.imageWidth ?? 22} min={5} max={70} onChange={(imageWidth) => patchAnnouncement({ imageWidth })} /></div>}
          </section>
          <section className="composer-section delivery-section">
            <header><span>3</span><div><strong>Delivery</strong><small>Choose the audience, layout, schedule, and how long it stays visible.</small></div></header>
            <div className="announcement-target-picker"><span>Send to</span>{Object.values(state.screens).map((screen) => <label key={screen.id}><input type="checkbox" checked={selectedTargets.includes(screen.id)} onChange={() => toggleAnnouncementTarget(screen.id)} />{screen.label}</label>)}</div>
            <div className="two-col"><LabeledSelect label="Layout" info="The announcement layout used on the display." value={state.announcement.style} options={["Ribbon", "Temporary Card", "Lower Third"]} onChange={(value) => patchAnnouncement({ style: value as LanternState["announcement"]["style"], layoutX: undefined, layoutY: undefined, layoutWidth: undefined })} /><label className="field duration-field"><span>Show for <InfoDot text="Use 0 to keep it visible until someone ends it manually." /></span><div className="duration-input"><input aria-label="Announcement duration in minutes" type="number" min={0} max={1440} value={state.announcement.durationMinutes} onChange={(event) => patchAnnouncement({ durationMinutes: Number(event.target.value) || 0 })} /><b>min</b></div></label></div>
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
                <Slider label="Text Y" info="Vertical center of the announcement text box." value={state.announcement.layoutY ?? (state.announcement.style === "Temporary Card" ? 50 : 88)} min={5} max={95} onChange={(layoutY) => patchAnnouncement({ layoutY })} />
                <Slider label="Text width" info="Width of the draggable announcement text box." value={state.announcement.layoutWidth ?? (state.announcement.style === "Ribbon" ? 90 : 78)} min={20} max={96} onChange={(layoutWidth) => patchAnnouncement({ layoutWidth })} />
              </div>
            </div>
          </section>
          <details className="composer-section optional-section">
            <summary><span>2</span><div><strong>Optional enhancements</strong><small>Image, countdown, sounds, and walk-on character</small></div><ChevronDown size={16} /></summary>
            <div className="optional-section-body">
              <div className="optional-image-control">
                <div><ImagePlus size={18} /><span><strong>Announcement image</strong><small>Add an optional PNG, JPG, GIF, or WebP to the message.</small></span></div>
                <label className="image-upload announcement-image-upload"><ImagePlus size={16} /><span>{state.announcement.imageUrl ? "Replace image" : "Add image"}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void readSharedImageFile(event.target.files?.[0], (imageUrl) => patchAnnouncement({ imageUrl, imageX: 72, imageY: 50, imageWidth: 22 }))} /></label>
                {state.announcement.imageUrl && <button type="button" className="icon-button danger-icon" onClick={() => patchAnnouncement({ imageUrl: undefined })} title="Remove announcement image"><Trash2 size={15} /></button>}
              </div>
              <div className="announcement-timer-controls">
                <LabeledSelect label="Countdown" info="Add a live countdown to the announcement." value={state.announcement.timerStyle} options={["off", "digital", "progress", "circular"]} optionLabels={{ off: "Off", digital: "Digital clock", progress: "Progress bar", circular: "Circular timer" }} onChange={(value) => patchAnnouncement({ timerStyle: value as LanternState["announcement"]["timerStyle"] })} />
                {state.announcement.timerStyle !== "off" && <><LabeledSelect label="Timer position" info="Keep the timer beside the announcement or pin it to a screen corner." value={state.announcement.timerPosition} options={["announcement-right", "top-left", "top-right", "bottom-left", "bottom-right"]} optionLabels={{ "announcement-right": "Announcement right", "top-left": "Top left", "top-right": "Top right", "bottom-left": "Bottom left", "bottom-right": "Bottom right" }} onChange={(value) => patchAnnouncement({ timerPosition: value as LanternState["announcement"]["timerPosition"], timerX: undefined, timerY: undefined })} /><ColorControl label="Timer color" value={state.announcement.timerAccentColor} onChange={(timerAccentColor) => patchAnnouncement({ timerAccentColor })} /><ColorControl label="Timer track" value={state.announcement.timerTrackColor} onChange={(timerTrackColor) => patchAnnouncement({ timerTrackColor })} /></>}
              </div>
              {state.announcement.timerStyle !== "off" && state.announcement.timerPosition !== "announcement-right" && <div className="announcement-placement-controls">
                <div className="placement-control-heading"><span>Timer position</span><button type="button" onClick={() => patchAnnouncement({ timerX: undefined, timerY: undefined })}><RotateCcw size={13} /> Use corner default</button></div>
                <div className="two-col">
                  <Slider label="Timer X" info="Horizontal center of the floating timer." value={state.announcement.timerX ?? (state.announcement.timerPosition.endsWith("left") ? 17 : 83)} min={4} max={96} onChange={(timerX) => patchAnnouncement({ timerX })} />
                  <Slider label="Timer Y" info="Vertical center of the floating timer." value={state.announcement.timerY ?? (state.announcement.timerPosition.startsWith("top") ? 15 : 84)} min={4} max={96} onChange={(timerY) => patchAnnouncement({ timerY })} />
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
          <div className="announcement-actions composer-actions"><div><small>{previewLabel} · {state.announcement.durationMinutes ? `${state.announcement.durationMinutes} minutes` : "Manual end"}</small></div><button type="button" className="command-button secondary" onClick={openAnnouncementDemo}><ExternalLink size={17} /> Preview</button><button className={state.announcement.active ? "command-button danger" : "command-button primary"} onClick={toggleAnnouncement}><Megaphone size={18} />{state.announcement.active ? "End announcement" : "Send announcement"}</button></div>
          <details className="saved-announcement-panel" aria-label="Saved announcements">
            <summary><span><Save size={15} /> Saved announcements</span><strong>{state.savedAnnouncements.find((item) => item.id === selectedSavedId)?.title ?? `${state.savedAnnouncements.length} created`}</strong><div className="announcement-library-actions"><button type="button" className="command-button secondary compact" onClick={(event) => { event.preventDefault(); newAnnouncement(); }}><Plus size={15} /> New</button><button type="button" className="command-button primary compact" onClick={(event) => { event.preventDefault(); saveAnnouncement(); }}><Save size={15} /> {selectedSavedId ? "Save changes" : "Save draft"}</button></div><ChevronDown size={15} /></summary>
            <div className="saved-announcement-list">
              {state.savedAnnouncements.map((item) => <article key={item.id} className={selectedSavedId === item.id ? "saved-announcement-card selected" : "saved-announcement-card"} onClick={() => loadSavedAnnouncement(item.id)}>
                <div><strong>{item.title || "Untitled announcement"}</strong><p>{item.message || "No message"}</p><small>{targetOptionLabels(state)[item.target]} · {item.durationMinutes ? `${item.durationMinutes} min` : "Manual"}</small></div>
                <div className="saved-announcement-card-actions">
                  <button type="button" onClick={(event) => { event.stopPropagation(); loadSavedAnnouncement(item.id); }} title="Edit announcement"><Pencil size={14} /> Edit</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); duplicateSavedAnnouncement(item.id); }} title="Create a new version"><Plus size={14} /> Version</button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); setScheduleAnnouncementId(item.id); }} title="Add to calendar"><CalendarDays size={14} /> Calendar</button>
                  <button type="button" className="danger" onClick={(event) => { event.stopPropagation(); deleteSavedAnnouncement(item.id); }} title="Delete announcement"><Trash2 size={14} /></button>
                </div>
              </article>)}
              {!state.savedAnnouncements.length && <div className="saved-announcement-empty"><Megaphone size={20} /><span>No saved announcements yet. Finish this draft and choose Save draft.</span></div>}
            </div>
          </details>
        </div>
        <div className="announcement-preview-card">
          <div className="announcement-preview-tools"><label className="announcement-preview-display-select"><Monitor size={15} /><span>Preview display</span><select aria-label="Preview display" value={previewScreen.id} onChange={(event) => setPreviewScreenId(event.target.value as ScreenId)}>{Object.values(state.screens).map((screen) => <option key={screen.id} value={screen.id}>{screen.label}</option>)}</select></label><button className="icon-button" onClick={() => document.querySelector<HTMLElement>(".announcement-preview-stage")?.requestFullscreen()} title="Full screen preview"><Maximize2 size={16} /></button></div>
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

interface LiveRecording {
  id: string;
  name: string;
  url: string;
  blob: Blob;
  durationSeconds: number;
  createdAt: string;
}

const livePolygonClip = (frame: LanternState["live"]["frame"]) => {
  const points = frame.polygonPoints?.length
    ? frame.polygonPoints
    : [{ x: 12, y: 4 }, { x: 88, y: 4 }, { x: 100, y: 50 }, { x: 86, y: 96 }, { x: 14, y: 96 }, { x: 0, y: 50 }];
  return `polygon(${points.map((point) => `${point.x}% ${point.y}%`).join(", ")})`;
};

function DirectLiveStage({
  screen,
  live,
  stream,
  mode,
  previewError,
  onFrameChange
}: {
  screen: DisplayProfile;
  live: LanternState["live"];
  stream: MediaStream | null;
  mode: "frame" | "crop";
  previewError: string | null;
  onFrameChange: (frame: LanternState["live"]["frame"]) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const dragRef = useRef<{
    kind: "move" | "resize" | "crop" | "point";
    edge?: string;
    pointIndex?: number;
    pointerId: number;
    x: number;
    y: number;
    frame: LanternState["live"]["frame"];
  } | null>(null);

  const polygonPoints = live.frame.polygonPoints?.length
    ? live.frame.polygonPoints
    : [{ x: 12, y: 4 }, { x: 88, y: 4 }, { x: 100, y: 50 }, { x: 86, y: 96 }, { x: 14, y: 96 }, { x: 0, y: 50 }];
  const polygonClip = `polygon(${polygonPoints.map((point) => `${point.x}% ${point.y}%`).join(", ")})`;

  const beginDrag = (event: React.PointerEvent<HTMLElement>, kind: "move" | "resize" | "crop" | "point", edge = "se", pointIndex?: number) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind, edge, pointIndex, pointerId: event.pointerId, x: event.clientX, y: event.clientY, frame: structuredClone(live.frame) };
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
      onFrameChange({
        ...drag.frame,
        polygonPoints: points.map((point, index) => index === drag.pointIndex ? {
          x: clamp(((event.clientX - frameBounds.left) / frameBounds.width) * 100, 0, 100),
          y: clamp(((event.clientY - frameBounds.top) / frameBounds.height) * 100, 0, 100)
        } : point)
      });
    } else if (drag.kind === "move") {
      onFrameChange({ ...drag.frame, x: clamp(drag.frame.x + dx, 0, 100 - drag.frame.width), y: clamp(drag.frame.y + dy, 0, 100 - drag.frame.height) });
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
      onFrameChange({ ...drag.frame, x, y, width, height, maskShape });
    } else {
      onFrameChange({ ...drag.frame, crop: { ...drag.frame.crop, x: clamp(drag.frame.crop.x + dx, -50, 50), y: clamp(drag.frame.crop.y + dy, -50, 50) } });
    }
  };

  const deletePolygonPoint = (index: number) => {
    if (polygonPoints.length <= 3) {
      if (!window.confirm("A polygon needs at least three points. Delete this point and remove the custom polygon?")) return;
      onFrameChange({ ...live.frame, maskShape: "rectangle", polygonPoints: undefined });
      setSelectedPoint(null);
      return;
    }
    onFrameChange({ ...live.frame, polygonPoints: polygonPoints.filter((_, pointIndex) => pointIndex !== index) });
    setSelectedPoint(null);
  };

  useEffect(() => {
    if (selectedPoint === null || live.frame.maskShape !== "polygon") return;
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
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const zoomCrop = (event: WheelEvent) => {
      if (mode !== "crop" || !(event.target instanceof Element) || !event.target.closest(".direct-live-frame")) return;
      event.preventDefault();
      const scale = clamp(live.frame.crop.scale + (event.deltaY < 0 ? .08 : -.08), 1, 3);
      onFrameChange({ ...live.frame, crop: { ...live.frame.crop, scale } });
    };
    stage.addEventListener("wheel", zoomCrop, { passive: false });
    return () => stage.removeEventListener("wheel", zoomCrop);
  }, [live.frame, mode, onFrameChange]);

  return (
    <div className="direct-live-stage-shell">
      <div className="direct-stage-toolbar">
        <span>{screen.label}</span>
        <strong>{mode === "frame" ? "Drag to move · corner to resize" : "Drag to crop · wheel to zoom"}</strong>
      </div>
      <div ref={stageRef} className={`direct-live-stage ${orientationClass(screen)}`}>
        <div className="direct-stage-board"><span>{screen.label}</span></div>
        <div
          className={`direct-live-frame ${mode === "crop" ? "crop-mode" : ""}`}
          style={{ left: `${live.frame.x}%`, top: `${live.frame.y}%`, width: `${live.frame.width}%`, height: `${live.frame.height}%`, transform: `rotate(${live.frame.rotation ?? 0}deg) scale(${live.frame.mirrorX ? -1 : 1}, ${live.frame.mirrorY ? -1 : 1})` }}
          onPointerDown={(event) => beginDrag(event, mode === "crop" ? "crop" : "move")}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <div className={`direct-live-content mask-${live.frame.maskShape ?? "rectangle"}`} style={live.frame.maskShape === "polygon" ? { clipPath: polygonClip } : undefined}>
            {stream ? <ChromaVideo stream={stream} chromaKey={live.chromaKey} effects={live.effects} crop={live.frame.crop} /> : live.source === "demo" ? <div className="live-test-pattern compact"><strong>DIRECTOR LIVE</strong><span>Generated test feed</span></div> : <div className="direct-source-empty"><Camera size={22} /><span>{previewError ?? "Connect the selected source to preview it here."}</span></div>}
            <div className="lower-third preview"><strong>{live.title}</strong><span>{live.lowerThird}</span></div>
          </div>
          {mode === "frame" && ["n", "ne", "e", "se", "s", "sw", "w", "nw"].map((edge) => <div key={edge} className={`direct-resize-handle resize-${edge}`} title={`Resize ${edge}`} onPointerDown={(event) => beginDrag(event, "resize", edge)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} />)}
          {mode === "frame" && live.frame.maskShape === "polygon" && <div className="polygon-editor" aria-label="Custom polygon points">
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
          <span className="direct-frame-size">{Math.round(live.frame.width)} × {Math.round(live.frame.height)}</span>
        </div>
      </div>
    </div>
  );
}

function LivePreviewPanel({
  state,
  patchLive,
  startLive,
  startLiveStream,
  stopLive
}: {
  state: LanternState;
  patchLive: (patch: Partial<LanternState["live"]>) => void;
  startLive: () => void;
  startLiveStream: (stream: MediaStream, detail: string) => Promise<void>;
  stopLive: () => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [liveTab, setLiveTab] = useState<"setup" | "frame" | "effects">("setup");
  const [previewWindow, setPreviewWindow] = useState<Window | null>(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [sourcePromptOpen, setSourcePromptOpen] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [directMode, setDirectMode] = useState<"frame" | "crop">("frame");
  const [recordings, setRecordings] = useState<LiveRecording[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [sendingRecordingId, setSendingRecordingId] = useState<string | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewWindowRef = useRef<Window | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const recordingsRef = useRef<LiveRecording[]>([]);
  const recordingPlaybackRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => { previewStreamRef.current = previewStream; }, [previewStream]);
  useEffect(() => { previewWindowRef.current = previewWindow; }, [previewWindow]);
  useEffect(() => { recordingsRef.current = recordings; }, [recordings]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds(Math.max(0, Math.floor((Date.now() - recordingStartedRef.current) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    void navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => setDevices([]));
    return () => {
      previewStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewWindowRef.current && !previewWindowRef.current.closed) previewWindowRef.current.close();
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      recordingsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
      recordingPlaybackRef.current?.pause();
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
  const previewScreen = state.screens[state.live.target] ?? Object.values(state.screens)[0];
  const backgroundRemovalMode = state.live.chromaKey.enabled
    ? "chroma"
    : state.live.effects.background === "original" ? "off" : "ai";

  const setBackgroundRemovalMode = (mode: string) => {
    patchLive({
      chromaKey: { ...state.live.chromaKey, enabled: mode === "chroma" },
      effects: {
        ...state.live.effects,
        background: mode === "ai"
          ? (state.live.effects.background === "original" ? "remove" : state.live.effects.background)
          : "original"
      }
    });
  };

  const stopPreviewStream = () => {
    previewStreamRef.current?.getTracks().forEach((track) => track.stop());
    previewStreamRef.current = null;
    setPreviewStream(null);
  };

  const startPreview = async (source = state.live.source) => {
    previewStream?.getTracks().forEach((track) => track.stop());
    setPreviewError(null);
    if (source === "demo") {
      setPreviewStream(null);
      return true;
    }
    if (!window.isSecureContext || (!navigator.mediaDevices?.getUserMedia && !navigator.mediaDevices?.getDisplayMedia)) {
      setPreviewStream(null);
      setPreviewError("Camera and screen capture require a secure browser context. Open this app from its local app address.");
      return false;
    }
    setPreviewBusy(true);
    try {
      const stream = source === "screen"
        ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: true })
        : await navigator.mediaDevices.getUserMedia({
            video: { deviceId: state.live.videoDeviceId ? { exact: state.live.videoDeviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, max: 60 } },
            audio: state.live.audioDeviceId ? { deviceId: { exact: state.live.audioDeviceId } } : true
          });
      stream.getVideoTracks().forEach((track) => track.addEventListener("ended", () => {
        setPreviewStream(null);
        setPreviewError(source === "screen" ? "Screen sharing ended. Choose a window again to resume." : "The camera stopped. Reconnect it or choose another camera.");
      }, { once: true }));
      previewStreamRef.current = stream;
      setPreviewStream(stream);
      const nextDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(nextDevices);
      return true;
    } catch (error) {
      setPreviewStream(null);
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setPreviewError(source === "screen"
          ? "Screen sharing was cancelled or blocked. Click Open preview and choose Screen or window share to try again."
          : "Webcam access was blocked. Allow Camera and Microphone for 127.0.0.1 in the browser address bar, then click Try camera again.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setPreviewError(source === "screen" ? "No shareable screen or window was found." : "No webcam was found. Connect one and try again.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setPreviewError("The selected camera is already in use by another app. Close that app or choose a different camera.");
      } else {
        setPreviewError(error instanceof Error ? error.message : "The video source could not be opened.");
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
    patchLive({ source, usingCamera: source === "camera" });
    if (openWindow) openPreviewWindow();
    if (source === "demo") {
      stopPreviewStream();
      setPreviewError(null);
      return;
    }
    void startPreview(source);
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
    if (!previewStream) {
      setPreviewError("Connect a camera or shared window before recording.");
      setLiveTab("setup");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setPreviewError("This browser does not support local video recording.");
      return;
    }
    const preferredTypes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(previewStream, mimeType ? { mimeType } : undefined);
    recordingChunksRef.current = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) recordingChunksRef.current.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "video/webm" });
      if (!blob.size) return;
      const createdAt = new Date().toISOString();
      const next: LiveRecording = {
        id: `recording-${Date.now()}`,
        name: `Lantern live ${new Date().toLocaleString().replace(/[/:]/g, "-")}.webm`,
        url: URL.createObjectURL(blob),
        blob,
        durationSeconds: Math.max(1, Math.round((Date.now() - recordingStartedRef.current) / 1000)),
        createdAt
      };
      setRecordings((current) => [next, ...current]);
      setRecording(false);
      setRecordingSeconds(0);
    }, { once: true });
    recorderRef.current = recorder;
    recordingStartedRef.current = Date.now();
    setRecordingSeconds(0);
    setRecording(true);
    recorder.start(500);
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const downloadRecording = (item: LiveRecording) => {
    const anchor = document.createElement("a");
    anchor.href = item.url;
    anchor.download = item.name;
    anchor.click();
  };

  const deleteRecording = (id: string) => {
    setRecordings((current) => {
      const item = current.find((recordingItem) => recordingItem.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return current.filter((recordingItem) => recordingItem.id !== id);
    });
  };

  const sendRecording = async (item: LiveRecording) => {
    try {
      recordingPlaybackRef.current?.pause();
      const playback = document.createElement("video");
      playback.src = item.url;
      playback.loop = true;
      playback.playsInline = true;
      playback.preload = "auto";
      recordingPlaybackRef.current = playback;
      await playback.play();
      const stream = (playback as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
      if (!stream) throw new Error("Recorded-video output is not supported by this browser.");
      setSendingRecordingId(item.id);
      await startLiveStream(stream, `Playing recording: ${item.name}`);
    } catch (error) {
      setSendingRecordingId(null);
      setPreviewError(error instanceof Error ? error.message : "The recording could not be sent to the displays.");
    }
  };

  const endLivePresentation = () => {
    recordingPlaybackRef.current?.pause();
    recordingPlaybackRef.current = null;
    setSendingRecordingId(null);
    stopLive();
  };

  const beginLivePresentation = () => {
    if (previewStream && state.live.source !== "demo") {
      void startLiveStream(previewStream.clone(), state.live.source === "screen" ? "Using approved screen share." : "Using approved camera preview.");
      return;
    }
    void startLive();
  };

  const previewPortal = previewWindow && !previewWindow.closed && previewWindow.document.getElementById("lantern-live-preview-root")
    ? createPortal(
        <div className="live-preview-popout-shell">
          <header className="live-preview-popout-header">
            <div><span className={state.live.active ? "live-indicator active" : "live-indicator"} /> <strong>Broadcast / Stream</strong><small>{labelForTarget(state.live.target)}</small></div>
            <button type="button" className="icon-button" onClick={() => previewWindow.close()} title="Close preview"><X size={18} /></button>
          </header>
          <div className={`live-preview-box popout-preview ${orientationClass(previewScreen)}`}>
            <div className={`live-positioned-preview mask-${state.live.frame.maskShape ?? "rectangle"}`} style={{ left: `${state.live.frame.x}%`, top: `${state.live.frame.y}%`, width: `${state.live.frame.width}%`, height: `${state.live.frame.height}%`, clipPath: state.live.frame.maskShape === "polygon" ? livePolygonClip(state.live.frame) : undefined, transform: `rotate(${state.live.frame.rotation ?? 0}deg) scale(${state.live.frame.mirrorX ? -1 : 1}, ${state.live.frame.mirrorY ? -1 : 1})` }}>
              {state.live.source !== "demo" && previewStream ? (
                <ChromaVideo stream={previewStream} chromaKey={state.live.chromaKey} effects={state.live.effects} crop={state.live.frame.crop} />
              ) : state.live.source !== "demo" ? (
                <div className="live-source-waiting">
                  {state.live.source === "screen" ? <Monitor size={34} /> : <Camera size={34} />}
                  <strong>{previewBusy ? "Waiting for permission..." : state.live.source === "screen" ? "Screen share not connected" : "Camera not connected"}</strong>
                  <span>{previewError ?? (state.live.source === "screen" ? "Choose a screen or application window from the Control Center." : "Allow webcam access from the Control Center.")}</span>
                </div>
              ) : (
                <div className="live-test-pattern"><strong>DIRECTOR LIVE</strong><span>Generated local test feed</span></div>
              )}
              <div className="lower-third preview"><strong>{state.live.title}</strong><span>{state.live.lowerThird}</span></div>
            </div>
          </div>
          <footer className="live-preview-popout-footer"><span>{state.live.source === "demo" ? "Test feed" : state.live.source === "screen" ? "Screen share" : "Camera"}</span><span>{state.live.active ? "On air" : "Preview"}</span></footer>
        </div>,
        previewWindow.document.getElementById("lantern-live-preview-root")!
      )
    : null;

  return (
    <div className="form-panel live-setup-panel">
      <div className="live-panel-heading">
        <div><h2>Broadcast / Stream Studio <InfoDot text="Preview camera, microphone, title, and target display before starting a broadcast." /></h2><span className={previewWindow && !previewWindow.closed ? "preview-window-status open" : "preview-window-status"}>{previewWindow && !previewWindow.closed ? "Preview window open" : "Preview window closed"}</span></div>
        <div className="live-heading-actions">
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
          <div><span className={state.live.active ? "live-indicator active" : "live-indicator"} /><strong>{state.live.active ? "Program output" : "Preview"}</strong><span>{previewScreen.label}</span></div>
          <span>{state.live.source === "demo" ? "Test feed" : state.live.source === "screen" ? "Screen share" : "Camera"}</span>
        </div>
        <div className="persistent-live-preview"><DirectLiveStage screen={previewScreen} live={state.live} stream={previewStream} mode={directMode} previewError={previewError} onFrameChange={(frame) => patchLive({ frame })} /></div>
      </section>
      <aside className="live-inspector" aria-label="Broadcast controls">
      <EditorTabs value={liveTab} options={[["setup", "Source"], ["frame", "Frame & crop"], ["effects", "Effects"]]} onChange={(value) => setLiveTab(value as typeof liveTab)} />
      {liveTab === "setup" && <div className="live-tab-panel setup-tab">
      <LabeledInput label="Title" info="The live presentation title shown on the lower third." value={state.live.title} onChange={(value) => patchLive({ title: value })} />
      <LabeledInput label="Lower third" info="The smaller caption shown under the title." value={state.live.lowerThird} onChange={(value) => patchLive({ lowerThird: value })} />
      <div className="two-col">
        <LabeledSelect label="Display" info="Choose which display receives the live presentation." value={state.live.target} options={targetOptions(state)} optionLabels={targetOptionLabels(state)} onChange={(value) => patchLive({ target: value as TargetScreen })} />
        <LabeledSelect label="Video source" info="Camera uses a camera, screen share captures a Zoom or Skype window, and demo is a local test feed." value={state.live.source} options={["demo", "camera", "screen"]} optionLabels={{ demo: "Generated test feed", camera: "Camera", screen: "Screen or window share" }} onChange={(value) => selectSource(value as LanternState["live"]["source"])} />
      </div>
      <div className="two-col">
        <LabeledSelect label="Camera" info="Camera used for preview and live mode." value={state.live.videoDeviceId ?? ""} options={cameraOptions.options} optionLabels={cameraOptions.labels} onChange={(value) => patchLive({ videoDeviceId: value || undefined })} />
        <LabeledSelect label="Microphone" info="Microphone used for live mode when the browser allows it." value={state.live.audioDeviceId ?? ""} options={micOptions.options} optionLabels={micOptions.labels} onChange={(value) => patchLive({ audioDeviceId: value || undefined })} />
      </div>
      <section className={previewError || popupBlocked ? "source-connection-card error" : previewStream ? "source-connection-card ready" : "source-connection-card"}>
        <div className="source-connection-status">
          {previewStream ? <CheckCircle2 size={17} /> : previewError || popupBlocked ? <AlertTriangle size={17} /> : <Camera size={17} />}
          <div><strong>{previewBusy ? "Waiting for permission…" : previewStream ? "Video source connected" : state.live.source === "demo" ? "Test feed selected" : "Video source not connected"}</strong><span>{previewError ?? (popupBlocked ? "The browser blocked the preview window. Allow pop-ups, then try again." : previewStream ? "The selected source is ready for preview and broadcast." : state.live.source === "camera" ? "Start the camera to connect this source." : state.live.source === "screen" ? "Start sharing to choose a screen or window." : "The generated feed is ready without a camera.")}</span></div>
        </div>
        {state.live.source !== "demo" && <button type="button" className={previewStream ? "command-button danger compact" : "command-button primary compact"} disabled={previewBusy} onClick={previewStream ? stopPreviewStream : () => void startPreview(state.live.source)}>
          {previewStream ? <Square size={15} /> : <Camera size={15} />}
          {previewBusy ? "Connecting…" : previewStream ? (state.live.source === "camera" ? "Stop camera" : "Stop sharing") : previewError ? (state.live.source === "camera" ? "Try camera again" : "Try sharing again") : (state.live.source === "camera" ? "Start camera" : "Start sharing")}
        </button>}
      </section>
      </div>}
      {liveTab === "frame" && <div className="live-frame-tab live-tab-panel">
        <div className="live-toolbox direct-frame-controls">
          <div className="direct-control-heading"><h3>Direct manipulation</h3><SegmentedControl value={directMode} options={[["frame", "Move & resize"], ["crop", "Pan & zoom"]]} onChange={(value) => setDirectMode(value as typeof directMode)} /></div>
          <div className="four-col">
            <Slider label="Left" info="Video position from the left edge." value={state.live.frame.x} min={0} max={90} onChange={(value) => patchLive({ frame: { ...state.live.frame, x: Math.min(value, 100 - state.live.frame.width) } })} />
            <Slider label="Top" info="Video position from the top edge." value={state.live.frame.y} min={0} max={90} onChange={(value) => patchLive({ frame: { ...state.live.frame, y: Math.min(value, 100 - state.live.frame.height) } })} />
            <Slider label="Width" info="Video section width." value={state.live.frame.width} min={10} max={100 - state.live.frame.x} onChange={(value) => patchLive({ frame: { ...state.live.frame, width: value } })} />
            <Slider label="Height" info="Video section height." value={state.live.frame.height} min={10} max={100 - state.live.frame.y} onChange={(value) => patchLive({ frame: { ...state.live.frame, height: value } })} />
          </div>
          <Slider label="Source zoom" info="Zoom into the captured source. You can also use the mouse wheel in Pan & zoom mode." value={Math.round(state.live.frame.crop.scale * 100)} min={100} max={300} onChange={(value) => patchLive({ frame: { ...state.live.frame, crop: { ...state.live.frame.crop, scale: value / 100 } } })} />
          <div className="two-col">
            <Slider label="Crop horizontal" info="Pan the source left or right." value={state.live.frame.crop.x} min={-50} max={50} onChange={(value) => patchLive({ frame: { ...state.live.frame, crop: { ...state.live.frame.crop, x: value } } })} />
            <Slider label="Crop vertical" info="Pan the source up or down." value={state.live.frame.crop.y} min={-50} max={50} onChange={(value) => patchLive({ frame: { ...state.live.frame, crop: { ...state.live.frame.crop, y: value } } })} />
          </div>
          <div className="live-transform-controls"><LabeledSelect label="Mask" info="Choose the visible shape of the live source." value={state.live.frame.maskShape ?? "rectangle"} options={["rectangle", "square", "circle", "polygon"]} optionLabels={{ rectangle: "Rectangle", square: "Square", circle: "Circle", polygon: "Custom polygon" }} onChange={(value) => {
            const maskShape = value as NonNullable<LanternState["live"]["frame"]["maskShape"]>;
            const size = maskShape === "square" ? Math.min(state.live.frame.width, state.live.frame.height, 100 - state.live.frame.x, 100 - state.live.frame.y) : null;
            patchLive({ frame: { ...state.live.frame, maskShape, width: size ?? state.live.frame.width, height: size ?? state.live.frame.height, polygonPoints: maskShape === "polygon" ? (state.live.frame.polygonPoints?.length ? state.live.frame.polygonPoints : undefined) : state.live.frame.polygonPoints } });
          }} /><Slider label="Rotate" info="Rotate the live source within its frame." value={state.live.frame.rotation ?? 0} min={-180} max={180} onChange={(rotation) => patchLive({ frame: { ...state.live.frame, rotation } })} /><label className="switch-row"><input type="checkbox" checked={state.live.frame.mirrorX ?? false} onChange={(event) => patchLive({ frame: { ...state.live.frame, mirrorX: event.target.checked } })} /><span>Mirror</span></label><label className="switch-row"><input type="checkbox" checked={state.live.frame.mirrorY ?? false} onChange={(event) => patchLive({ frame: { ...state.live.frame, mirrorY: event.target.checked } })} /><span>Flip</span></label></div>
          {(state.live.frame.maskShape === "circle" || state.live.frame.maskShape === "polygon") && <p className="direct-manipulation-hint">Hold Shift while dragging an edge to scale proportionally. Polygon points can be dragged anywhere; hover an edge midpoint to add a point.</p>}
        </div>
      </div>}
      {liveTab === "effects" && <div className="live-toolbox live-tab-panel effects-tab">
        <div className="effect-section-heading"><h3>Background removal</h3><span>Choose one method</span></div>
        <div className="field removal-method-field"><span>Removal method <InfoDot text="Green screen keying and screenless AI removal are separate pipelines and cannot be stacked." /></span><SegmentedControl value={backgroundRemovalMode} options={[["off", "Off"], ["chroma", "Green screen"], ["ai", "No screen (AI)"]]} onChange={setBackgroundRemovalMode} /></div>

        {backgroundRemovalMode === "chroma" && <section className="effect-settings-card chroma-settings-card">
          <div className="effect-card-heading"><div><strong>Green screen key</strong><span>For a physical green or blue backdrop</span></div><b>CHROMA</b></div>
          <div className="four-col">
            <label className="field"><span>Key color</span><input type="color" value={state.live.chromaKey.color} onChange={(event) => patchLive({ chromaKey: { ...state.live.chromaKey, color: event.target.value } })} /></label>
            <Slider label="Similarity" info="How close a pixel must be to the key color." value={Math.round(state.live.chromaKey.similarity * 100)} min={5} max={80} onChange={(value) => patchLive({ chromaKey: { ...state.live.chromaKey, similarity: value / 100 } })} />
            <Slider label="Edge feather" info="Softens the keyed edge without erasing the subject." value={Math.round(state.live.chromaKey.smoothness * 100)} min={1} max={40} onChange={(value) => patchLive({ chromaKey: { ...state.live.chromaKey, smoothness: value / 100 } })} />
            <Slider label="Spill cleanup" info="Removes reflected key color from hair and clothing." value={Math.round(state.live.chromaKey.spill * 100)} min={0} max={60} onChange={(value) => patchLive({ chromaKey: { ...state.live.chromaKey, spill: value / 100 } })} />
          </div>
        </section>}

        {backgroundRemovalMode === "ai" && <section className="effect-settings-card ai-settings-card">
          <div className="effect-card-heading"><div><strong>No-screen background removal</strong><span>Local person segmentation; no colored backdrop needed</span></div><b>AI</b></div>
          <div className="field"><span>Background result <InfoDot text="Keep only the person, blur the room, or place an image behind them." /></span><SegmentedControl value={state.live.effects.background} options={[["remove", "Remove"], ["blur", "Blur"], ["image", "Image"]]} onChange={(value) => patchLive({ chromaKey: { ...state.live.chromaKey, enabled: false }, effects: { ...state.live.effects, background: value as LanternState["live"]["effects"]["background"] } })} /></div>
          <div className="three-col ai-precision-controls">
            <Slider label="Edge precision" info="Raise this to reject more background; lower it to retain fine hair and hands." value={Math.round(state.live.effects.segmentationThreshold * 100)} min={20} max={75} onChange={(value) => patchLive({ effects: { ...state.live.effects, segmentationThreshold: value / 100 } })} />
            <Slider label="Edge feather" info="Smooths the transition around the segmented person." value={Math.round(state.live.effects.segmentationFeather * 100)} min={4} max={35} onChange={(value) => patchLive({ effects: { ...state.live.effects, segmentationFeather: value / 100 } })} />
            {state.live.effects.background === "blur" ? <Slider label="Background blur" info="Blur strength behind the segmented person." value={state.live.effects.blur} min={4} max={40} onChange={(value) => patchLive({ effects: { ...state.live.effects, blur: value } })} /> : <div className="effect-setting-note">Mask updates are stabilized between frames to reduce edge flicker.</div>}
          </div>
          {state.live.effects.background === "image" && <label className="image-upload"><ImagePlus size={17} /><span>{state.live.effects.backgroundImage ? "Replace background image" : "Choose background image"}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void readSharedImageFile(event.target.files?.[0], (backgroundImage) => patchLive({ effects: { ...state.live.effects, backgroundImage } }))} /></label>}
        </section>}

        <section className="effect-settings-card face-settings-card">
          <div className="effect-card-heading"><div><strong>Face effects</strong><span>High-frequency, stabilized landmark tracking</span></div><b>30 FPS</b></div>
          <label className="switch-row"><input type="checkbox" checked={state.live.effects.faceTracking} onChange={(event) => patchLive({ effects: { ...state.live.effects, faceTracking: event.target.checked, accessory: event.target.checked ? state.live.effects.accessory : "none", puppetPreview: event.target.checked && state.live.effects.puppetPreview } })} /><ScanFace size={16} /><span>Track eyes, head, and mouth</span></label>
          <div className="accessory-options"><button type="button" className={state.live.effects.accessory === "none" ? "selected" : ""} onClick={() => patchLive({ effects: { ...state.live.effects, accessory: "none" } })}>None</button><button type="button" className={state.live.effects.accessory === "glasses" ? "selected" : ""} onClick={() => patchLive({ effects: { ...state.live.effects, accessory: "glasses", faceTracking: true } })}><Glasses size={17} /> Glasses</button><button type="button" className={state.live.effects.accessory === "party-hat" ? "selected" : ""} onClick={() => patchLive({ effects: { ...state.live.effects, accessory: "party-hat", faceTracking: true } })}><PartyPopper size={17} /> Party hat</button></div>
          <label className="switch-row"><input type="checkbox" checked={state.live.effects.puppetPreview} onChange={(event) => patchLive({ effects: { ...state.live.effects, puppetPreview: event.target.checked, faceTracking: event.target.checked || state.live.effects.faceTracking } })} /><span>Mouth-driven puppet preview</span><InfoDot text="Foundation only: tracks mouth opening and drives a sample avatar. Full puppet replacement is intentionally not built yet." /></label>
        </section>
      </div>}
      </aside>
      </div>
      <section className="recording-panel">
        <div className="recording-command">
          <button type="button" className={recording ? "command-button danger" : "command-button secondary"} onClick={recording ? stopRecording : startRecording}>
            {recording ? <Square size={15} /> : <Circle size={15} />}
            {recording ? `Stop ${formatCountdown(recordingSeconds)}` : "Record"}
          </button>
          <div><strong>Recordings</strong><span>{recordings.length ? `${recordings.length} saved in this session` : "Record the connected camera or shared window."}</span></div>
        </div>
        {recordings.length > 0 && <div className="recording-list">
          {recordings.map((item) => <article className="recording-item" key={item.id}>
            <video src={item.url} controls preload="metadata" />
            <div><strong>{item.name.replace(".webm", "")}</strong><span>{formatCountdown(item.durationSeconds)} - {new Date(item.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>
            <button type="button" className={sendingRecordingId === item.id ? "icon-button active" : "icon-button"} onClick={() => void sendRecording(item)} title="Send recording to selected displays"><Send size={15} /></button>
            <button type="button" className="icon-button" onClick={() => downloadRecording(item)} title="Save recording"><Download size={15} /></button>
            <button type="button" className="icon-button danger-icon" onClick={() => deleteRecording(item.id)} title="Delete recording"><Trash2 size={15} /></button>
          </article>)}
        </div>}
      </section>
      {previewPortal}
      {mobilePreviewOpen && <div className="mobile-live-preview" role="dialog" aria-modal="true" aria-label="Live presentation preview">
        <header><div><span className={state.live.active ? "live-indicator active" : "live-indicator"} /><strong>Live presentation</strong><small>{previewScreen.label}</small></div><button type="button" className="icon-button" onClick={() => setMobilePreviewOpen(false)} title="Close preview"><X size={18} /></button></header>
        <div className="mobile-live-preview-stage"><DirectLiveStage screen={previewScreen} live={state.live} stream={previewStream} mode={directMode} previewError={previewError} onFrameChange={(frame) => patchLive({ frame })} /></div>
        <footer><span>{state.live.source === "demo" ? "Test feed" : state.live.source === "screen" ? "Screen share" : "Camera"}</span><span>{state.live.active ? "On air" : "Preview"}</span></footer>
      </div>}
      {sourcePromptOpen && <div className="modal-backdrop preview-source-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourcePromptOpen(false); }}>
        <section className="preview-source-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-source-title">
          <div className="preview-source-head"><div><p className="eyebrow">Preview source</p><h2 id="preview-source-title">What do you want to preview?</h2></div><button type="button" className="icon-button" onClick={() => setSourcePromptOpen(false)} title="Close"><X size={18} /></button></div>
          <div className="preview-source-options">
            <button type="button" onClick={() => selectSource("camera", true)}><Camera size={24} /><strong>Use webcam</strong><span>Ask for camera and microphone access.</span></button>
            <button type="button" onClick={() => selectSource("screen", true)}><Monitor size={24} /><strong>Share a window</strong><span>Choose Zoom, Skype, or another screen.</span></button>
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
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1, rotateX: -4, rotateY: 12 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; view: typeof view; pan: boolean } | null>(null);
  const resetView = () => setView({ x: 0, y: 0, zoom: 1, rotateX: -4, rotateY: 12 });
  const setMode = (mode: "2d" | "3d") => {
    setViewMode(mode);
    resetView();
  };
  const beginViewDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest(".monitor-view-controls, .announcement-edit-handle, [contenteditable='true'], .announcement-image.editable")) return;
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
      setView({ ...drag.view, rotateX: clamp(drag.view.rotateX - dy * .22, -65, 65), rotateY: clamp(drag.view.rotateY + dx * .28, -75, 75) });
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
  const timerInAnnouncement = announcement.timerStyle !== "off" && announcement.timerPosition === "announcement-right";
  const overlayClass = preview ? "announcement-display-overlay" : "announcement-overlay";
  const styleClass = announcement.style.toLowerCase().replace(/\s/g, "-");
  const defaultLayoutY = announcement.style === "Temporary Card" ? 50 : 88;
  const hasCustomLayout = announcement.layoutX !== undefined || announcement.layoutY !== undefined || announcement.layoutWidth !== undefined;
  const overlayStyle = {
    color: announcement.textColor ?? undefined,
    background: announcement.backgroundColor ?? undefined,
    ...(hasCustomLayout ? {
      top: `${announcement.layoutY ?? defaultLayoutY}%`,
      left: `${announcement.layoutX ?? 50}%`,
      right: "auto",
      bottom: "auto",
      width: `${announcement.layoutWidth ?? (announcement.style === "Ribbon" ? 90 : 78)}%`,
      transform: "translate(-50%, -50%)"
    } : {})
  } as React.CSSProperties;
  const dragPosition = (event: React.PointerEvent<HTMLElement>, kind: "layout" | "image") => {
    if (!editing || !onPatch || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bounds = event.currentTarget.closest(".announcement-fixed-canvas")?.getBoundingClientRect();
    if (!bounds) return;
    const x = clamp((event.clientX - bounds.left) / bounds.width * 100, 0, 100);
    const y = clamp((event.clientY - bounds.top) / bounds.height * 100, 0, 100);
    onPatch(kind === "layout" ? { layoutX: x, layoutY: y } : { imageX: x, imageY: y });
  };
  const editableText = (field: "title" | "message" | "details") => ({
    contentEditable: editing,
    suppressContentEditableWarning: true,
    onBlur: (event: React.FocusEvent<HTMLElement>) => onPatch?.({ [field]: event.currentTarget.textContent ?? "" })
  });

  return <>
    <div className={`${overlayClass} ${styleClass}${timerInAnnouncement ? " has-timer" : ""}${hasCustomLayout ? " custom-position" : ""}${editing ? " announcement-editable-element" : ""}`} style={overlayStyle}>
      {editing && <button type="button" className="announcement-edit-handle text-handle" title="Drag announcement text box" onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={(event) => dragPosition(event, "layout")}><Move size={20} /></button>}
      <strong {...editableText("title")}>{announcement.title || "Announcement title"}</strong>
      <span {...editableText("message")}>{announcement.message || "Your message appears here."}</span>
      {announcement.details && <small className="announcement-details" {...editableText("details")}>{announcement.details}</small>}
      {announcement.imageUrl && <img className={`announcement-image${editing ? " editable announcement-editable-element" : ""}`} src={announcement.imageUrl} alt="" draggable={false} onPointerDown={(event) => {
        if (!editing || !onPatch) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={(event) => dragPosition(event, "image")} style={{ left: `${announcement.imageX ?? 72}%`, top: `${announcement.imageY ?? 50}%`, width: `${announcement.imageWidth ?? 22}%` }} />}
      {timerInAnnouncement && <AnnouncementCountdown announcement={announcement} startedAt={startedAt} playOnComplete={playOnComplete} className="inside-announcement" />}
    </div>
    {announcement.timerStyle !== "off" && !timerInAnnouncement && <AnnouncementCountdown announcement={announcement} startedAt={startedAt} playOnComplete={playOnComplete} className={`floating ${announcement.timerPosition}${announcement.timerX !== undefined || announcement.timerY !== undefined ? " custom-position" : ""}`} editing={editing} onPatch={onPatch} />}
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
  const timerStyle = {
    "--timer-accent": announcement.timerAccentColor,
    "--timer-track": announcement.timerTrackColor,
    "--timer-progress": `${Math.max(0, Math.min(1, progress)) * 360}deg`,
    "--timer-progress-percent": `${Math.max(0, Math.min(1, progress)) * 100}%`,
    ...(announcement.timerX !== undefined || announcement.timerY !== undefined ? {
      left: `${announcement.timerX ?? (announcement.timerPosition.endsWith("left") ? 17 : 83)}%`,
      top: `${announcement.timerY ?? (announcement.timerPosition.startsWith("top") ? 15 : 84)}%`,
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

function MediaStreamVideo({ stream, muted, className }: { stream: MediaStream | null; muted: boolean; className?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [stream]);
  return <video ref={videoRef} autoPlay playsInline muted={muted} className={className} />;
}

function ScreensView({
  state,
  selectedDisplayId,
  setSelectedDisplayId,
  openDisplays,
  updateState,
  initialEditingId,
  initialEditorTab
}: {
  state: LanternState;
  selectedDisplayId: ScreenId;
  setSelectedDisplayId: (screenId: ScreenId) => void;
  openDisplays: () => void;
  updateState: (updater: (current: LanternState) => LanternState) => void;
  initialEditingId?: ScreenId;
  initialEditorTab?: "setup" | "room" | "names";
}) {
  const [editingId, setEditingId] = useState<ScreenId | null>(initialEditingId ?? null);
  const [page, setPage] = useState(0);
  const [editorTab, setEditorTab] = useState<"setup" | "room" | "names">(initialEditorTab ?? "setup");
  const [rosterAddId, setRosterAddId] = useState("");
  const [draggedRosterDonorId, setDraggedRosterDonorId] = useState<string | null>(null);
  const [mediaDevices, setMediaDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [roomScreenId, setRoomScreenId] = useState<ScreenId | null>(null);
  const [roomStream, setRoomStream] = useState<MediaStream | null>(null);
  const [roomWindow, setRoomWindow] = useState<Window | null>(null);
  const [roomMuted, setRoomMuted] = useState(false);
  const roomStreamRef = useRef<MediaStream | null>(null);
  const roomWindowRef = useRef<Window | null>(null);
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
  const roomCameras = mediaDevices.filter((device) => device.kind === "videoinput");
  const roomMics = mediaDevices.filter((device) => device.kind === "audioinput");
  const roomCameraOptions = deviceOptionList(roomCameras, "Default camera", "Camera");
  const roomMicOptions = deviceOptionList(roomMics, "Default mic", "Mic");
  const patchDisplay = (id: ScreenId, patch: Partial<DisplayProfile>) => {
    updateState((current) => ({ ...current, screens: { ...current.screens, [id]: { ...current.screens[id], ...patch } } }));
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
      roomStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (roomWindowRef.current && !roomWindowRef.current.closed) roomWindowRef.current.close();
    };
  }, []);

  useEffect(() => { roomStreamRef.current = roomStream; }, [roomStream]);
  useEffect(() => { roomWindowRef.current = roomWindow; }, [roomWindow]);

  const detectRoomDevices = async () => {
    setDeviceError(null);
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      permissionStream.getTracks().forEach((track) => track.stop());
      setMediaDevices(await navigator.mediaDevices.enumerateDevices());
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : "Camera and microphone access was not granted.");
    }
  };

  const closeRoomView = () => {
    roomStreamRef.current?.getTracks().forEach((track) => track.stop());
    roomStreamRef.current = null;
    setRoomStream(null);
    if (roomWindowRef.current && !roomWindowRef.current.closed) roomWindowRef.current.close();
    roomWindowRef.current = null;
    setRoomWindow(null);
    setRoomScreenId(null);
  };

  const openRoomView = async (screen: DisplayProfile) => {
    let popup = roomWindowRef.current;
    if (!popup || popup.closed) {
      popup = window.open("", "lantern-room-monitor", "popup=yes,width=900,height=620,resizable=yes,scrollbars=no");
      if (!popup) {
        setDeviceError("The browser blocked the room-view window. Allow pop-ups for 127.0.0.1 and try again.");
        return;
      }
      popup.document.head.innerHTML = '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
      popup.document.title = `${screen.label} Room View`;
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => popup!.document.head.appendChild(node.cloneNode(true)));
      popup.document.body.className = "room-view-popout-body";
      popup.document.body.innerHTML = '<div id="lantern-room-view-root"></div>';
      popup.addEventListener("beforeunload", () => {
        roomStreamRef.current?.getTracks().forEach((track) => track.stop());
        roomStreamRef.current = null;
        setRoomStream(null);
        setRoomWindow(null);
        setRoomScreenId(null);
      }, { once: true });
      roomWindowRef.current = popup;
      setRoomWindow(popup);
    }
    setRoomScreenId(screen.id);
    popup.focus();
    roomStreamRef.current?.getTracks().forEach((track) => track.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: screen.roomVideoDeviceId ? { exact: screen.roomVideoDeviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: screen.roomAudioEnabled === false ? false : screen.roomAudioDeviceId ? { deviceId: { exact: screen.roomAudioDeviceId } } : true
      });
      roomStreamRef.current = stream;
      setRoomStream(stream);
      setMediaDevices(await navigator.mediaDevices.enumerateDevices());
      setDeviceError(null);
    } catch (error) {
      setRoomStream(null);
      setDeviceError(error instanceof Error ? error.message : "The assigned room camera could not be opened.");
    }
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

  const identify = (screenId: ScreenId) => {
    const channel = new BroadcastChannel("project-lantern-host-v1");
    channel.postMessage({ type: "identify-screen", screenId } satisfies HostMessage);
    channel.close();
  };

  const roomPortal = roomWindow && !roomWindow.closed && roomScreen && roomWindow.document.getElementById("lantern-room-view-root")
    ? createPortal(
        <div className="room-view-shell">
          <header className="room-view-header">
            <div><span className={roomStream ? "live-indicator active" : "live-indicator"} /><strong>{roomScreen.label}</strong><small>Room camera</small></div>
            <div>
              <button type="button" className={roomMuted ? "icon-button active" : "icon-button"} onClick={() => setRoomMuted((current) => !current)} title={roomMuted ? "Unmute room audio" : "Mute room audio"}>{roomMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
              <button type="button" className="icon-button" onClick={closeRoomView} title="Close room view"><X size={18} /></button>
            </div>
          </header>
          <div className="room-view-video">
            {roomStream ? <MediaStreamVideo stream={roomStream} muted={roomMuted} /> : <div className="room-view-empty"><Camera size={34} /><strong>Room camera unavailable</strong><span>{deviceError ?? "Choose the camera assigned to this display and try again."}</span></div>}
          </div>
          <footer className="room-view-footer"><span>{roomMuted ? "Audio muted" : "Room audio on"}</span><span>{roomScreen.roomVideoDeviceId ? "Assigned camera" : "Default camera"}</span></footer>
        </div>,
        roomWindow.document.getElementById("lantern-room-view-root")!
      )
    : null;

  return (
    <section className="display-workspace">
      <div className="section-commandbar"><div><strong>{Object.keys(state.screens).length} displays</strong><span>Wi-Fi shows attachment. Power controls whether content is live.</span></div><div className="button-row"><button className="command-button secondary" onClick={openDisplays}><Monitor size={17} /> Open test displays</button><button className="command-button primary" onClick={addDisplay}><Plus size={17} /> Add display</button></div></div>
      <div className="screens-grid managed compact-screen-grid">
        {pageScreens.map((screen) => (
          <article className={selectedDisplayId === screen.id ? "screen-card selected" : "screen-card"} key={screen.id}>
            <div className="screen-card-head"><div><h2>{screen.label}</h2><p>{screen.orientation} · {screen.resolution}</p></div><div className="screen-icon-actions"><span title={screen.status === "offline" ? "Display is not attached" : "Display attached"}>{screen.status === "offline" ? <WifiOff size={19} /> : <Wifi size={19} />}</span><button className={screen.enabled ? "icon-button live-toggle active" : "icon-button live-toggle"} onClick={() => patchDisplay(screen.id, { enabled: !screen.enabled })} title={screen.enabled ? "Take display offline" : "Make display live"}><Power size={17} /></button></div></div>
            <button className={`mini-preview ${orientationClass(screen)}`} onClick={() => setSelectedDisplayId(screen.id)}><BabylonDonorWall state={state} screenId={screen.id} /></button>
            <div className="screen-card-summary"><span>{labelForStyle(screen.style)}</span><span>{screen.donorScrollEnabled ? `Scrolling · ${screen.donorScrollSpeed ?? 4}/10` : `${screen.columns ?? 1} column${screen.columns === 2 ? "s" : ""}`}</span><span>{screen.roomVideoDeviceId ? "Room camera assigned" : "Default room camera"}</span></div>
            <div className="button-row screen-actions"><button className="icon-button" onClick={() => identify(screen.id)} title="Identify display"><Radio size={17} /></button><button className="icon-button" onClick={() => void openRoomView(screen)} title={`Open ${screen.label} room view`}><Camera size={17} /></button><button className="command-button secondary" onClick={() => { setSelectedDisplayId(screen.id); setEditingId(screen.id); setEditorTab("setup"); }}><Settings2 size={17} /> Edit</button><button className="icon-button danger-icon" onClick={() => deleteDisplay(screen.id)} title="Delete display"><Trash2 size={17} /></button></div>
          </article>
        ))}
      </div>
      <div className="collection-footer"><span>{screens.length} configured display{screens.length === 1 ? "" : "s"}</span><Pager page={page} pageCount={pageCount} onChange={setPage} /></div>
      {editingScreen && <aside className="screen-editor-drawer">
        <button className="icon-button screen-editor-close" onClick={() => setEditingId(null)} title="Close editor"><X size={18} /></button>
        <div className="panel-heading"><div><p className="eyebrow">Display settings</p><h2>{editingScreen.label}</h2></div></div>
        <EditorTabs value={editorTab} options={[["setup", "Configuration"], ["room", "Room camera"], ["names", "Assigned names"]]} onChange={(value) => setEditorTab(value as typeof editorTab)} />
        {editorTab === "setup" &&
        <div className="screen-editor-grid">
          <LabeledInput label="Name" info="User-facing display name." value={editingScreen.label} onChange={(value) => patchDisplay(editingScreen.id, { label: value })} />
          <LabeledSelect label="Orientation" info="Physical screen orientation." value={editingScreen.orientation} options={["Portrait", "Landscape"]} onChange={(value) => patchDisplay(editingScreen.id, { orientation: value as DisplayProfile["orientation"], resolution: value === "Portrait" ? "1080 x 1920" : "1920 x 1080" })} />
          <LabeledSelect label="Board style" info="Display content style." value={state.board.visualStyle} options={["chalkboard", "chalkboard-minimal", "gallery-plaque", "museum"]} optionLabels={{ chalkboard: "Chalkboard lines", "chalkboard-minimal": "Chalkboard dots", "gallery-plaque": "Gallery plaque", museum: "Museum story board" }} onChange={(value) => updateState((current) => ({ ...current, board: { ...current.board, visualStyle: value as LanternState["board"]["visualStyle"] } }))} />
          <LabeledSelect label="Font" info="Donor name font on this display." value={editingScreen.fontFamily ?? "Montserrat"} options={boardFontOptions} optionLabels={boardFontLabels} onChange={(value) => patchDisplay(editingScreen.id, { fontFamily: value as DisplayProfile["fontFamily"] })} />
          <LabeledInput label="Heading" info="Display-specific heading." value={editingScreen.customHeading ?? ""} onChange={(value) => patchDisplay(editingScreen.id, { customHeading: value })} />
          <LabeledInput label="Subheading" info="Display-specific subheading." value={editingScreen.customSubheading ?? ""} onChange={(value) => patchDisplay(editingScreen.id, { customSubheading: value })} />
          <div className="field"><span>Columns</span><SegmentedControl value={String(editingScreen.columns ?? 1)} options={[["1", "1 column"], ["2", "2 columns"]]} onChange={(value) => patchDisplay(editingScreen.id, { columns: Number(value) as 1 | 2 })} /></div>
          <label className="field"><span>Name size</span><input type="number" min={14} max={72} value={editingScreen.nameSize ?? 28} onChange={(event) => patchDisplay(editingScreen.id, { nameSize: Number(event.target.value) })} /></label>
          <div className="display-scroll-controls"><label className="switch-row display-scroll-toggle"><input type="checkbox" checked={editingScreen.donorScrollEnabled ?? false} onChange={(event) => patchDisplay(editingScreen.id, { donorScrollEnabled: event.target.checked })} /><span>Scrolling credits list</span></label><Slider label="Scroll speed" info="Speed of the continuous donor credits, from 1 (slow) to 10 (fast)." min={1} max={10} value={editingScreen.donorScrollSpeed ?? 4} onChange={(value) => patchDisplay(editingScreen.id, { donorScrollSpeed: value })} /></div>
          <div className="display-icon-controls"><label className="switch-row"><input type="checkbox" checked={editingScreen.showIcons ?? false} onChange={(event) => patchDisplay(editingScreen.id, { showIcons: event.target.checked })} /><span>Show donor icons</span></label>{editingScreen.showIcons && <><SegmentedControl value={editingScreen.donorIconStyle ?? "circle"} options={[["circle", "Circles"], ["diamond", "Diamonds"], ["dash", "Dashes"]]} onChange={(value) => patchDisplay(editingScreen.id, { donorIconStyle: value as DisplayProfile["donorIconStyle"] })} /><SegmentedControl value={editingScreen.donorIconPlacement ?? "left"} options={[["left", "Left only"], ["both", "Both sides"]]} onChange={(value) => patchDisplay(editingScreen.id, { donorIconPlacement: value as DisplayProfile["donorIconPlacement"] })} /></>}</div>
          <div className="display-particle-controls"><label className="switch-row"><input type="checkbox" checked={editingScreen.particleAnimationEnabled ?? false} onChange={(event) => patchDisplay(editingScreen.id, { particleAnimationEnabled: event.target.checked })} /><span>Particle animation</span></label>{editingScreen.particleAnimationEnabled && <><LabeledSelect label="Drift direction" info="Direction particles travel." value={editingScreen.particleDriftDirection ?? "natural"} options={["natural", "left", "right"]} optionLabels={{ natural: "Natural", left: "Drift left", right: "Drift right" }} onChange={(value) => patchDisplay(editingScreen.id, { particleDriftDirection: value as DisplayProfile["particleDriftDirection"] })} /><Slider label="Drift speed" info="How quickly the particles travel." min={1} max={10} value={editingScreen.particleDriftSpeed ?? 4} onChange={(value) => patchDisplay(editingScreen.id, { particleDriftSpeed: value })} /><Slider label="Gravity" info="How strongly particles settle downward." min={0} max={10} value={editingScreen.particleGravity ?? 3} onChange={(value) => patchDisplay(editingScreen.id, { particleGravity: value })} /></>}</div>
          <div className="display-background-controls"><div className="field"><span>Background</span><SegmentedControl value={editingScreen.backgroundMode ?? (editingScreen.style === "image" ? "image" : "board")} options={[["board", "Board"], ["image", "Image"]]} onChange={(value) => patchDisplay(editingScreen.id, { style: "donor-wall", backgroundMode: value as DisplayProfile["backgroundMode"] })} /></div>{(editingScreen.backgroundMode === "image" || editingScreen.style === "image") && <MediaCropEditor display={editingScreen} patchDisplay={(patch) => patchDisplay(editingScreen.id, patch)} chooseMedia={(file) => void chooseDisplayMedia(editingScreen, file)} />}</div>
        </div>}
        {editorTab === "room" && <div className="room-device-editor">
          <div className="room-device-heading"><div><strong>Camera at this display</strong><span>Assign the USB camera and microphone facing the room.</span></div><button type="button" className="command-button secondary compact" onClick={() => void detectRoomDevices()}><RefreshCcw size={15} /> Detect devices</button></div>
          <LabeledSelect label="Room webcam" info="Camera physically facing visitors at this monitor." value={editingScreen.roomVideoDeviceId ?? ""} options={roomCameraOptions.options} optionLabels={roomCameraOptions.labels} onChange={(value) => patchDisplay(editingScreen.id, { roomVideoDeviceId: value || undefined })} />
          <LabeledSelect label="Room microphone" info="Microphone used to hear people near this monitor." value={editingScreen.roomAudioDeviceId ?? ""} options={roomMicOptions.options} optionLabels={roomMicOptions.labels} onChange={(value) => patchDisplay(editingScreen.id, { roomAudioDeviceId: value || undefined })} />
          <label className="switch-row"><input type="checkbox" checked={editingScreen.roomAudioEnabled ?? true} onChange={(event) => patchDisplay(editingScreen.id, { roomAudioEnabled: event.target.checked })} /><Volume2 size={16} /><span>Capture room audio</span></label>
          {deviceError && <div className="device-error"><AlertTriangle size={16} /><span>{deviceError}</span></div>}
          <button type="button" className="command-button primary" onClick={() => void openRoomView(editingScreen)}><PictureInPicture2 size={17} /> Open movable room view</button>
        </div>}
        {editorTab === "names" && <div className="display-roster-editor">
          <div className="display-roster-heading">
            <div><h2>Names on this display</h2><span>{rosterDonors.length} assigned · drag or use arrows to reorder</span></div>
            <button className="command-button secondary compact" onClick={() => useAllActiveDonors(editingScreen)}>Use all active</button>
          </div>
          <div className="display-roster-add">
            <select aria-label="Donor to add" value={selectedRosterAddId} onChange={(event) => setRosterAddId(event.target.value)} disabled={!availableRosterDonors.length}>
              {availableRosterDonors.length
                ? availableRosterDonors.map((donor) => <option key={donor.id} value={donor.id}>{donor.name}</option>)
                : <option value="">All active donors are assigned</option>}
            </select>
            <button type="button" className="command-button primary compact" onClick={() => addRosterDonor(editingScreen)} disabled={!selectedRosterAddId}><Plus size={15} /> Add name</button>
          </div>
          <div className="display-roster-list">
            {rosterDonors.map((donor, index) => (
              <article
                className={draggedRosterDonorId === donor.id ? "display-roster-row dragging" : "display-roster-row"}
                key={donor.id}
                draggable
                onDragStart={(event) => { setDraggedRosterDonorId(donor.id); event.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                onDrop={(event) => { event.preventDefault(); if (draggedRosterDonorId) moveRosterDonor(editingScreen, draggedRosterDonorId, index); setDraggedRosterDonorId(null); }}
                onDragEnd={() => setDraggedRosterDonorId(null)}
              >
                <span className="display-roster-grip" title="Drag to reorder"><GripVertical size={16} /></span>
                <div className="display-roster-copy"><strong>{donor.name}</strong><small>{donor.subtext || donor.note || "No donor subtext entered"}</small></div>
                <label className="display-roster-subtext"><input type="checkbox" checked={donorSubtextVisibleForDisplay(editingScreen, donor.id)} onChange={(event) => setDonorSubtextVisibility(editingScreen, donor.id, event.target.checked)} /><span>Subtext</span></label>
                <div className="display-roster-order">
                  <button type="button" className="icon-button" disabled={index === 0} onClick={() => moveRosterDonor(editingScreen, donor.id, index - 1)} title={`Move ${donor.name} up`}><ChevronUp size={15} /></button>
                  <button type="button" className="icon-button" disabled={index === rosterDonors.length - 1} onClick={() => moveRosterDonor(editingScreen, donor.id, index + 1)} title={`Move ${donor.name} down`}><ChevronDown size={15} /></button>
                  <button type="button" className="icon-button danger-icon" onClick={() => setRoster(editingScreen, rosterIds.filter((id) => id !== donor.id))} title={`Remove ${donor.name}`}><X size={15} /></button>
                </div>
              </article>
            ))}
            {!rosterDonors.length && <div className="display-roster-empty"><Users size={22} /><strong>No names assigned</strong><span>Add a donor from the list above.</span></div>}
          </div>
        </div>}
      </aside>}
      {roomPortal}
    </section>
  );
}

function ScheduleCalendarView({
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
  const dayLabels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const [viewMode, setViewMode] = useState<"week" | "month" | "agenda">(() => window.innerWidth <= 760 ? "agenda" : "week");
  const [compact, setCompact] = useState(() => window.innerWidth <= 760);
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [displayFilter, setDisplayFilter] = useState<TargetScreen>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id?: string; x: number; y: number; date?: Date; start?: number } | null>(null);
  const [previewEntry, setPreviewEntry] = useState<ScheduleEntry | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [editorPosition, setEditorPosition] = useState({ x: Math.max(12, window.innerWidth - 376), y: 132 });
  const editorDragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const weekScrollRef = useRef<HTMLDivElement | null>(null);
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
  const selected = state.schedules.find((entry) => entry.id === selectedId) ?? null;
  const visibleMode = compact ? "agenda" : viewMode;
  const weekStart = startOfCalendarWeek(anchorDate);
  const hourHeight = clamp((window.innerHeight - 280) / 17, 20, 32);
  const hours = Array.from({ length: 24 }, (_, index) => index);
  const filtered = state.schedules.filter((entry) => displayFilter === "all" || entry.target === "all" || entry.target === displayFilter);
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
    const resize = () => setCompact(window.innerWidth <= 760);
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
    const frame = window.requestAnimationFrame(() => { if (weekScrollRef.current) weekScrollRef.current.scrollTop = hourHeight * 6; });
    return () => window.cancelAnimationFrame(frame);
  }, [visibleMode]);

  const patchEntry = (id: string, patch: Partial<ScheduleEntry>) => updateState((current) => ({
    ...current,
    schedules: current.schedules.map((entry) => entry.id === id ? { ...entry, ...patch } : entry)
  }));
  const removeEntry = (id: string) => {
    updateState((current) => ({ ...current, schedules: current.schedules.filter((entry) => entry.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };
  const duplicateEntry = (entry: ScheduleEntry) => {
    const id = `schedule-${Date.now()}`;
    updateState((current) => ({ ...current, schedules: [...current.schedules, { ...entry, id, name: `${entry.name} copy` }] }));
    setSelectedId(id);
  };
  const addEntry = (contentType: "board" | "announcement", slot?: { date: Date; start: number }) => {
    const saved = state.savedAnnouncements[0];
    const id = `schedule-${Date.now()}`;
    updateState((current) => ({ ...current, schedules: [...current.schedules, {
      id,
      name: contentType === "announcement" ? saved?.title ?? "Scheduled announcement" : "New scheduled board",
      target: displayFilter,
      boardId: state.boardPrograms[0]?.id ?? "board-classic",
      contentType,
      announcementId: contentType === "announcement" ? saved?.id : undefined,
      days: slot ? [slot.date.getDay()] : [1, 2, 3, 4, 5],
      recurrence: slot ? "once" : undefined,
      scheduleDate: slot ? toDateInputValue(slot.date) : undefined,
      startTime: minutesToTime(slot?.start ?? 540),
      endTime: minutesToTime(Math.min(1440, (slot?.start ?? 540) + 60)),
      color: contentType === "announcement" ? "#b45a78" : "#4f63cf",
      active: true
    }] }));
    setSelectedId(id);
  };
  const entriesForDate = (date: Date) => filtered.filter((entry) => entryOccursOnDate(entry, date)).sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const conflictFor = (entry: ScheduleEntry, date: Date) => entry.active && filtered.some((candidate) =>
    candidate.id !== entry.id && candidate.active && entryOccursOnDate(candidate, date)
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
    const entry = state.schedules.find((item) => item.id === drag.id);
    if (entry) {
      const patch: Partial<ScheduleEntry> = { startTime: minutesToTime(preview.start), endTime: minutesToTime(preview.end) };
      if (drag.mode === "move" && preview.dayDelta) {
        const sourceDate = dateFromInputValue(drag.sourceDate);
        const targetDate = addCalendarDays(sourceDate, preview.dayDelta);
        const sourceDay = sourceDate.getDay();
        patch.days = [...new Set([...entry.days.filter((day) => day !== sourceDay), targetDate.getDay()])];
        if (entry.recurrence === "once" || entry.scheduleDate) patch.scheduleDate = toDateInputValue(targetDate);
      }
      patchEntry(entry.id, patch);
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
      top: `${(visualStart / 60) * hourHeight}px`,
      height: `${Math.max(24, ((visualEnd - visualStart) / 60) * hourHeight)}px`,
      left: `calc(${(lane / laneCount) * 100}% + 2px)`,
      width: `calc(${100 / laneCount}% - 4px)`,
      transform: preview ? `translateX(${preview.dayDelta * ((document.querySelector(".week-columns")?.getBoundingClientRect().width ?? 700) / 7)}px)` : undefined,
      "--event-color": entry.color ?? "#5f55bd",
      zIndex: preview ? 9 : undefined
    } as React.CSSProperties;
  };
  const quickActions = (entry: ScheduleEntry) => <div className="schedule-quick-actions" aria-label={`Actions for ${entry.name}`}>
    <button type="button" title="Preview on display" onClick={(event) => { event.stopPropagation(); setPreviewEntry(entry); }}><Eye size={13} /></button>
    <button type="button" title="Edit" onClick={(event) => { event.stopPropagation(); openEditor(entry.id, event); }}><Pencil size={13} /></button>
    <button type="button" title="Duplicate" onClick={(event) => { event.stopPropagation(); duplicateEntry(entry); }}><Plus size={13} /></button>
    <button type="button" title={entry.active ? "Disable" : "Enable"} onClick={(event) => { event.stopPropagation(); patchEntry(entry.id, { active: !entry.active }); }}>{entry.active ? <Power size={13} /> : <Play size={13} />}</button>
    <button type="button" className="danger" title="Delete" onClick={(event) => { event.stopPropagation(); removeEntry(entry.id); }}><Trash2 size={13} /></button>
  </div>;
  const openEditorAt = (id: string, originX?: number, originY?: number) => {
    if (!compact && originX !== undefined && originY !== undefined) {
      const editorWidth = 352;
      const gap = 16;
      const x = originX + gap + editorWidth <= window.innerWidth - 8
        ? originX + gap
        : Math.max(8, originX - editorWidth - gap);
      setEditorPosition({ x, y: clamp(originY - 24, 70, Math.max(70, window.innerHeight - 150)) });
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
    const start = clamp(Math.round(((event.clientY - bounds.top) / hourHeight) * 4) * 15, 0, 1410);
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
        <label className="calendar-selector"><Monitor size={14} /><select aria-label="Display filter" value={displayFilter} onChange={(event) => setDisplayFilter(event.target.value as TargetScreen)}><option value="all">All displays</option>{Object.values(state.screens).map((screen) => <option key={screen.id} value={screen.id}>{screen.label}</option>)}</select></label>
        <button type="button" className="command-button secondary compact" onClick={() => addEntry("board")}><Plus size={15} /> Board</button>
        <button type="button" className="command-button primary compact" onClick={() => addEntry("announcement")}><Megaphone size={15} /> Announcement</button>
      </div>
    </header>
    <div className="schedule-status-strip">
      <div className={`schedule-live-summary${liveEntries.length ? " active" : ""}`}><Radio size={14} /><span>{liveEntries.length ? "Live now" : "Nothing live now"}</span>{liveEntries.slice(0, 2).map((entry) => <button key={entry.id} onClick={() => setSelectedId(entry.id)}>{entry.name}</button>)}</div>
      <div className="schedule-next-summary"><Clock3 size={14} /><span>Next up</span>{nextEntry ? <button onClick={() => setSelectedId(nextEntry.id)}><strong>{nextEntry.startTime}</strong> {nextEntry.name}</button> : <small>No more events today</small>}</div>
      <div className="schedule-type-legend"><span><i className="board" /> Donor board</span><span><i className="announcement" /> Announcement</span><span><AlertTriangle size={12} /> Conflict</span></div>
    </div>
    <div className={`schedule-view-container ${visibleMode}`}>
      {visibleMode === "week" && <div className="week-calendar schedule-week" style={{ "--calendar-hour": `${hourHeight}px` } as React.CSSProperties}>
        <div className="week-header"><div />{dayLabels.map((label, index) => { const date = addCalendarDays(weekStart, index); return <div className={isSameCalendarDate(date, now) ? "today" : ""} key={label}><span>{label.slice(0, 3)}</span><strong>{date.getDate()}</strong></div>; })}</div>
        <div className="week-scroll" ref={weekScrollRef}><div className="time-gutter">{hours.map((hour) => <span key={hour} style={{ top: `${hour * hourHeight}px` }}>{formatHour(hour)}</span>)}</div><div className="week-columns">
          {dayLabels.map((label, index) => { const date = addCalendarDays(weekStart, index); const entries = entriesForDate(date); const today = isSameCalendarDate(date, now); return <div className={`week-day-column${today ? " is-today" : ""}`} key={label} onContextMenu={(event) => openCalendarContextMenu(event, date)}>{hours.map((hour) => <i key={hour} style={{ top: `${hour * hourHeight}px` }} />)}{today && <div className="calendar-now-line" style={{ top: `${(nowMinutes / 60) * hourHeight}px` }}><span>Now</span></div>}{entries.map((entry) => {
            const lane = scheduleLane(entry, entries);
            const conflict = conflictFor(entry, date);
            const live = today && entry.active && timeToMinutes(entry.startTime) <= nowMinutes && timeToMinutes(entry.endTime) > nowMinutes;
            const offline = displayIsOffline(entry);
            return <button type="button" key={entry.id} className={`calendar-event layer-${entry.contentType ?? "board"}${entry.active ? "" : " disabled"}${offline ? " display-offline" : ""}${conflict ? " conflict" : ""}${live ? " live" : ""}${selectedId === entry.id ? " selected" : ""}${dragPreview?.id === entry.id ? " dragging" : ""}`} style={eventStyle(entry, date, lane.index, lane.count)} onClick={(event) => openEditor(entry.id, event)} onContextMenu={(event) => openContextMenu(event, entry)} onPointerDown={(event) => beginDrag(event, entry, date, "move")} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} aria-label={`${entry.name}, ${entry.startTime} to ${entry.endTime}${offline ? ", target display offline" : ""}`} title="Drag to move. Drag the top or bottom edge to resize.">
              <span className="calendar-resize-handle top" onPointerDown={(event) => beginDrag(event, entry, date, "resize-start")} />
              <strong>{entry.contentType === "announcement" ? <Megaphone size={11} /> : <Monitor size={11} />}{entry.name}{conflict && <AlertTriangle size={10} />}</strong><span>{minutesToTime(dragPreview?.id === entry.id ? dragPreview.start : timeToMinutes(entry.startTime))}–{minutesToTime(dragPreview?.id === entry.id ? dragPreview.end : timeToMinutes(entry.endTime))}</span><small>{offline ? "Display offline" : live ? "Live now" : targetOptionLabels(state)[entry.target]}</small>
              <span className="calendar-resize-handle bottom" onPointerDown={(event) => beginDrag(event, entry, date, "resize-end")} />
            </button>;
          })}</div>; })}
        </div></div>
      </div>}
      {visibleMode === "month" && <div className="month-calendar"><div className="month-weekdays">{dayLabels.map((label) => <span key={label}>{label.slice(0, 3)}</span>)}</div><div className="month-grid">{monthDates.map((date) => { const entries = entriesForDate(date); return <section key={toDateInputValue(date)} className={`month-day${date.getMonth() !== anchorDate.getMonth() ? " outside" : ""}${isSameCalendarDate(date, now) ? " today" : ""}`}><button type="button" className="month-day-number" onClick={() => { setAnchorDate(date); setViewMode("agenda"); }}>{date.getDate()}</button><div className="month-events">{entries.slice(0, 3).map((entry) => { const conflict = conflictFor(entry, date); const offline = displayIsOffline(entry); return <button type="button" key={entry.id} className={`month-event layer-${entry.contentType ?? "board"}${entry.active ? "" : " disabled"}${offline ? " display-offline" : ""}${conflict ? " conflict" : ""}`} aria-label={`${entry.name}${offline ? ", target display offline" : ""}`} onClick={(event) => openEditor(entry.id, event)}><i style={{ background: entry.color ?? "#5f55bd" }} /><span>{entry.startTime}</span><strong>{entry.name}</strong>{offline ? <WifiOff size={10} /> : conflict && <AlertTriangle size={10} />}</button>; })}{entries.length > 3 && <button type="button" className="month-more" onClick={() => { setAnchorDate(date); setViewMode("agenda"); }}>+{entries.length - 3} more</button>}</div></section>; })}</div></div>}
      {visibleMode === "agenda" && <div className="agenda-calendar">{agendaDates.map((date) => { const entries = entriesForDate(date); return <section className={`agenda-day${isSameCalendarDate(date, now) ? " today" : ""}`} key={toDateInputValue(date)}><header><div><span>{date.toLocaleDateString([], { weekday: "short" })}</span><strong>{date.getDate()}</strong></div><p>{date.toLocaleDateString([], { month: "long", year: "numeric" })}</p></header><div className="agenda-events">{entries.length ? entries.map((entry) => { const conflict = conflictFor(entry, date); const offline = displayIsOffline(entry); const live = !offline && isSameCalendarDate(date, now) && entry.active && timeToMinutes(entry.startTime) <= nowMinutes && timeToMinutes(entry.endTime) > nowMinutes; return <article key={entry.id} className={`agenda-event layer-${entry.contentType ?? "board"}${entry.active ? "" : " disabled"}${offline ? " display-offline" : ""}${conflict ? " conflict" : ""}${live ? " live" : ""}`} aria-label={`${entry.name}${offline ? ", target display offline" : ""}`} onClick={(event) => openEditor(entry.id, event)}><div className="agenda-event-time"><strong>{entry.startTime}</strong><span>{entry.endTime}</span></div><i style={{ background: entry.color ?? "#5f55bd" }} /><div className="agenda-event-copy"><strong>{entry.contentType === "announcement" ? <Megaphone size={14} /> : <Monitor size={14} />}{entry.name}</strong><span>{targetOptionLabels(state)[entry.target]} · {entry.contentType === "announcement" ? "Announcement" : "Donor board"}{live ? " · Live now" : ""}</span>{offline ? <small><WifiOff size={12} /> Target display offline</small> : conflict && <small><AlertTriangle size={12} /> Conflicts on this display</small>}</div>{quickActions(entry)}</article>; }) : <p className="agenda-empty">No scheduled content</p>}</div></section>; })}</div>}
    </div>
    {selected && createPortal(<aside className="schedule-event-editor" style={compact ? undefined : { left: editorPosition.x, top: editorPosition.y }} role="dialog" aria-modal="false" aria-labelledby="schedule-event-editor-title">
      <header className="schedule-event-editor-header" onPointerDown={(event) => { if (compact || (event.target as Element).closest("button")) return; editorDragRef.current = { pointerX: event.clientX, pointerY: event.clientY, ...editorPosition }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const drag = editorDragRef.current; if (!drag) return; setEditorPosition({ x: clamp(drag.x + event.clientX - drag.pointerX, 8, Math.max(8, window.innerWidth - 360)), y: clamp(drag.y + event.clientY - drag.pointerY, 70, Math.max(70, window.innerHeight - 150)) }); }} onPointerUp={() => { editorDragRef.current = null; }} onPointerCancel={() => { editorDragRef.current = null; }}><div><p className="eyebrow">Schedule item · drag to move</p><h2 id="schedule-event-editor-title">Edit event</h2></div><button type="button" className="icon-button" title="Close editor" onClick={() => setSelectedId(null)}><X size={17} /></button></header>
      <div className="schedule-event-editor-body">{quickActions(selected)}<LabeledInput label="Name" info="Event label shown in the calendar." value={selected.name} onChange={(name) => patchEntry(selected.id, { name })} /><div className="two-col"><label className="field"><span>Starts</span><input type="time" value={selected.startTime} onChange={(event) => patchEntry(selected.id, { startTime: event.target.value })} /></label><label className="field"><span>Ends</span><input type="time" value={selected.endTime} onChange={(event) => patchEntry(selected.id, { endTime: event.target.value })} /></label></div><LabeledSelect label="Content" info="Choose the scheduled content type." value={selected.contentType ?? "board"} options={["board", "announcement"]} optionLabels={{ board: "Donor board", announcement: "Saved announcement" }} onChange={(value) => patchEntry(selected.id, { contentType: value as "board" | "announcement", announcementId: value === "announcement" ? selected.announcementId ?? state.savedAnnouncements[0]?.id : undefined })} />
        {selected.contentType === "announcement" ? state.savedAnnouncements.length ? <><LabeledSelect label="Announcement" info="Saved announcement to broadcast." value={selected.announcementId ?? state.savedAnnouncements[0].id} options={state.savedAnnouncements.map((item) => item.id)} optionLabels={Object.fromEntries(state.savedAnnouncements.map((item) => [item.id, item.title || "Untitled announcement"]))} onChange={(announcementId) => { const item = state.savedAnnouncements.find((candidate) => candidate.id === announcementId); patchEntry(selected.id, { announcementId, name: item?.title ?? selected.name }); }} /><button type="button" className="command-button secondary compact" onClick={() => selected.announcementId && onEditAnnouncement(selected.announcementId)}><Pencil size={14} /> Edit announcement</button></> : <p className="field-note">Create a saved announcement before scheduling one.</p> : <LabeledSelect label="Board" info="Donor board shown during the event." value={selected.boardId} options={state.boardPrograms.map((program) => program.id)} optionLabels={Object.fromEntries(state.boardPrograms.map((program) => [program.id, program.name]))} onChange={(boardId) => patchEntry(selected.id, { boardId })} />}
        <LabeledSelect label="Display" info="Display targeted by this event." value={selected.target} options={targetOptions(state)} optionLabels={targetOptionLabels(state)} onChange={(target) => { const nextTarget = target as TargetScreen; patchEntry(selected.id, { target: nextTarget }); if (nextTarget !== "all") setDisplayFilter(nextTarget); }} /><div className="schedule-color-row"><label className="field"><span>Calendar color</span><input type="color" value={selected.color ?? "#5f55bd"} onChange={(event) => patchEntry(selected.id, { color: event.target.value })} /></label>{selected.contentType !== "announcement" && <button type="button" className="command-button secondary compact" onClick={() => onEditDisplay(selected.target)}><Palette size={14} /> Edit display</button>}</div><div className="field"><span>Repeats</span><div className="schedule-days">{dayLabels.map((label, index) => { const day = (index + 1) % 7; return <button type="button" className={selected.days.includes(day) ? "selected" : ""} key={label} onClick={() => patchEntry(selected.id, { days: selected.days.includes(day) ? selected.days.filter((value) => value !== day) : [...selected.days, day] })}>{label.slice(0, 1)}</button>; })}</div></div><label className="switch-row"><input type="checkbox" checked={selected.active} onChange={(event) => patchEntry(selected.id, { active: event.target.checked })} /><span>Active on displays</span></label>
      </div>
    </aside>, document.body)}
    {contextMenu && createPortal(<div className="calendar-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()} role="menu">{contextMenu.id ? (() => { const entry = state.schedules.find((item) => item.id === contextMenu.id); return entry ? <><button type="button" onClick={() => { setSelectedId(entry.id); setContextMenu(null); }}><Pencil size={14} /> Edit event</button><button type="button" onClick={() => { setPreviewEntry(entry); setContextMenu(null); }}><Eye size={14} /> Preview on display</button>{entry.contentType === "announcement" ? <button type="button" disabled={!entry.announcementId} onClick={() => { if (entry.announcementId) onEditAnnouncement(entry.announcementId); setContextMenu(null); }}><Megaphone size={14} /> Edit announcement</button> : <button type="button" onClick={() => { onEditDisplay(entry.target); setContextMenu(null); }}><Palette size={14} /> Edit display</button>}<button type="button" onClick={() => { duplicateEntry(entry); setContextMenu(null); }}><Plus size={14} /> Duplicate</button><button type="button" className="danger" onClick={() => { removeEntry(entry.id); setContextMenu(null); }}><Trash2 size={14} /> Delete</button></> : null; })() : <><button type="button" onClick={() => { if (contextMenu.date !== undefined && contextMenu.start !== undefined) addEntry("board", { date: contextMenu.date, start: contextMenu.start }); setContextMenu(null); }}><Plus size={14} /> Add board here</button><button type="button" onClick={() => { if (contextMenu.date !== undefined && contextMenu.start !== undefined) addEntry("announcement", { date: contextMenu.date, start: contextMenu.start }); setContextMenu(null); }}><Megaphone size={14} /> Add announcement here</button></>}</div>, document.body)}
    {previewEntry && (() => { const screenId = previewEntry.target === "all" ? (displayFilter === "all" ? Object.keys(state.screens)[0] : displayFilter) : previewEntry.target; const screen = state.screens[screenId]; const savedAnnouncement = previewEntry.contentType === "announcement" ? state.savedAnnouncements.find((item) => item.id === previewEntry.announcementId) : undefined; const announcement = savedAnnouncement ? { ...savedAnnouncement, active: true } : undefined; return screen && createPortal(<div className="modal-backdrop schedule-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewEntry(null); }}><section className="editor-modal schedule-display-preview" role="dialog" aria-modal="true" aria-labelledby="schedule-preview-title"><div className="editor-modal-head"><div><p className="eyebrow">Scheduled display preview</p><h2 id="schedule-preview-title">{screen.label} · {previewEntry.startTime}–{previewEntry.endTime}</h2></div><button type="button" className="icon-button" title="Close preview" onClick={() => setPreviewEntry(null)}><X size={18} /></button></div><div className={`schedule-preview-surface ${orientationClass(screen)}`}><BabylonDonorWall state={state} screenId={screen.id} fitToScreen viewMode="2d" previewProgramId={previewEntry.contentType === "announcement" ? undefined : previewEntry.boardId} announcementActive={Boolean(announcement)} announcementCharacter={announcement?.character} announcementCharacterAsset={announcement} />{announcement && <FixedAnnouncementComposition screen={screen} announcement={announcement} startedAt={`${toDateInputValue(anchorDate)}T${previewEntry.startTime}:00`} />}</div><p className="field-note">Previewing the content scheduled for this event on {screen.label}.</p></section></div>, document.body); })()}
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
        target: "all",
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
            <LabeledSelect label="Display" info="Target display for this event." value={selected.target} options={targetOptions(state)} optionLabels={targetOptionLabels(state)} onChange={(value) => patchEntry(selected.id, { target: value as TargetScreen })} />
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
  const overlaps = entries
    .filter((candidate) => timeToMinutes(candidate.startTime) < timeToMinutes(entry.endTime) && timeToMinutes(candidate.endTime) > timeToMinutes(entry.startTime))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime) || a.id.localeCompare(b.id));
  return { index: Math.max(0, overlaps.findIndex((candidate) => candidate.id === entry.id)), count: Math.max(1, overlaps.length) };
}

function timeToMinutes(value: string) { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }
function formatHour(hour: number) { return `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? "PM" : "AM"}`; }
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
    </section>
  );
}

function VocabularyEditor({ title, description, values, onChange }: { title: string; description: string; values: string[]; onChange: (values: string[], previous?: string, replacement?: string) => void }) {
  const [newValue, setNewValue] = useState("");
  const add = () => { const clean = newValue.trim(); if (!clean || values.includes(clean)) return; onChange([...values, clean]); setNewValue(""); };
  return (
    <section className="vocabulary-panel">
      <div className="vocabulary-panel-head">
        <div>
          <h2>{title}</h2>
          <span>{description}</span>
        </div>
        <b>{values.length}</b>
      </div>
      <div className="vocabulary-list">
        {values.map((value, index) => (
          <div className="vocabulary-row" key={`${index}-${value}`}>
            <input value={value} aria-label={`${title} name`} onChange={(event) => { const replacement = event.target.value; onChange(values.map((item, itemIndex) => itemIndex === index ? replacement : item), value, replacement); }} />
            <button type="button" className="icon-button danger-icon" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index), value)} disabled={values.length <= 1} title={`Remove ${value}`}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div className="vocabulary-add">
        <input value={newValue} onChange={(event) => setNewValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder={`New ${title.toLowerCase().replace(/s$/, "")}`} />
        <button type="button" className="command-button primary" onClick={add}><Plus size={14} /> Add</button>
      </div>
    </section>
  );
}

function RevisionsView({ state, updateState }: { state: LanternState; updateState: (updater: (current: LanternState) => LanternState) => void }) {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<"all" | "code" | "publish">("all");
  const pageSize = 5;
  const entries = [
    ...codeChangelog.map((entry) => ({ ...entry, kind: "code" as const })),
    ...state.revisions.map((revision) => ({
      id: `BOARD-${String(revision.id).padStart(4, "0")}`,
      kind: "publish" as const,
      title: `Published board revision ${revision.id}`,
      summary: revision.note,
      author: revision.author,
      createdAt: revision.publishedAt,
      areas: ["Board content", "Display package"],
      files: [] as string[],
      tests: revision.portraitReady && revision.landscapeReady ? "Portrait and landscape displays ready" : "Display verification needed",
      revisionId: revision.id
    }))
  ];
  const filteredEntries = entries.filter((entry) => filter === "all" || entry.kind === filter);
  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const pageItems = filteredEntries.slice(page * pageSize, page * pageSize + pageSize);
  useEffect(() => setPage(0), [filter]);
  const restore = (revisionId: number) => {
    updateState((current) => ({
      ...current,
      revision: revisionId,
      publishedAt: new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      screens: Object.fromEntries(Object.entries(current.screens).map(([id, screen]) => [id, { ...screen, currentRevision: revisionId }])) as LanternState["screens"]
    }));
  };

  return (
    <section className="revision-workspace">
      <div className="revision-hero"><div><p className="eyebrow">Version control</p><h2>Project changelog</h2><span>Code changes, reasoning, verification, and restorable board publishes in one history.</span><div className="revision-filters">{(["all", "code", "publish"] as const).map((value) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{value === "all" ? "All activity" : value === "code" ? "Code changes" : "Board publishes"}</button>)}</div></div><div className="revision-orb"><History size={24} /><strong>{entries.length}</strong><small>Changes</small></div></div>
      <div className="revision-list github-log">
      {pageItems.map((revision) => (
        <article className="revision-row changelog-row" key={`${revision.kind}-${revision.id}`}>
          <div className={`change-kind-icon ${revision.kind}`}>{revision.kind === "code" ? "<>" : <History size={15} />}</div>
          <div className="change-main">
            <div className="change-title"><strong>{revision.title}</strong><code>{revision.id}</code><span className={`change-badge ${revision.kind}`}>{revision.kind === "code" ? "Code" : "Publish"}</span></div>
            <p>{revision.summary}</p>
            <div className="change-meta"><span>{revision.author}</span><span>{revision.createdAt}</span><span>{revision.tests}</span></div>
            <div className="change-details">
              {revision.areas.map((area) => <span key={area}>{area}</span>)}
              {revision.files.slice(0, 3).map((file) => <code key={file}>{file}</code>)}
            </div>
          </div>
          {revision.kind === "publish" ? <button className="command-button secondary" onClick={() => restore(revision.revisionId)}>
            <RotateCcw size={18} />
            Restore
          </button> : <span className="change-verified"><CheckCircle2 size={15} /> Recorded</span>}
        </article>
      ))}
      </div>
      <div className="collection-footer"><span>{filteredEntries.length} changelog entries · {codeChangelog.length} code · {state.revisions.length} published</span><Pager page={page} pageCount={pageCount} onChange={setPage} /></div>
    </section>
  );
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
      .then((shared) => hydrateLanternMedia(shared ?? loadLanternState()))
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
  const identifyTimerRef = useRef<number | null>(null);
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
      .then((shared) => hydrateLanternMedia(shared ?? loadLanternState()))
      .then((hydrated) => mounted && setState(hydrated));
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
    const channel = createHostChannel((message) => {
      if (message.type === "state-update") setState(message.state);
      if (message.type === "identify-screen" && message.screenId === screenId) {
        showIdentity();
      }
    });

    const heartbeat = () => {
      channel.post({
        type: "display-heartbeat",
        screenId,
        fps,
        status: state.live.active && targetIncludes(state.live.target, screenId) ? "live" : "ready",
        timestamp: new Date().toISOString()
      });
    };

    const timer = window.setInterval(heartbeat, 1600);
    heartbeat();
    return () => {
      window.clearInterval(timer);
      channel.close();
    };
  }, [fps, screenId, showIdentity, state.live.active, state.live.target]);

  const showAnnouncement = state.announcement.active && (state.announcement.targets?.length ? state.announcement.targets.includes(screenId) : targetIncludes(state.announcement.target, screenId));
  const showLive = state.live.active && targetIncludes(state.live.target, screenId);
  const scheduledAnnouncement = showAnnouncement ? null : resolveScheduledAnnouncement(state, screenId, scheduleNow);
  const scheduledMessage = activeScheduleMessage(state, screenId, scheduleNow);

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
      className={`display-shell ${orientationClass(screen)}${fitToScreen ? " fit-board" : ""}`}
      onClick={() => setDisplayMenu(null)}
      onContextMenu={(event) => {
        event.preventDefault();
        setDisplayMenu({
          x: Math.max(8, Math.min(event.clientX, window.innerWidth - 250)),
          y: Math.max(8, Math.min(event.clientY, window.innerHeight - 230))
        });
      }}
    >
      <BabylonDonorWall
        state={state}
        screenId={screenId}
        onFps={setFps}
        fitToScreen={fitToScreen}
        viewMode="2d"
        announcementCharacter={(showAnnouncement ? state.announcement : scheduledAnnouncement?.announcement)?.character ?? "off"}
        announcementCharacterAsset={showAnnouncement ? state.announcement : scheduledAnnouncement?.announcement}
        announcementActive={Boolean(showAnnouncement || scheduledAnnouncement)}
      />
      {showAnnouncement && (
        <FixedAnnouncementComposition screen={screen} announcement={state.announcement} startedAt={state.announcement.startedAt} />
      )}
      {!showAnnouncement && scheduledAnnouncement && (
        <FixedAnnouncementComposition screen={screen} announcement={scheduledAnnouncement.announcement} startedAt={scheduledAnnouncement.startedAt} />
      )}
      {!showAnnouncement && !scheduledAnnouncement && scheduledMessage && (
        <div className="announcement-overlay ribbon">
          <strong>{scheduledMessage.name}</strong>
          <span>{scheduledMessage.message}</span>
        </div>
      )}
      {showLive && (
        <div className={`live-overlay mask-${state.live.frame.maskShape ?? "rectangle"}`} style={{ left: `${state.live.frame.x}%`, top: `${state.live.frame.y}%`, width: `${state.live.frame.width}%`, height: `${state.live.frame.height}%`, clipPath: state.live.frame.maskShape === "polygon" ? livePolygonClip(state.live.frame) : undefined, transform: `rotate(${state.live.frame.rotation ?? 0}deg) scale(${state.live.frame.mirrorX ? -1 : 1}, ${state.live.frame.mirrorY ? -1 : 1})` }}>
          <ChromaVideo stream={stream} chromaKey={state.live.chromaKey} effects={state.live.effects} crop={state.live.frame.crop} />
          <div className="lower-third">
            <strong>{state.live.title}</strong>
            <span>{state.live.lowerThird}</span>
          </div>
          {!stream && <div className="video-waiting">Waiting for local video signal</div>}
        </div>
      )}
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
  max = 100
}: {
  label: string;
  info: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="field slider-field">
      <span>
        {label}
        <InfoDot text={info} />
      </span>
      <b>{Number.isInteger(value) ? value : value.toFixed(1)}</b>
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
  onChange
}: {
  label: string;
  info: string;
  value: string;
  options: string[];
  optionLabels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>
        {label}
        <InfoDot text={info} />
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? labelForTarget(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function LabeledInput({ label, info, value, onChange }: { label: string; info: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>
        {label}
        <InfoDot text={info} />
      </span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
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

function targetOptionLabels(state: LanternState) {
  return Object.fromEntries(targetOptions(state).map((target) => [target, target === "all" ? "All displays" : state.screens[target]?.label ?? target]));
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
  if (screen.donorRosterConfigured) return (screen.donorIds ?? []).filter((id) => state.donors.some((donor) => donor.id === id));
  if (screen.donorIds?.length) return screen.donorIds.filter((id) => state.donors.some((donor) => donor.id === id));
  return state.donors.filter((donor) => donor.active && donor.displayIds?.includes(screen.id)).map((donor) => donor.id);
}

function donorSubtextVisibleForDisplay(screen: DisplayProfile, donorId: string) {
  return screen.donorSubtextVisibility?.[donorId] ?? screen.showSubtext ?? false;
}

function titleFor(view: View) {
  switch (view) {
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
    case "screens":
      return "Displays";
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

function scheduleMatchesDate(entry: ScheduleEntry, now: Date) {
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (entry.recurrence === "once" && entry.scheduleDate) return entry.scheduleDate === localDate;
  if (entry.scheduleDate && localDate < entry.scheduleDate) return false;
  if (entry.scheduleEndDate && localDate > entry.scheduleEndDate) return false;
  return entry.days.includes(now.getDay());
}

function resolveActiveBoardProgram(state: LanternState, screenId: ScreenId, now = new Date()) {
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const scheduled = state.schedules?.find((entry) =>
    entry.contentType !== "announcement"
    && entry.active
    && scheduleMatchesDate(entry, now)
    && (entry.target === "all" || entry.target === screenId)
    && time >= entry.startTime
    && time < entry.endTime
  );
  if (scheduled) {
    const program = state.boardPrograms.find((candidate) => candidate.id === scheduled.boardId && candidate.active);
    if (program) return program;
  }
  const assignedId = state.screens[screenId]?.boardProgramId;
  return state.boardPrograms.find((candidate) => candidate.id === assignedId)
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

function activeScheduleMessage(state: LanternState, screenId: ScreenId, now = new Date()) {
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return state.schedules?.find((entry) => entry.contentType !== "announcement" && entry.active && entry.message && scheduleMatchesDate(entry, now) && (entry.target === "all" || entry.target === screenId) && time >= entry.startTime && time < entry.endTime);
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
