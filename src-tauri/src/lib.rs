use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}, process::Command};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Serialize)]
struct DisplayInfo {
    id: usize,
    name: Option<String>,
    position_x: i32,
    position_y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenDisplayInput {
    id: String,
    label: String,
    orientation: String,
}

#[derive(Serialize)]
struct BugCapture {
    screenshots: Vec<BugAttachment>,
    captured_at: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BugAttachment {
    name: String,
    data_url: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BugReportInput {
    summary: String,
    details: String,
    fix_tips: String,
    entered_by: String,
    tags: Vec<String>,
    attachments: Vec<BugAttachment>,
    app_state: serde_json::Value,
    recent_events: Vec<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BugRecord {
    bug_id: String,
    summary: String,
    details: String,
    fix_tips: String,
    #[serde(default)]
    entered_by: Option<String>,
    tags: Vec<String>,
    status: String,
    created_at: String,
    updated_at: String,
    attachments: Vec<String>,
    folder: String,
}

fn bug_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().document_dir().map_err(|e| e.to_string())?
        .join("Project Lantern").join("Bug Reports");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}

#[tauri::command]
fn available_displays(app: AppHandle) -> Result<Vec<DisplayInfo>, String> {
    let monitors = app.available_monitors().map_err(|error| error.to_string())?;
    Ok(monitors
        .iter()
        .enumerate()
        .map(|(id, monitor)| DisplayInfo {
            id,
            name: monitor.name().map(ToOwned::to_owned),
            position_x: monitor.position().x,
            position_y: monitor.position().y,
            width: monitor.size().width,
            height: monitor.size().height,
            scale_factor: monitor.scale_factor(),
        })
        .collect())
}

#[tauri::command]
fn open_test_displays(app: AppHandle, displays: Vec<OpenDisplayInput>) -> Result<(), String> {
    for (index, display) in displays.iter().enumerate() {
        let portrait = display.orientation == "Portrait";
        let window_label = format!("lantern-display-{}", slug(&display.id));
        open_display(
            &app,
            &window_label,
            &display.id,
            &display.label,
            if portrait { 540.0 } else { 1280.0 },
            if portrait { 920.0 } else { 760.0 },
            60.0 + index as f64 * 580.0,
            40.0 + index as f64 * 30.0,
        )?;
    }
    Ok(())
}

#[tauri::command]
fn capture_bug_windows(app: AppHandle) -> Result<BugCapture, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        return Ok(BugCapture { screenshots: vec![], captured_at: timestamp() });
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let capture_dir = std::env::temp_dir().join(format!("project-lantern-bug-{}", std::process::id()));
        let _ = fs::remove_dir_all(&capture_dir);
        fs::create_dir_all(&capture_dir).map_err(|e| e.to_string())?;
        let script = format!(r#"
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class LanternCapture {{
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
 public delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);
 public struct RECT {{ public int Left,Top,Right,Bottom; }}
}}
'@
$pidWanted={pid}
$out='{out}'
$i=0
[LanternCapture]::EnumWindows({{
 param($h,$lp)
 [uint32]$p=0; [LanternCapture]::GetWindowThreadProcessId($h,[ref]$p)|Out-Null
 if($p -eq $pidWanted -and [LanternCapture]::IsWindowVisible($h)) {{
  $r=New-Object LanternCapture+RECT
  [LanternCapture]::GetWindowRect($h,[ref]$r)|Out-Null
  $w=$r.Right-$r.Left; $ht=$r.Bottom-$r.Top
  if($w -gt 10 -and $ht -gt 10) {{
   $bmp=New-Object Drawing.Bitmap $w,$ht
   $g=[Drawing.Graphics]::FromImage($bmp)
   [LanternCapture]::PrintWindow($h,$g.GetHdc(),2)|Out-Null
   $g.ReleaseHdc(); $g.Dispose()
   $sb=New-Object Text.StringBuilder 256
   [LanternCapture]::GetWindowText($h,$sb,256)|Out-Null
   $safe=($sb.ToString() -replace '[^\w\- ]','').Trim()
   if(!$safe){{$safe="window"}}
   $bmp.Save((Join-Path $out ("{{0:D2}}-{{1}}.png" -f $i,$safe)),[Drawing.Imaging.ImageFormat]::Png)
   $bmp.Dispose(); $script:i++
  }}
 }}
 return $true
}},[IntPtr]::Zero)|Out-Null
"#, pid = std::process::id(), out = capture_dir.display().to_string().replace('\'', "''"));
        let status = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script])
            .creation_flags(0x08000000)
            .status()
            .map_err(|e| format!("Could not start screenshot capture: {e}"))?;
        if !status.success() { return Err("Screenshot capture failed".into()); }
        let mut screenshots = Vec::new();
        for entry in fs::read_dir(&capture_dir).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.extension().and_then(|v| v.to_str()) == Some("png") {
                let bytes = fs::read(&path).map_err(|e| e.to_string())?;
                screenshots.push(BugAttachment {
                    name: path.file_name().unwrap_or_default().to_string_lossy().into_owned(),
                    data_url: format!("data:image/png;base64,{}", BASE64.encode(bytes)),
                });
            }
        }
        screenshots.sort_by(|a, b| a.name.cmp(&b.name));
        let _ = fs::remove_dir_all(capture_dir);
        Ok(BugCapture { screenshots, captured_at: timestamp() })
    }
}

