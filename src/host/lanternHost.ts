import { BOARD_TEXT_CONTRAST_CONTENT_VERSION, brigadeAnnouncements, brigadeBlips, brigadeBoardPrograms, DONOR_ROSTER_BOARDS_CONTENT_VERSION, generousDonorBoardPrograms, initialState, legacyBoardPrograms, legacyDonors, LEGACY_DONOR_STARS_CONTENT_VERSION, LEGACY_DONOR_TAGS_CONTENT_VERSION, LEGACY_STAR_LAYER_CONTENT_VERSION, LEGACY_STAR_RECOVERY_CONTENT_VERSION, LANTERN_CONTENT_VERSION } from "../sampleData";
import { withBrigadeOpeningPayment } from "../donorDomain";
import { appendMissingPhase3Content, migratePhase3Schedules, phase3Announcements, PHASE3_CONTENT_VERSION } from "../phase3Schedule";
import type { Announcement, BoardDonorPresentation, BoardPanel, Donor, GivingProgram, HostMessage, LanternState, LiveSource, ScheduleEntry, ScreenId, TargetScreen } from "../types";
import { normalizeVisitorMessageRotation, normalizeVisitorMessages } from "../visitorMessages";
import { normalizeBroadcastComposition } from "../broadcastComposition";
import { normalizeEffectStudioState, normalizePhase4LiveEffects, PHASE4_CONTENT_VERSION } from "../effectStudio";

export const LANTERN_CHANNEL = "project-lantern-host-v1";
export const LANTERN_STORAGE_KEY = "project-lantern-state-v1";
const DEMO_DATA_VERSION_KEY = "project-lantern-demo-data-version";
const DEMO_DATA_VERSION = "8";
const LANTERN_PROTECTED_SNAPSHOTS_KEY = "project-lantern-protected-snapshots-v1";
const LANTERN_DATA_PROTECTION_REPORT_KEY = "project-lantern-data-protection-report-v1";
const MAX_PROTECTED_SNAPSHOTS = 8;
const LANTERN_MEDIA_DB = "project-lantern-media-v1";
const LANTERN_MEDIA_STORE = "assets";
const configuredWriteEndpoint = (import.meta.env.VITE_LANTERN_SERVICE_ENDPOINT as string | undefined)?.trim()
  || (import.meta.env.VITE_LANTERN_BUG_ENDPOINT as string | undefined)?.trim()
  || "";
const configuredReadEndpoint = (import.meta.env.VITE_LANTERN_READ_ENDPOINT as string | undefined)?.trim()
  || configuredWriteEndpoint;
const LANTERN_READ_SERVICE_ROOT = import.meta.env.DEV ? "" : configuredReadEndpoint.replace(/\/bugs\/?$/, "");
const LANTERN_WRITE_SERVICE_ROOT = import.meta.env.DEV ? "" : configuredWriteEndpoint.replace(/\/bugs\/?$/, "");
const LEGACY_CONTENT_MIGRATION_VERSION = 3;
const MAX_AUDIT_HISTORY = 350;
const MAX_BROADCAST_REMINDER_ACKNOWLEDGEMENTS = 250;
let sharedPersistenceEnabled = false;
let sharedSaveTimer: number | undefined;

type Listener = (message: HostMessage) => void;

export interface DataProtectionReport {
  at: string;
  source: "migration" | "shared-state";
  preserved: string[];
  conflicts: string[];
}

function saveProtectedSnapshot(state: LanternState, reason: string) {
  try {
    const snapshots = JSON.parse(window.localStorage.getItem(LANTERN_PROTECTED_SNAPSHOTS_KEY) ?? "[]") as Array<{ at: string; reason: string; state: LanternState }>;
    snapshots.push({ at: new Date().toISOString(), reason, state });
    window.localStorage.setItem(LANTERN_PROTECTED_SNAPSHOTS_KEY, JSON.stringify(snapshots.slice(-MAX_PROTECTED_SNAPSHOTS)));
  } catch {
    // Storage may be full; the active state remains the authoritative copy.
  }
}

function writeDataProtectionReport(report: DataProtectionReport) {
  try { window.localStorage.setItem(LANTERN_DATA_PROTECTION_REPORT_KEY, JSON.stringify(report)); } catch { /* non-essential notice */ }
}

export function readDataProtectionReport(): DataProtectionReport | null {
  try {
    const report = JSON.parse(window.localStorage.getItem(LANTERN_DATA_PROTECTION_REPORT_KEY) ?? "null") as DataProtectionReport | null;
    return report?.at && Array.isArray(report.preserved) && Array.isArray(report.conflicts) ? report : null;
  } catch { return null; }
}

/** Read-only compatibility shape for migrating profiles saved before v5. */
type LegacyDonorAppearance = {
  icon?: "none" | "star" | "heart" | "leaf" | "sparkle" | "diamond" | "crown" | "laurel" | "sun" | "hand";
  customIconImage?: string;
  fontOverride?: LanternState["boardPrograms"][number]["fontFamily"];
  nameColor?: string;
  accentColor?: string;
  highlight?: "none" | "underline" | "soft-box";
  animation?: "none" | "gentle-pulse" | "soft-glow" | "shimmer";
};

export function loadLanternState(): LanternState {
  const stored = window.localStorage.getItem(LANTERN_STORAGE_KEY);
  if (!stored) {
    return normalizeState(initialState);
  }

  try {
    const parsed = JSON.parse(stored) as Partial<LanternState>;
    const saved = { ...initialState, ...parsed, contentVersion: parsed.contentVersion ?? 0 } as LanternState;
    const needsNormalizationBackup = saved.contentVersion !== LANTERN_CONTENT_VERSION;
    if (needsNormalizationBackup) saveProtectedSnapshot(saved, "Before a content/schema migration");
    const normalized = normalizeState(saved);
    const demoVersionChanged = window.localStorage.getItem(DEMO_DATA_VERSION_KEY) !== DEMO_DATA_VERSION;
    const contentVersionChanged = normalized.contentVersion !== parsed.contentVersion;
    if (demoVersionChanged || contentVersionChanged) {
      // Persist content migrations even when the legacy demo marker was already
      // advanced by another route. This keeps the version stored with the data
      // authoritative for both local and shared-state normalization.
      const savedSuccessfully = saveLanternState(normalized);
      if (savedSuccessfully) {
        window.localStorage.setItem(DEMO_DATA_VERSION_KEY, DEMO_DATA_VERSION);
      }
    }
    return normalized;
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
      boardPrograms: state.boardPrograms.map((program) => program.backgroundMediaId && program.backgroundImage?.startsWith("blob:") ? { ...program, backgroundImage: undefined } : program),
      screens: Object.fromEntries(Object.entries(state.screens).map(([id, screen]) => [
        id,
        screen.backgroundMediaId && screen.backgroundImage?.startsWith("blob:") ? { ...screen, backgroundImage: undefined } : screen
      ]))
    };
    window.localStorage.setItem(LANTERN_STORAGE_KEY, JSON.stringify(serializable));
    return true;
  } catch (error) {
    console.warn("Project Lantern could not persist the current media asset locally.", error);
    return false;
  }
}

