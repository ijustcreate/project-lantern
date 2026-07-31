import { initialState } from "../sampleData";
import type { HostMessage, LanternState, ScreenId, TargetScreen } from "../types";

export const LANTERN_CHANNEL = "project-lantern-host-v1";
export const LANTERN_STORAGE_KEY = "project-lantern-state-v1";
const DEMO_DATA_VERSION_KEY = "project-lantern-demo-data-version";
const DEMO_DATA_VERSION = "5";
const LANTERN_MEDIA_DB = "project-lantern-media-v1";
const LANTERN_MEDIA_STORE = "assets";
const configuredWriteEndpoint = (import.meta.env.VITE_LANTERN_SERVICE_ENDPOINT as string | undefined)?.trim()
  || (import.meta.env.VITE_LANTERN_BUG_ENDPOINT as string | undefined)?.trim()
  || "";
const configuredReadEndpoint = (import.meta.env.VITE_LANTERN_READ_ENDPOINT as string | undefined)?.trim()
  || configuredWriteEndpoint;
const LANTERN_READ_SERVICE_ROOT = configuredReadEndpoint.replace(/\/bugs\/?$/, "");
const LANTERN_WRITE_SERVICE_ROOT = import.meta.env.DEV ? "" : configuredWriteEndpoint.replace(/\/bugs\/?$/, "");
let sharedPersistenceEnabled = false;
let sharedSaveTimer: number | undefined;

type Listener = (message: HostMessage) => void;

export function loadLanternState(): LanternState {
  const stored = window.localStorage.getItem(LANTERN_STORAGE_KEY);
  if (!stored) {
    return normalizeState(initialState);
  }

  try {
    const saved = { ...initialState, ...JSON.parse(stored) } as LanternState;
    if (window.localStorage.getItem(DEMO_DATA_VERSION_KEY) !== DEMO_DATA_VERSION) {
      const savedPrograms = saved.boardPrograms?.length ? saved.boardPrograms : initialState.boardPrograms;
      const portraitProgram = savedPrograms.find((program) => program.orientation === "Portrait") ?? savedPrograms[0];
      const landscapeProgram = savedPrograms.find((program) => program.orientation === "Landscape") ?? savedPrograms[1] ?? savedPrograms[0];
      const retainedSchedules = (saved.schedules ?? []).filter((entry) => !["schedule-first-half", "schedule-second-half", "schedule-portrait-hours", "schedule-portrait-board", "schedule-landscape-board"].includes(entry.id));
      const boardSchedules = [
        { ...initialState.schedules.find((entry) => entry.id === "schedule-portrait-board")!, boardId: portraitProgram.id },
        { ...initialState.schedules.find((entry) => entry.id === "schedule-landscape-board")!, boardId: landscapeProgram.id }
      ];
      const migrated = normalizeState({
        ...saved,
        donors: initialState.donors,
        donorGroups: initialState.donorGroups,
        recognitionSettings: initialState.recognitionSettings,
        board: { ...saved.board, storyImageUrl: "" },
        boardPrograms: savedPrograms,
        schedules: [...boardSchedules, ...retainedSchedules],
        savedAnnouncements: saved.savedAnnouncements?.length ? saved.savedAnnouncements : initialState.savedAnnouncements,
        screens: Object.fromEntries(Object.entries(saved.screens).map(([id, screen]) => [id, {
          ...screen,
          orientation: id === "display-1" ? "Portrait" : screen.orientation,
          resolution: id === "display-1" ? "1080 x 1920" : screen.resolution,
          boardProgramId: id === "display-1" ? "board-classic" : screen.boardProgramId,
          style: screen.style === "image" ? "donor-wall" : screen.style,
          backgroundMode: screen.style === "image" ? "image" : screen.backgroundMode,
          backgroundImage: undefined,
          backgroundMediaId: undefined,
          backgroundMediaType: undefined,
          donorIds: initialState.boardPrograms[0].donorIds,
          donorRosterConfigured: true
        }])) as LanternState["screens"]
      });
      window.localStorage.setItem(DEMO_DATA_VERSION_KEY, DEMO_DATA_VERSION);
      saveLanternState(migrated);
      void deleteAllLanternMedia();
      return migrated;
    }
    return normalizeState(saved);
  } catch {
    return normalizeState(initialState);
  }
}