#[tauri::command]
fn capture_bug_snip() -> Result<BugAttachment, String> {
    #[cfg(not(target_os = "windows"))]
    return Err("Screen snipping is currently available on Windows".into());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let target = std::env::temp_dir().join(format!("project-lantern-snip-{}.png", std::process::id()));
        let _ = fs::remove_file(&target);
        let script = format!(r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
try {{ [Windows.Forms.Clipboard]::Clear() }} catch {{}}
Start-Process "ms-screenclip:"
$deadline=(Get-Date).AddMinutes(3)
while((Get-Date) -lt $deadline) {{
 Start-Sleep -Milliseconds 250
 try {{
  if([Windows.Forms.Clipboard]::ContainsImage()) {{
   $image=[Windows.Forms.Clipboard]::GetImage()
   $image.Save('{out}',[Drawing.Imaging.ImageFormat]::Png)
   $image.Dispose()
   exit 0
  }}
 }} catch {{}}
}}
exit 2
"#, out = target.display().to_string().replace('\'', "''"));
        let status = Command::new("powershell")
            .args(["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", &script])
            .creation_flags(0x08000000)
            .status().map_err(|e| format!("Could not open Windows Snipping Tool: {e}"))?;
        if status.code() == Some(2) { return Err("Screen capture was cancelled or timed out".into()); }
        if !status.success() || !target.exists() { return Err("No screen capture was received".into()); }
        let bytes = fs::read(&target).map_err(|e| e.to_string())?;
        let _ = fs::remove_file(&target);
        Ok(BugAttachment {
            name: format!("screen-capture-{}.png", timestamp()),
            data_url: format!("data:image/png;base64,{}", BASE64.encode(bytes)),
        })
    }
}

