#![cfg_attr(
all(not(debug_assertions), target_os = "windows"),
windows_subsystem = "windows"
)]

use tauri::GlobalWindowEvent;
mod init;
mod utilities;
mod boot_config;

mod platform;

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn console_log(_handle: tauri::AppHandle, message: &str) {
    println!("{}", message);
}

#[tauri::command]
fn console_error(_handle: tauri::AppHandle, message: &str) {
    eprintln!("{}", message);
}

#[tauri::command]
fn _get_windows_drives() -> Option<Vec<char>> {
    platform::get_windows_drives()
}

#[tauri::command]
fn _rename_path(old_path: &str, new_path: &str) -> Result<(), String> {
    platform::rename_path(old_path, new_path)
}

static mut DEVTOOLS_LOADED:bool = false;

#[tauri::command]
fn toggle_devtools(window: tauri::Window) {
    unsafe {
        // though unsafe, this is fine as its just a view toggle and not mission critical.
        if !DEVTOOLS_LOADED {
            window.open_devtools();
        } else {
            window.close_devtools();
        }
        DEVTOOLS_LOADED = !DEVTOOLS_LOADED;
    }
}

fn process_window_event(event: &GlobalWindowEvent) {
    if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
        let size = event.window().inner_size().unwrap();
        boot_config::write_boot_config(size.width, size.height);
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs_extra::init())
        .on_window_event(|event| process_window_event(&event))
        .invoke_handler(tauri::generate_handler![
            toggle_devtools, console_log, console_error,
            _get_windows_drives, _rename_path])
        .setup(|app| {
            init::init_app(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