function deleteAllLanternMedia() {
  return new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(LANTERN_MEDIA_DB);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

export function saveLanternState(state: LanternState) {
  try {
    const serializable = {
      ...state,
      screens: Object.fromEntries(Object.entries(state.screens).map(([id, screen]) => [
        id,
        screen.backgroundMediaId && screen.backgroundImage?.startsWith("blob:") ? { ...screen, backgroundImage: undefined } : screen
      ]))
    };
    window.localStorage.setItem(LANTERN_STORAGE_KEY, JSON.stringify(serializable));
  } catch (error) {
    console.warn("Project Lantern could not persist the current media asset locally.", error);
  }
}

function serializableSharedState(state: LanternState): LanternState {
  return {
    ...state,
    screens: Object.fromEntries(Object.entries(state.screens).map(([id, screen]) => [
      id,
      screen.backgroundImage?.startsWith("blob:") ? { ...screen, backgroundImage: undefined } : screen
    ])) as LanternState["screens"]
  };
}

export async function loadSharedLanternState(): Promise<LanternState | null> {
  if (!LANTERN_READ_SERVICE_ROOT) return null;
  const response = await fetch(`${LANTERN_READ_SERVICE_ROOT}/state`, { headers: { "Accept": "application/json" } });
  if (!response.ok) throw new Error(`Shared project service returned ${response.status}`);
  const body = await response.json() as { state?: LanternState | null };
  return body.state ? normalizeState({ ...initialState, ...body.state }) : null;
}

export function enableSharedStatePersistence() {
  if (!LANTERN_WRITE_SERVICE_ROOT) return;
  sharedPersistenceEnabled = true;
}

function queueSharedStateSave(state: LanternState) {
  if (!sharedPersistenceEnabled || !LANTERN_WRITE_SERVICE_ROOT) return;
  window.clearTimeout(sharedSaveTimer);
  sharedSaveTimer = window.setTimeout(() => {
    void saveSharedLanternState(state).catch(() => undefined);
  }, 450);
}

export async function saveSharedLanternState(state: LanternState) {
  if (!LANTERN_WRITE_SERVICE_ROOT) throw new Error("Shared project storage is read-only in local development");
  window.clearTimeout(sharedSaveTimer);
  const response = await fetch(`${LANTERN_WRITE_SERVICE_ROOT}/state`, {
    method: "PUT",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ state: serializableSharedState(state) })
  });
  if (!response.ok) throw new Error(`Shared project service returned ${response.status}`);
}

export async function uploadLanternAsset(file: File) {
  if (!LANTERN_WRITE_SERVICE_ROOT) throw new Error("Shared image storage is read-only in local development");
  const response = await fetch(`${LANTERN_WRITE_SERVICE_ROOT}/assets`, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": file.type },
    body: file
  });
  const body = await response.json() as { url?: string; error?: string };
  if (!response.ok || !body.url) throw new Error(body.error ?? `Image service returned ${response.status}`);
  return body.url;
}

export function canWriteSharedLanternState() {
  return Boolean(LANTERN_WRITE_SERVICE_ROOT);
}

async function shareImageUrl(value: string | undefined, name: string) {
  if (!value?.startsWith("data:") && !value?.startsWith("blob:")) return value;
  try {
    const blob = await fetch(value).then((response) => response.blob());
    const extension = blob.type === "image/png" ? "png" : blob.type === "image/gif" ? "gif" : blob.type === "image/webp" ? "webp" : "jpg";
    return await uploadLanternAsset(new File([blob], `${name}.${extension}`, { type: blob.type }));
  } catch {
    return value;
  }
}

