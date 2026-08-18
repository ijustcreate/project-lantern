import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bone,
  Check,
  ChevronRight,
  ClipboardCopy,
  Download,
  Eye,
  FileUp,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  UserRoundSearch
} from "lucide-react";
import {
  CALIBRATION_POSES,
  TRACKING_ANCHORS,
  createCalibrationProfile,
  duplicateCostume,
  parseImportedCostume,
  resolveCalibrationProfile,
  userDeviceCalibrationKey
} from "../effectStudio";
import type { TrackingRuntimeStatus } from "../trackingRuntime";
import type {
  CalibrationPose,
  CostumeArtPiece,
  CostumeDefinition,
  EffectRigBone,
  EffectStudioState,
  LiveEffectsSettings,
  TrackingAnchorPoint
} from "../types";
import "./EffectStudio.css";

type StudioTab = "costume" | "rig" | "calibration";

interface EffectStudioProps {
  studio: EffectStudioState;
  effects: LiveEffectsSettings;
  userId: string;
  deviceId?: string;
  trackingStatus?: TrackingRuntimeStatus;
  onStudioChange: (studio: EffectStudioState) => void;
  onEffectsChange: (effects: LiveEffectsSettings) => void;
}

const PIECE_ROLES: CostumeArtPiece["role"][] = [
  "head-backplate", "cheek", "nose", "upper-mouth", "lower-mouth", "chin", "ear", "eyebrow", "eye",
  "upper-eyelid", "lower-eyelid", "muzzle", "hand", "palm", "forearm", "hand-prop", "body", "hat", "glasses", "custom"
];

