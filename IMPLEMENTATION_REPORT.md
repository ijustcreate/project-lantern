# Project Lantern Recognition Boards — Implementation Report

Date: 2026-08-06
Author: Codex
Authoritative backlog: `C:\Users\17148\Downloads\codex_handoff_local_recognition_boards.md`
Tracking records: `BUG-0047` (authoritative four-phase backlog), `BUG-0048` (post-phase UI/UX refinement)
Changelog records: `DEV-0154` (Phase 1), `DEV-0155` (Phase 2), `DEV-0156` and `DEV-0157` (Phase 3), `DEV-0158` (Phase 4), and `DEV-0159` through `DEV-0166` (final UI/UX refinement and verification)

This was completed as an incremental refinement. The existing visual language, tactile donor controls, donor-board count, Recognition Profile structure, particle editor, room-camera active indicator, move/resize and pan/zoom interaction model, live board compositing, background-removal path, and local recording behavior were retained and extended.

## 1. What was implemented in each phase

### Phase 1 — Data integrity and core interactions

- Added migration-backed local users (`Felix`, `Codex`, and `Edward`), per-user preferences, bounded audit history, and reminder acknowledgements.
- Preserved donor order, media references, custom users, preferences, and prior audit/reminder records during migration.
- Repaired tactile donor drag/reorder and persistence without replacing the existing card interaction.
- Made schedule create/edit/color/delete transactional: Cancel and Escape do not mutate persisted data, while Apply/Save does.
- Prevented repeated broadcast reminders by persisting occurrence acknowledgements.
- Made individual and all-display pop-outs open real, orientation-aware board content.
- Added shared, reference-counted camera/microphone ownership with friendly exact-device fallback and contention errors.
- Made the room camera draggable/resizable, persistent per user, mirrored when requested, and paired it with live audio level/gain controls.
- Kept the existing movable broadcast preview, direct manipulation, particle editor, and board compositing behavior.

### Phase 2 — Dashboard, Brigade, donors, and board editor

- Moved Toy Soldier Brigade beneath Dashboard and removed the duplicate sidebar destination.
- Added a child-drawn SVG soldier set, compact Brigade layout, inline editing, configurable third level, and consistent edit affordances.
- Reduced the donor profile to the requested four useful tabs; presentation appearance is now owned by each board instead of by a donor.
- Added pledge/program/level controls and an explicit donation/payment history. Migrated prior aggregate donations into clearly labeled opening-payment records without inventing identifiers.
- Kept `donor.boardIds` as the membership source of truth and synchronized donor/board previews.
- Added and persisted the exact 42-message visitor prompt pool, manager, schedule-safe editing, and rotating display footer.
- Preserved donor-card board counts, useful Recognition Profile organization, and existing highlight behavior.

### Phase 3 — Calendar, displays, announcements, and composition

- Added an idempotent 20-entry two-display demo schedule spanning 7:00 a.m.–6:00 p.m. and an install-relative range of seven days before through thirty days after.
- Preserved customized/disabled schedules. The two exact obsolete full-day seed records remain archived in storage but no longer consume visible calendar lanes.
- Added orientation-aware display labels, Art Center/closing announcement content, repo-owned art, and separate Messages and Blips views.
- Replaced remaining native `alert`, `confirm`, and `prompt` interactions with themed, accessible, draft-safe dialogs.
- Added seven frame presets and six background modes: Board, Solid, Gradient, Museum, Custom Image, and None.
- Added two-to-four-color gradients, responsive museum assets, fit/fill/zoom/position/rotation controls, independent four-edge crop, Control-key temporary crop mode, and shared rendering across studio/pop-out/mobile/visitor outputs.
- Simplified background removal to a clear On/Off control with mutually exclusive Chroma Key and local screenless removal, green/blue/custom samples, preview sampling, and replace/clear image handling.

### Phase 4 — Tracking, costumes, calibration, and recording

- Added cached MediaPipe module/WASM/model loading, an immediate `Detecting face…` state, live initialization/first-detection/inference/FPS telemetry, and adaptive 60-to-30 FPS cadence selection under sustained load.
- Added classic and playful glasses, a party hat, and a three-bone spring/damping wizard hat.
- Added independent blink values, camera-under-landmarks, labeled face/body/hand anchors, finger/open-palm/wave inference, shoulder/neck/inferred-arm anchors, confidence-bounded hand-over-face holds, and a fail-closed experimental mouth-analysis extension.
- Added migration-backed Effect Studio state with per-user/device center/left/right/up/down calibration; costume create, duplicate, rename, save, load, delete, export, and import; piece/anchor/bone editing; and rig controls.
- Added a 22-piece Talking Teddy and a Playful Skeleton with inferred forearms, rendered through the same tracking overlay contract used by preview/pop-out/display paths.
- Added a persistent IndexedDB recording library with Blob storage and memory fallback, live-preview stream cloning, generated demo capture, timer, thumbnails, playback, rename, download, send, and themed delete.
- Locked source/target/camera/microphone controls during recording and instrumented click-to-recorder-ready and click-to-first-data timings.
- Added container-width responsive behavior so Effect Studio and face controls remain usable inside the actual narrow Broadcast inspector.

