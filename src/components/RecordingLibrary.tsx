import { useEffect, useRef, useState } from "react";
import { Check, Download, Pencil, Play, Send, Trash2, X } from "lucide-react";
import type { RecordingLibraryRecord } from "../recordingLibrary";
import { LanternConfirmDialog } from "./LanternDialog";
import "./RecordingLibrary.css";

export function RecordingLibrary({
  recordings,
  loading,
  error,
  sendingId,
  compact = false,
  onSend,
  onDownload,
  onRename,
  onDelete
}: {
  recordings: RecordingLibraryRecord[];
  loading: boolean;
  error?: string | null;
  sendingId?: string | null;
  compact?: boolean;
  onSend: (recording: RecordingLibraryRecord) => void;
  onDownload: (recording: RecordingLibraryRecord) => void;
  onRename: (recording: RecordingLibraryRecord, title: string) => void;
  onDelete: (recording: RecordingLibraryRecord) => void;
}) {
  const urlsRef = useRef(new Map<string, string>());
  const [, renderUrls] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [pendingDelete, setPendingDelete] = useState<RecordingLibraryRecord | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  useEffect(() => {
    let changed = false;
    const liveIds = new Set(recordings.map((recording) => recording.id));
    recordings.forEach((recording) => {
      if (urlsRef.current.has(recording.id)) return;
      urlsRef.current.set(recording.id, URL.createObjectURL(recording.blob));
      changed = true;
    });
    [...urlsRef.current.entries()].forEach(([id, url]) => {
      if (liveIds.has(id)) return;
      URL.revokeObjectURL(url);
      urlsRef.current.delete(id);
      changed = true;
    });
    if (changed) renderUrls((value) => value + 1);
  }, [recordings]);

  useEffect(() => () => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current.clear();
  }, []);

  const beginRename = (recording: RecordingLibraryRecord) => {
    setEditingId(recording.id);
    setDraftTitle(recording.title);
  };

  const saveRename = (recording: RecordingLibraryRecord) => {
    const title = draftTitle.trim();
    if (!title) return;
    onRename(recording, title);
    setEditingId(null);
  };

  return <section className={`recording-library${compact ? " compact-recording-library" : ""}`} aria-labelledby="recording-library-title">
    <header className="recording-library__header">
      <div><p className="eyebrow">Local recording library</p><h3 id="recording-library-title">Saved Lantern Live captures</h3></div>
      <span>{loading ? "Loading…" : `${recordings.length} saved`}</span>
    </header>
    {error && <p className="recording-library__error">{error}</p>}
    {!loading && recordings.length === 0 && <div className="recording-library__empty"><Play size={20} /><strong>No saved recordings yet</strong><span>Connect a source or use the generated test feed, then record a short capture.</span></div>}
    {recordings.length > 0 && <div className="recording-library__list">
      {recordings.map((recording, index) => {
        const url = urlsRef.current.get(recording.id);
        const previewing = previewingId === recording.id;
        return <article className={`${index === 0 ? "recording-library__item latest" : "recording-library__item"}${previewing ? " previewing" : ""}`} key={recording.id}>
          <div className="recording-library__media">
            {url ? <video src={url} poster={recording.thumbnailDataUrl} controls preload="metadata" aria-label={`Play ${recording.title}`} /> : recording.thumbnailDataUrl ? <img src={recording.thumbnailDataUrl} alt="" /> : <div className="recording-library__media-placeholder"><Play size={20} /></div>}
            {index === 0 && <span>Latest capture</span>}
          </div>
          <div className="recording-library__details">
            {editingId === recording.id ? <form className="recording-library__rename" onSubmit={(event) => { event.preventDefault(); saveRename(recording); }}>
              <input autoFocus aria-label="Recording title" value={draftTitle} maxLength={120} onChange={(event) => setDraftTitle(event.target.value)} />
              <button type="submit" className="icon-button" disabled={!draftTitle.trim()} title="Save title"><Check size={14} /></button>
              <button type="button" className="icon-button" title="Cancel rename" onClick={() => setEditingId(null)}><X size={14} /></button>
            </form> : <div className="recording-library__title"><strong>{recording.title}</strong><button type="button" className="icon-button" title="Rename recording" onClick={() => beginRename(recording)}><Pencil size={13} /></button></div>}
            <div className="recording-library__metadata">
              <span>{new Date(recording.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
              <span>{formatDuration(recording.durationSeconds)}</span>
              <span>{recording.sourceLabel}</span>
              <span>{recording.targetLabel}</span>
              <span>{formatBytes(recording.sizeBytes)}</span>
              <span>{recording.storage === "indexeddb" ? "Saved on this device" : "Memory fallback"}</span>
            </div>
            <small>Recorder ready in {recording.timings.clickToRecorderStartMs} ms{recording.timings.clickToFirstDataMs === undefined ? "" : ` · first data ${recording.timings.clickToFirstDataMs} ms`}</small>
          </div>
          <div className="recording-library__actions">
            <button type="button" className="command-button secondary compact" aria-pressed={previewing} title={previewing ? "Close recording preview" : "Preview recording"} onClick={() => setPreviewingId((current) => current === recording.id ? null : recording.id)}><Play size={14} /> {previewing ? "Close preview" : "Preview"}</button>
            <button type="button" className="command-button primary compact" disabled={sendingId === recording.id} onClick={() => onSend(recording)}><Send size={14} /> {sendingId === recording.id ? "Sending…" : "Send to selected display"}</button>
            <button type="button" className="command-button secondary compact" onClick={() => onDownload(recording)}><Download size={14} /> Save file</button>
            <button type="button" className="icon-button danger-icon" title="Delete recording" onClick={() => setPendingDelete(recording)}><Trash2 size={14} /></button>
          </div>
        </article>;
      })}
    </div>}
    {pendingDelete && <LanternConfirmDialog
      eyebrow="Local recording"
      title={`Delete “${pendingDelete.title}”?`}
      description="This removes the saved video from this browser. A downloaded copy is not affected."
      confirmLabel="Delete recording"
      onCancel={() => setPendingDelete(null)}
      onConfirm={() => {
        const recording = pendingDelete;
        setPendingDelete(null);
        onDelete(recording);
      }}
    />}
  </section>;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.max(0, Math.round(seconds)) % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
