import type { SavedAnnouncement, ScheduleEntry, ScreenId } from "./types";

export const PHASE3_CONTENT_VERSION = 18;

/** Museum hours: Wednesday through Sunday. Regular boards run 07:00–18:00. */
const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];
const ART_CENTER_ASSET = "/assets/announcements/art-center-paintbrush.svg";

const announcementBase = {
  target: "all" as const,
  priority: "Normal" as const,
  textColor: "#173f61",
  imageUrl: ART_CENTER_ASSET,
  imageX: 78,
  imageY: 22,
  imageWidth: 20,
  durationMinutes: 5,
  timerStyle: "off" as const,
  timerPosition: "top-right" as const,
  timerAccentColor: "#ef8157",
  timerTrackColor: "#f4d894",
  finishSfx: "off" as const,
  sfxVolume: 55,
};

/**
 * Stable, editable templates installed by the Phase 3 content migration.
 * The percentage-based artwork placement is intentionally shared by portrait
 * and landscape displays; the announcement compositor already responds to the
 * selected display orientation.
 */
export const phase3Announcements: SavedAnnouncement[] = [
  {
    ...announcementBase,
    id: "art-center-countdown",
    title: "Art Center opens at 10:00",
    message: "Paintbrushes are waking up! The Art Center opens at 10:00 a.m.",
    details: "Follow the hand-drawn paintbrush and get your next big idea ready.",
    style: "Temporary Card",
    backgroundColor: "#f8e7b7",
    layoutX: 36,
    layoutY: 20,
    layoutWidth: 58,
    durationMinutes: 15,
    timerStyle: "circular"
  },
  {
    ...announcementBase,
    id: "art-center-open",
    title: "The Art Center is Open",
    message: "The Art Center is now open—come draw, paint, and make something only you would make.",
    details: "Look for the paintbrush signs in the main hall.",
    style: "Ribbon",
    backgroundColor: "#7bc6bd",
    priority: "Elevated",
    finishSfx: "chime"
  },
  {
    ...announcementBase,
    id: "museum-closing-preview",
    title: "Closing Soon · Keep the Wonder Going",
    message: "The museum closes soon. Choose one spark of wonder to carry home.",
    details: "Tomorrow brings more questions, more play, and more discoveries.",
    style: "Lower Third",
    backgroundColor: "#173f61",
    textColor: "#fff5dc",
    imageWidth: 20,
    durationMinutes: 15
  }
];

export interface Phase3DemoRange {
  startDate: string;
  endDate: string;
}

export function phase3DemoRange(reference = new Date()): Phase3DemoRange {
  const start = new Date(2026, 7, 25, 12);
  const end = new Date(2026, 8, 30, 12);
  return { startDate: localDateValue(start), endDate: localDateValue(end) };
}

type DemoSlot = Pick<ScheduleEntry, "name" | "startTime" | "endTime" | "contentType" | "boardId" | "announcementId" | "blipId" | "color">;

const welcomeSlots: DemoSlot[] = [
  { name: "Welcome / Today at the Museum", startTime: "07:00", endTime: "12:00", contentType: "board", boardId: "board-toy-about-portrait", color: "#3579A6" },
  { name: "Art Center opens", startTime: "09:55", endTime: "10:00", contentType: "announcement", boardId: "board-toy-about-portrait", announcementId: "art-center-countdown", color: "#D99005" },
  { name: "Supporter spotlight", startTime: "12:00", endTime: "18:00", contentType: "board", boardId: "board-supporter-spotlight-portrait", color: "#A95777" },
  { name: "Visitor kindness blip", startTime: "13:15", endTime: "13:17", contentType: "blip", boardId: "board-supporter-spotlight-portrait", blipId: "blip-brigade-good-deed", color: "#26A89F" },
  { name: "After-hours board test · Welcome", startTime: "18:15", endTime: "18:30", contentType: "board", boardId: "board-toy-about-portrait", color: "#596579" }
];

const discoverySlots: DemoSlot[] = [
  { name: "Panoramic Welcome / Today’s Highlights", startTime: "07:00", endTime: "12:00", contentType: "board", boardId: "board-toy-about-landscape", color: "#3579A6" },
  { name: "Art Center is open", startTime: "10:00", endTime: "10:05", contentType: "announcement", boardId: "board-toy-about-landscape", announcementId: "art-center-open", color: "#2E9E91" },
  { name: "Supporter spotlight", startTime: "12:00", endTime: "18:00", contentType: "board", boardId: "board-supporter-spotlight-landscape", color: "#A95777" },
  { name: "Visitor kindness blip", startTime: "14:15", endTime: "14:17", contentType: "blip", boardId: "board-supporter-spotlight-landscape", blipId: "blip-brigade-good-deed", color: "#26A89F" },
  { name: "After-hours board test · Discovery", startTime: "18:15", endTime: "18:30", contentType: "board", boardId: "board-toy-about-landscape", color: "#596579" }
];