#[tauri::command]
fn save_bug_report(app: AppHandle, report: BugReportInput) -> Result<String, String> {
    if report.summary.trim().is_empty() { return Err("A brief description is required".into()); }
    let root = bug_root(&app)?;
    let number = fs::read_dir(&root).map_err(|e| e.to_string())?
        .filter_map(Result::ok).filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false)).count() + 1;
    let bug_id = format!("BUG-{number:05}");
    let dir = root.join(format!("{}-{}", bug_id, slug(&report.summary)));
    let shots = dir.join("screenshots");
    let files = dir.join("attachments");
    let logs = dir.join("logs");
    fs::create_dir_all(&shots).map_err(|e| e.to_string())?;
    fs::create_dir_all(&files).map_err(|e| e.to_string())?;
    fs::create_dir_all(&logs).map_err(|e| e.to_string())?;

    let mut saved_attachments = Vec::new();
    for (index, attachment) in report.attachments.iter().enumerate() {
        let (header, encoded) = attachment.data_url.split_once(',').ok_or("Invalid attachment data")?;
        let bytes = BASE64.decode(encoded).map_err(|e| e.to_string())?;
        let safe_name = safe_file_name(&attachment.name, index);
        let target_dir = if header.starts_with("data:image/") { &shots } else { &files };
        fs::write(target_dir.join(&safe_name), bytes).map_err(|e| e.to_string())?;
        saved_attachments.push(target_dir.join(&safe_name).strip_prefix(&dir).unwrap().display().to_string());
    }

    if let Ok(log_dir) = app.path().app_log_dir() {
        copy_recent_logs(&log_dir, &logs);
    }
    let created = timestamp();
    let diagnostic = serde_json::json!({
        "bugId": bug_id,
        "createdAt": created,
        "enteredBy": report.entered_by.clone(),
        "app": {"name": app.package_info().name, "version": app.package_info().version.to_string()},
        "platform": {"os": std::env::consts::OS, "arch": std::env::consts::ARCH, "debugBuild": cfg!(debug_assertions)},
        "process": {"pid": std::process::id(), "workingDirectory": std::env::current_dir().ok()},
        "appState": report.app_state,
        "recentEvents": report.recent_events,
        "attachments": saved_attachments
    });
    fs::write(dir.join("diagnostics.json"), serde_json::to_string_pretty(&diagnostic).unwrap()).map_err(|e| e.to_string())?;
    fs::write(dir.join("report.json"), serde_json::to_string_pretty(&report).unwrap()).map_err(|e| e.to_string())?;
    let record = BugRecord {
        bug_id: bug_id.clone(), summary: report.summary.clone(), details: report.details.clone(),
        fix_tips: report.fix_tips.clone(), entered_by: Some(report.entered_by.clone()), tags: report.tags.clone(), status: "open".into(),
        created_at: created.clone(), updated_at: created.clone(), attachments: saved_attachments.clone(),
        folder: dir.display().to_string(),
    };
    fs::write(dir.join("catalog.json"), serde_json::to_string_pretty(&record).unwrap()).map_err(|e| e.to_string())?;
    let markdown = format!("# {bug_id}: {}\n\nCreated: {created}\nEntered by: {}\nTags: {}\n\n## Brief description\n\n{}\n\n## Details\n\n{}\n\n## Tips on how to fix\n\n{}\n\n## Attached evidence\n\n{}\n\n## Codex handoff\n\nStart with `diagnostics.json`, then inspect `logs/` and the screenshots. Reproduce from the Details section before changing code.\n",
        report.summary, report.entered_by, report.tags.join(", "), report.summary, report.details, report.fix_tips,
        saved_attachments.iter().map(|p| format!("- `{p}`")).collect::<Vec<_>>().join("\n"));
    fs::write(dir.join("report.md"), markdown).map_err(|e| e.to_string())?;
    Ok(dir.display().to_string())
}

#[tauri::command]
fn list_bug_reports(app: AppHandle) -> Result<Vec<BugRecord>, String> {
    let root = bug_root(&app)?;
    let mut records = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())?.filter_map(Result::ok) {
        let path = entry.path().join("catalog.json");
        if let Ok(text) = fs::read_to_string(path) {
            if let Ok(record) = serde_json::from_str::<BugRecord>(&text) { records.push(record); }
        }
    }
    records.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(records)
}

#[tauri::command]
fn update_bug_report(app: AppHandle, bug: BugRecord) -> Result<BugRecord, String> {
    let root = bug_root(&app)?;
    let folder = root.join(root.file_name().and_then(|_| Path::new(&bug.folder).file_name()).ok_or("Invalid bug folder")?);
    if !folder.starts_with(&root) || !folder.exists() { return Err("Bug report folder was not found".into()); }
    let mut updated = bug;
    updated.updated_at = timestamp();
    updated.folder = folder.display().to_string();
    fs::write(folder.join("catalog.json"), serde_json::to_string_pretty(&updated).unwrap()).map_err(|e| e.to_string())?;
    let markdown = format!("# {}: {}\n\nStatus: {}\nEntered by: {}\nTags: {}\n\n## Details\n\n{}\n\n## Tips on how to fix\n\n{}\n\n## Attached evidence\n\n{}\n",
        updated.bug_id, updated.summary, updated.status, updated.entered_by.as_deref().unwrap_or("Unattributed"), updated.tags.join(", "), updated.details, updated.fix_tips,
        updated.attachments.iter().map(|p| format!("- `{p}`")).collect::<Vec<_>>().join("\n"));
    fs::write(folder.join("report.md"), markdown).map_err(|e| e.to_string())?;
    Ok(updated)
}

