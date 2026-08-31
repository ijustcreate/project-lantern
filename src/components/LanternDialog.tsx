import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info, X } from "lucide-react";
import "./LanternDialog.css";

interface DialogBaseProps {
  eyebrow?: string;
  title: string;
  description: ReactNode;
  onCancel: () => void;
}

function useEscapeToCancel(onCancel: () => void) {
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [onCancel]);
}

export function LanternConfirmDialog({
  eyebrow = "Please confirm",
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  secondaryActionLabel,
  tone = "danger",
  onCancel,
  onConfirm,
  onSecondaryAction
}: DialogBaseProps & {
  confirmLabel: string;
  cancelLabel?: string;
  secondaryActionLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onSecondaryAction?: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEscapeToCancel(onCancel);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return createPortal(
    <div className="modal-backdrop lantern-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className={`editor-modal lantern-confirm-dialog tone-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="lantern-dialog-symbol" aria-hidden="true">{tone === "danger" ? <AlertTriangle size={23} /> : <Info size={23} />}</div>
        <div className="lantern-dialog-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={titleId}>{title}</h2>
          <div id={descriptionId} className="lantern-dialog-description">{description}</div>
        </div>
        <div className="editor-modal-actions">
          <button ref={cancelRef} type="button" className="command-button secondary" onClick={onCancel}>{cancelLabel}</button>
          {secondaryActionLabel && onSecondaryAction && <button type="button" className="command-button secondary" onClick={onSecondaryAction}>{secondaryActionLabel}</button>}
          <button type="button" className={`command-button ${tone === "danger" ? "danger" : "primary"}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>,
    document.body
  );
}

export function LanternTextPromptDialog({
  eyebrow = "Create item",
  title,
  description,
  label,
  initialValue = "",
  placeholder,
  submitLabel,
  maxLength = 100,
  onCancel,
  onSubmit
}: Omit<DialogBaseProps, "description"> & {
  description?: ReactNode;
  label: string;
  initialValue?: string;
  placeholder?: string;
  submitLabel: string;
  maxLength?: number;
  onSubmit: (value: string) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [value, setValue] = useState(initialValue);
  useEscapeToCancel(onCancel);

  const submit = () => {
    const normalized = value.trim();
    if (normalized) onSubmit(normalized);
  };

  return createPortal(
    <div className="modal-backdrop lantern-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <form className="editor-modal lantern-text-prompt" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="editor-modal-head">
          <div><p className="eyebrow">{eyebrow}</p><h2 id={titleId}>{title}</h2></div>
          <button type="button" className="icon-button" aria-label="Cancel and close" title="Cancel and close" onClick={onCancel}><X size={18} /></button>
        </div>
        {description && <div id={descriptionId} className="lantern-dialog-description">{description}</div>}
        <label className="field"><span>{label}</span><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} maxLength={maxLength} /></label>
        <div className="editor-modal-actions">
          <button type="button" className="command-button secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="command-button primary" disabled={!value.trim()}>{submitLabel}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

export function LanternNotice({
  message,
  actionLabel,
  onAction,
  onDismiss
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}) {
  return createPortal(
    <div className="lantern-notice" role="alert" aria-live="assertive">
      <Info size={18} aria-hidden="true" />
      <span>{message}</span>
      <div className="lantern-notice-actions">
        {actionLabel && onAction && <button type="button" className="command-button primary compact" onClick={onAction}>{actionLabel}</button>}
        <button type="button" className="icon-button" aria-label="Dismiss notice" title="Dismiss notice" onClick={onDismiss}><X size={16} /></button>
      </div>
    </div>,
    document.body
  );
}