## 2. Exact files and modules changed

### Shared integration and data model

- `src/App.tsx`
- `src/types.ts`
- `src/sampleData.ts`
- `src/stateManagement.ts`
- `src/styles.css`
- `src/host/lanternHost.ts`
- `src/host/mediaDeviceManager.ts`
- `src/display/BabylonDonorWall.tsx`
- `src/changelog.json`

### Phase 1 modules

- `src/components/AuditHistoryPanel.tsx`
- `src/components/AudioLevelMeter.tsx`

### Phase 2 modules and assets

- `src/boardPresentation.ts`
- `src/donorDomain.ts`
- `src/visitorMessages.ts`
- `src/components/BoardDonorPresentationEditor.tsx`
- `src/components/BrigadeView.tsx`
- `src/components/BrigadeView.css`
- `src/components/VisitorMessageFooter.tsx`
- `src/components/VisitorMessageFooter.css`
- `src/components/VisitorMessageManager.tsx`
- `src/components/VisitorMessageManager.css`
- `public/assets/brigade/group-guard.svg`
- `public/assets/brigade/group-hangout.svg`
- `public/assets/brigade/head-blue.svg`
- `public/assets/brigade/head-red.svg`
- `public/assets/brigade/head-yellow.svg`
- `public/assets/brigade/soldier-blue.svg`
- `public/assets/brigade/soldier-red.svg`
- `public/assets/brigade/soldier-yellow.svg`

### Phase 3 modules, fixtures, and assets

- `src/phase3Schedule.ts`
- `src/backgroundRemoval.ts`
- `src/broadcastComposition.ts`
- `src/components/BroadcastBackgroundLayer.tsx`
- `src/components/BroadcastCompositionControls.tsx`
- `src/components/ChromaKeySampler.tsx`
- `src/components/ChromaKeySampler.css`
- `src/components/LanternDialog.tsx`
- `src/components/LanternDialog.css`
- `scripts/phase3-schedule-fixture.mjs`
- `scripts/test-broadcast-composition.mjs`
- `public/assets/announcements/art-center-paintbrush.svg`
- `public/assets/broadcast/cms-landscape.svg`
- `public/assets/broadcast/cms-portrait.svg`

### Phase 4 modules and fixtures

- `src/components/ChromaVideo.tsx`
- `src/trackingRuntime.ts`
- `src/trackingEffects.ts`
- `src/visionResources.ts`
- `src/effectStudio.ts`
- `src/costumeRenderer.ts`
- `src/components/EffectStudio.tsx`
- `src/components/EffectStudio.css`
- `src/recordingLibrary.ts`
- `src/components/RecordingLibrary.tsx`
- `src/components/RecordingLibrary.css`
- `scripts/test-tracking-runtime.mjs`
- `scripts/phase4-effect-studio-fixture.mjs`
- `scripts/test-recording-library.mjs`

## 3. Data migrations and preservation

All migrations are additive, normalized on load, and idempotent. Existing state is not reset.

| Migration | Added or normalized | Preservation behavior |
| --- | --- | --- |
| v3 → v4 | Stable local users, per-user preferences, audit history, reminder acknowledgements | Pre-v3 official-content repair is gated separately, so existing donor array order and `recognitionOrder` remain unchanged. Custom users/preferences survive; legacy matching local user IDs remap to stable IDs. Audit history is newest-first and bounded to 350; reminder occurrences are deduplicated/newest-first and bounded to 250. Board background media IDs and Blob URLs remain intact. |
| v4 → v5 | Board-owned donor presentation, normalized pledge/program/level data, payment history, Brigade configuration, 42 visitor messages | Donor membership remains sourced from `donor.boardIds`. Legacy donor appearance becomes board presentation without discarding board-specific values. Existing donation totals become labeled opening-payment records; no fake transaction ID is created. Existing donors, media, and ordering survive. |
| v5 → v6 | Install-relative two-display schedule and Art Center announcement/demo content | Existing/custom schedules remain. Only the two exact legacy all-day seed IDs are archived with `active=false`; their records are retained. Customized variants are not archived. A second normalization produces no duplicate schedule entries. |
| v6 → v7 | `EffectStudioState`, starter costume rigs, per-user/device calibration, renderer-facing legacy effect fields | Existing legacy face-effect toggles are translated, not removed. Custom starter edits, custom costumes, and calibration profiles survive. A second normalization is stable. Recording Blobs are stored separately in IndexedDB, avoiding large local-state rewrites. |

