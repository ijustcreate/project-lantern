import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpRight,
  BadgeCheck,
  LayoutDashboard,
  Maximize2,
  Megaphone,
  MessageSquare,
  Monitor,
  Pencil,
  RotateCcw,
  Save,
  Sparkles,
  Star,
  Users,
  X
} from "lucide-react";
import type { GivingLevel, GivingProgram, LanternState, SavedAnnouncement } from "../types";
import "./BrigadeView.css";

type BrigadeSection = "hero" | "why" | "contact" | "levels" | "roster" | "boards" | "announcements" | "good-deed";

interface BrigadePanelLayout {
  split?: number;
  reversed?: boolean;
  compact?: boolean;
  columns?: number;
}

interface BrigadeLandingPage {
  heroTitle?: string;
  heroAccent?: string;
  whyTitle?: string;
  contactTitle?: string;
  levelsTitle?: string;
  rosterTitle?: string;
  boardsTitle?: string;
  announcementsTitle?: string;
  selectedBoardId?: string;
  selectedAnnouncementId?: string;
  layouts?: Partial<Record<BrigadeSection, BrigadePanelLayout>>;
}

type BrigadeProgram = GivingProgram & { landingPage?: BrigadeLandingPage };

const HERO_ART = [
  "soldier-red.svg",
  "soldier-blue.svg",
  "soldier-yellow.svg",
  "group-hangout.svg",
  "group-guard.svg"
] as const;

const BOARD_ART = [
  "head-red.svg",
  "head-blue.svg",
  "head-yellow.svg",
  "group-hangout.svg",
  "group-guard.svg"
] as const;

const DEFAULT_LAYOUTS: Record<BrigadeSection, BrigadePanelLayout> = {
  hero: { split: 60, reversed: false, compact: false },
  why: { columns: 3, compact: true },
  contact: { split: 40, reversed: false, compact: true },
  levels: { columns: 3, compact: true },
  roster: { columns: 2, compact: true },
  boards: { split: 35, reversed: false, compact: true },
  announcements: { split: 35, reversed: false, compact: true },
  "good-deed": { split: 70, reversed: false, compact: true }
};

const purposeLabels = {
  roster: "Full honor roll",
  level: "Level recognition",
  story: "Supporter story",
  invitation: "Program invitation",
  "good-deeds": "Good deeds"
} as const;

function assetUrl(fileName: string) {
  return `${import.meta.env.BASE_URL}assets/brigade/${fileName}`;
}

function cloneProgram(program: BrigadeProgram): BrigadeProgram {
  return JSON.parse(JSON.stringify(program)) as BrigadeProgram;
}

function resolvedLevels(program: BrigadeProgram) {
  return program.levels.filter((level) => level.id !== "custom-annual");
}

function panelStyle(layout: BrigadePanelLayout): CSSProperties {
  return {
    "--brigade-panel-split": `${Math.max(30, Math.min(70, layout.split ?? 50))}%`,
    "--brigade-panel-columns": Math.max(1, Math.min(3, layout.columns ?? 2))
  } as CSSProperties;
}

function editCopy(program: BrigadeProgram, patch: Partial<BrigadeLandingPage>) {
  return { ...program, landingPage: { ...(program.landingPage ?? {}), ...patch } };
}

