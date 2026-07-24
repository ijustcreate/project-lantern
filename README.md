# Project Lantern

Project Lantern is a Tauri-ready donor recognition control center with independent portrait and landscape display windows for local testing.

## Hosted test site

The public test build is deployed automatically from `main` with GitHub Pages:

https://ijustcreate.github.io/project-lantern/

The hosted build is suitable for interface and display-layout testing. Its current
state and live-video channels are browser-local; cross-device museum synchronization
is the next deployment phase.

## Test Now

```powershell
npm install
npm run dev
```

Open the local URL, then press the monitor button in the top bar or use `Screens > Open independent test displays`.

## What Works

- React control center with dashboard, donors, theme studio, announcements, screens, and revision history.
- Babylon.js display renderer with high-resolution baked donor lettering.
- Independent portrait and landscape display windows on the same machine.
- BroadcastChannel host sync for state, display health, FPS, identify-screen, publishing, and rollback.
- Local live video routing from the control center to display windows through WebRTC.
- Generated local video fallback when no camera is available or permission is declined.
- Tauri 2 Rust host scaffold for native multi-window display creation.

## Native Tauri

This machine does not currently have Rust/Cargo in PATH. After installing Rust and the Windows build tools, run:

```powershell
npm run tauri:dev
```

The Rust host command `open_test_displays` creates separate Tauri webview windows for the portrait and landscape displays.

## Codex bug workflow

While the Vite development server is running, browser bug reports are mirrored into
`.lantern/bugs/<BUG-ID>/`. Opening the Bugs page once migrates older browser-only
reports. Screenshots, animated GIFs, and other attachments are saved under the
bug's `evidence/` folder so Codex and scheduled local agents can inspect them.

```powershell
npm run bugs
npm run bugs -- list --status=open
npm run bugs -- show BUG-0002
npm run bugs -- status BUG-0002 in-progress
npm run bugs -- work BUG-0002 proposal "Cause and proposed fix; awaiting approval."
npm run bugs -- work BUG-0002 test "Build and regression checks passed."
```

The `work` command adds a visible entry to the bug's Agent work log. Supported entry
types are `analysis`, `proposal`, `change`, `test`, and `handoff`. Approval-first
agents should record a proposal and stop for approval before changing code.