export function createPhase3DemoSchedule(reference = new Date()): ScheduleEntry[] {
  const range = phase3DemoRange(reference);
  const weekly = (id: string, name: string, target: ScreenId, boardId: string, startTime: string, endTime: string, color: string, contentType: ScheduleEntry["contentType"] = "board", extra: Partial<ScheduleEntry> = {}): ScheduleEntry => ({ id, name, target, boardId, startTime, endTime, color, contentType, days: [...ALL_WEEK], recurrence: "weekly", scheduleDate: range.startDate, scheduleEndDate: range.endDate, active: true, ...extra });
  return [
    weekly("phase3-demo-welcome-01", "Morning welcome", "display-1", "board-toy-about-portrait", "09:00", "13:00", "#3579A6"),
    weekly("phase3-demo-welcome-02", "Art Center opens", "display-1", "board-toy-about-portrait", "10:00", "10:05", "#D99005", "announcement", { announcementId: "art-center-open" }),
    weekly("phase3-demo-welcome-03", "Afternoon supporter spotlight", "display-1", "board-supporter-spotlight-portrait", "13:00", "17:00", "#A95777"),
    weekly("phase3-demo-welcome-04", "Visitor kindness blip", "display-1", "board-supporter-spotlight-portrait", "14:15", "14:17", "#26A89F", "blip", { blipId: "blip-brigade-good-deed" }),
    weekly("phase3-demo-discovery-01", "Morning welcome", "display-2", "board-toy-about-landscape", "09:00", "13:00", "#3579A6"),
    weekly("phase3-demo-discovery-02", "Art Center opens", "display-2", "board-toy-about-landscape", "10:00", "10:05", "#D99005", "announcement", { announcementId: "art-center-open" }),
    weekly("phase3-demo-discovery-03", "Afternoon supporter spotlight", "display-2", "board-supporter-spotlight-landscape", "13:00", "17:00", "#A95777"),
    weekly("phase3-demo-discovery-04", "Visitor kindness blip", "display-2", "board-supporter-spotlight-landscape", "14:15", "14:17", "#26A89F", "blip", { blipId: "blip-brigade-good-deed" }),
    { ...weekly("phase3-demo-test-01", "After-hours test board", "display-1", "board-toy-about-portrait", "18:15", "18:30", "#6B7280"), days: [1, 2] },
    { ...weekly("phase3-demo-test-02", "After-hours test board", "display-2", "board-toy-about-landscape", "18:15", "18:30", "#6B7280"), days: [1, 2] }
  ];
}

export function appendMissingPhase3Content<T extends { id: string }>(existing: T[], seeded: readonly T[]): T[] {
  const ids = new Set(existing.map((item) => item.id));
  return [...existing, ...seeded.filter((item) => !ids.has(item.id)).map((item) => ({ ...item }))];
}

export function migratePhase3Schedules(
  existing: readonly ScheduleEntry[],
  incomingContentVersion: number,
  reference = new Date()
): ScheduleEntry[] {
  if (incomingContentVersion >= PHASE3_CONTENT_VERSION) return [...existing];
  // Phase 3 entries are generated demo content rather than curator-created
  // schedules. Replace only those stable IDs so the compact v8 rotation takes
  // effect without touching custom schedules or legacy content.
  return createPhase3DemoSchedule(reference);
}

/**
 * The v5 demo used one full-day board event per display. Retaining those active
 * alongside the detailed v6 rotation would create a board conflict in every
 * slot. Archive only byte-for-byte-equivalent seed records; a curator's renamed,
 * recolored, retimed, or otherwise customized event is never changed.
 */
export function archiveUntouchedLegacyFullDaySchedules(entries: readonly ScheduleEntry[]): ScheduleEntry[] {
  return entries.map((entry) => isUntouchedLegacyFullDaySchedule(entry) ? { ...entry, active: false } : entry);
}

export function isPhase3DemoScheduleId(id: string): boolean {
  return /^phase3-demo-(welcome|discovery)-\d{2}$|^phase3-demo-test-\d+$/.test(id);
}

function scheduleTrack(track: string, target: ScreenId, slots: DemoSlot[], range: Phase3DemoRange): ScheduleEntry[] {
  return slots.map((slot, index) => ({
    id: `phase3-demo-${track}-${String(index + 1).padStart(2, "0")}`,
    ...slot,
    target,
    days: [...ALL_WEEK],
    recurrence: "weekly",
    scheduleDate: range.startDate,
    scheduleEndDate: range.endDate,
    active: true
  }));
}

function isUntouchedLegacyFullDaySchedule(entry: ScheduleEntry): boolean {
  const portrait = entry.id === "schedule-portrait-board";
  const landscape = entry.id === "schedule-landscape-board";
  if (!portrait && !landscape) return false;
  const expectedTarget = portrait ? "display-1" : "display-2";
  const expectedName = portrait ? "Toy Soldier Brigade · Welcome Gallery" : "Toy Soldier Brigade · Discovery Hall";
  const expectedBoard = portrait ? "board-toy-soldier-portrait" : "board-toy-soldier-landscape";
  const expectedColor = portrait ? "#1675a8" : "#c74432";
  return entry.name === expectedName
    && entry.target === expectedTarget
    && entry.boardId === expectedBoard
    && (entry.contentType ?? "board") === "board"
    && entry.recurrence === "weekly"
    && entry.startTime === "07:00"
    && entry.endTime === "18:00"
    && entry.color?.toLocaleLowerCase() === expectedColor
    && entry.active === true
    && entry.scheduleDate === undefined
    && entry.scheduleEndDate === undefined
    && entry.announcementId === undefined
    && entry.blipId === undefined
    && entry.broadcastMode === undefined
    && entry.broadcastVideoUrl === undefined
    && entry.days.length === 5
    && [0, 3, 4, 5, 6].every((day) => entry.days.includes(day));
}

function localDateValue(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