export async function shareLanternImages(state: LanternState): Promise<LanternState> {
  const boardPrograms = await Promise.all(state.boardPrograms.map(async (program) => ({
    ...program,
    panels: program.panels ? await Promise.all(program.panels.map(async (panel) => ({
      ...panel,
      imageUrl: await shareImageUrl(panel.imageUrl, `${program.id}-${panel.id}`)
    }))) : program.panels
  })));
  const donors = await Promise.all(state.donors.map(async (donor) => ({
    ...donor,
    customIconImage: await shareImageUrl(donor.customIconImage, `${donor.id}-icon`)
  })));
  const savedAnnouncements = await Promise.all(state.savedAnnouncements.map(async (announcement) => ({
    ...announcement,
    imageUrl: await shareImageUrl(announcement.imageUrl, `${announcement.id}-image`)
  })));
  const screens = Object.fromEntries(await Promise.all(Object.entries(state.screens).map(async ([id, screen]) => {
    const backgroundImage = await shareImageUrl(screen.backgroundImage, `${id}-background`);
    return [id, {
      ...screen,
      backgroundImage,
      backgroundMediaId: backgroundImage?.startsWith("http") ? undefined : screen.backgroundMediaId
    }];
  }))) as LanternState["screens"];
  return {
    ...state,
    boardPrograms,
    donors,
    savedAnnouncements,
    screens,
    announcement: { ...state.announcement, imageUrl: await shareImageUrl(state.announcement.imageUrl, "active-announcement") },
    live: {
      ...state.live,
      backgroundImage: await shareImageUrl(state.live.backgroundImage, "live-composition-background"),
      effects: {
        ...state.live.effects,
        backgroundImage: await shareImageUrl(state.live.effects.backgroundImage, "live-background")
      }
    }
  };
}

export async function storeLanternMedia(file: File) {
  const id = `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const database = await openMediaDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(LANTERN_MEDIA_STORE, "readwrite");
    transaction.objectStore(LANTERN_MEDIA_STORE).put(file, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  return id;
}

export async function deleteLanternMedia(id?: string) {
  if (!id) return;
  const database = await openMediaDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(LANTERN_MEDIA_STORE, "readwrite");
    transaction.objectStore(LANTERN_MEDIA_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function hydrateLanternMedia(state: LanternState): Promise<LanternState> {
  const mediaScreens = Object.values(state.screens).filter((screen) => screen.backgroundMediaId && !screen.backgroundImage);
  if (!mediaScreens.length) return state;
  const database = await openMediaDatabase();
  const hydrated = await Promise.all(mediaScreens.map(async (screen) => {
    const mediaId = screen.backgroundMediaId as string;
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const transaction = database.transaction(LANTERN_MEDIA_STORE, "readonly");
      const request = transaction.objectStore(LANTERN_MEDIA_STORE).get(mediaId);
      request.onsuccess = () => resolve(request.result as Blob | undefined);
      request.onerror = () => reject(request.error);
    });
    return blob ? [screen.id, URL.createObjectURL(blob)] as const : null;
  }));
  database.close();
  const urls = new Map(hydrated.filter((item): item is readonly [string, string] => Boolean(item)));
  if (!urls.size) return state;
  return {
    ...state,
    screens: Object.fromEntries(Object.entries(state.screens).map(([id, screen]) => [id, urls.has(id) ? { ...screen, backgroundImage: urls.get(id) } : screen])) as LanternState["screens"]
  };
}

function openMediaDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LANTERN_MEDIA_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LANTERN_MEDIA_STORE)) request.result.createObjectStore(LANTERN_MEDIA_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createHostChannel(listener: Listener) {
  const channel = new BroadcastChannel(LANTERN_CHANNEL);
  channel.addEventListener("message", (event: MessageEvent<HostMessage>) => {
    listener(event.data);
  });

  return {
    post(message: HostMessage) {
      channel.postMessage(message);
    },
    close() {
      channel.close();
    }
  };
}

export function publishState(state: LanternState) {
  saveLanternState(state);
  queueSharedStateSave(state);
  const channel = new BroadcastChannel(LANTERN_CHANNEL);
  channel.postMessage({ type: "state-update", state } satisfies HostMessage);
  channel.close();
}

export function targetIncludes(target: TargetScreen, screenId: ScreenId) {
  return target === "all" || target === screenId;
}

export function nextRevision(state: LanternState, note: string): LanternState {
  const revision = state.revision + 1;
  const publishedAt = new Date().toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  return {
    ...state,
    revision,
    publishedAt,
    screens: Object.fromEntries(
      Object.entries(state.screens).map(([id, screen]) => [id, { ...screen, currentRevision: revision }])
    ) as LanternState["screens"],
    revisions: [
      {
        id: revision,
        note,
        author: "Lantern Host",
        publishedAt,
        portraitReady: true,
        landscapeReady: true
      },
      ...state.revisions.slice(0, 6)
    ]
  };
}

export function openBrowserDisplayWindows(screens = Object.values(loadLanternState().screens)) {
  const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href;

  screens.forEach((screen, index) => {
    const isPortrait = screen.orientation === "Portrait";
    window.open(
      `${appUrl}#/display/${screen.id}`,
      `lantern-${screen.id}`,
      `popup=yes,width=${isPortrait ? 540 : 1280},height=${isPortrait ? 920 : 760},left=${60 + index * 580},top=${40 + index * 30}`
    );
  });
}

