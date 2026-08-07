import { Megaphone, Pencil, RefreshCcw, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ScreenId } from "../types";
import type { VisitorMessage } from "../visitorMessages";
import "./VisitorMessageFooter.css";

export function VisitorMessageFooter({
  message,
  displays,
  onNext,
  onManage,
  onSend
}: {
  message?: VisitorMessage;
  displays: Array<{ id: ScreenId; name: string; orientation: string }>;
  onNext: () => void;
  onManage: () => void;
  onSend: (target: ScreenId | "all") => void;
}) {
  const [target, setTarget] = useState<ScreenId | "all">("all");
  return <footer className="visitor-message-footer">
    <div className="visitor-message-footer-icon"><Sparkles size={20} /></div>
    <div className="visitor-message-footer-copy"><p>A message for every young visitor</p><h3>{message?.text ?? "Add an active visitor message to begin the rotation."}</h3><span>{message?.category ?? "Visitor message pool"}</span></div>
    <div className="visitor-message-footer-actions">
      <button type="button" onClick={onNext} disabled={!message}><RefreshCcw size={15} /> Next</button>
      <button type="button" onClick={onManage}><Pencil size={15} /> Manage</button>
      <label><span className="sr-only">Send visitor message to display</span><select value={target} onChange={(event) => setTarget(event.target.value as ScreenId | "all")}><option value="all">All Displays</option>{displays.map((display) => <option value={display.id} key={display.id}>{display.name} ({display.orientation})</option>)}</select></label>
      <button type="button" className="primary" disabled={!message} onClick={() => onSend(target)}><Send size={15} /><Megaphone size={14} /> Put on screen</button>
    </div>
  </footer>;
}
