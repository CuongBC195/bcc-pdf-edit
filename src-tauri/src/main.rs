#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Serialize;
use std::{fs, path::Path, process::Command};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[derive(Serialize)]
struct ExplorerContextFile {
    name: String,
    mime: String,
    base64: String,
}

/// Phát hiện tệp đang được chọn (highlight) trong Windows File Explorer trước khi hiện cửa sổ Raycast
#[cfg(target_os = "windows")]
fn detect_windows_selected_file() -> Option<String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let ps_script = r#"
$sh = New-Object -ComObject Shell.Application
foreach ($w in $sh.Windows()) {
  try {
    $sel = $w.Document.SelectedItems()
    if ($sel -and $sel.Count -gt 0) {
      Write-Output $sel.Item(0).Path
      break
    }
  } catch {}
}
"#;
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    let path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path_str.is_empty() || !Path::new(&path_str).is_file() {
        return None;
    }
    Some(path_str)
}

#[cfg(not(target_os = "windows"))]
fn detect_windows_selected_file() -> Option<String> {
    None
}

fn load_context_file_payload(path_str: &str) -> Option<ExplorerContextFile> {
    let path = Path::new(path_str);
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    let mime = match ext.as_str() {
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => return None,
    };
    let meta = fs::metadata(path).ok()?;
    // Giới hạn đọc tự động qua bộ nhớ tối đa 80MB
    if meta.len() > 80 * 1024 * 1024 {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let name = path.file_name()?.to_string_lossy().to_string();
    Some(ExplorerContextFile {
        name,
        mime: mime.to_string(),
        base64: BASE64.encode(bytes),
    })
}

fn toggle_launcher_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        let is_focused = window.is_focused().unwrap_or(false);
        if is_visible && is_focused {
            let _ = window.hide();
        } else {
            // 1. Bắt tệp đang được trỏ ở Windows Explorer trước khi cửa sổ Raycast chiếm focus
            let selected_file = detect_windows_selected_file()
                .and_then(|p| load_context_file_payload(&p));

            // 2. Hiện cửa sổ nổi Raycast ở chính giữa màn hình
            let _ = window.center();
            let _ = window.show();
            let _ = window.set_focus();

            if let Some(payload) = selected_file {
                if let Ok(json) = serde_json::to_string(&payload) {
                    let js = format!(
                        "window.dispatchEvent(new CustomEvent('bcc:explorer-file', {{ detail: {} }}))",
                        json
                    );
                    let _ = window.eval(&js);
                    return;
                }
            }
            let _ = window.eval("window.dispatchEvent(new CustomEvent('bcc:launcher-summon'))");
        }
    }
}

fn main() {
    let alt_space = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    let ctrl_shift_space = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed
                        && (shortcut == &alt_space || shortcut == &ctrl_shift_space)
                    {
                        toggle_launcher_window(app);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            let _ = app.global_shortcut().register(alt_space);
            let _ = app.global_shortcut().register(ctrl_shift_space);

            let show_item = MenuItem::with_id(
                app,
                "toggle",
                "Mở bccHub Launcher (Alt + Space)",
                true,
                None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(app, "quit", "Thoát hoàn toàn", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .tooltip("bccHub Launcher (Alt + Space)")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle_launcher_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_launcher_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("Lỗi khởi chạy bccHub Launcher");
}