export async function openDisplayWindows(screens = Object.values(loadLanternState().screens)) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_test_displays", {
      displays: screens.map((screen) => ({
        id: screen.id,
        label: screen.label,
        orientation: screen.orientation
      }))
    });
  } catch {
    openBrowserDisplayWindows(screens);
  }
}

export function fitWarnings(state: LanternState) {
  const activeDonors = state.donors.filter((donor) => donor.active);
  const warnings: string[] = [];

  Object.values(state.screens).forEach((screen) => {
    const capacity = screen.orientation === "Portrait"
      ? state.theme.letteringDepth > 70 ? 16 : 22
      : state.theme.letteringDepth > 70 ? 24 : 32;
    if (activeDonors.length > capacity) {
      warnings.push(`${screen.label} needs ${activeDonors.length - capacity} fewer active names at the required minimum size.`);
    }
  });

  return warnings;
}

export function normalizeState(state: LanternState): LanternState {
  const legacyScreens = state.screens as LanternState["screens"] & {
    portrait?: LanternState["screens"][string];
    landscape?: LanternState["screens"][string];
  };

  const defaultScreens = initialState.screens;
  const screens: LanternState["screens"] = {};

  if (legacyScreens["display-1"] || legacyScreens["display-2"]) {
    Object.entries(legacyScreens).forEach(([id, screen]) => {
      screens[id] = normalizeScreen(screen, defaultScreens[id] ?? defaultScreens["display-2"], id);
    });
  } else {
    screens["display-1"] = normalizeScreen(legacyScreens.portrait ?? defaultScreens["display-1"], defaultScreens["display-1"], "display-1");
    screens["display-2"] = normalizeScreen(legacyScreens.landscape ?? defaultScreens["display-2"], defaultScreens["display-2"], "display-2");
  }

  const chromaKey = { ...initialState.live.chromaKey, ...state.live?.chromaKey };
  const effects = { ...initialState.live.effects, ...state.live?.effects };
  // Background removal methods are alternatives. Older saved states could have
  // both enabled, which caused chroma keying to punch holes in an AI composite.
  if (chromaKey.enabled) effects.background = "original";

  return {
    ...initialState,
    ...state,
    board: {
      ...initialState.board,
      ...state.board,
      footerVisibility: {
        ...initialState.board.footerVisibility,
        ...state.board?.footerVisibility
      }
    },
    boardPrograms: (state.boardPrograms ?? initialState.boardPrograms).map((program) => ({
      ...program,
      orientation: program.orientation
        ?? Object.values(screens).find((screen) => screen.boardProgramId === program.id)?.orientation
        ?? initialState.boardPrograms.find((candidate) => candidate.id === program.id)?.orientation
        ?? "Portrait"
    })),
    schedules: (state.schedules ?? initialState.schedules).map((entry, index) => ({
      ...entry,
      contentType: entry.contentType ?? "board",
      color: entry.color ?? ["#5f55bd", "#218ba2", "#a95777", "#956330"][index % 4]
    })),
    savedAnnouncements: (state.savedAnnouncements?.length ? state.savedAnnouncements : initialState.savedAnnouncements).map((announcement) => ({
      ...announcement,
      character: announcement.character ?? "off",
      target: normalizeTarget(announcement.target)
    })),
    donors: (state.donors ?? initialState.donors).map((donor) => ({
      ...donor,
      tags: donor.tags ?? [],
      donationDate: donor.donationDate ?? donor.since,
      basicInfo: donor.basicInfo ?? donor.subtext ?? donor.note,
      expandedInfo: donor.expandedInfo ?? "",
      donations: donor.donations ?? (donor.amount ? [{ id: `${donor.id}-legacy-gift`, date: donor.donationDate ?? donor.since, amount: donor.amount, type: donor.donationType ?? "Cash", note: donor.note }] : []),
      donationType: donor.donationType ?? (donor.category === "Legacy" ? "Legacy" : donor.category === "Corporate" ? "Sponsorship" : "Cash"),
      amount: donor.amount ?? 0,
      // Older donor records predate per-display assignment and belonged to every screen.
      // An explicitly empty array now means the donor is intentionally shown nowhere.
      displayIds: donor.displayIds ?? Object.keys(screens),
      icon: donor.icon ?? "none",
      highlight: donor.highlight ?? "none",
      animation: donor.animation ?? "none"
    })),
    donorGroups: state.donorGroups ?? initialState.donorGroups,
    recognitionSettings: {
      tiers: state.recognitionSettings?.tiers?.length ? state.recognitionSettings.tiers : initialState.recognitionSettings.tiers,
      categories: state.recognitionSettings?.categories?.length ? state.recognitionSettings.categories : initialState.recognitionSettings.categories,
      tags: [...new Set([...(state.recognitionSettings?.tags ?? initialState.recognitionSettings.tags), ...(state.donors ?? initialState.donors).flatMap((donor) => donor.tags ?? [])])].sort(),
      appearance: ["dark", "light", "ocean", "warm", "contrast", "sparkle"].includes(state.recognitionSettings?.appearance ?? "")
        ? state.recognitionSettings.appearance
        : "dark"
    },
    announcement: {
      ...initialState.announcement,
      ...state.announcement,
      character: state.announcement?.character ?? "off",
      target: normalizeTarget(state.announcement?.target)
    },
    live: {
      ...initialState.live,
      ...state.live,
      source: state.live?.source ?? (state.live?.usingCamera ? "camera" : "demo"),
      frame: {
        ...initialState.live.frame,
        ...state.live?.frame,
        crop: { ...initialState.live.frame.crop, ...state.live?.frame?.crop }
      },
      chromaKey,
      effects,
      target: normalizeTarget(state.live?.target)
    },
    screens
  };
}

