import type { SavedAnnouncement, ScheduleEntry, ScreenId } from "./types";

export const PHASE3_CONTENT_VERSION = 6;

const ALL_WEEK = [0, 1, 2, 3, 4, 5, 6];
const ART_CENTER_ASSET = "/assets/announcements/art-center-paintbrush.svg";

const announcementBase = {
  target: "all" as const,
  priority: "Normal" as const,
  textColor: "#173f61",
  imageUrl: ART_CENTER_ASSET,
  imageX: 76,
  imageY: 50,
  imageWidth: 28,
  layoutX: 8,
  layoutY: 13,
  layoutWidth: 72,
  durationMinutes: 5,
  timerStyle: "off" as const,
  timerPosition: "top-right" as const,
  timerAccentColor: "#ef8157",
  timerTrackColor: "#f4d894",
  finishSfx: "off" as const,
  sfxVolume: 55,
  character: "off" as const
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
  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate(), 12);
  const start = new Date(today);
  const end = new Date(today);
  start.setDate(start.getDate() - 7);
  end.setDate(end.getDate() + 30);
  return { startDate: localDateValue(start), endDate: localDateValue(end) };
}

type DemoSlot = Pick<ScheduleEntry, "name" | "startTime" | "endTime" | "contentType" | "boardId" | "announcementId" | "blipId" | "color">;

const welcomeSlots: DemoSlot[] = [
  { name: "Welcome / Today at the Museum", startTime: "07:00", endTime: "08:30", contentType: "board", boardId: "board-toy-about-portrait", color: "#3579A6" },
  { name: "Toy Soldier Brigade Class of 2026", startTime: "08:30", endTime: "09:45", contentType: "board", boardId: "board-toy-soldier-portrait", color: "#1675A8" },
  { name: "Art Center countdown", startTime: "09:45", endTime: "10:00", contentType: "announcement", boardId: "board-toy-soldier-portrait", announcementId: "art-center-countdown", color: "#D99005" },
  { name: "The Art Center is Open", startTime: "10:00", endTime: "10:05", contentType: "announcement", boardId: "board-toy-soldier-portrait", announcementId: "art-center-open", color: "#2E9E91" },
  { name: "Donor stories / Play It Forward", startTime: "10:05", endTime: "12:00", contentType: "board", boardId: "board-supporter-spotlight-portrait", color: "#A95777" },
  { name: "Visitor kindness prompt", startTime: "12:00", endTime: "13:30", contentType: "blip", boardId: "board-toy-good-deeds-portrait", blipId: "blip-brigade-good-deed", color: "#26A89F" },
  { name: "Upcoming programs", startTime: "13:30", endTime: "15:00", contentType: "announcement", boardId: "board-toy-about-portrait", announcementId: "brigade-museum-news", color: "#7B61A8" },
  { name: "Signature board / visitor good deeds", startTime: "15:00", endTime: "16:30", contentType: "board", boardId: "board-toy-good-deeds-portrait", color: "#D09B2A" },
  { name: "Thank-you rotation", startTime: "16:30", endTime: "17:45", contentType: "board", boardId: "board-toy-soldier-portrait", color: "#B94C43" },
  { name: "Closing soon / tomorrow preview", startTime: "17:45", endTime: "18:00", contentType: "announcement", boardId: "board-toy-about-portrait", announcementId: "museum-closing-preview", color: "#596579" }
];

const discoverySlots: DemoSlot[] = [
  { name: "Panoramic Welcome / Today’s Highlights", startTime: "07:00", endTime: "08:30", contentType: "board", boardId: "board-toy-about-landscape", color: "#3579A6" },
  { name: "Full Recognition Roster", startTime: "08:30", endTime: "09:45", contentType: "board", boardId: "board-toy-soldier-landscape", color: "#1675A8" },
  { name: "Art Center countdown / directions", startTime: "09:45", endTime: "10:00", contentType: "announcement", boardId: "board-toy-soldier-landscape", announcementId: "art-center-countdown", color: "#D99005" },
  { name: "The Art Center is Open", startTime: "10:00", endTime: "10:05", contentType: "announcement", boardId: "board-toy-soldier-landscape", announcementId: "art-center-open", color: "#2E9E91" },
  { name: "Recognition stories / museum impact", startTime: "10:05", endTime: "12:00", contentType: "board", boardId: "board-supporter-spotlight-landscape", color: "#A95777" },
  { name: "Community message / good-deed prompt", startTime: "12:00", endTime: "13:30", contentType: "blip", boardId: "board-toy-good-deeds-landscape", blipId: "blip-brigade-good-deed", color: "#26A89F" },
  { name: "Board rotation / announcements", startTime: "13:30", endTime: "15:00", contentType: "announcement", boardId: "board-toy-about-landscape", announcementId: "brigade-museum-news", color: "#7B61A8" },
  { name: "Play It Forward showcase", startTime: "15:00", endTime: "16:30", contentType: "board", boardId: "board-toy-good-deeds-landscape", color: "#D09B2A" },
  { name: "Donor and visitor gratitude rotation", startTime: "16:30", endTime: "17:45", contentType: "board", boardId: "board-toy-soldier-landscape", color: "#B94C43" },
  { name: "Closing-soon panoramic message", startTime: "17:45", endTime: "18:00", contentType: "announcement", boardId: "board-toy-about-landscape", announcementId: "museum-closing-preview", color: "#596579" }
];

export function createPhase3DemoSchedule(reference = new Date()): ScheduleEntry[] {
  const range = phase3DemoRange(reference);
  return [
    ...scheduleTrack("welcome", "display-1", welcomeSlots, range),
    ...scheduleTrack("discovery", "display-2", discoverySlots, range)
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
  return appendMissingPhase3Content(
    archiveUntouchedLegacyFullDaySchedules(existing),
    createPhase3DemoSchedule(reference)
  );
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
  return /^phase3-demo-(welcome|discovery)-\d{2}$/.test(id);
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
