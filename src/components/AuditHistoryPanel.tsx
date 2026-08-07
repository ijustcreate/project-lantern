import { useDeferredValue, useId, useMemo, useState } from "react";
import type { AuditRecord, LanternState } from "../types";

interface AuditHistoryPanelProps {
  auditHistory: LanternState["auditHistory"];
  className?: string;
  title?: string;
}
const ACTION_LABELS: Record<AuditRecord["action"], string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  reorder: "Reordered",
  publish: "Published",
  run: "Ran"
};

function joinClassNames(...names: Array<string | undefined | false>) {
  return names.filter(Boolean).join(" ");
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatValue(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return "This value could not be displayed.";
  }
}

function auditSearchText(record: AuditRecord) {
  return [
    record.summary,
    record.userName,
    record.userId,
    record.entityType,
    record.entityId,
    record.action,
    record.before === undefined ? "" : formatValue(record.before),
    record.after === undefined ? "" : formatValue(record.after)
  ]
    .join(" ")
    .toLocaleLowerCase();
}

/** A read-only, searchable view over the persisted Lantern audit trail. */
export function AuditHistoryPanel({ auditHistory, className, title = "Audit history" }: AuditHistoryPanelProps) {
  const headingId = useId();
  const searchId = useId();
  const actionId = useId();
  const entityId = useId();
  const userId = useId();
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());

  const actions = useMemo(
    () => Array.from(new Set(auditHistory.map((record) => record.action))).sort(),
    [auditHistory]
  );
  const entityTypes = useMemo(
    () => Array.from(new Set(auditHistory.map((record) => record.entityType))).sort((a, b) => a.localeCompare(b)),
    [auditHistory]
  );
  const users = useMemo(() => {
    const namesById = new Map<string, string>();
    auditHistory.forEach((record) => namesById.set(record.userId, record.userName));
    return Array.from(namesById, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [auditHistory]);

  const filteredHistory = useMemo(() => {
    return [...auditHistory]
      .filter((record) => actionFilter === "all" || record.action === actionFilter)
      .filter((record) => entityFilter === "all" || record.entityType === entityFilter)
      .filter((record) => userFilter === "all" || record.userId === userFilter)
      .filter((record) => !deferredQuery || auditSearchText(record).includes(deferredQuery))
      .sort((a, b) => {
        const aTime = Date.parse(a.timestamp);
        const bTime = Date.parse(b.timestamp);
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
      });
  }, [actionFilter, auditHistory, deferredQuery, entityFilter, userFilter]);

  const filtersActive = Boolean(query || actionFilter !== "all" || entityFilter !== "all" || userFilter !== "all");
  const clearFilters = () => {
    setQuery("");
    setActionFilter("all");
    setEntityFilter("all");
    setUserFilter("all");
  };

  return (
    <section className={joinClassNames("audit-history-panel", className)} aria-labelledby={headingId}>
      <header className="audit-history-panel__header">
        <div>
          <h2 id={headingId}>{title}</h2>
          <p>Review who changed local board data and when.</p>
        </div>
      </header>

      <div className="audit-history-panel__filters" role="search" aria-label="Filter audit history">
        <div className="audit-history-panel__field audit-history-panel__field--search">
          <label htmlFor={searchId}>Search history</label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Summary, person, or item"
          />
        </div>

        <div className="audit-history-panel__field">
          <label htmlFor={actionId}>Action</label>
          <select id={actionId} value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
            <option value="all">All actions</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {ACTION_LABELS[action]}
              </option>
            ))}
          </select>
        </div>

        <div className="audit-history-panel__field">
          <label htmlFor={entityId}>Item type</label>
          <select id={entityId} value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
            <option value="all">All item types</option>
            {entityTypes.map((entityType) => (
              <option key={entityType} value={entityType}>
                {entityType}
              </option>
            ))}
          </select>
        </div>

        <div className="audit-history-panel__field">
          <label htmlFor={userId}>Person</label>
          <select id={userId} value={userFilter} onChange={(event) => setUserFilter(event.target.value)}>
            <option value="all">Everyone</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="audit-history-panel__clear" onClick={clearFilters} disabled={!filtersActive}>
          Clear filters
        </button>
      </div>

      <p className="audit-history-panel__result-count" role="status" aria-live="polite">
        {filteredHistory.length === auditHistory.length
          ? `${auditHistory.length} ${auditHistory.length === 1 ? "change" : "changes"}`
          : `${filteredHistory.length} of ${auditHistory.length} changes`}
      </p>

      {filteredHistory.length ? (
        <ol className="audit-history-panel__list">
          {filteredHistory.map((record) => {
            const recordHeadingId = `${headingId}-${record.id}`;
            const hasDetails = record.before !== undefined || record.after !== undefined;
            return (
              <li key={record.id} className="audit-history-panel__item">
                <article aria-labelledby={recordHeadingId}>
                  <div className="audit-history-panel__item-heading">
                    <span className={`audit-history-panel__action audit-history-panel__action--${record.action}`}>
                      {ACTION_LABELS[record.action]}
                    </span>
                    <time dateTime={record.timestamp}>{formatTimestamp(record.timestamp)}</time>
                  </div>
                  <h3 id={recordHeadingId}>{record.summary}</h3>
                  <p className="audit-history-panel__byline">
                    {record.userName} · {record.entityType} · <span>{record.entityId}</span>
                  </p>
                  {hasDetails ? (
                    <details className="audit-history-panel__details">
                      <summary>View change details</summary>
                      <div className="audit-history-panel__change-values">
                        {record.before !== undefined ? (
                          <section aria-label="Previous value">
                            <h4>Before</h4>
                            <pre>{formatValue(record.before)}</pre>
                          </section>
                        ) : null}
                        {record.after !== undefined ? (
                          <section aria-label="New value">
                            <h4>After</h4>
                            <pre>{formatValue(record.after)}</pre>
                          </section>
                        ) : null}
                      </div>
                    </details>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="audit-history-panel__empty" role="status">
          <p>{auditHistory.length ? "No changes match these filters." : "No changes have been recorded yet."}</p>
          {filtersActive ? (
            <button type="button" onClick={clearFilters}>
              Show all history
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