Media remains referenced rather than reset. The shared host keeps production persistence behavior; only local development skips the configured cross-origin shared-state request that previously generated CORS noise.

## 4. Tests added and commands run

### Automated fixtures added

- `node --experimental-strip-types scripts/phase3-schedule-fixture.mjs`
  - Passed: 20 entries, exact `2026-07-30` through `2026-09-05` range for the test install date, exact legacy archival, custom preservation, idempotence.
- `node scripts/test-broadcast-composition.mjs`
  - Passed: seven frames, six backgrounds, legacy-field preservation, independent crop edges, custom URL preservation.
- `node scripts/test-tracking-runtime.mjs`
  - Passed: cached renderer contract, adaptive 60→30 cadence simulation, independent blink, bounded occlusion hold, five-finger/open-palm and body/arm inference, fail-closed mouth analysis, three wizard bones.
- `node scripts/phase4-effect-studio-fixture.mjs`
  - Passed: content version 7, custom starter/costume/calibration preservation, legacy-toggle migration, 22 teddy pieces, skeleton arms, idempotence.
- `node scripts/test-recording-library.mjs`
  - Passed: memory fallback, Blob persistence, newest-first sorting, timing math, rename, and delete.

### Build and source verification

- `npm run build` passed after Phases 1, 2, and 3.
- Final `npm run build` completed the full TypeScript check after the UI/UX refinement and Vite emitted fresh production assets `dist/assets/index-CU5f6-Kf.js` and `dist/assets/index-7FW-U5oD.css` at 2026-08-06 19:14 local time.
- `npx tsc --noEmit --pretty false` passed during Phase 4 integration.
- `git diff --check` passed after every phase and in the final combined check. Git reported only its configured LF→CRLF working-copy notices.
- Source assertion found zero native `window.alert`, `window.confirm`, or `window.prompt` calls under `src`.
- Vite reported only the existing mixed static/dynamic Tauri import and large-chunk advisories; there were no build errors.

### Browser verification

Production/dev Chromium verification covered Dashboard → Brigade → Donors → Board Editor → Schedule → Announcements/Messages/Blips → Settings → Broadcast, plus refresh persistence. It verified:

- v7 state with Felix/Codex/Edward, 42 visitor messages, 20 schedule seeds, two starter costumes, and a calibration profile.
- Four donor tabs, board-owned presentation, opening-payment labels, 52 Brigade inline edit controls, orientation labels, and Messages/Blips navigation.
- Schedule/Blip Cancel safety, display pop-outs, frame/background selection, portrait/landscape asset switching, Control crop mode, and an independent right-edge pointer crop.
- No application console errors across the primary route regression; Babylon startup messages were informational.
- Effect Studio interactive height and narrow-inspector reflow. Final measured grid columns were approximately 327 px for face/effect choices and 319 px for visibility/editor content, each resolving to one column rather than overlapping controls.
- Preview remained visible while recording; source controls locked; three recordings persisted after reload; inline rename to `Final browser capture` succeeded.

## 5. Screenshots and visual evidence

The following local captures were produced during the phase checks:

- Phase 2 Brigade: `C:\Users\17148\Desktop\Recognition Boards\.playwright-cli\page-2026-08-06T20-59-19-275Z.png`
- Phase 2 visitor footer/manager: `C:\Users\17148\Desktop\Recognition Boards\.playwright-cli\page-2026-08-06T21-25-51-766Z.png`
- Phase 3 schedule after archived-lane correction: `C:\Users\17148\Desktop\Recognition Boards\.playwright-cli\page-2026-08-06T22-35-30-728Z.png`
- Phase 3 Broadcast composition: `C:\Users\17148\Desktop\Recognition Boards\.playwright-cli\page-2026-08-06T22-18-47-783Z.png`
- Phase 4 Effect Studio costume header: `C:\Users\17148\Desktop\Recognition Boards\.playwright-cli\page-2026-08-06T23-28-23-545Z.png`
- Phase 4 recording library with three persisted captures and latest timing: `C:\Users\17148\Desktop\Recognition Boards\.playwright-cli\page-2026-08-06T23-31-35-207Z.png`
- Phase 4 final narrow-layout diagnostic geometry: `C:\Users\17148\Desktop\Recognition Boards\.playwright-cli\page-2026-08-06T23-52-52-940Z.png`