export function BrigadeView({
  state,
  updateState,
  onManageDonors,
  onOpenBoard,
  onUseAnnouncement,
  onPutAnnouncementOnScreen,
  onOpenBlips,
  visitorMessagePanel
}: {
  state: LanternState;
  updateState: (updater: (current: LanternState) => LanternState) => void;
  onManageDonors: () => void;
  onOpenBoard: (boardId: string) => void;
  onUseAnnouncement: (announcementId: string) => void;
  onPutAnnouncementOnScreen: (announcementId: string) => void;
  onOpenBlips: () => void;
  visitorMessagePanel?: ReactNode;
}) {
  const sourceProgram = state.givingPrograms.find((item) => item.id === "toy-soldier-brigade") as BrigadeProgram | undefined
    ?? state.givingPrograms[0] as BrigadeProgram | undefined;
  const [editing, setEditing] = useState<BrigadeSection | null>(null);
  const [draft, setDraft] = useState<BrigadeProgram | null>(null);
  const [heroArtwork, setHeroArtwork] = useState(0);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState("");

  const program = useMemo(() => sourceProgram
    ? { ...sourceProgram, levels: resolvedLevels(sourceProgram) }
    : undefined, [sourceProgram]);

  const templates = useMemo(() => program
    ? state.boardPrograms.filter((board) => board.givingProgramId === program.id)
    : [], [program, state.boardPrograms]);
  const announcements = useMemo(() => state.savedAnnouncements.filter((announcement) => announcement.id.startsWith("brigade-")), [state.savedAnnouncements]);

  useEffect(() => {
    if (!program) return;
    setSelectedBoardId((current) => current && templates.some((template) => template.id === current)
      ? current
      : program.landingPage?.selectedBoardId && templates.some((template) => template.id === program.landingPage?.selectedBoardId)
        ? program.landingPage.selectedBoardId
        : templates[0]?.id ?? "");
    setSelectedAnnouncementId((current) => current && announcements.some((announcement) => announcement.id === current)
      ? current
      : program.landingPage?.selectedAnnouncementId && announcements.some((announcement) => announcement.id === program.landingPage?.selectedAnnouncementId)
        ? program.landingPage.selectedAnnouncementId
        : announcements[0]?.id ?? "");
  }, [announcements, program, templates]);

  useEffect(() => {
    const motionReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (motionReduced) return;
    const timer = window.setInterval(() => setHeroArtwork((current) => (current + 1) % HERO_ART.length), 4800);
    return () => window.clearInterval(timer);
  }, []);

  if (!program) {
    return <section className="brigade-hub"><div className="empty-inspector"><Star size={28} /><strong>No giving program configured</strong><span>Add a giving program to begin.</span></div></section>;
  }

  const pageProgram = draft ?? program;
  const landing = pageProgram.landingPage ?? {};
  const members = state.donors.filter((donor) => donor.givingProgramId === program.id && donor.active);
  const selectedTemplate = templates.find((template) => template.id === selectedBoardId) ?? templates[0];
  const selectedAnnouncement = announcements.find((announcement) => announcement.id === selectedAnnouncementId) ?? announcements[0];

  const layoutFor = (section: BrigadeSection) => ({
    ...DEFAULT_LAYOUTS[section],
    ...(landing.layouts?.[section] ?? {})
  });

  const beginEdit = (section: BrigadeSection) => {
    setDraft(cloneProgram({ ...program, levels: resolvedLevels(program) }));
    setEditing(section);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditing(null);
  };

  const saveEdit = () => {
    if (!draft) return;
    const saved = cloneProgram({ ...draft, levels: resolvedLevels(draft) });
    updateState((current) => ({
      ...current,
      givingPrograms: current.givingPrograms.map((item) => item.id === saved.id ? saved : item)
    }));
    if (saved.landingPage?.selectedBoardId) setSelectedBoardId(saved.landingPage.selectedBoardId);
    if (saved.landingPage?.selectedAnnouncementId) setSelectedAnnouncementId(saved.landingPage.selectedAnnouncementId);
    setDraft(null);
    setEditing(null);
  };

  const patchDraft = (patch: Partial<BrigadeProgram>) => setDraft((current) => current ? { ...current, ...patch } : current);
  const patchLanding = (patch: Partial<BrigadeLandingPage>) => setDraft((current) => current ? editCopy(current, patch) : current);
  const patchLayout = (section: BrigadeSection, patch: Partial<BrigadePanelLayout>) => setDraft((current) => {
    if (!current) return current;
    return editCopy(current, {
      layouts: {
        ...(current.landingPage?.layouts ?? {}),
        [section]: { ...layoutFor(section), ...patch }
      }
    });
  });
  const resetLayout = (section: BrigadeSection) => patchLayout(section, DEFAULT_LAYOUTS[section]);

  const editor = (section: BrigadeSection, children?: ReactNode) => editing === section && draft
    ? <div className="brigade-inline-editor">
        {children}
        <LayoutEditor section={section} layout={layoutFor(section)} onChange={(patch) => patchLayout(section, patch)} />
        <div className="brigade-edit-actions">
          <button type="button" className="brigade-reset-action" onClick={() => resetLayout(section)}><RotateCcw size={15} /> Reset layout</button>
          <span />
          <button type="button" className="brigade-cancel-action" onClick={cancelEdit}><X size={15} /> Cancel</button>
          <button type="button" className="brigade-save-action" onClick={saveEdit}><Save size={15} /> Save</button>
        </div>
      </div>
    : null;

  const sectionEditButton = (section: BrigadeSection, label: string) => (
    <button
      type="button"
      className="brigade-section-edit"
      onClick={() => beginEdit(section)}
      disabled={editing !== null}
      aria-label={`Edit ${label}`}
      title={`Edit ${label}`}
    ><Pencil size={16} /></button>
  );

  const updateLevel = (index: number, patch: Partial<GivingLevel>) => setDraft((current) => current ? {
    ...current,
    levels: current.levels.map((level, levelIndex) => levelIndex === index ? { ...level, ...patch } : level)
  } : current);

  const moveLevel = (index: number, direction: -1 | 1) => setDraft((current) => {
    if (!current) return current;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= current.levels.length) return current;
    const levels = [...current.levels];
    [levels[index], levels[nextIndex]] = [levels[nextIndex], levels[index]];
    return { ...current, levels };
  });

  return (
    <section className="brigade-hub">
      <header
        className={`brigade-hero brigade-editable-section${editing === "hero" ? " is-editing" : ""}${layoutFor("hero").compact ? " is-compact" : ""}`}
        data-reversed={layoutFor("hero").reversed || undefined}
        style={panelStyle(layoutFor("hero"))}
      >
        {sectionEditButton("hero", "museum hero")}
        <div className="brigade-hero-copy">
          <p className="brigade-kicker"><span>Children's Museum of Stockton</span><i />{pageProgram.classLabel}</p>
          <h2>{landing.heroTitle ?? "Play it forward."}<br /><em>{landing.heroAccent ?? "Make wonder possible."}</em></h2>
          <p>{pageProgram.description}</p>
          <div className="brigade-hero-actions">
            <button type="button" className="brigade-primary-action" onClick={onManageDonors}><Users size={18} /> Manage official roster</button>
            <button type="button" className="brigade-secondary-action" onClick={() => onOpenBoard("board-toy-soldier-portrait")}><LayoutDashboard size={18} /> Open signature board</button>
          </div>
          {editor("hero", <div className="brigade-edit-fields two-column">
            <BrigadeField label="Class label"><input value={pageProgram.classLabel} onChange={(event) => patchDraft({ classLabel: event.target.value })} /></BrigadeField>
            <BrigadeField label="Program name"><input value={pageProgram.name} onChange={(event) => patchDraft({ name: event.target.value })} /></BrigadeField>
            <BrigadeField label="Hero headline"><input value={landing.heroTitle ?? "Play it forward."} onChange={(event) => patchLanding({ heroTitle: event.target.value })} /></BrigadeField>
            <BrigadeField label="Hero accent"><input value={landing.heroAccent ?? "Make wonder possible."} onChange={(event) => patchLanding({ heroAccent: event.target.value })} /></BrigadeField>
            <BrigadeField label="Multi-year giving-society explanation" wide><textarea value={pageProgram.description} onChange={(event) => patchDraft({ description: event.target.value })} /></BrigadeField>
            <BrigadeField label="Fund designation" wide><input value={pageProgram.fundDesignation} onChange={(event) => patchDraft({ fundDesignation: event.target.value })} /></BrigadeField>
          </div>)}
        </div>
        <div className="brigade-hero-art">
          <span className="brigade-sun" />
          <span className="brigade-ribbon ribbon-one" />
          <span className="brigade-ribbon ribbon-two" />
          <img key={HERO_ART[heroArtwork]} className="brigade-rotating-art" src={assetUrl(HERO_ART[heroArtwork])} alt={`Child-drawn Toy Soldier Brigade artwork ${heroArtwork + 1} of ${HERO_ART.length}`} />
          <div><strong>{members.length}</strong><span>Class of 2026<br />member entries</span></div>
          <nav className="brigade-art-dots" aria-label="Choose hero artwork">
            {HERO_ART.map((file, index) => <button key={file} type="button" className={heroArtwork === index ? "active" : ""} onClick={() => setHeroArtwork(index)} aria-label={`Show artwork ${index + 1}`} />)}
          </nav>
        </div>
      </header>

      <section className="brigade-intro-grid">
        <article className={`brigade-story-card brigade-editable-section${editing === "why" ? " is-editing" : ""}${layoutFor("why").compact ? " is-compact" : ""}`} style={panelStyle(layoutFor("why"))}>
          {sectionEditButton("why", "Why the Brigade Matters")}
          <p className="brigade-section-kicker">Why the Brigade matters</p>
          <h3>{landing.whyTitle ?? "Dependable generosity gives imagination room to grow."}</h3>
          <p>{pageProgram.impactStatement}</p>
          <div className="brigade-values">
            <div><BadgeCheck size={17} /><span><strong>Gratitude first</strong><small>Recognition celebrates people without turning giving into a competition.</small></span></div>
            <div><MessageSquare size={17} /><span><strong>A gracious invitation</strong><small>Families are welcomed to learn more—never pressured to participate.</small></span></div>
            <div><Star size={17} /><span><strong>Good deeds count</strong><small>Gifts, service, kindness, and shared play all model care for young visitors.</small></span></div>
          </div>
          {editor("why", <div className="brigade-edit-fields">
            <BrigadeField label="Section headline"><input value={landing.whyTitle ?? "Dependable generosity gives imagination room to grow."} onChange={(event) => patchLanding({ whyTitle: event.target.value })} /></BrigadeField>
            <BrigadeField label="Impact statement"><textarea value={pageProgram.impactStatement} onChange={(event) => patchDraft({ impactStatement: event.target.value })} /></BrigadeField>
          </div>)}
        </article>

        <aside
          className={`brigade-contact-card brigade-editable-section${editing === "contact" ? " is-editing" : ""}${layoutFor("contact").compact ? " is-compact" : ""}`}
          data-reversed={layoutFor("contact").reversed || undefined}
          style={panelStyle(layoutFor("contact"))}
        >
          {sectionEditButton("contact", "Curious to Learn More contact panel")}
          <div className="brigade-contact-art"><img src={assetUrl("group-hangout.svg")} alt="Three child-drawn toy soldiers hanging out together" /></div>
          <div className="brigade-contact-copy">
            <p className="brigade-section-kicker">Curious to learn more?</p>
            <h3>{landing.contactTitle ?? "Meet Edward and plan a visit"}</h3>
            <p>{pageProgram.invitation}</p>
            <dl>
              <div><dt>Contact</dt><dd>{pageProgram.contactName}</dd></div>
              <div><dt>Phone</dt><dd><a href={`tel:+1${pageProgram.contactPhone.replace(/\D/g, "")}`}>{pageProgram.contactPhone}</a></dd></div>
              <div><dt>Email</dt><dd><a href={`mailto:${pageProgram.contactEmail}`}>{pageProgram.contactEmail}</a></dd></div>
              <div><dt>Visit</dt><dd><a href={`https://${pageProgram.website}`} target="_blank" rel="noreferrer">{pageProgram.website}<ArrowUpRight size={13} /></a><small>{pageProgram.address}</small></dd></div>
            </dl>
          </div>
          {editor("contact", <div className="brigade-edit-fields two-column">
            <BrigadeField label="Contact panel heading" wide><input value={landing.contactTitle ?? "Meet Edward and plan a visit"} onChange={(event) => patchLanding({ contactTitle: event.target.value })} /></BrigadeField>
            <BrigadeField label="Contact name"><input value={pageProgram.contactName} onChange={(event) => patchDraft({ contactName: event.target.value })} /></BrigadeField>
            <BrigadeField label="Phone"><input value={pageProgram.contactPhone} onChange={(event) => patchDraft({ contactPhone: event.target.value })} /></BrigadeField>
            <BrigadeField label="Email"><input type="email" value={pageProgram.contactEmail} onChange={(event) => patchDraft({ contactEmail: event.target.value })} /></BrigadeField>
            <BrigadeField label="Website"><input value={pageProgram.website} onChange={(event) => patchDraft({ website: event.target.value })} /></BrigadeField>
            <BrigadeField label="Visit address" wide><input value={pageProgram.address} onChange={(event) => patchDraft({ address: event.target.value })} /></BrigadeField>
            <BrigadeField label="Invitation" wide><textarea value={pageProgram.invitation} onChange={(event) => patchDraft({ invitation: event.target.value })} /></BrigadeField>
          </div>)}
        </aside>
      </section>

      <section className={`brigade-level-section brigade-editable-section${editing === "levels" ? " is-editing" : ""}${layoutFor("levels").compact ? " is-compact" : ""}`} style={panelStyle(layoutFor("levels"))}>
        {sectionEditButton("levels", "Giving Levels")}
        <div className="brigade-section-heading">
          <div><p className="brigade-section-kicker">Giving levels</p><h3>{landing.levelsTitle ?? "One society, flexible ways to make a five-year commitment."}</h3></div>
          <p>Each name receives equal visual weight within its official level. Custom annual commitments have no maximum.</p>
        </div>
        <div className="brigade-level-grid">
          {pageProgram.levels.map((level) => {
            const levelMembers = members.filter((donor) => donor.givingLevelId === level.id || donor.tier === level.name);
            const levelTemplate = templates.find((template) => template.templatePurpose === "level" && template.name.toLowerCase().includes(level.name.toLowerCase()));
            return <article className={`brigade-level-card level-${level.id}`} key={level.id} style={{ "--brigade-level-color": level.color } as CSSProperties}>
              <header><span>{level.name.slice(0, 1)}</span><div><small>Toy Soldier Brigade</small><h4>{level.name}{level.id === "custom-annual" ? "" : " Level"}</h4></div><b>{levelMembers.length} member{levelMembers.length === 1 ? "" : "s"}</b></header>
              <div className="level-pledge"><strong>${level.annualPledge.toLocaleString()}{level.id === "custom-annual" ? "+" : ""}</strong><span>per year<br />for {level.years} years</span></div>
              <p>{level.description}</p>
              {levelTemplate
                ? <button type="button" onClick={() => onOpenBoard(levelTemplate.id)}>Open {level.name} template <ArrowUpRight size={15} /></button>
                : <button type="button" onClick={onManageDonors}>Manage level members <ArrowUpRight size={15} /></button>}
            </article>;
          })}
        </div>
        {editor("levels", <div className="brigade-level-edit-list">
          <BrigadeField label="Section headline"><input value={landing.levelsTitle ?? "One society, flexible ways to make a five-year commitment."} onChange={(event) => patchLanding({ levelsTitle: event.target.value })} /></BrigadeField>
          {pageProgram.levels.map((level, index) => <article key={level.id}>
            <div className="brigade-level-order"><strong>{index + 1}. {level.name}</strong><button type="button" disabled={index === 0} onClick={() => moveLevel(index, -1)} aria-label={`Move ${level.name} up`}><ArrowUp size={14} /></button><button type="button" disabled={index === pageProgram.levels.length - 1} onClick={() => moveLevel(index, 1)} aria-label={`Move ${level.name} down`}><ArrowDown size={14} /></button></div>
            <div className="brigade-edit-fields two-column">
              <BrigadeField label="Public label"><input value={level.name} onChange={(event) => updateLevel(index, { name: event.target.value })} /></BrigadeField>
              <BrigadeField label={level.id === "custom-annual" ? "Minimum annual threshold" : "Annual pledge"}><input type="number" min="0" step="100" value={level.annualPledge} onChange={(event) => updateLevel(index, { annualPledge: Number(event.target.value) || 0 })} /></BrigadeField>
              <BrigadeField label="Commitment years"><input type="number" min="1" max="25" value={level.years} onChange={(event) => updateLevel(index, { years: Number(event.target.value) || 1 })} /></BrigadeField>
              <BrigadeField label="Accent color"><input type="color" value={level.color} onChange={(event) => updateLevel(index, { color: event.target.value })} /></BrigadeField>
              <BrigadeField label="Description" wide><textarea value={level.description} onChange={(event) => updateLevel(index, { description: event.target.value })} /></BrigadeField>
            </div>
          </article>)}
        </div>)}
      </section>

      <section className={`brigade-roster-section brigade-editable-section${editing === "roster" ? " is-editing" : ""}${layoutFor("roster").compact ? " is-compact" : ""}`} style={panelStyle(layoutFor("roster"))}>
        {sectionEditButton("roster", "Official Recognition Roster")}
        <div className="brigade-section-heading">
          <div><p className="brigade-section-kicker">Official recognition roster</p><h3>{landing.rosterTitle ?? "Introducing the Class of 2026"}</h3></div>
          <button type="button" className="brigade-secondary-action compact" onClick={onManageDonors}><Users size={16} /> Manage source roster</button>
        </div>
        <div className="brigade-roster-grid">
          {pageProgram.levels.map((level) => {
            const levelMembers = members
              .filter((donor) => donor.givingLevelId === level.id || donor.tier === level.name)
              .sort((a, b) => (a.recognitionOrder ?? 0) - (b.recognitionOrder ?? 0));
            return <article className={`brigade-roster-card roster-${level.id}`} key={level.id} style={{ "--brigade-level-color": level.color } as CSSProperties}>
              <header><div><span>{level.name}{level.id === "custom-annual" ? "" : " Level"}</span><strong>${level.annualPledge.toLocaleString()}{level.id === "custom-annual" ? "+" : ""}/year for {level.years} years</strong></div><b>{levelMembers.length}</b></header>
              {levelMembers.length
                ? <ol>{levelMembers.map((donor) => <li key={donor.id}><i aria-hidden="true" /><span>{donor.name}</span></li>)}</ol>
                : <p className="brigade-empty-roster">No current members in this level.</p>}
            </article>;
          })}
        </div>
        {editor("roster", <div className="brigade-edit-fields">
          <BrigadeField label="Section headline"><input value={landing.rosterTitle ?? "Introducing the Class of 2026"} onChange={(event) => patchLanding({ rosterTitle: event.target.value })} /></BrigadeField>
          <div className="brigade-linked-record-note"><Users size={17} /><span><strong>Names, numbering, pledge details, and order stay connected to donor records.</strong><small>Use Manage source roster to make those changes without creating a disconnected copy.</small></span><button type="button" onClick={onManageDonors}>Manage official roster</button></div>
        </div>)}
      </section>

      <section
        className={`brigade-template-section brigade-editable-section brigade-compact-library${editing === "boards" ? " is-editing" : ""}${layoutFor("boards").compact ? " is-compact" : ""}`}
        data-reversed={layoutFor("boards").reversed || undefined}
        style={panelStyle(layoutFor("boards"))}
      >
        {sectionEditButton("boards", "Board Collection")}
        <div className="brigade-section-heading">
          <div><p className="brigade-section-kicker">Board collection</p><h3>{landing.boardsTitle ?? "A complete recognition set for every museum screen."}</h3></div>
          <p>Portrait and landscape editions for rosters, stories, invitations, and good-deed prompts.</p>
        </div>
        <div className="brigade-library-layout">
          <div className="brigade-library-selector">
            <label htmlFor="brigade-board-selector">Choose a board template</label>
            <select id="brigade-board-selector" value={selectedTemplate?.id ?? ""} onChange={(event) => {
              setSelectedBoardId(event.target.value);
              if (editing === "boards") patchLanding({ selectedBoardId: event.target.value });
            }}>
              {Object.entries(purposeLabels).map(([purpose, label]) => {
                const options = templates.filter((template) => (template.templatePurpose ?? "roster") === purpose);
                return options.length ? <optgroup key={purpose} label={label}>{options.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</optgroup> : null;
              })}
            </select>
            {selectedTemplate && <div className="brigade-library-meta"><span>{purposeLabels[selectedTemplate.templatePurpose ?? "roster"]}</span><span>{selectedTemplate.orientation}</span><span>{selectedTemplate.donorIds.length ? `${selectedTemplate.donorIds.length} members` : "Story-led"}</span></div>}
            <p>Every template remains connected to the Board Editor and its current roster.</p>
            <button type="button" className="brigade-secondary-action" disabled={!selectedTemplate} onClick={() => selectedTemplate && onOpenBoard(selectedTemplate.id)}><Pencil size={15} /> Open in Board Editor</button>
          </div>
          {selectedTemplate && <BoardPreview template={selectedTemplate} program={pageProgram} art={BOARD_ART[Math.max(0, templates.findIndex((item) => item.id === selectedTemplate.id)) % BOARD_ART.length]} />}
        </div>
        {editor("boards", <div className="brigade-edit-fields">
          <BrigadeField label="Section headline"><input value={landing.boardsTitle ?? "A complete recognition set for every museum screen."} onChange={(event) => patchLanding({ boardsTitle: event.target.value })} /></BrigadeField>
          <div className="brigade-linked-record-note"><LayoutDashboard size={17} /><span><strong>Board visuals and copy stay connected to the Board Editor.</strong><small>The selected template becomes the landing-page default when you save.</small></span><button type="button" disabled={!selectedTemplate} onClick={() => selectedTemplate && onOpenBoard(selectedTemplate.id)}>Edit selected board</button></div>
        </div>)}
      </section>

      <section
        className={`brigade-announcement-section brigade-editable-section brigade-compact-library${editing === "announcements" ? " is-editing" : ""}${layoutFor("announcements").compact ? " is-compact" : ""}`}
        data-reversed={layoutFor("announcements").reversed || undefined}
        style={panelStyle(layoutFor("announcements"))}
      >
        {sectionEditButton("announcements", "Announcement Kit")}
        <div className="brigade-section-heading">
          <div><p className="brigade-section-kicker">Announcement kit</p><h3>{landing.announcementsTitle ?? "Polished messages, ready when the moment arrives."}</h3></div>
          <button type="button" className="brigade-secondary-action compact" onClick={onOpenBlips}><Sparkles size={17} /> Browse Blips</button>
        </div>
        <div className="brigade-library-layout">
          <div className="brigade-library-selector">
            <label htmlFor="brigade-announcement-selector">Choose a prepared announcement</label>
            <select id="brigade-announcement-selector" value={selectedAnnouncement?.id ?? ""} onChange={(event) => {
              setSelectedAnnouncementId(event.target.value);
              if (editing === "announcements") patchLanding({ selectedAnnouncementId: event.target.value });
            }}>
              {announcementGroups(announcements).map(([style, items]) => <optgroup key={style} label={style}>{items.map((announcement) => <option key={announcement.id} value={announcement.id}>{announcement.title}</option>)}</optgroup>)}
            </select>
            {selectedAnnouncement && <div className="brigade-library-meta"><span>{selectedAnnouncement.style}</span><span>{selectedAnnouncement.durationMinutes} min</span><span>{selectedAnnouncement.priority}</span></div>}
            <p>Program messages stay here. Put the selected message on screen whenever the moment is right.</p>
          </div>
          {selectedAnnouncement && <AnnouncementPreview announcement={selectedAnnouncement} art={BOARD_ART[Math.max(0, announcements.findIndex((item) => item.id === selectedAnnouncement.id)) % BOARD_ART.length]} onPutOnScreen={() => onPutAnnouncementOnScreen(selectedAnnouncement.id)} />}
        </div>
        {editor("announcements", <div className="brigade-edit-fields">
          <BrigadeField label="Section headline"><input value={landing.announcementsTitle ?? "Polished messages, ready when the moment arrives."} onChange={(event) => patchLanding({ announcementsTitle: event.target.value })} /></BrigadeField>
          <div className="brigade-linked-record-note"><Megaphone size={17} /><span><strong>Message text and styling stay connected to the announcement composer.</strong><small>The selected announcement becomes the landing-page default when you save.</small></span><button type="button" disabled={!selectedAnnouncement} onClick={() => selectedAnnouncement && onUseAnnouncement(selectedAnnouncement.id)}>Edit selected message</button></div>
        </div>)}
      </section>

      {visitorMessagePanel}

      <footer
        className={`brigade-good-deed-banner brigade-editable-section${editing === "good-deed" ? " is-editing" : ""}${layoutFor("good-deed").compact ? " is-compact" : ""}`}
        data-reversed={layoutFor("good-deed").reversed || undefined}
        style={panelStyle(layoutFor("good-deed"))}
      >
        {sectionEditButton("good-deed", "campaign message")}
        <div><span><Sparkles size={20} /></span><p className="brigade-section-kicker">A campaign message for young visitors</p><h3>{pageProgram.goodDeedPrompt}</h3></div>
        <button type="button" onClick={() => onUseAnnouncement("brigade-good-deed")}><Megaphone size={17} /> Put this message on screen</button>
        {editor("good-deed", <div className="brigade-edit-fields"><BrigadeField label="Campaign message"><textarea value={pageProgram.goodDeedPrompt} onChange={(event) => patchDraft({ goodDeedPrompt: event.target.value })} /></BrigadeField></div>)}
      </footer>
    </section>
  );
}

