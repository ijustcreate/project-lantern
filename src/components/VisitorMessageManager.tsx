import { ArrowDown, ArrowUp, Eye, Megaphone, Pencil, Plus, RefreshCcw, Save, Send, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ScreenId } from "../types";
import type { VisitorMessage } from "../visitorMessages";
import "./VisitorMessageManager.css";

type MessageDraft = Pick<VisitorMessage, "text" | "category" | "active" | "weight">;

const emptyDraft: MessageDraft = { text: "", category: "Curiosity", active: true, weight: 1 };

export function VisitorMessageManager({
  messages,
  currentId,
  displays,
  onChange,
  onUse,
  onNext,
  onSend,
  onSchedule
}: {
  messages: VisitorMessage[];
  currentId?: string;
  displays: Array<{ id: ScreenId; name: string; orientation: string }>;
  onChange: (messages: VisitorMessage[], summary: string) => void;
  onUse: (id: string) => void;
  onNext: () => void;
  onSend: (id: string, target: ScreenId | "all") => void;
  onSchedule: (id: string, target: ScreenId | "all") => void;
}) {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<MessageDraft>(emptyDraft);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [previewId, setPreviewId] = useState<string | undefined>(currentId);
  const [target, setTarget] = useState<ScreenId | "all">("all");
  const sorted = useMemo(() => [...messages].sort((a, b) => a.order - b.order), [messages]);
  const visible = categoryFilter === "All" ? sorted : sorted.filter((message) => message.category === categoryFilter);
  const preview = messages.find((message) => message.id === previewId) ?? messages.find((message) => message.id === currentId) ?? messages.find((message) => message.active);

  useEffect(() => {
    if (currentId) setPreviewId(currentId);
  }, [currentId]);

  const beginEdit = (message?: VisitorMessage) => {
    setEditingId(message?.id ?? "new");
    setDraft(message ? { text: message.text, category: message.category, active: message.active, weight: message.weight } : emptyDraft);
  };

  const saveDraft = () => {
    const text = draft.text.trim();
    if (!text) return;
    const now = new Date().toISOString();
    if (editingId === "new") {
      const id = `visitor-message-${Date.now().toString(36)}`;
      onChange([...messages, { id, ...draft, text, order: messages.length, createdAt: now, updatedAt: now }], "Added visitor message");
      setPreviewId(id);
    } else if (editingId) {
      onChange(messages.map((message) => message.id === editingId ? { ...message, ...draft, text, updatedAt: now } : message), "Updated visitor message");
    }
    setEditingId(null);
    setDraft(emptyDraft);
  };

  const move = (id: string, delta: -1 | 1) => {
    const index = sorted.findIndex((message) => message.id === id);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= sorted.length) return;
    const reordered = [...sorted];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    onChange(reordered.map((message, order) => ({ ...message, order, updatedAt: message.id === id ? new Date().toISOString() : message.updatedAt })), "Reordered visitor messages");
  };

  const remove = (id: string) => {
    onChange(messages.filter((message) => message.id !== id).map((message, order) => ({ ...message, order })), "Deleted visitor message");
    if (previewId === id) setPreviewId(undefined);
  };

  return <section id="visitor-message-pool" className="visitor-message-manager" aria-label="Visitor message pool">
    <header className="visitor-message-toolbar">
      <div>
        <p className="brigade-section-kicker">Visitor message pool</p>
        <h3>{messages.filter((message) => message.active).length} active messages</h3>
      </div>
      <label>Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All</option>{["Curiosity", "Creativity", "Kindness", "Courage", "Community"].map((category) => <option key={category}>{category}</option>)}</select></label>
      <button type="button" className="brigade-secondary-action compact" onClick={() => beginEdit()}><Plus size={16} /> Add message</button>
    </header>

    <div className="visitor-message-layout">
      <div className="visitor-message-list" role="list">
        {visible.map((message, index) => <article key={message.id} role="listitem" className={`${message.id === preview?.id ? "selected" : ""} ${message.active ? "" : "inactive"}`}>
          <button type="button" className="visitor-message-preview-button" onClick={() => setPreviewId(message.id)} aria-label={`Preview ${message.text}`}><Eye size={15} /></button>
          <div><span>{message.category} · weight {message.weight}</span><p>{message.text}</p></div>
          <div className="visitor-message-row-actions">
            <button type="button" onClick={() => move(message.id, -1)} disabled={index === 0} aria-label="Move message up"><ArrowUp size={14} /></button>
            <button type="button" onClick={() => move(message.id, 1)} disabled={index === visible.length - 1} aria-label="Move message down"><ArrowDown size={14} /></button>
            <button type="button" onClick={() => beginEdit(message)} aria-label="Edit message"><Pencil size={14} /></button>
            <button type="button" onClick={() => onChange(messages.map((candidate) => candidate.id === message.id ? { ...candidate, active: !candidate.active, updatedAt: new Date().toISOString() } : candidate), message.active ? "Disabled visitor message" : "Enabled visitor message")} aria-label={message.active ? "Disable message" : "Enable message"}>{message.active ? <X size={14} /> : <RefreshCcw size={14} />}</button>
            <button type="button" className="danger" onClick={() => remove(message.id)} aria-label="Delete message"><Trash2 size={14} /></button>
          </div>
        </article>)}
      </div>

      <aside className="visitor-message-preview">
        <span><Megaphone size={16} /> {preview?.category ?? "Message preview"}</span>
        <blockquote>{preview?.text ?? "Add or enable a message to preview it here."}</blockquote>
        <label>Display<select value={target} onChange={(event) => setTarget(event.target.value as ScreenId | "all")}><option value="all">All Displays</option>{displays.map((display) => <option key={display.id} value={display.id}>{display.name} ({display.orientation})</option>)}</select></label>
        <div className="visitor-message-preview-actions">
          <button type="button" disabled={!preview} onClick={() => preview && onUse(preview.id)}><Save size={15} /> Use This Message</button>
          <button type="button" onClick={onNext}><RefreshCcw size={15} /> Next Message</button>
          <button type="button" disabled={!preview} onClick={() => preview && onSend(preview.id, target)}><Send size={15} /> Send now</button>
          <button type="button" disabled={!preview} onClick={() => preview && onSchedule(preview.id, target)}>Schedule</button>
        </div>
      </aside>
    </div>

    {editingId && <div className="visitor-message-edit-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingId(null); }}>
      <section className="visitor-message-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="visitor-message-edit-title">
        <header><div><p className="eyebrow">Message pool</p><h3 id="visitor-message-edit-title">{editingId === "new" ? "Add message" : "Edit message"}</h3></div><button type="button" className="icon-button" onClick={() => setEditingId(null)} aria-label="Cancel editing"><X size={17} /></button></header>
        <label>Message<textarea value={draft.text} rows={4} onChange={(event) => setDraft({ ...draft, text: event.target.value })} autoFocus /></label>
        <div className="visitor-message-edit-grid"><label>Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as VisitorMessage["category"] })}>{["Curiosity", "Creativity", "Kindness", "Courage", "Community"].map((category) => <option key={category}>{category}</option>)}</select></label><label>Weight<input type="range" min="1" max="10" value={draft.weight} onChange={(event) => setDraft({ ...draft, weight: Number(event.target.value) })} /><output>{draft.weight}</output></label></div>
        <label className="check-row"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Active in rotation</label>
        <footer><button type="button" onClick={() => setEditingId(null)}>Cancel</button><button type="button" className="primary" disabled={!draft.text.trim()} onClick={saveDraft}><Save size={15} /> Save</button></footer>
      </section>
    </div>}
  </section>;
}