The final narrow-layout capture was made with the final responsive rules injected into the production page to validate geometry; the identical rules were then compiled into the fresh final production CSS bundle. A subsequent Playwright CLI package bootstrap hung, so no claim is made that this last capture was taken after reloading that bundle.

## 6. Measured tracking and recording performance

### Tracking

| Measurement | Before | After |
| --- | ---: | ---: |
| Activation latency | Approximately 8,000 ms, reported by the handoff; not reproduced on this machine | Deterministic cached-runtime simulation: 920 ms initialization and 1,080 ms first detection |
| Cadence behavior | Not instrumented | Deterministic simulation holds 60 FPS under light inference and falls back to 30 FPS under sustained load |
| Synthetic Chromium, software WebGL | No baseline | Cold combined screenless-removal/costume run: 15,981 ms warm-up, 3,879 ms inference, 3 rendered FPS |
| Synthetic Chromium, warmed assets, face-only no-face stream | No baseline | 3,430 ms warm-up, 4,048 ms inference, 2 rendered FPS |

The two browser measurements are deliberately reported as synthetic software-WebGL/no-face-stream results, not as real-camera hardware performance. They demonstrate status/telemetry and failure-safe behavior, but do not validate the 60/30 FPS target on museum hardware. The live `onTrackingStatus` contract now reports initialization, first-detection, inference, rendered FPS, and selected cadence so that measurement can be captured on the target GPU/camera.

### Recording

| Measurement | Before | After |
| --- | --- | --- |
| Persistence | Session-only list/object URLs | IndexedDB Blob library surviving full reload, with memory fallback |
| Timing telemetry | None | Deterministic fixture: 6 ms recorder-ready, 252 ms first data |
| Production Chromium generated feed | Not measured | Cold start: 6,161/6,161 ms ready/first data; warm starts: 788/794 ms and 629/629 ms |
| Preview continuity | Local save existed | Preview stayed visible for the complete recording; controls locked; saved clips reloaded and renamed |

The cold MediaRecorder initialization remains materially slower than the warm path in software Chromium. The UI stays in `Starting recorder…` with the preview alive, and the timings are exposed rather than hidden.

## 7. Incomplete items, technical reasons, and extension points

- **Real-camera 60/30 FPS validation:** not completed because the automated environment supplied a synthetic no-face stream under software WebGL, not the target museum camera/GPU. The cached `trackingRuntime`, adaptive cadence controller, and `onTrackingStatus` metrics are the extension points for a target-hardware acceptance run.
- **Direct dragging of calibration landmarks on the camera image:** the implemented guided center/left/right/up/down calibration uses an adjacent schematic/editor. Direct video-surface dragging would require coordinate hit-testing synchronized with the composited/cropped camera transform. `EffectStudioState.calibrations`, the overlay callback, and the piece/anchor editor preserve the extension point.
- **Full production-grade puppet physics and rear-head occlusion:** the first pass uses lightweight per-bone spring/damping and confidence-bounded front occlusion; it does not infer unseen back-of-head depth. Costume bone physics fields, normalized anchors, and `costumeRenderer` are designed for a later solver/depth source.
- **Experimental mouth imagery:** it fails closed unless sufficient image evidence is available. This avoids inventing mouth state from weak landmarks; the explicit mouth-analysis hook can accept a later verified classifier.
- **Always-composited recordings:** recording captures the approved source stream. Board/title/effects are included when the deliberately selected source is the shared/composited window; automatic canvas-and-audio stream assembly is not forced because browser capture permissions and audio-track mixing differ by runtime. `recordingLibrary` accepts a prepared stream immediately before `MediaRecorder`, which is the intended extension point.
- **Cold recorder start:** the first software-Chromium run took 6.16 seconds, while warm runs were sub-second. The preview remains live and the UI exposes the startup state/metrics; codec warm-up or a pre-created encoder can be evaluated on deployment hardware.

No existing user data was reset to deliver these phases.

## 8. Final UI/UX refinement after the four phases

The post-phase review remained incremental and did not add another state-schema migration. Existing v7 data, schedules, recordings, media references, donor order, custom vocabulary, giving programs, board geometry, and presentation settings continue to load unchanged.

### Schedule and help

- Restored full type color in offline schedule entries and strengthened shape, border, icon, and explicit type-label cues for Boards, Announcements, Blips, and Broadcasts.
- Removed horizontal week scrolling by fitting seven columns to the available width.
- Fit the normal operating day (7:00 a.m.–7:00 p.m., expanding for actual out-of-range content) into the available calendar height.
- Removed the internal Revisions material from How to Use and updated schedule guidance.

