import type {
  AuditRecord,
  BroadcastReminderAcknowledgement,
  LanternState,
  LanternUser,
  ScheduleEntry
} from "./types";

export interface AuditActor {
  id: string;
  name: string;
}

const AUDIT_LIMIT = 350;
const REMINDER_LIMIT = 250;

const collectionLabels: Record<string, string> = {
  donors: "donor",
  boardPrograms: "board",
  schedules: "schedule",
  savedAnnouncements: "announcement",
  savedBlips: "blip",
  visitorMessages: "visitor message",
  givingPrograms: "giving program",
  donorGroups: "donor group",
  users: "user"
};

function idOf(value: unknown, fallback: string) {
  return value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : fallback;
}

function scrubAuditValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value, (key, nested) => {
      if (nested instanceof Blob) return `[${nested.type || "blob"} ${nested.size} bytes]`;
      if (typeof nested === "string" && (nested.startsWith("data:") || nested.startsWith("blob:"))) {
        return `[local media omitted${key ? `: ${key}` : ""}]`;
      }
      return nested;
    })) as unknown;
  } catch {
    return "[value unavailable]";
  }
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function auditRecord(
  actor: AuditActor,
  entityType: string,
  entityId: string,
  action: AuditRecord["action"],
  before: unknown,
  after: unknown,
  summary?: string
): AuditRecord {
  const timestamp = new Date().toISOString();
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    userId: actor.id,
    userName: actor.name,
    entityType,
    entityId,
    action,
    summary: summary ?? `${action[0].toUpperCase()}${action.slice(1)} ${entityType}`,
    before: scrubAuditValue(before),
    after: scrubAuditValue(after)
  };
}

function diffCollection(key: string, before: unknown[], after: unknown[], actor: AuditActor) {
  const entityType = collectionLabels[key] ?? key;
  const beforeById = new Map(before.map((item, index) => [idOf(item, `${key}-${index}`), item]));
  const afterById = new Map(after.map((item, index) => [idOf(item, `${key}-${index}`), item]));
  const entries: AuditRecord[] = [];

  new Set([...beforeById.keys(), ...afterById.keys()]).forEach((id) => {
    const previous = beforeById.get(id);
    const next = afterById.get(id);
    if (previous === undefined && next !== undefined) entries.push(auditRecord(actor, entityType, id, "create", undefined, next));
    else if (previous !== undefined && next === undefined) entries.push(auditRecord(actor, entityType, id, "delete", previous, undefined));
    else if (!same(previous, next)) entries.push(auditRecord(actor, entityType, id, "update", previous, next));
  });

  if (key === "donors") {
    const beforeOrder = before.map((item, index) => idOf(item, `${index}`));
    const afterOrder = after.map((item, index) => idOf(item, `${index}`));
    if (beforeOrder.length === afterOrder.length
      && beforeOrder.every((id) => afterOrder.includes(id))
      && !same(beforeOrder, afterOrder)) {
      entries.push(auditRecord(actor, "donor roster", "manual-order", "reorder", beforeOrder, afterOrder, "Reordered the donor roster"));
    }
  }
  return entries;
}

function diffScreens(before: LanternState["screens"], after: LanternState["screens"], actor: AuditActor) {
  const entries: AuditRecord[] = [];
  new Set([...Object.keys(before), ...Object.keys(after)]).forEach((id) => {
    const previous = before[id];
    const next = after[id];
    if (!previous && next) entries.push(auditRecord(actor, "display", id, "create", undefined, next));
    else if (previous && !next) entries.push(auditRecord(actor, "display", id, "delete", previous, undefined));
    else if (!same(previous, next)) entries.push(auditRecord(actor, "display", id, "update", previous, next));
  });
  return entries;
}

/**
 * Adds compact, entity-level history for a user mutation. Runtime heartbeats use
 * setState directly and therefore do not flood this operational audit trail.
 */
export function withAuditHistory(before: LanternState, after: LanternState, actor: AuditActor): LanternState {
  if (before === after) return after;
  const entries: AuditRecord[] = [];
  (Object.keys(collectionLabels) as Array<keyof LanternState>).forEach((key) => {
    const previous = before[key];
    const next = after[key];
    if (Array.isArray(previous) && Array.isArray(next) && !same(previous, next)) {
      entries.push(...diffCollection(String(key), previous, next, actor));
    }
  });
  if (!same(before.screens, after.screens)) entries.push(...diffScreens(before.screens, after.screens, actor));

  const singletonFields: Array<[keyof LanternState, string, string]> = [
    ["recognitionSettings", "settings", "recognition"],
    ["theme", "board theme", "theme"],
    ["board", "board content", "shared-content"],
    ["live", "broadcast composition", "live"],
    ["effectStudio", "effect studio", "costumes-and-calibration"],
    ["announcement", "active announcement", after.announcement.id],
    ["activeBlip", "active blip", after.activeBlip.id]
  ];
  singletonFields.forEach(([key, entityType, entityId]) => {
    if (!same(before[key], after[key])) entries.push(auditRecord(actor, entityType, entityId, "update", before[key], after[key]));
  });

  if (!entries.length) return after;
  return {
    ...after,
    auditHistory: [...entries.reverse(), ...(after.auditHistory ?? before.auditHistory ?? [])].slice(0, AUDIT_LIMIT)
  };
}

export function defaultUserPreferences(user: LanternUser, theme: LanternState["recognitionSettings"]["appearance"]): LanternState["userPreferences"][number] {
  return {
    userId: user.id,
    theme,
    donorSort: "manual",
    roomWindows: {},
    roomMirrorByDisplay: {},
    editor: {}
  };
}

export function scheduleOccurrenceKey(entry: ScheduleEntry, date: Date) {
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `${entry.id}:${localDate}:${entry.startTime}`;
}

export function reminderMayPrompt(
  acknowledgements: BroadcastReminderAcknowledgement[],
  occurrenceKey: string,
  now = new Date()
) {
  const acknowledgement = acknowledgements.find((item) => item.occurrenceKey === occurrenceKey);
  if (!acknowledgement) return true;
  if (acknowledgement.status === "cleared" || acknowledgement.status === "acknowledged") return false;
  if (acknowledgement.status === "dismissed") {
    return !acknowledgement.snoozedUntil || Date.parse(acknowledgement.snoozedUntil) <= now.getTime();
  }
  return false;
}

export function updateReminderAcknowledgement(
  acknowledgements: BroadcastReminderAcknowledgement[],
  acknowledgement: BroadcastReminderAcknowledgement
) {
  return [
    acknowledgement,
    ...acknowledgements.filter((item) => item.occurrenceKey !== acknowledgement.occurrenceKey)
  ].slice(0, REMINDER_LIMIT);
}
