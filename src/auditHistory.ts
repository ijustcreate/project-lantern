import type { AuditRecord } from "./types";

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

function compactBoardSnapshot(value: unknown): unknown {
  if (!value || typeof value !== "object") return scrubAuditValue(value);
  const board = value as Record<string, unknown>;
  return {
    id: board.id,
    name: board.name,
    orientation: board.orientation,
    templatePurpose: board.templatePurpose,
    panelCount: Array.isArray(board.panels) ? board.panels.length : 0,
    donorCount: Array.isArray(board.donorIds) ? board.donorIds.length : 0
  };
}

/** Keep audit metadata useful without copying an entire board for every drag. */
export function compactAuditValue(entityType: string, value: unknown): unknown {
  return entityType === "board" ? compactBoardSnapshot(value) : scrubAuditValue(value);
}

/** Also compacts legacy records during load/save so one successful save repairs old state bloat. */
export function compactAuditRecord(record: AuditRecord): AuditRecord {
  return {
    ...record,
    before: compactAuditValue(record.entityType, record.before),
    after: compactAuditValue(record.entityType, record.after)
  };
}