function BrigadeField({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={`brigade-edit-field${wide ? " wide" : ""}`}><span>{label}</span>{children}</label>;
}

function LayoutEditor({ section, layout, onChange }: { section: BrigadeSection; layout: BrigadePanelLayout; onChange: (patch: Partial<BrigadePanelLayout>) => void }) {
  const splitSections: BrigadeSection[] = ["hero", "contact", "boards", "announcements", "good-deed"];
  const columnSections: BrigadeSection[] = ["why", "levels", "roster"];
  return <div className="brigade-layout-editor" aria-label="Section layout controls">
    <strong><Maximize2 size={14} /> Layout</strong>
    {splitSections.includes(section) && <label><span>First panel width</span><input type="range" min="30" max="70" step="5" value={layout.split ?? 50} onChange={(event) => onChange({ split: Number(event.target.value) })} /><output>{layout.split ?? 50}%</output></label>}
    {columnSections.includes(section) && <label><span>Columns</span><input type="range" min="1" max="3" step="1" value={layout.columns ?? 2} onChange={(event) => onChange({ columns: Number(event.target.value) })} /><output>{layout.columns ?? 2}</output></label>}
    {splitSections.includes(section) && <button type="button" className={layout.reversed ? "active" : ""} onClick={() => onChange({ reversed: !layout.reversed })}><ArrowLeftRight size={14} /> Swap panels</button>}
    <button type="button" className={layout.compact ? "active" : ""} onClick={() => onChange({ compact: !layout.compact })}><Maximize2 size={14} /> Compact spacing</button>
    <small>Controls snap to safe increments and stay bounded inside this panel.</small>
  </div>;
}

function BoardPreview({ template, program, art }: { template: LanternState["boardPrograms"][number]; program: BrigadeProgram; art: string }) {
  return <article className={`brigade-floating-preview board palette-${template.palette ?? "classic"} ${template.orientation.toLowerCase()}`}>
    <span className="brigade-preview-orientation">{template.orientation}</span>
    <img src={assetUrl(art)} alt="" aria-hidden="true" />
    <div><small>{program.classLabel}</small><strong>{template.heading}</strong><p>{template.subtitle}</p><i /></div>
    <footer>{purposeLabels[template.templatePurpose ?? "roster"]} · {template.donorIds.length || "Story"}</footer>
  </article>;
}

function AnnouncementPreview({ announcement, art, onPutOnScreen }: { announcement: SavedAnnouncement; art: string; onPutOnScreen: () => void }) {
  const style = {
    "--brigade-announcement-bg": announcement.backgroundColor ?? "#1675a8",
    "--brigade-announcement-ink": announcement.textColor ?? "#ffffff"
  } as CSSProperties;
  return <article className="brigade-floating-preview announcement" style={style}>
    <span className="brigade-preview-orientation">Live preview · {announcement.style}</span>
    <img src={assetUrl(art)} alt="" aria-hidden="true" />
    <div><small>Toy Soldier Brigade</small><strong>{announcement.title}</strong><p>{announcement.message}</p>{announcement.details && <em>{announcement.details}</em>}</div>
    <button type="button" className="brigade-put-on-screen" onClick={onPutOnScreen} title="Show this prepared message on every display now"><Monitor size={16} /><span>Put on screen</span><small>All displays · {announcement.durationMinutes} min</small></button>
  </article>;
}

function announcementGroups(announcements: SavedAnnouncement[]) {
  const groups = new Map<SavedAnnouncement["style"], SavedAnnouncement[]>();
  announcements.forEach((announcement) => groups.set(announcement.style, [...(groups.get(announcement.style) ?? []), announcement]));
  return Array.from(groups.entries());
}