function serializableSharedState(state: LanternState): LanternState {
  return {
    ...state,
    boardPrograms: state.boardPrograms.map((program) => program.backgroundImage?.startsWith("blob:") ? { ...program, backgroundImage: undefined } : program),
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
  return body.state ? normalizeState({ ...initialState, ...body.state, contentVersion: body.state.contentVersion ?? 0 }) : null;
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
  const boardPrograms = await Promise.all(state.boardPrograms.map(async (program) => {
    const backgroundImage = await shareImageUrl(program.backgroundImage, `${program.id}-background`);
    const donorStyles = program.donorStyles
      ? Object.fromEntries(await Promise.all(Object.entries(program.donorStyles).map(async ([donorId, style]) => [donorId, {
          ...style,
          recognitionIconImage: await shareImageUrl(style.recognitionIconImage, `${program.id}-${donorId}-icon`)
        }])))
      : undefined;
    return {
      ...program,
      backgroundImage,
      backgroundMediaId: backgroundImage?.startsWith("http") ? undefined : program.backgroundMediaId,
      donorStyles,
      panels: program.panels ? await Promise.all(program.panels.map(async (panel) => ({
        ...panel,
        imageUrl: await shareImageUrl(panel.imageUrl, `${program.id}-${panel.id}`)
      }))) : program.panels
    };
  }));
  const donors = state.donors;
  const savedAnnouncements = await Promise.all(state.savedAnnouncements.map(async (announcement) => ({
    ...announcement,
    imageUrl: await shareImageUrl(announcement.imageUrl, `${announcement.id}-image`)
  })));
  const savedBlips = await Promise.all(state.savedBlips.map(async (blip) => ({
    ...blip,
    imageUrl: await shareImageUrl(blip.imageUrl, `${blip.id}-image`)
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
    savedBlips,
    screens,
    announcement: { ...state.announcement, imageUrl: await shareImageUrl(state.announcement.imageUrl, "active-announcement") },
    activeBlip: { ...state.activeBlip, imageUrl: await shareImageUrl(state.activeBlip.imageUrl, "active-blip") },
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
  const mediaPrograms = state.boardPrograms.filter((program) => program.backgroundMediaId && !program.backgroundImage);
  if (!mediaScreens.length && !mediaPrograms.length) return state;
  const database = await openMediaDatabase();
  const loadMediaUrl = async (mediaId: string) => {
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const transaction = database.transaction(LANTERN_MEDIA_STORE, "readonly");
      const request = transaction.objectStore(LANTERN_MEDIA_STORE).get(mediaId);
      request.onsuccess = () => resolve(request.result as Blob | undefined);
      request.onerror = () => reject(request.error);
    });
    return blob ? URL.createObjectURL(blob) : undefined;
  };
  const hydratedScreens = await Promise.all(mediaScreens.map(async (screen) => {
    const url = await loadMediaUrl(screen.backgroundMediaId as string);
    return url ? [screen.id, url] as const : null;
  }));
  const hydratedPrograms = await Promise.all(mediaPrograms.map(async (program) => {
    const url = await loadMediaUrl(program.backgroundMediaId as string);
    return url ? [program.id, url] as const : null;
  }));
  database.close();
  const screenUrls = new Map(hydratedScreens.filter((item): item is readonly [string, string] => Boolean(item)));
  const programUrls = new Map(hydratedPrograms.filter((item): item is readonly [string, string] => Boolean(item)));
  if (!screenUrls.size && !programUrls.size) return state;
  return {
    ...state,
    boardPrograms: state.boardPrograms.map((program) => programUrls.has(program.id) ? { ...program, backgroundImage: programUrls.get(program.id) } : program),
    screens: Object.fromEntries(Object.entries(state.screens).map(([id, screen]) => [id, screenUrls.has(id) ? { ...screen, backgroundImage: screenUrls.get(id) } : screen])) as LanternState["screens"]
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

export interface DisplayWindowOpenResult {
  opened: string[];
  blocked: string[];
}

function preserveCollection<T extends { id: string }>(local: readonly T[], shared: readonly T[], label: string, report: DataProtectionReport) {
  const sharedById = new Map(shared.map((item) => [item.id, item]));
  const localIds = new Set(local.map((item) => item.id));
  const preserved = local.map((item) => {
    const remote = sharedById.get(item.id);
    if (remote && JSON.stringify(remote) !== JSON.stringify(item)) {
      report.conflicts.push(`${label}: kept this browser's edit for ${item.id}`);
    }
    return item;
  });
  const additions = shared.filter((item) => !localIds.has(item.id));
  if (additions.length) report.preserved.push(`${label}: included ${additions.length} change${additions.length === 1 ? "" : "s"} from shared storage`);
  return [...preserved, ...additions];
}

/**
 * Remote state is useful for another workstation, but must never erase edits
 * that already exist in this browser. Collection IDs are stable, so local
 * records win a collision and both the preservation and conflict are recorded.
 */
export function mergeSharedLanternState(local: LanternState, shared: LanternState): LanternState {
  const report: DataProtectionReport = { at: new Date().toISOString(), source: "shared-state", preserved: [], conflicts: [] };
  const preferences = preserveCollection(
    local.userPreferences.map((preference) => ({ ...preference, id: preference.userId })),
    shared.userPreferences.map((preference) => ({ ...preference, id: preference.userId })),
    "User preferences",
    report
  ).map(({ id: _id, ...preference }) => preference);
  const merged: LanternState = {
    ...shared,
    ...local,
    contentVersion: Math.max(local.contentVersion ?? 0, shared.contentVersion ?? 0),
    donors: preserveCollection(local.donors, shared.donors, "Donors", report),
    boardPrograms: preserveCollection(local.boardPrograms, shared.boardPrograms, "Boards", report),
    schedules: preserveCollection(local.schedules, shared.schedules, "Schedules", report),
    savedAnnouncements: preserveCollection(local.savedAnnouncements, shared.savedAnnouncements, "Announcements", report),
    savedBlips: preserveCollection(local.savedBlips, shared.savedBlips, "Pop-ups", report),
    donorGroups: preserveCollection(local.donorGroups, shared.donorGroups, "Donor groups", report),
    givingPrograms: preserveCollection(local.givingPrograms, shared.givingPrograms, "Giving programs", report),
    users: preserveCollection(local.users, shared.users, "Users", report),
    userPreferences: preferences,
    visitorMessages: preserveCollection(local.visitorMessages, shared.visitorMessages, "Visitor messages", report),
    effectStudio: {
      ...shared.effectStudio,
      ...local.effectStudio,
      costumes: preserveCollection(local.effectStudio.costumes, shared.effectStudio.costumes, "Costumes", report),
      calibrationProfiles: preserveCollection(local.effectStudio.calibrationProfiles, shared.effectStudio.calibrationProfiles, "Calibration profiles", report)
    },
    screens: { ...shared.screens, ...local.screens }
  };
  if (report.conflicts.length || report.preserved.length) writeDataProtectionReport(report);
  return normalizeState(merged);
}

const browserDisplayWindows = new Map<string, Window>();

export function openBrowserDisplayWindows(screens = Object.values(loadLanternState().screens)): DisplayWindowOpenResult {
  const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href;
  const result: DisplayWindowOpenResult = { opened: [], blocked: [] };
  if (!screens.length) return result;
  screens.forEach((screen, index) => {
    const popupName = `lantern-display-${screen.id}`;
    const knownPopup = browserDisplayWindows.get(screen.id);
    const wasAlreadyOpen = Boolean(knownPopup && !knownPopup.closed);
    const portrait = screen.orientation === "Portrait";
    const width = portrait ? 540 : 960;
    const height = portrait ? 900 : 620;
    const cascade = index * 28;
    const left = window.screenX + Math.round((window.outerWidth - width) / 2) + cascade;
    const top = window.screenY + Math.round((window.outerHeight - height) / 2) + cascade;
    const popup = window.open(
      `${appUrl}#/display/${encodeURIComponent(screen.id)}`,
      popupName,
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no`
    );
    if (!popup) {
      result.blocked.push(screen.id);
      return;
    }
    browserDisplayWindows.set(screen.id, popup);
    // A named popup keeps its last position. Reopening it deliberately brings it
    // back to the operator's current monitor and centers it over the control app.
    if (wasAlreadyOpen) {
      try {
        popup.resizeTo(width, height);
        popup.moveTo(left, top);
      } catch {
        // Browsers may restrict window movement; focus remains a safe fallback.
      }
    }
    popup.focus();
    result.opened.push(screen.id);
  });
  window.dispatchEvent(new CustomEvent("lantern:display-open-result", { detail: result }));
  return result;
}

export async function openDisplayWindows(screens = Object.values(loadLanternState().screens)): Promise<DisplayWindowOpenResult> {
  // Keep browser popups inside the originating click event. Waiting for the
  // Tauri module import first causes browsers to block all but the first window.
  if (!(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    return openBrowserDisplayWindows(screens);
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_test_displays", {
      displays: screens.map((screen) => ({
        id: screen.id,
        label: screen.label,
        orientation: screen.orientation,
        defaultMonitorId: screen.defaultMonitorId
      }))
    });
    return { opened: screens.map((screen) => screen.id), blocked: [] };
  } catch {
    return openBrowserDisplayWindows(screens);
  }
}

export function fitWarnings(state: LanternState) {
  const warnings: string[] = [];

  Object.values(state.screens).forEach((screen) => {
    const program = state.boardPrograms.find((candidate) => candidate.id === screen.boardProgramId);
    const activeDonors = state.donors.filter((donor) => donor.active && (!program || program.donorIds.includes(donor.id)));
    const donorPanels = program?.panels?.filter((panel) => panel.type === "donors") ?? [];
    if (donorPanels.length) {
      donorPanels.forEach((panel) => {
        const panelDonors = activeDonors.filter((donor) =>
          (!panel.donorIds?.length || panel.donorIds.includes(donor.id))
          && (!panel.donorTierFilter?.length || panel.donorTierFilter.includes(donor.tier))
        );
        const columns = panel.columns ?? program?.columns ?? 1;
        const rows = panel.rows ?? Math.max(1, Math.ceil(panelDonors.length / columns));
        const capacity = columns * rows;
        if (panelDonors.length > capacity) warnings.push(`${screen.label} · ${panel.title || "donor list"} needs ${panelDonors.length - capacity} fewer names or more rows.`);
      });
      return;
    }
    const capacity = screen.orientation === "Portrait"
      ? state.theme.letteringDepth > 70 ? 16 : 22
      : state.theme.letteringDepth > 70 ? 24 : 32;
    if (activeDonors.length > capacity) {
      warnings.push(`${screen.label} needs ${activeDonors.length - capacity} fewer active names at the required minimum size.`);
    }
  });

  return warnings;
}

function appendMissingById<T extends { id: string }>(existing: T[], defaults: readonly T[]) {
  const existingIds = new Set(existing.map((item) => item.id));
  return [...existing, ...defaults.filter((item) => !existingIds.has(item.id))];
}

function uniqueStrings(...values: Array<readonly string[] | undefined>) {
  return [...new Set(values.flatMap((items) => items ?? []))];
}

function uniqueRecordsById<T extends { id: string }>(...values: Array<readonly T[] | undefined>) {
  return [...new Map(values.flatMap((items) => items ?? []).map((item) => [item.id, item])).values()];
}

function legacyDonorPresentation(donor: Donor): BoardDonorPresentation | undefined {
  const legacy = donor as Donor & LegacyDonorAppearance;
  const presentation: BoardDonorPresentation = {
    fontFamily: legacy.fontOverride,
    nameColor: legacy.nameColor,
    accentColor: legacy.accentColor,
    highlight: legacy.highlight === "underline"
      ? "fine-underline"
      : legacy.highlight === "soft-box"
        ? "soft-highlight"
        : undefined,
    recognitionIcon: legacy.icon && legacy.icon !== "none" && legacy.icon !== "hand" ? legacy.icon : undefined,
    recognitionIconImage: legacy.customIconImage,
    animation: legacy.animation === "gentle-pulse"
      ? "grow-shrink"
      : legacy.animation === "shimmer" || legacy.animation === "soft-glow"
        ? "slow-shimmer"
        : undefined
  };
  return Object.values(presentation).some(Boolean) ? presentation : undefined;
}

function migrateLegacyDonorPresentation(
  programs: LanternState["boardPrograms"],
  donors: Donor[]
): LanternState["boardPrograms"] {
  return programs.map((program) => {
    const memberIds = new Set([
      ...program.donorIds,
      ...(program.panels?.flatMap((panel) => panel.donorIds ?? []) ?? [])
    ]);
    const migratedStyles = donors.reduce<NonNullable<typeof program.donorStyles>>((styles, donor) => {
      if (!memberIds.has(donor.id)) return styles;
      const legacyStyle = legacyDonorPresentation(donor);
      if (!legacyStyle) return styles;
      styles[donor.id] = { ...legacyStyle, ...(styles[donor.id] ?? {}) };
      return styles;
    }, { ...(program.donorStyles ?? {}) });
    return { ...program, donorStyles: Object.keys(migratedStyles).length ? migratedStyles : undefined };
  });
}

function migrateUnifiedBoardPanels(programs: LanternState["boardPrograms"], donors: Donor[]): LanternState["boardPrograms"] {
  return programs.map((program) => ({
    ...program,
    panels: program.panels?.flatMap((panel): BoardPanel[] => {
      if (["text", "donors", "image"].includes(panel.type)) return [panel];
      if (panel.type === "donor-star") {
        const groupId = panel.groupId ?? `group-${panel.id}`;
        const donorName = donors.find((donor) => donor.id === panel.donorId)?.name ?? panel.title;
        return [
          { ...panel, id: `${panel.id}-image`, type: "image", title: "Recognition star", groupId, donorId: undefined, eyebrow: undefined, body: undefined },
          { ...panel, type: "text", title: donorName, groupId, imageUrl: undefined, imageFit: undefined, donorId: undefined, eyebrow: undefined, body: undefined }
        ];
      }
      return [{ ...panel, type: "text", title: [panel.eyebrow, panel.title, panel.body].filter(Boolean).join("\n"), eyebrow: undefined, body: undefined, donorId: undefined }];
    })
  }));
}

function donorIdentityKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\band\b/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mergeDonorProfiles(primary: Donor, secondary: Donor): Donor {
  return {
    ...secondary,
    ...primary,
    note: primary.note || secondary.note,
    tags: uniqueStrings(primary.tags, secondary.tags),
    donations: uniqueRecordsById(primary.donations, secondary.donations),
    displayIds: primary.displayIds ?? secondary.displayIds,
    boardIds: uniqueStrings(primary.boardIds, secondary.boardIds)
  };
}

function mergeOfficialDonor(profile: Donor | undefined, official: Donor): Donor {
  if (!profile) return { ...official, tags: [...(official.tags ?? [])], donations: [...(official.donations ?? [])], displayIds: official.displayIds ? [...official.displayIds] : undefined };
  return {
    ...official,
    ...profile,
    // Roster identity, giving level, and pledge terms come from the approved
    // source. Operational fields on the profile remain user-owned.
    id: official.id,
    name: official.name,
    tier: official.tier,
    category: official.category,
    since: official.since,
    groupId: official.groupId,
    givingProgramId: official.givingProgramId,
    givingLevelId: official.givingLevelId,
    pledgeAnnualAmount: official.pledgeAnnualAmount,
    pledgeYears: official.pledgeYears,
    pledgeStartYear: official.pledgeStartYear,
    recognitionOrder: official.recognitionOrder,
    pledgeStatus: profile.pledgeStatus ?? official.pledgeStatus,
    tags: uniqueStrings(profile.tags, official.tags),
    donations: [...(profile.donations ?? official.donations ?? [])],
    displayIds: profile.displayIds ? [...profile.displayIds] : official.displayIds ? [...official.displayIds] : undefined,
    boardIds: profile.boardIds ? [...profile.boardIds] : official.boardIds ? [...official.boardIds] : undefined
  };
}

function isKnownDemoDonor(donor: Donor) {
  return donor.id.startsWith("test-") && (
    /^test\b/i.test(donor.name)
    || donor.tags?.some((tag) => tag.toLowerCase() === "(test)")
    || /^test record\b/i.test(donor.note)
  );
}

function migrateOfficialDonors(incoming: Donor[], officialDonors: Donor[]) {
  const officialById = new Map(officialDonors.map((donor) => [donor.id, donor]));
  const officialByName = new Map(officialDonors.map((donor) => [donorIdentityKey(donor.name), donor]));
  const matches = new Map<string, Donor[]>();
  const aliases = new Map<string, string>();
  const retained: Donor[] = [];

  incoming.forEach((donor) => {
    const official = officialById.get(donor.id) ?? officialByName.get(donorIdentityKey(donor.name));
    if (official) {
      matches.set(official.id, [...(matches.get(official.id) ?? []), donor]);
      if (donor.id !== official.id) aliases.set(donor.id, official.id);
      return;
    }

    // IDs in this namespace were generated by the retired placeholder roster.
    // Real donors created in the UI use donor-* IDs and are always retained.
    if (/^toy-(explorer|play)-\d+$/.test(donor.id) || isKnownDemoDonor(donor)) return;
    retained.push(donor);
  });

  const official = officialDonors.map((seed) => {
    const candidates = matches.get(seed.id) ?? [];
    const exact = candidates.find((candidate) => candidate.id === seed.id);
    const ordered = exact ? [exact, ...candidates.filter((candidate) => candidate !== exact)] : candidates;
    const profile = ordered.length ? ordered.slice(1).reduce(mergeDonorProfiles, ordered[0]) : undefined;
    return mergeOfficialDonor(profile, seed);
  });

  return { donors: [...retained, ...official], aliases };
}

function remapDonorIds(ids: string[] | undefined, aliases: Map<string, string>) {
  if (!ids) return undefined;
  return uniqueStrings(ids.map((id) => aliases.get(id) ?? id));
}

function isUntouchedLegacyDemoBoard(program: LanternState["boardPrograms"][number]) {
  const donorsAreDemoOnly = program.donorIds.length > 0 && program.donorIds.every((id) => id.startsWith("test-"));
  const hasOnlyLegacyFields = Object.keys(program).every((key) => [
    "id", "name", "orientation", "heading", "subtitle", "description", "footer", "columns", "donorIds", "active"
  ].includes(key));
  if (!donorsAreDemoOnly || !hasOnlyLegacyFields || program.heading !== "THANK YOU" || program.active !== true) return false;
  if (program.id === "board-classic") {
    return program.name === "Our Generous Donors"
      && program.subtitle === "OUR GENEROUS DONORS"
      && program.description === "TOGETHER, WE MAKE A DIFFERENCE."
      && program.footer === "TOGETHER, WE MAKE A DIFFERENCE."
      && program.columns === 2;
  }
  if (program.id === "board-spotlight") {
    return program.name === "Community Spotlight"
      && program.subtitle === "COMMUNITY PARTNERS"
      && program.description === "YOUR SUPPORT BUILDS A BRIGHTER FUTURE."
      && program.footer === "WITH GRATITUDE TO OUR COMMUNITY."
      && program.columns === 1;
  }
  return false;
}

function isUntouchedLegacyDemoScreen(id: string, screen: LanternState["screens"][string] | undefined) {
  if (!screen || (id !== "display-1" && id !== "display-2")) return false;
  const portrait = id === "display-1";
  return screen.label === (portrait ? "Display 1" : "Display 2")
    && screen.assignment === "Test window"
    && screen.orientation === (portrait ? "Portrait" : "Landscape")
    && screen.resolution === (portrait ? "1080 x 1920" : "1920 x 1080")
    && screen.boardProgramId === (portrait ? "board-classic" : "board-spotlight")
    && screen.style === "donor-wall"
    && (screen.backgroundMode ?? "board") === "board"
    && screen.backgroundCrop?.scale === 1
    && screen.backgroundCrop?.x === 0
    && screen.backgroundCrop?.y === 0
    && (screen.backgroundCrop?.rotation ?? 0) === 0
    && screen.layoutScale === 100
    && screen.brightness === 72
    && screen.enabled !== false
    && screen.customHeading === "THANK YOU"
    && screen.customSubheading === "OUR GENEROUS DONORS"
    && screen.fontFamily === "Montserrat"
    && screen.nameSize === (portrait ? 30 : 28)
    && screen.columns === (portrait ? 1 : 2)
    && screen.donorScrollEnabled === false
    && screen.donorScrollSpeed === 4
    && screen.particleAnimationEnabled === false
    && screen.particleDriftDirection === "natural"
    && screen.particleDriftSpeed === 4
    && screen.particleGravity === 3
    && screen.showIcons === false
    && screen.donorIconStyle === "circle"
    && screen.donorIconPlacement === "left"
    && screen.showSubtext === false
    && !screen.backgroundImage
    && !screen.backgroundMediaId
    && !screen.backgroundMediaName
    && !screen.backgroundMediaType
    && !screen.showFrame
    && !screen.textFinish
    && !screen.textShadowEnabled
    && !screen.particleColorStyle
    && screen.particleCount === undefined
    && screen.particleSize === undefined
    && screen.particleSpread === undefined
    && screen.particleWander === undefined
    && screen.particleLifetime === undefined
    && screen.particleLifetimeRange === undefined
    && !screen.roomVideoDeviceId
    && !screen.roomAudioDeviceId
    && !(screen.donorIds?.length)
    && !Object.keys(screen.donorSubtextVisibility ?? {}).length;
}

function isUntouchedLegacyDemoBoardSchedule(entry: ScheduleEntry) {
  const portrait = entry.id === "schedule-portrait-board";
  const landscape = entry.id === "schedule-landscape-board";
  if (!portrait && !landscape) return false;
  return entry.name === (portrait ? "Portrait board · Display 1" : "Landscape board · Display 2")
    && entry.target === (portrait ? "display-1" : "display-2")
    && entry.boardId === (portrait ? "board-classic" : "board-spotlight")
    && (entry.contentType ?? "board") === "board"
    && entry.days.join(",") === "0,3,4,5,6"
    && entry.recurrence === "weekly"
    && entry.startTime === "07:00"
    && entry.endTime === "18:00"
    && entry.color === (portrait ? "#5f55bd" : "#218ba2")
    && entry.active === true
    && !entry.scheduleDate
    && !entry.scheduleEndDate
    && !entry.message
    && !entry.announcementId
    && !entry.blipId
    && !entry.broadcastMode
    && !entry.broadcastVideoUrl
    && !entry.broadcastVideoName
    && !entry.presenterName;
}

function fullRosterBoardIdForLegacy(id: string) {
  return id === "board-classic" ? "board-toy-soldier-portrait"
    : id === "board-spotlight" ? "board-toy-soldier-landscape"
      : id;
}

function mergeOfficialGivingProgram(existing: GivingProgram, official: GivingProgram): GivingProgram {
  return {
    ...official,
    ...existing,
    id: official.id,
    name: official.name,
    classLabel: official.classLabel,
    classYear: official.classYear,
    description: official.description,
    fundDesignation: official.fundDesignation,
    spotlightDonorId: official.spotlightDonorId,
    levels: official.levels.map((level) => ({
      ...existing.levels.find((candidate) => candidate.id === level.id),
      ...level,
      color: existing.levels.find((candidate) => candidate.id === level.id)?.color ?? level.color
    }))
  };
}

function isKnownDemoAnnouncement(announcement: Pick<Announcement, "id" | "title" | "message">) {
  return /^announcement-test-\d+$/.test(announcement.id)
    && /^test message \d+$/i.test(announcement.title.trim())
    && /^test message \d+$/i.test(announcement.message.trim());
}

function isKnownDemoSchedule(entry: ScheduleEntry, retiredAnnouncementIds: Set<string>) {
  return /^schedule-test-message-\d+$/.test(entry.id)
    && Boolean(entry.announcementId && retiredAnnouncementIds.has(entry.announcementId));
}

function scheduleReferenceIsValid(
  entry: ScheduleEntry,
  boardIds: Set<string>,
  announcementIds: Set<string>,
  blipIds: Set<string>,
  screenIds: Set<string>
) {
  if (entry.target !== "all" && !screenIds.has(entry.target)) return false;
  const contentType = entry.contentType ?? "board";
  if (contentType === "announcement") return Boolean(entry.announcementId && announcementIds.has(entry.announcementId));
  if (contentType === "blip") return Boolean(entry.blipId && blipIds.has(entry.blipId));
  if (contentType === "broadcast") return true;
  return boardIds.has(entry.boardId);
}

function userIdentityKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function normalizeUsers(incoming: LanternState["users"] | null | undefined) {
  const seedById = new Map(initialState.users.map((user) => [user.id, user]));
  const seedByName = new Map(initialState.users.map((user) => [userIdentityKey(user.name), user]));
  const aliases = new Map<string, string>();
  const users: LanternState["users"] = [];

  (Array.isArray(incoming) ? incoming : []).forEach((candidate) => {
    const candidateId = typeof candidate?.id === "string" ? candidate.id.trim() : "";
    const candidateName = typeof candidate?.name === "string" ? candidate.name.trim() : "";
    if (!candidateName) return;

    const seed = seedById.get(candidateId)
      ?? (candidate.accessMode !== "authenticated" ? seedByName.get(userIdentityKey(candidateName)) : undefined);
    const id = seed?.id ?? candidateId;
    if (!id) return;
    if (candidateId && candidateId !== id) aliases.set(candidateId, id);

    const fallbackTimestamp = seed?.createdAt ?? initialState.users[0].createdAt;
    const normalized = {
      ...seed,
      ...candidate,
      id,
      name: candidateName,
      createdAt: candidate.createdAt || fallbackTimestamp,
      updatedAt: candidate.updatedAt || candidate.createdAt || fallbackTimestamp,
      accessMode: candidate.accessMode === "authenticated" ? "authenticated" as const : "local-demo" as const
    };
    const existingIndex = users.findIndex((user) => user.id === id);
    if (existingIndex >= 0) users[existingIndex] = { ...users[existingIndex], ...normalized };
    else users.push(normalized);
  });

  initialState.users.forEach((seed) => {
    if (!users.some((user) => user.id === seed.id)) users.push({ ...seed });
  });

  return { users, aliases };
}

function defaultPreferencesForUser(userId: string): LanternState["userPreferences"][number] {
  const defaults = initialState.userPreferences.find((preference) => preference.userId === userId)
    ?? initialState.userPreferences[0];
  return {
    ...defaults,
    userId,
    roomWindows: { ...(defaults?.roomWindows ?? {}) },
    roomMirrorByDisplay: { ...(defaults?.roomMirrorByDisplay ?? {}) },
    editor: { ...(defaults?.editor ?? {}) }
  };
}

function normalizeUserPreferences(
  incoming: LanternState["userPreferences"] | null | undefined,
  users: LanternState["users"],
  aliases: Map<string, string>
) {
  const preferencesByUser = new Map<string, LanternState["userPreferences"][number]>();

  (Array.isArray(incoming) ? incoming : []).forEach((candidate) => {
    const incomingUserId = typeof candidate?.userId === "string" ? candidate.userId.trim() : "";
    if (!incomingUserId) return;
    const userId = aliases.get(incomingUserId) ?? incomingUserId;
    const defaults = defaultPreferencesForUser(userId);
    const previous = preferencesByUser.get(userId) ?? defaults;
    preferencesByUser.set(userId, {
      ...previous,
      ...candidate,
      userId,
      theme: ["dark", "light", "ocean", "warm", "contrast", "sparkle"].includes(candidate.theme)
        ? candidate.theme
        : previous.theme,
      donorSort: ["manual", "az", "za"].includes(candidate.donorSort)
        ? candidate.donorSort
        : previous.donorSort,
      roomWindows: { ...previous.roomWindows, ...(candidate.roomWindows ?? {}) },
      roomMirrorByDisplay: { ...previous.roomMirrorByDisplay, ...(candidate.roomMirrorByDisplay ?? {}) },
      editor: { ...previous.editor, ...(candidate.editor ?? {}) }
    });
  });

  users.forEach((user) => {
    if (!preferencesByUser.has(user.id)) preferencesByUser.set(user.id, defaultPreferencesForUser(user.id));
  });

  return [...preferencesByUser.values()];
}

function normalizeAuditHistory(
  incoming: LanternState["auditHistory"] | null | undefined,
  aliases: Map<string, string>
) {
  return (Array.isArray(incoming) ? incoming : [])
    .map((record) => ({ ...record, userId: aliases.get(record.userId) ?? record.userId }))
    .slice(0, MAX_AUDIT_HISTORY);
}

function normalizeBroadcastReminderAcknowledgements(
  incoming: LanternState["broadcastReminderAcknowledgements"] | null | undefined,
  aliases: Map<string, string>
) {
  const latestByOccurrence = new Map<string, LanternState["broadcastReminderAcknowledgements"][number]>();
  (Array.isArray(incoming) ? incoming : []).forEach((record) => {
    if (!record?.occurrenceKey || latestByOccurrence.has(record.occurrenceKey)) return;
    latestByOccurrence.set(record.occurrenceKey, {
      ...record,
      userId: record.userId ? aliases.get(record.userId) ?? record.userId : undefined
    });
  });
  return [...latestByOccurrence.values()].slice(0, MAX_BROADCAST_REMINDER_ACKNOWLEDGEMENTS);
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
  let effects = normalizePhase4LiveEffects(state.live?.effects, initialState.live.effects);
  // Background removal methods are alternatives. Older saved states could have
  // both enabled, which caused chroma keying to punch holes in an AI composite.
  if (chromaKey.enabled) effects.background = "original";
  const incomingContentVersion = Number.isFinite(state.contentVersion) ? state.contentVersion : 0;
  // Version 3 installed and reconciled the approved donor/content roster. Newer
  // schema-only upgrades must not rerun that migration because its seed ordering
  // would overwrite a curator's saved donor order and recognition order.
  const needsLegacyContentMigration = incomingContentVersion < LEGACY_CONTENT_MIGRATION_VERSION;
  const needsDonorDomainMigration = incomingContentVersion < 5;
  const needsPhase3ContentMigration = incomingContentVersion < PHASE3_CONTENT_VERSION;
  const needsEffectStudioMigration = incomingContentVersion < PHASE4_CONTENT_VERSION;
  const needsLegacyDonorStarsMigration = incomingContentVersion < LEGACY_DONOR_STARS_CONTENT_VERSION;
  const needsDonorRosterBoardsMigration = incomingContentVersion < DONOR_ROSTER_BOARDS_CONTENT_VERSION;
  const needsLegacyStarRecovery = incomingContentVersion < LEGACY_STAR_RECOVERY_CONTENT_VERSION;
  const needsLegacyDonorTagsMigration = incomingContentVersion < LEGACY_DONOR_TAGS_CONTENT_VERSION;
  const needsBoardTextContrastMigration = incomingContentVersion < BOARD_TEXT_CONTRAST_CONTENT_VERSION;
  const needsLegacyStarLayerMigration = incomingContentVersion < LEGACY_STAR_LAYER_CONTENT_VERSION;
  const normalizedContentVersion = Math.max(incomingContentVersion, LANTERN_CONTENT_VERSION);

  const incomingDonors = state.donors ?? initialState.donors;
  const donorMigration = needsLegacyContentMigration
    ? migrateOfficialDonors(incomingDonors, initialState.donors)
    : { donors: incomingDonors, aliases: new Map<string, string>() };
  const starWallDonors = needsLegacyDonorStarsMigration
    ? appendMissingById(donorMigration.donors, legacyDonors)
    : donorMigration.donors;
  const legacyDonorIds = new Set(legacyDonors.map((donor) => donor.id));
  const donors = needsLegacyDonorTagsMigration
    ? starWallDonors.map((donor) => legacyDonorIds.has(donor.id)
      ? { ...donor, tier: "Legacy donor", category: "Legacy", tags: uniqueStrings(donor.tags, ["Legacy"]) }
      : donor)
    : starWallDonors;
  const donorAliases = donorMigration.aliases;

  const incomingPrograms = state.boardPrograms ?? initialState.boardPrograms;
  const incomingSchedules = state.schedules ?? initialState.schedules;
  const retireableLegacyBoardIds = new Set(incomingPrograms.filter(isUntouchedLegacyDemoBoard).map((program) => program.id));
  const legacyBoardIds = new Set([...retireableLegacyBoardIds].filter((boardId) => {
    const hasCustomizedScreenReference = Object.entries(legacyScreens).some(([id, screen]) =>
      screen.boardProgramId === boardId && !isUntouchedLegacyDemoScreen(id, screen)
    );
    const hasCustomizedScheduleReference = incomingSchedules.some((entry) =>
      (entry.contentType ?? "board") === "board"
      && entry.boardId === boardId
      && !isUntouchedLegacyDemoBoardSchedule(entry)
    );
    return !hasCustomizedScreenReference && !hasCustomizedScheduleReference;
  }));
  const retainedPrograms = needsLegacyContentMigration
    ? incomingPrograms.filter((program) => !legacyBoardIds.has(program.id))
    : incomingPrograms;
  const migratedPrograms = needsLegacyContentMigration
    ? appendMissingById(retainedPrograms, brigadeBoardPrograms)
    : retainedPrograms;
  const programsWithLegacyDonorWalls = needsLegacyDonorStarsMigration
    ? appendMissingById(migratedPrograms, legacyBoardPrograms)
    : migratedPrograms;
  const programsWithDonorRosterBoards = needsDonorRosterBoardsMigration
    ? appendMissingById(programsWithLegacyDonorWalls, generousDonorBoardPrograms)
    : programsWithLegacyDonorWalls;
  const normalizedBoardPrograms = programsWithDonorRosterBoards.map((incomingProgram) => {
    const hasVisibleDonors = incomingProgram.donorIds.some((donorId) => donors.some((donor) => donor.id === donorId && donor.active));
    const isGenerousDonorBoard = /generous donors/i.test(incomingProgram.name);
    const generousDefault = /legacy/i.test(incomingProgram.name)
      ? generousDonorBoardPrograms.find((program) => program.id === "board-generous-legacy-portrait")
      : generousDonorBoardPrograms.find((program) => program.id === "board-generous-toy-soldier-portrait");
    const repairEmptyGenerousBoard = needsDonorRosterBoardsMigration && isGenerousDonorBoard && !hasVisibleDonors && generousDefault;
    const program = repairEmptyGenerousBoard ? {
      ...incomingProgram,
      heading: generousDefault.heading,
      subtitle: generousDefault.subtitle,
      description: generousDefault.description,
      footer: generousDefault.footer,
      donorIds: generousDefault.donorIds,
      panels: incomingProgram.panels?.map((panel) => panel.type === "donors"
        ? { ...panel, donorIds: generousDefault.donorIds }
        : panel.type === "heading"
          ? { ...panel, title: generousDefault.heading }
          : panel.type === "footer"
            ? { ...panel, title: generousDefault.footer }
            : panel)
    } : incomingProgram;
    const defaultLegacyStarWall = legacyBoardPrograms.find((candidate) => candidate.id === program.id);
    const currentPanels = program.panels ?? [];
    const missingLegacyStarPanels = defaultLegacyStarWall?.panels?.filter((panel) => !currentPanels.some((current) => current.id === panel.id)) ?? [];
    const recoveredPanels = needsLegacyStarRecovery && /^board-legacy-stars-photo-[12]$/.test(program.id) && missingLegacyStarPanels.length > 0 && missingLegacyStarPanels.length <= 2
      ? [...currentPanels, ...missingLegacyStarPanels]
      : currentPanels;
    return {
      ...program,
      donorIds: remapDonorIds(program.donorIds, donorAliases) ?? [],
      panels: recoveredPanels
        ?.filter((panel) => !(needsDonorRosterBoardsMigration
          && program.id === "board-legacy-donors-portrait"
          && panel.id === "legacy-list-donors-heading"
          && panel.type === "supporters-heading"))
        .map((panel) => {
          const donorIds = panel.donorIds ? remapDonorIds(panel.donorIds, donorAliases) : undefined;
          const flatStarImage = needsDonorRosterBoardsMigration
            && panel.type === "donor-star"
            && (!panel.imageUrl || panel.imageUrl === "/assets/donor-icons/star.png")
            ? "/assets/donor-icons/legacy-star-flat.svg"
            : panel.imageUrl;
          const isLegacyStarLayer = /^legacy-photo[12]-.+-star-(image|text)$/.test(panel.id);
          return {
            ...panel,
            ...(donorIds ? { donorIds } : {}),
            imageUrl: flatStarImage,
            ...(needsLegacyStarLayerMigration && isLegacyStarLayer
              ? { groupId: undefined, lineHeight: panel.type === "text" ? (panel.lineHeight ?? .92) : panel.lineHeight }
              : {})
          };
        })
    };
  });
  const boardProgramsBeforeTextContrastMigration = migrateUnifiedBoardPanels(needsDonorDomainMigration
    ? migrateLegacyDonorPresentation(normalizedBoardPrograms, donors)
    : normalizedBoardPrograms, donors);
  // The dark brass outline was previously applied to a shipped board treatment.
  // Replace it once for all current saved boards, without touching their content,
  // panel layout, or donor/schedule assignments.
  const boardPrograms = needsBoardTextContrastMigration
    ? boardProgramsBeforeTextContrastMigration.map((program) => program.textFinish === "cut-brass"
      ? { ...program, textFinish: "flat" as const }
      : program)
    : boardProgramsBeforeTextContrastMigration;

  const incomingAnnouncements = state.savedAnnouncements ?? initialState.savedAnnouncements;
  const retiredAnnouncements = needsLegacyContentMigration
    ? incomingAnnouncements.filter(isKnownDemoAnnouncement)
    : [];
  const retainedAnnouncements = needsLegacyContentMigration
    ? incomingAnnouncements.filter((announcement) => !isKnownDemoAnnouncement(announcement))
    : incomingAnnouncements;
  // An empty library is a valid user choice. Only install new templates when a
  // pre-existing library is being migrated (or defaults filled an absent field).
  const legacyMigratedAnnouncements = needsLegacyContentMigration && incomingAnnouncements.length
    ? appendMissingById(retainedAnnouncements, brigadeAnnouncements)
    : retainedAnnouncements;
  const savedAnnouncements = needsPhase3ContentMigration
    ? appendMissingPhase3Content(legacyMigratedAnnouncements, phase3Announcements)
    : legacyMigratedAnnouncements;

  const incomingBlips = state.savedBlips ?? initialState.savedBlips;
  const savedBlips = needsLegacyContentMigration && incomingBlips.length
    ? appendMissingById(incomingBlips, brigadeBlips)
    : incomingBlips;

  const donorGroups = needsLegacyContentMigration
    ? appendMissingById(state.donorGroups ?? initialState.donorGroups, initialState.donorGroups)
    : state.donorGroups ?? initialState.donorGroups;

  const incomingGivingPrograms = state.givingPrograms ?? initialState.givingPrograms;
  const officialGivingPrograms = new Map(initialState.givingPrograms.map((program) => [program.id, program]));
  const migratedGivingPrograms = needsLegacyContentMigration
    ? incomingGivingPrograms.map((program) => {
        const official = officialGivingPrograms.get(program.id);
        return official ? mergeOfficialGivingProgram(program, official) : program;
      })
    : incomingGivingPrograms;
  const givingPrograms = (needsLegacyContentMigration
    ? appendMissingById(migratedGivingPrograms, initialState.givingPrograms)
    : migratedGivingPrograms).map((program) => {
      const defaultProgram = initialState.givingPrograms.find((candidate) => candidate.id === program.id);
      const donorDomainProgram = needsDonorDomainMigration && defaultProgram
        ? {
            ...defaultProgram,
            ...program,
            levels: appendMissingById(program.levels.map((level) => ({
              ...defaultProgram.levels.find((candidate) => candidate.id === level.id),
              ...level
            })), defaultProgram.levels)
          }
        : program;
      return {
        ...donorDomainProgram,
        // The temporary Custom Annual Commitment level is not a supported
        // recognition tier. Filter it on every load so it cannot reappear
        // from an older saved state after the migration has already run.
        levels: donorDomainProgram.levels.filter((level) => level.id !== "custom-annual"),
        spotlightDonorId: donorDomainProgram.spotlightDonorId
          ? donorAliases.get(donorDomainProgram.spotlightDonorId) ?? donorDomainProgram.spotlightDonorId
          : undefined
      };
    });

  const remappedScreens = Object.fromEntries(Object.entries(screens).map(([id, screen]) => {
    const legacyScreen = legacyScreens[id];
    const migrateUntouchedDemoScreen = needsLegacyContentMigration
      && screen.boardProgramId
      && legacyBoardIds.has(screen.boardProgramId)
      && isUntouchedLegacyDemoScreen(id, legacyScreen);
    const replacement = migrateUntouchedDemoScreen ? initialState.screens[id] : undefined;
    const migratedScreen = replacement ? {
      ...replacement,
      status: screen.status,
      fps: screen.fps,
      lastHeartbeat: screen.lastHeartbeat,
      currentRevision: screen.currentRevision
    } : screen;
    const legacyStarWall = needsLegacyDonorStarsMigration
      ? id === "display-1"
        ? { boardProgramId: "board-legacy-stars-photo-1", assignment: "Legacy donor star wall", style: "donor-wall" as const }
        : id === "display-2"
          ? { boardProgramId: "board-legacy-stars-photo-2", assignment: "Legacy donor star wall", style: "donor-wall" as const }
          : undefined
      : undefined;
    const normalizedScreen = {
      ...migratedScreen,
      ...legacyStarWall,
      donorIds: remapDonorIds(migratedScreen.donorIds, donorAliases) ?? [],
      donorSubtextVisibility: Object.fromEntries(Object.entries(migratedScreen.donorSubtextVisibility ?? {}).map(([donorId, visible]) => [donorAliases.get(donorId) ?? donorId, visible]))
    };
    return [id, needsBoardTextContrastMigration && normalizedScreen.textFinish === "cut-brass"
      ? { ...normalizedScreen, textFinish: "flat" as const }
      : normalizedScreen];
  })) as LanternState["screens"];

  const retiredAnnouncementIds = new Set(retiredAnnouncements.map((announcement) => announcement.id));
  const migratedSchedules = needsLegacyContentMigration
    ? incomingSchedules.map((entry) => {
        if (!legacyBoardIds.has(entry.boardId) || !isUntouchedLegacyDemoBoardSchedule(entry)) return entry;
        const replacement = initialState.schedules.find((candidate) => candidate.id === entry.id);
        return replacement ? { ...replacement } : { ...entry, boardId: fullRosterBoardIdForLegacy(entry.boardId) };
      })
    : incomingSchedules;
  const retainedSchedules = needsLegacyContentMigration
    ? migratedSchedules.filter((entry) => !isKnownDemoSchedule(entry, retiredAnnouncementIds))
    : migratedSchedules;
  const phase3MigratedSchedules = migratePhase3Schedules(retainedSchedules, incomingContentVersion);
  const boardIds = new Set(boardPrograms.map((program) => program.id));
  const announcementIds = new Set(savedAnnouncements.map((announcement) => announcement.id));
  const blipIds = new Set(savedBlips.map((blip) => blip.id));
  const screenIds = new Set(Object.keys(remappedScreens));
  const schedules = phase3MigratedSchedules.map((entry, index) => {
    const approvedHours = ["schedule-portrait-board", "schedule-landscape-board"].includes(entry.id)
      && entry.startTime === "09:00"
      && entry.endTime === "16:00"
      ? { startTime: "07:00", endTime: "18:00" }
      : {};
    const normalized = {
      ...entry,
      ...approvedHours,
      target: normalizeTarget(entry.target),
      contentType: entry.contentType ?? "board" as const,
      color: entry.color ?? ["#5f55bd", "#218ba2", "#a95777", "#956330"][index % 4]
    };
    return scheduleReferenceIsValid(normalized, boardIds, announcementIds, blipIds, screenIds)
      ? normalized
      : { ...normalized, active: false };
  });
  const userMigration = normalizeUsers(state.users);
  const userPreferences = normalizeUserPreferences(state.userPreferences, userMigration.users, userMigration.aliases);
  const auditHistory = normalizeAuditHistory(state.auditHistory, userMigration.aliases);
  const broadcastReminderAcknowledgements = normalizeBroadcastReminderAcknowledgements(
    state.broadcastReminderAcknowledgements,
    userMigration.aliases
  );
  const visitorMessages = normalizeVisitorMessages(state.visitorMessages);
  const visitorMessageRotation = normalizeVisitorMessageRotation(state.visitorMessageRotation, visitorMessages);
  const effectStudio = normalizeEffectStudioState(state.effectStudio, userMigration.users, needsEffectStudioMigration);
  effects = normalizePhase4LiveEffects(effects, initialState.live.effects, effectStudio);

  return {
    ...initialState,
    ...state,
    contentVersion: normalizedContentVersion,
    users: userMigration.users,
    userPreferences,
    auditHistory,
    broadcastReminderAcknowledgements,
    visitorMessages,
    visitorMessageRotation,
    effectStudio,
    nextScheduledEvent: needsLegacyContentMigration && /^Test Message\b/i.test(state.nextScheduledEvent ?? "")
      ? initialState.nextScheduledEvent
      : state.nextScheduledEvent,
    board: {
      ...initialState.board,
      ...state.board,
      footerVisibility: {
        ...initialState.board.footerVisibility,
        ...state.board?.footerVisibility
      }
    },
    boardPrograms: boardPrograms.map((program) => ({
      ...program,
      orientation: program.orientation
        ?? Object.values(screens).find((screen) => screen.boardProgramId === program.id)?.orientation
        ?? initialState.boardPrograms.find((candidate) => candidate.id === program.id)?.orientation
        ?? "Portrait"
    })),
    schedules,
    savedAnnouncements: savedAnnouncements.map((announcement) => ({
      ...announcement,
      character: announcement.character ?? "off",
      target: normalizeTarget(announcement.target)
    })),
    savedBlips: savedBlips.map((blip) => ({
      ...blip,
      target: normalizeTarget(blip.target)
    })),
    donors: donors.map((donor) => {
      const hasReceivedGift = Boolean(donor.donations?.length) || Boolean(donor.amount && donor.amount > 0);
      const pledgeOnly = Boolean(donor.givingProgramId) && !hasReceivedGift;
      const amountUnknown = donor.amountUnknown === true;
      const seededBrigadeDonor = initialState.donors.some((seeded) => seeded.id === donor.id && seeded.givingProgramId === "toy-soldier-brigade");
      const migratedDonor = needsDonorDomainMigration && seededBrigadeDonor
        ? withBrigadeOpeningPayment(donor)
        : donor;
      const legacyDonor = migratedDonor as Donor & LegacyDonorAppearance;
      const {
        fontOverride: _fontOverride,
        nameColor: _nameColor,
        accentColor: _accentColor,
        highlight: _highlight,
        animation: _animation,
        icon: _icon,
        customIconImage: _customIconImage,
        ...profile
      } = legacyDonor;
      return {
        ...profile,
        tags: (donor.tags ?? []).filter((tag) => tag.trim().toLocaleLowerCase() !== "unrestricted support"),
        donationDate: pledgeOnly || amountUnknown ? undefined : donor.donationDate ?? donor.since,
        basicInfo: donor.basicInfo ?? donor.subtext ?? donor.note,
        expandedInfo: donor.expandedInfo ?? "",
        donations: migratedDonor.donations ?? (!pledgeOnly && !amountUnknown && donor.amount ? [{ id: `${donor.id}-legacy-gift`, date: donor.donationDate ?? donor.since, amount: donor.amount, type: donor.donationType ?? "Cash", note: donor.note }] : []),
        donationType: pledgeOnly ? undefined : donor.donationType ?? (donor.category === "Legacy" ? "Legacy" : donor.category === "Corporate" ? "Sponsorship" : "Cash"),
        amount: pledgeOnly || amountUnknown ? undefined : donor.amount ?? 0,
        amountUnknown: amountUnknown || undefined,
        // Older donor records predate per-display assignment and belonged to every screen.
        // An explicitly empty array now means the donor is intentionally shown nowhere.
        displayIds: donor.displayIds ?? Object.keys(remappedScreens),
        boardIds: donor.boardIds ?? boardPrograms
          .filter((program) => program.donorIds.includes(donor.id) || program.panels?.some((panel) => panel.donorIds?.includes(donor.id)))
          .map((program) => program.id)
      };
    }),
    givingPrograms,
    donorGroups,
    recognitionSettings: {
      tiers: uniqueStrings(state.recognitionSettings?.tiers, donors.map((donor) => donor.tier), initialState.recognitionSettings.tiers),
      categories: uniqueStrings(state.recognitionSettings?.categories, donors.map((donor) => donor.category), initialState.recognitionSettings.categories),
      tags: uniqueStrings(state.recognitionSettings?.tags, donors.flatMap((donor) => donor.tags ?? []), initialState.recognitionSettings.tags)
        .filter((tag) => tag.trim().toLocaleLowerCase() !== "unrestricted support")
        .sort(),
      appearance: ["dark", "light", "ocean", "warm", "contrast", "sparkle"].includes(state.recognitionSettings?.appearance ?? "")
        ? state.recognitionSettings.appearance
        : "dark"
    },
    announcement: needsLegacyContentMigration && state.announcement && isKnownDemoAnnouncement(state.announcement)
      ? { ...initialState.announcement, active: false }
      : {
          ...initialState.announcement,
          ...state.announcement,
          character: state.announcement?.character ?? "off",
          target: normalizeTarget(state.announcement?.target)
        },
    activeBlip: {
      ...initialState.activeBlip,
      ...state.activeBlip,
      target: normalizeTarget(state.activeBlip?.target)
    },
    live: normalizeBroadcastComposition({
      ...initialState.live,
      ...state.live,
      source: (["demo", "camera", "screen", "recording"] as LiveSource[]).includes(state.live?.source as LiveSource)
        ? state.live!.source
        : state.live?.usingCamera ? "camera" : "demo",
      frame: {
        ...initialState.live.frame,
        ...state.live?.frame,
        crop: { ...initialState.live.frame.crop, ...state.live?.frame?.crop }
      },
      chromaKey,
      effects,
      target: normalizeTarget(state.live?.target)
    }),
    screens: remappedScreens
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
    label: screen?.label ?? fallback.label,
    style: screen?.style ?? fallback.style,
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