#[tauri::command]
fn delete_bug_report(app: AppHandle, bug_id: String) -> Result<(), String> {
    let root = bug_root(&app)?;
    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
    let target = fs::read_dir(&root).map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .find_map(|entry| {
            let catalog = entry.path().join("catalog.json");
            let text = fs::read_to_string(catalog).ok()?;
            let record = serde_json::from_str::<BugRecord>(&text).ok()?;
            (record.bug_id.eq_ignore_ascii_case(&bug_id)).then_some(entry.path())
        })
        .ok_or("Bug report was not found")?;
    let canonical_target = target.canonicalize().map_err(|e| e.to_string())?;
    if canonical_target == canonical_root || !canonical_target.starts_with(&canonical_root) {
        return Err("Refusing to delete a bug outside the bug report folder".into());
    }
    fs::remove_dir_all(canonical_target).map_err(|e| e.to_string())
}

#[tauri::command]
fn export_bug_reports(app: AppHandle) -> Result<String, String> {
    let root = bug_root(&app)?;
    let export = root.parent().unwrap_or(&root).join(format!("project-lantern-bugs-{}.zip", timestamp()));
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let script = format!("Compress-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
            root.display().to_string().replace('\'', "''"), export.display().to_string().replace('\'', "''"));
        let status = Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .creation_flags(0x08000000).status().map_err(|e| e.to_string())?;
        if !status.success() { return Err("Could not build the bug export archive".into()); }
    }
    #[cfg(not(target_os = "windows"))]
    return Err("Bug archive export is currently available on Windows".into());
    Ok(export.display().to_string())
}

fn timestamp() -> String {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(value) => value.as_secs().to_string(),
        Err(_) => "unknown".into(),
    }
}

fn slug(value: &str) -> String {
    let result: String = value.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    let compact = result.split('-').filter(|v| !v.is_empty()).take(8).collect::<Vec<_>>().join("-");
    if compact.is_empty() { "untitled".into() } else { compact }
}

fn safe_file_name(name: &str, index: usize) -> String {
    let safe: String = Path::new(name).file_name().unwrap_or_default().to_string_lossy()
        .chars().map(|c| if c.is_ascii_alphanumeric() || ".-_ ".contains(c) { c } else { '_' }).collect();
    if safe.trim().is_empty() { format!("attachment-{index}") } else { safe }
}

fn copy_recent_logs(from: &Path, to: &PathBuf) {
    let Ok(entries) = fs::read_dir(from) else { return };
    for entry in entries.filter_map(Result::ok).take(20) {
        let path = entry.path();
        if path.is_file() {
            let _ = fs::copy(&path, to.join(entry.file_name()));
        }
    }
}

fn open_display(
    app: &AppHandle,
    label: &str,
    screen: &str,
    title: &str,
    width: f64,
    height: f64,
    x: f64,
    y: f64,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(label) {
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        label,
        WebviewUrl::App(format!("index.html#/display/{screen}").into()),
    )
    .title(format!("Project Lantern {title}"))
    .inner_size(width, height)
    .position(x, y)
    .resizable(true)
    // Display windows are intended for TVs and signage, not operator input.
    // Keep the control-center window decorated, but make each output window
    // a borderless native fullscreen surface on its selected monitor.
    .decorations(false)
    .fullscreen(true)
    .build()
    .map(|_| ())
    .map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("control") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![available_displays, open_test_displays, capture_bug_windows, capture_bug_snip, save_bug_report, list_bug_reports, update_bug_report, delete_bug_report, export_bug_reports])
        .run(tauri::generate_context!())
        .expect("error while running Project Lantern");
}
