import type { DonorBoardProgram, LanternState, ScheduleEntry, ScreenId } from "./types";

export type ScheduleContentType = NonNullable<ScheduleEntry["contentType"]>;

export function scheduleMatchesDate(entry: ScheduleEntry, now: Date) {
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (entry.recurrence === "once" && entry.scheduleDate) return entry.scheduleDate === localDate;
  if (entry.scheduleDate && localDate < entry.scheduleDate) return false;
  if (entry.scheduleEndDate && localDate > entry.scheduleEndDate) return false;
  return entry.days.includes(now.getDay());
}

function priority(entry: ScheduleEntry, screenId: ScreenId, index: number) {
  const target = entry.target === screenId ? 2 : 0;
  const bounded = entry.recurrence === "once" ? 4 : entry.scheduleDate && entry.scheduleEndDate ? 3 : entry.scheduleDate || entry.scheduleEndDate ? 2 : 0;
  const date = entry.scheduleDate ? Number(entry.scheduleDate.replace(/-/g, "")) : 0;
  const start = Number(entry.startTime.replace(":", ""));
  return [target, bounded, date, start, index] as const;
}

function compare(left: readonly number[], right: readonly number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

/** Resolve overlapping events consistently on every app surface. */
export function resolveCurrentScheduleEntry(
  state: LanternState,
  screenId: ScreenId,
  contentType: ScheduleContentType,
  now = new Date(),
  isUsable: (entry: ScheduleEntry) => boolean = () => true
) {
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return (state.schedules ?? [])
    .map((entry, index) => ({ entry, priority: priority(entry, screenId, index) }))
    .filter(({ entry }) => (entry.contentType ?? "board") === contentType && entry.active && isUsable(entry)
      && scheduleMatchesDate(entry, now) && (entry.target === "all" || entry.target === screenId)
      && time >= entry.startTime && time < entry.endTime)
    .sort((left, right) => compare(left.priority, right.priority))[0]?.entry;
}

/** Resolve overlapping board events consistently on every app surface. */
export function resolveCurrentBoardSchedule(state: LanternState, screenId: ScreenId, now = new Date()) {
  return resolveCurrentScheduleEntry(
    state,
    screenId,
    "board",
    now,
    (entry) => Boolean(entry.boardId && state.boardPrograms.some((program) => program.id === entry.boardId))
  );
}

export function resolveActiveBoardProgram(state: LanternState, screenId: ScreenId, now = new Date()): DonorBoardProgram | undefined {
  const scheduled = resolveCurrentBoardSchedule(state, screenId, now);
  if (scheduled) {
    const program = state.boardPrograms.find((candidate) => candidate.id === scheduled.boardId);
    if (program) return program;
  }
  const assignedId = state.screens[screenId]?.boardProgramId;
  return state.boardPrograms.find((candidate) => candidate.id === assignedId)
    ?? state.boardPrograms.find((candidate) => candidate.active && candidate.orientation === state.screens[screenId]?.orientation)
    ?? state.boardPrograms[0];
}