function normalizeScreen(
  screen: LanternState["screens"][string],
  fallback: LanternState["screens"][string],
  id: string
): LanternState["screens"][string] {
  return {
    ...fallback,
    ...screen,
    id,
    label: screen?.label?.startsWith("Entrance") || screen?.label?.startsWith("Main Gallery") ? fallback.label : screen?.label ?? fallback.label,
    style: screen?.style === "constellation" || screen?.style === "image" ? "donor-wall" : screen?.style ?? fallback.style,
    backgroundMode: screen?.backgroundMode ?? (screen?.style === "image" ? "image" : "board"),
    backgroundMediaType: screen?.backgroundMediaType ?? (screen?.backgroundImage?.startsWith("data:video/") ? "video" : screen?.backgroundImage ? "image" : undefined),
    backgroundMediaName: screen?.backgroundMediaName,
    backgroundMediaAnimated: screen?.backgroundMediaAnimated ?? false,
    backgroundCrop: { ...fallback.backgroundCrop, ...screen?.backgroundCrop, rotation: screen?.backgroundCrop?.rotation ?? 0 },
    layoutScale: screen?.layoutScale ?? fallback.layoutScale,
    brightness: screen?.brightness ?? fallback.brightness,
    enabled: screen?.enabled ?? true,
    donorIds: screen?.donorIds ?? [],
    donorRosterConfigured: screen?.donorRosterConfigured ?? Boolean(screen?.donorIds?.length),
    donorSubtextVisibility: screen?.donorSubtextVisibility ?? {},
    customHeading: screen?.customHeading ?? fallback.customHeading,
    customSubheading: screen?.customSubheading ?? fallback.customSubheading,
    fontFamily: screen?.fontFamily ?? fallback.fontFamily,
    nameSize: screen?.nameSize ?? fallback.nameSize,
    columns: screen?.columns ?? fallback.columns,
    donorScrollEnabled: screen?.donorScrollEnabled ?? false,
    donorScrollSpeed: Math.min(10, Math.max(1, screen?.donorScrollSpeed ?? 4)),
    showIcons: screen?.showIcons ?? false,
    showSubtext: screen?.showSubtext ?? false,
    roomVideoDeviceId: screen?.roomVideoDeviceId,
    roomAudioDeviceId: screen?.roomAudioDeviceId,
    roomAudioEnabled: screen?.roomAudioEnabled ?? true
  };
}

function normalizeTarget(target?: TargetScreen) {
  if (target === "both") {
    return "all";
  }
  if (target === "portrait") {
    return "display-1";
  }
  if (target === "landscape") {
    return "display-2";
  }
  return target ?? "display-2";
}