const CALIBRATION_BASE: Record<TrackingAnchorPoint, { x: number; y: number }> = {
  "left-eye": { x: .4, y: .39 }, "right-eye": { x: .6, y: .39 }, nose: { x: .5, y: .51 },
  "mouth-upper": { x: .5, y: .61 }, "mouth-lower": { x: .5, y: .65 }, "left-ear": { x: .27, y: .48 },
  "right-ear": { x: .73, y: .48 }, "head-left": { x: .31, y: .38 }, "head-right": { x: .69, y: .38 },
  "head-top": { x: .5, y: .19 }, chin: { x: .5, y: .76 }, neck: { x: .5, y: .84 }, chest: { x: .5, y: .94 },
  "left-shoulder": { x: .31, y: .87 }, "right-shoulder": { x: .69, y: .87 }, "left-hand": { x: .16, y: .74 },
  "right-hand": { x: .84, y: .74 }
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function cloneCostume(costume: CostumeDefinition) {
  return structuredClone(costume);
}

function downloadCostume(costume: CostumeDefinition) {
  const blob = new Blob([JSON.stringify({ format: "lantern-costume-v1", costume }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${costume.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "lantern-costume"}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function CostumeMiniPreview({ costume }: { costume: CostumeDefinition }) {
  const skeleton = costume.starter === "skeleton" || /skeleton/i.test(costume.name);
  const visibleCount = costume.pieces.filter((piece) => piece.visible).length;
  if (costume.conceptArt) return <div className="costume-mini-preview concept" aria-label={`${costume.name} concept art`}>
    <img src={`${import.meta.env.BASE_URL}${costume.conceptArt}`} alt="" />
    <span>{visibleCount} active pieces Â· {costume.bones.length} bones</span>
  </div>;
  return <div className={`costume-mini-preview ${skeleton ? "skeleton" : "teddy"}`} aria-label={`${costume.name} rig preview`}>
    <div className="costume-preview-ear left" /><div className="costume-preview-ear right" />
    <div className="costume-preview-head">
      <i className="costume-preview-eye left" /><i className="costume-preview-eye right" />
      <i className="costume-preview-nose" /><i className="costume-preview-mouth" />
    </div>
    <div className="costume-preview-hand left" /><div className="costume-preview-hand right" />
    <span>{visibleCount} active pieces · {costume.bones.length} bones</span>
  </div>;
}

function CostumeEditor({
  studio,
  effects,
  onStudioChange,
  onEffectsChange
}: Pick<EffectStudioProps, "studio" | "effects" | "onStudioChange" | "onEffectsChange">) {
  const initialId = effects.costumeId && studio.costumes.some((item) => item.id === effects.costumeId)
    ? effects.costumeId
    : studio.costumes[0]?.id;
  const [selectedId, setSelectedId] = useState(initialId ?? "");
  const selected = studio.costumes.find((item) => item.id === selectedId) ?? studio.costumes[0];
  const [draft, setDraft] = useState<CostumeDefinition | null>(() => selected ? cloneCostume(selected) : null);
  const [deletePending, setDeletePending] = useState(false);
  const [importError, setImportError] = useState("");
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selected) return;
    setDraft(cloneCostume(selected));
    setDeletePending(false);
  }, [selected?.id, selected?.updatedAt]);

  const chooseCostume = (id: string) => {
    setSelectedId(id);
    setDeletePending(false);
    setImportError("");
  };
  const makeCostume = () => {
    const now = new Date().toISOString();
    const next: CostumeDefinition = {
      id: uid("costume"), name: "My Costume", description: "A custom tracked costume.", createdAt: now, updatedAt: now,
      bones: [{ id: uid("bone"), name: "Head", joint: "ball", anchor: "nose", weight: 1, springiness: .35, damping: .72 }], pieces: []
    };
    setSelectedId(next.id);
    setDraft(next);
    setDeletePending(false);
  };
  const duplicate = () => {
    if (!draft) return;
    const next = duplicateCostume(draft);
    setSelectedId(next.id);
    setDraft(next);
    setDeletePending(false);
  };
  const save = () => {
    if (!draft || !draft.name.trim()) return;
    const next = { ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() };
    const exists = studio.costumes.some((item) => item.id === next.id);
    onStudioChange({ ...studio, costumes: exists ? studio.costumes.map((item) => item.id === next.id ? next : item) : [...studio.costumes, next] });
    setDraft(next);
    setSelectedId(next.id);
  };
  const load = () => {
    if (!draft) return;
    onEffectsChange({ ...effects, costumeEnabled: true, costumeId: draft.id, puppetPreview: false, faceTracking: true });
  };
  const remove = () => {
    if (!draft || !studio.costumes.some((item) => item.id === draft.id)) {
      setDraft(selected ? cloneCostume(selected) : null);
      setSelectedId(selected?.id ?? "");
      setDeletePending(false);
      return;
    }
    const remaining = studio.costumes.filter((item) => item.id !== draft.id);
    const nextId = remaining[0]?.id;
    onStudioChange({ ...studio, costumes: remaining });
    if (effects.costumeId === draft.id) onEffectsChange({ ...effects, costumeId: nextId, costumeEnabled: Boolean(nextId) });
    setSelectedId(nextId ?? "");
    setDraft(nextId ? cloneCostume(remaining[0]) : null);
    setDeletePending(false);
  };
  const importFile = async (file?: File) => {
    setImportError("");
    if (!file) return;
    try {
      const imported = parseImportedCostume(JSON.parse(await file.text()));
      if (!imported) throw new Error("This file does not contain a Lantern costume.");
      onStudioChange({ ...studio, costumes: [...studio.costumes, imported] });
      setSelectedId(imported.id);
      setDraft(imported);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The costume could not be imported.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  if (!draft) return <div className="studio-empty"><Sparkles size={24} /><strong>Make the first costume</strong><button type="button" className="command-button primary compact" onClick={makeCostume}><Plus size={14} /> Make Costume</button></div>;
  const isLoaded = effects.costumeEnabled && effects.costumeId === draft.id;
  const isSaved = studio.costumes.some((item) => item.id === draft.id);

  return <div className="costume-editor-grid">
    <aside className="costume-library" aria-label="Costume library">
      <header><strong>Costume library</strong><button type="button" className="icon-button" title="Make Costume" onClick={makeCostume}><Plus size={15} /></button></header>
      <div>{studio.costumes.map((costume) => <button type="button" key={costume.id} className={costume.id === draft.id ? "active" : ""} onClick={() => chooseCostume(costume.id)}><span>{costume.name}</span><small>{costume.starter ? "Starter" : "Custom"}</small></button>)}</div>
      <label className="command-button secondary compact studio-import-button"><FileUp size={14} /> Import<input ref={importRef} type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} /></label>
      {importError && <p className="studio-inline-error" role="alert">{importError}</p>}
    </aside>
    <div className="costume-workbench">
      <div className="costume-name-row"><label><span>Costume name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><span className={isLoaded ? "loaded" : ""}>{isLoaded ? "Loaded in preview" : "Ready to load"}</span></div>
      <label className="field"><span>Description</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <CostumeMiniPreview costume={draft} />
      <div className="costume-piece-list">
        <header><div><strong>Tracked pieces</strong><small>Each piece has its own anchor and visibility.</small></div><button type="button" className="command-button secondary compact" onClick={() => {
          const next: CostumeArtPiece = { id: uid("piece"), name: "New piece", role: "custom", anchor: "nose", color: "#efb67b", accentColor: "#213647", x: 0, y: 0, scale: 1, rotation: 0, zIndex: 12, visible: true };
          setDraft({ ...draft, pieces: [...draft.pieces, next] });
        }}><Plus size={13} /> Add piece</button></header>
        <div>{draft.pieces.map((item) => <div className="costume-piece-row" key={item.id}>
          <label className="piece-visible"><input type="checkbox" checked={item.visible} onChange={(event) => setDraft({ ...draft, pieces: draft.pieces.map((piece) => piece.id === item.id ? { ...piece, visible: event.target.checked } : piece) })} /><Eye size={14} /></label>
          <input aria-label="Piece name" value={item.name} onChange={(event) => setDraft({ ...draft, pieces: draft.pieces.map((piece) => piece.id === item.id ? { ...piece, name: event.target.value } : piece) })} />
          <select aria-label={`${item.name} role`} value={item.role} onChange={(event) => setDraft({ ...draft, pieces: draft.pieces.map((piece) => piece.id === item.id ? { ...piece, role: event.target.value as CostumeArtPiece["role"] } : piece) })}>{PIECE_ROLES.map((role) => <option key={role} value={role}>{role.replace(/-/g, " ")}</option>)}</select>
          <select aria-label={`${item.name} anchor`} value={item.anchor} onChange={(event) => setDraft({ ...draft, pieces: draft.pieces.map((piece) => piece.id === item.id ? { ...piece, anchor: event.target.value as TrackingAnchorPoint } : piece) })}>{TRACKING_ANCHORS.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}</select>
          <select aria-label={`${item.name} bone`} value={item.boneId ?? ""} onChange={(event) => setDraft({ ...draft, pieces: draft.pieces.map((piece) => piece.id === item.id ? { ...piece, boneId: event.target.value || undefined } : piece) })}><option value="">No bone</option>{draft.bones.map((bone) => <option key={bone.id} value={bone.id}>{bone.name}</option>)}</select>
          <input type="color" aria-label={`${item.name} color`} value={item.color} onChange={(event) => setDraft({ ...draft, pieces: draft.pieces.map((piece) => piece.id === item.id ? { ...piece, color: event.target.value } : piece) })} />
          <button type="button" className="icon-button danger-icon" title={`Remove ${item.name}`} onClick={() => setDraft({ ...draft, pieces: draft.pieces.filter((piece) => piece.id !== item.id) })}><Trash2 size={13} /></button>
        </div>)}</div>
      </div>
      <footer className="costume-actions">
        <button type="button" className="command-button secondary compact" onClick={makeCostume}><Plus size={14} /> Make Costume</button>
        <button type="button" className="command-button secondary compact" onClick={duplicate}><ClipboardCopy size={14} /> Duplicate</button>
        <button type="button" className="command-button secondary compact" onClick={() => downloadCostume(draft)}><Download size={14} /> Export</button>
        <button type="button" className="command-button secondary compact" onClick={load}><Eye size={14} /> {isLoaded ? "Reload" : "Load"}</button>
        <button type="button" className="command-button primary compact" onClick={save} disabled={!draft.name.trim()}><Save size={14} /> Save</button>
        <button type="button" className="command-button danger compact" onClick={() => setDeletePending(true)}><Trash2 size={14} /> Delete</button>
      </footer>
      {deletePending && <div className="studio-inline-confirm" role="alertdialog" aria-label={`Delete ${draft.name}`}><span>{isSaved ? `Delete “${draft.name}”?` : "Discard this unsaved costume?"}</span><button type="button" className="command-button secondary compact" onClick={() => setDeletePending(false)}>Cancel</button><button type="button" className="command-button danger compact" onClick={remove}>Delete</button></div>}
    </div>
  </div>;
}

function RigEditor({ studio, selectedCostumeId, onStudioChange }: { studio: EffectStudioState; selectedCostumeId?: string; onStudioChange: EffectStudioProps["onStudioChange"] }) {
  const selected = studio.costumes.find((item) => item.id === selectedCostumeId) ?? studio.costumes[0];
  const [draft, setDraft] = useState<CostumeDefinition | null>(() => selected ? cloneCostume(selected) : null);
  useEffect(() => { if (selected) setDraft(cloneCostume(selected)); }, [selected?.id, selected?.updatedAt]);
  if (!draft) return <div className="studio-empty">Create a costume before building its rig.</div>;
  const updateBone = (id: string, patch: Partial<EffectRigBone>) => setDraft({ ...draft, bones: draft.bones.map((item) => item.id === id ? { ...item, ...patch } : item) });
  const save = () => onStudioChange({ ...studio, costumes: studio.costumes.map((item) => item.id === draft.id ? { ...draft, updatedAt: new Date().toISOString() } : item) });
  return <div className="rig-editor">
    <header><div><strong>{draft.name} rig</strong><small>Attach pieces to stable anchors, then tune how each bone follows motion.</small></div><button type="button" className="command-button secondary compact" onClick={() => setDraft({ ...draft, bones: [...draft.bones, { id: uid("bone"), name: `Bone ${draft.bones.length + 1}`, parentId: draft.bones[draft.bones.length - 1]?.id, joint: "spring", anchor: "head-top", weight: 1, springiness: .5, damping: .68 }] })}><Plus size={14} /> Add bone</button></header>
    <div className="rig-map" aria-label="Live rig preview"><Bone size={30} /><div><strong>Live preview</strong><span>{draft.bones.length} linked bones · changes follow the camera after Save</span></div>{draft.bones.map((item, index) => <i key={item.id} style={{ left: `${12 + (index % 6) * 15}%`, top: `${25 + Math.floor(index / 6) * 34}%` }} title={`${item.name}: ${item.anchor}`} />)}</div>
    <div className="rig-bone-list">{draft.bones.map((item) => <article key={item.id}>
      <div className="rig-bone-heading"><input aria-label="Bone name" value={item.name} onChange={(event) => updateBone(item.id, { name: event.target.value })} /><button type="button" className="icon-button danger-icon" title={`Remove ${item.name}`} onClick={() => setDraft({ ...draft, bones: draft.bones.filter((bone) => bone.id !== item.id).map((bone) => bone.parentId === item.id ? { ...bone, parentId: undefined } : bone), pieces: draft.pieces.map((piece) => piece.boneId === item.id ? { ...piece, boneId: undefined } : piece) })}><Trash2 size={14} /></button></div>
      <div className="rig-select-grid">
        <label><span>Joint</span><select value={item.joint} onChange={(event) => updateBone(item.id, { joint: event.target.value as EffectRigBone["joint"] })}><option value="fixed">Fixed</option><option value="hinge">Hinge</option><option value="ball">Ball</option><option value="spring">Spring</option></select></label>
        <label><span>Parent</span><select value={item.parentId ?? ""} onChange={(event) => updateBone(item.id, { parentId: event.target.value || undefined })}><option value="">No parent</option>{draft.bones.filter((bone) => bone.id !== item.id).map((bone) => <option key={bone.id} value={bone.id}>{bone.name}</option>)}</select></label>
        <label><span>Anchor point</span><select value={item.anchor} onChange={(event) => updateBone(item.id, { anchor: event.target.value as TrackingAnchorPoint })}>{TRACKING_ANCHORS.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}</select></label>
      </div>
      <div className="rig-slider-grid">
        <label><span>Weight <b>{Math.round(item.weight * 100)}%</b></span><input type="range" min="0" max="100" value={item.weight * 100} onChange={(event) => updateBone(item.id, { weight: Number(event.target.value) / 100 })} /></label>
        <label><span>Springiness <b>{Math.round(item.springiness * 100)}%</b></span><input type="range" min="0" max="100" value={item.springiness * 100} onChange={(event) => updateBone(item.id, { springiness: Number(event.target.value) / 100 })} /></label>
        <label><span>Damping <b>{Math.round(item.damping * 100)}%</b></span><input type="range" min="0" max="100" value={item.damping * 100} onChange={(event) => updateBone(item.id, { damping: Number(event.target.value) / 100 })} /></label>
      </div>
    </article>)}</div>
    <footer><button type="button" className="command-button secondary compact" onClick={() => selected && setDraft(cloneCostume(selected))}><RotateCcw size={14} /> Revert</button><button type="button" className="command-button primary compact" onClick={save}><Save size={14} /> Save rig</button></footer>
  </div>;
}

function CalibrationEditor({ studio, effects, userId, deviceId, onStudioChange, onEffectsChange }: Omit<EffectStudioProps, "trackingStatus">) {
  const resolvedDevice = deviceId || "default-camera";
  const key = userDeviceCalibrationKey(userId, resolvedDevice);
  const activeProfile = resolveCalibrationProfile(studio, userId, resolvedDevice, effects.calibrationProfileId);
  const profiles = studio.calibrationProfiles.filter((profile) => profile.userId === userId && profile.deviceId === resolvedDevice);
  const [pose, setPose] = useState<CalibrationPose>("center");
  const [anchor, setAnchor] = useState<TrackingAnchorPoint>("head-top");
  const [offset, setOffset] = useState({ x: activeProfile?.landmarkOffsets[anchor]?.x ?? 0, y: activeProfile?.landmarkOffsets[anchor]?.y ?? 0 });
  const dragRef = useRef<number | null>(null);
  useEffect(() => setOffset({ x: activeProfile?.landmarkOffsets[anchor]?.x ?? 0, y: activeProfile?.landmarkOffsets[anchor]?.y ?? 0 }), [activeProfile?.id, activeProfile?.updatedAt, anchor]);

  const activateProfile = (profileId: string) => {
    onStudioChange({ ...studio, activeCalibrationByUserDevice: { ...studio.activeCalibrationByUserDevice, [key]: profileId } });
    onEffectsChange({ ...effects, calibrationProfileId: profileId, faceTracking: true });
  };
  const addProfile = () => {
    const next = createCalibrationProfile(userId, resolvedDevice, `${profiles.length ? `Camera calibration ${profiles.length + 1}` : "Camera calibration"}`);
    onStudioChange({ ...studio, calibrationProfiles: [...studio.calibrationProfiles, next], activeCalibrationByUserDevice: { ...studio.activeCalibrationByUserDevice, [key]: next.id } });
    onEffectsChange({ ...effects, calibrationProfileId: next.id, faceTracking: true });
  };
  const updatePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const base = CALIBRATION_BASE[anchor];
    setOffset({ x: Math.max(-.35, Math.min(.35, (event.clientX - bounds.left) / bounds.width - base.x)), y: Math.max(-.35, Math.min(.35, (event.clientY - bounds.top) / bounds.height - base.y)) });
  };
  const saveStep = () => {
    if (!activeProfile) return;
    const now = new Date().toISOString();
    const value = { ...offset, updatedAt: now };
    const next = { ...activeProfile, updatedAt: now, landmarkOffsets: { ...activeProfile.landmarkOffsets, [anchor]: value }, poseSamples: { ...activeProfile.poseSamples, [pose]: { pose, completedAt: now, offsets: { ...activeProfile.poseSamples[pose]?.offsets, [anchor]: value } } } };
    onStudioChange({ ...studio, calibrationProfiles: studio.calibrationProfiles.map((profile) => profile.id === next.id ? next : profile), activeCalibrationByUserDevice: { ...studio.activeCalibrationByUserDevice, [key]: next.id } });
    onEffectsChange({ ...effects, calibrationProfileId: next.id, faceTracking: true });
    const nextPose = CALIBRATION_POSES[Math.min(CALIBRATION_POSES.length - 1, CALIBRATION_POSES.findIndex((item) => item.id === pose) + 1)];
    setPose(nextPose.id);
  };

  return <div className="calibration-editor">
    <header><div><strong>Per-user camera calibration</strong><small>{resolvedDevice === "default-camera" ? "Default camera" : "Selected camera"} · saved only for this local user/device pair</small></div><button type="button" className="command-button secondary compact" onClick={addProfile}><Plus size={14} /> New profile</button></header>
    {profiles.length > 0 && <label className="field"><span>Calibration profile</span><select value={activeProfile?.id ?? ""} onChange={(event) => activateProfile(event.target.value)}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>}
    {!activeProfile ? <div className="studio-empty"><UserRoundSearch size={28} /><strong>No calibration for this camera yet</strong><span>Create a profile to begin the five guided poses.</span><button type="button" className="command-button primary compact" onClick={addProfile}>Start calibration</button></div> : <>
      <div className="calibration-steps">{CALIBRATION_POSES.map((item, index) => <button type="button" key={item.id} className={`${item.id === pose ? "active" : ""}${activeProfile.poseSamples[item.id] ? " complete" : ""}`} onClick={() => setPose(item.id)}><i>{activeProfile.poseSamples[item.id] ? <Check size={12} /> : index + 1}</i><span>{item.label}</span><ChevronRight size={13} /></button>)}</div>
      <div className="calibration-grid">
        <div className="calibration-guide">
          <div><strong>{CALIBRATION_POSES.find((item) => item.id === pose)?.label}</strong><span>{CALIBRATION_POSES.find((item) => item.id === pose)?.instruction}</span></div>
          <label><span>Point to train</span><select value={anchor} onChange={(event) => setAnchor(event.target.value as TrackingAnchorPoint)}>{[...new Set(TRACKING_ANCHORS.map((item) => item.group))].map((group) => <optgroup key={group} label={group}>{TRACKING_ANCHORS.filter((item) => item.group === group).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>)}</select></label>
          <div className="calibration-pad" onPointerDown={(event) => { dragRef.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); updatePointer(event); }} onPointerMove={updatePointer} onPointerUp={(event) => { if (dragRef.current === event.pointerId) { updatePointer(event); dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); } }}>
            <div className="calibration-face-guide"><i className="eye left" /><i className="eye right" /><i className="nose" /><i className="mouth" /></div>
            <button type="button" className="calibration-point" aria-label={`Drag ${TRACKING_ANCHORS.find((item) => item.id === anchor)?.label}`} style={{ left: `${(CALIBRATION_BASE[anchor].x + offset.x) * 100}%`, top: `${(CALIBRATION_BASE[anchor].y + offset.y) * 100}%` }} />
          </div>
          <p>Drag the amber point until it matches the same landmark in the live camera preview.</p>
        </div>
        <aside><strong>Saved offsets</strong><div>{TRACKING_ANCHORS.filter((item) => activeProfile.landmarkOffsets[item.id]).map((item) => <button type="button" key={item.id} onClick={() => setAnchor(item.id)}><span>{item.label}</span><small>{Math.round((activeProfile.landmarkOffsets[item.id]?.x ?? 0) * 1000) / 10}% x · {Math.round((activeProfile.landmarkOffsets[item.id]?.y ?? 0) * 1000) / 10}% y</small></button>)}</div>{!Object.keys(activeProfile.landmarkOffsets).length && <p>No corrected points yet.</p>}</aside>
      </div>
      <footer><button type="button" className="command-button secondary compact" onClick={() => setOffset({ x: 0, y: 0 })}><RotateCcw size={14} /> Reset point</button><button type="button" className="command-button primary compact" onClick={saveStep}><Save size={14} /> Save this step</button></footer>
    </>}
  </div>;
}

export function EffectStudio(props: EffectStudioProps) {
  const [tab, setTab] = useState<StudioTab>("costume");
  const status = props.trackingStatus;
  const activeCostume = props.studio.costumes.find((item) => item.id === props.effects.costumeId) ?? props.studio.costumes[0];
  const statusLabel = status?.phase === "warming" ? "Warming tracker" : status?.phase === "detecting" ? "Detecting face…" : status?.phase === "tracking" ? "Tracking" : status?.phase === "degraded" ? "Adaptive tracking" : status?.phase === "error" ? "Tracker needs attention" : "Tracker idle";
  const statusDetail = status ? `${Math.round(status.renderedFps)} FPS${status.initializationLatencyMs !== undefined ? ` · ${Math.round(status.initializationLatencyMs)} ms warm-up` : ""}${status.inferenceLatencyMs !== undefined ? ` · ${Math.round(status.inferenceLatencyMs)} ms inference` : ""}` : "Start a camera preview to measure tracking";
  const loadedProfile = useMemo(() => resolveCalibrationProfile(props.studio, props.userId, props.deviceId, props.effects.calibrationProfileId), [props.studio, props.userId, props.deviceId, props.effects.calibrationProfileId]);

  return <section className="effect-authoring-studio">
    <header className="effect-studio-heading"><div><p className="eyebrow">Effect authoring</p><h3>Costumes, rigs & calibration</h3><span>Build approachable tracked characters without changing the camera pipeline.</span></div><div className={`tracking-runtime-pill ${status?.phase ?? "idle"}`}><i /><span><strong>{statusLabel}</strong><small>{statusDetail}</small></span></div></header>
    <div className="effect-visibility-controls">
      <label className="switch-row"><input type="checkbox" checked={props.effects.trackedPointsOverlay ?? props.effects.trackingDebug ?? false} onChange={(event) => props.onEffectsChange({ ...props.effects, trackedPointsOverlay: event.target.checked, trackingDebug: event.target.checked, faceTracking: event.target.checked || props.effects.faceTracking })} /><span><strong>Show tracked points</strong><small>Draw face, ear, body, hand, and finger landmarks.</small></span></label>
      <label className="switch-row"><input type="checkbox" checked={props.effects.trackingCameraUnderlay ?? true} onChange={(event) => props.onEffectsChange({ ...props.effects, trackingCameraUnderlay: event.target.checked, faceTracking: true })} /><span><strong>Show real camera underneath</strong><small>Compare colored landmarks with the live image while aligning.</small></span></label>
      <label className="switch-row"><input type="checkbox" checked={props.effects.costumeEnabled ?? false} onChange={(event) => props.onEffectsChange({ ...props.effects, costumeEnabled: event.target.checked, costumeId: props.effects.costumeId ?? activeCostume?.id, faceTracking: event.target.checked || props.effects.faceTracking })} /><span><strong>Costume output</strong><small>{activeCostume ? `${activeCostume.name}${loadedProfile ? ` · ${loadedProfile.name}` : ""}` : "Choose or make a costume"}</small></span></label>
    </div>
    <nav className="effect-studio-tabs" aria-label="Effect authoring tools"><button type="button" className={tab === "costume" ? "active" : ""} onClick={() => setTab("costume")}><Sparkles size={14} /> Make Costume</button><button type="button" className={tab === "rig" ? "active" : ""} onClick={() => setTab("rig")}><Bone size={14} /> Rig Editor</button><button type="button" className={tab === "calibration" ? "active" : ""} onClick={() => setTab("calibration")}><UserRoundSearch size={14} /> Calibration</button></nav>
    <div className="effect-studio-body">
      {tab === "costume" && <CostumeEditor studio={props.studio} effects={props.effects} onStudioChange={props.onStudioChange} onEffectsChange={props.onEffectsChange} />}
      {tab === "rig" && <RigEditor studio={props.studio} selectedCostumeId={props.effects.costumeId} onStudioChange={props.onStudioChange} />}
      {tab === "calibration" && <CalibrationEditor {...props} />}
    </div>
  </section>;
}