### Donors and recognition-board names

- Rebuilt donor rows as contained 82 px cards with a calmer information hierarchy, concise pledge summary, three visible tags plus an overflow count, and 12 rows per page.
- Corrected Warm/Light theme contrast after browser review; all 12 rendered cards passed direct-child containment checks.
- Donor names now use one shared font size per panel. Conjunction names render as `Name` / `and` / `Name`, long names wrap to two or three lines, and logical rows receive height according to their tallest wrapped entry. The same layout contract is used in Board Editor and Babylon display output.

### Messages, Blips, Broadcast, and recording

- Added an always-visible explanation distinguishing a fuller timed Message from a brief playful Blip.
- Made Broadcast default to a straight-on 2D board, added an interactive 3D pan/zoom mode, and expanded the preview to the maximum aspect-fit size.
- Removed the persistent recording footer. Record and saved captures now live in the monitor header; the compact filename library reveals its associated thumbnail on hover/focus.
- Expanded the Source, Frame & Crop, and Effects inspector into the vertical space released by the footer.

### Settings and display launch

- Collapsed giving programs by default, restored reliable expand/collapse, and corrected the four-section Settings grid so expanded Brigade content remains in document flow.
- Replaced always-open tier/category/tag lists with select, edit-selected, delete-selected, and add-new controls.
- Chrome permits one new popup per user activation. The browser build therefore opens one display-wall popup containing both live outputs on the first click; the native Tauri build continues to open independent physical display windows.

### Refinement files and verification

Additional or materially refined files:

- `src/App.tsx`
- `src/styles.css`
- `src/display/BabylonDonorWall.tsx`
- `src/host/lanternHost.ts`
- `src/components/RecordingLibrary.tsx`
- `src/components/RecordingLibrary.css`
- `src/donorNameLayout.ts`
- `scripts/test-display-window-open.mjs`
- `scripts/test-donor-name-layout.mjs`
- `scripts/test-settings-vocabulary-layout.mjs`

Focused fixtures passed for schedule seeding, donor-name row demand, browser display launch, recording persistence, and Settings vocabulary/layout. Playwright verified the no-scroll seven-day schedule, donor-card containment and theme contrast, Message/Blip explanation, default 2D and interactive 3D Broadcast modes, removal of the recording footer, compact recording menu, Settings expand/collapse geometry, and the first-click two-output display wall.

Refinement evidence is stored under `output/playwright/`, including:

- `schedule-warm.png`
- `donors-warm-fixed.png`
- `message-blip-explainer.png`
- `broadcast-2d.png`
- `broadcast-recordings-menu.png`
- `settings-compact.png`
- `settings-expanded.png`
- `display-wall-first-click.png`
- `donor-names-equal-wrapped.png`

## 9. Movable room-camera window follow-up

- Dashboard room-camera actions now open the assigned camera and microphone controls in a true resizable browser window that can be moved to another monitor.
- The pop-out uses the Dashboard's existing `MediaStream` lease, so it does not open the selected camera or microphone a second time.
- Closing the separate window releases the room-camera lease. If the browser blocks or suppresses the pop-out, the existing movable in-app camera panel remains available and includes a Pop out retry control.
- The focused pop-out fixture, Dashboard browser interaction, full TypeScript/Vite production build, and final HTTP 200 bundle check passed for BUG-0049.

## 10. Broadcast pop-out alignment and saved-recording source follow-up

- Donor-board canvases rendered in the Broadcast pop-out now observe and respond to the pop-out window instead of the control-portal window. Moving or resizing the separate preview therefore re-fits the 2D board to the available stage and keeps the board background aligned with the video frame.
- Saved recordings are now a first-class **Video source** alongside the generated feed, camera, and screen share. Choosing **Saved recording** replaces the Camera and Microphone controls with a recording selector and an explanation that audio comes from the selected clip.
- A selected recording loops through the normal Broadcast preview and live-presentation path. Its temporary playback URL and captured media tracks are released when the preview stops, the source changes, or the app unmounts.
- The selector preserves the currently selected recording when possible, advances safely after deletion, and disables itself with a clear empty-library message until a recording has been saved.
- Browser verification recorded a 1:51 generated-feed clip, saved it to the local recording library, switched Video source to **Saved recording**, selected the clip, and confirmed a connected preview video. No application console errors were emitted.
- Focused fixtures passed for recording-source playback and cleanup, recording-library persistence, Broadcast composition, and pop-out board sizing. The final TypeScript/Vite build and internal-preview bundle check are recorded under BUG-0050 and BUG-0051.
