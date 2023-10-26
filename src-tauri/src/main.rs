#![cfg_attr(
all(not(debug_assertions), target_os = "windows"),
windows_subsystem = "windows"
)]

extern crate percent_encoding;
use tauri::http::ResponseBuilder;
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
        .register_uri_scheme_protocol("phcode", move |app, request| { // can't use `tauri` because that's already in use
            let path = request.uri().strip_prefix("phcode://localhost").unwrap();
            let path = percent_encoding::percent_decode(path.as_bytes())
                .decode_utf8_lossy()
                .to_string();
            // Remove query string and fragment
            let path_without_query_or_fragment = path.split('?').next().unwrap_or(&path);
            let final_path = path_without_query_or_fragment.split('#').next().unwrap_or(path_without_query_or_fragment).to_string();

            let asset_option = app.asset_resolver().get(final_path.clone());
            if asset_option.is_none() {
                let not_found_response = ResponseBuilder::new()
                    .status(404)
                    .mimetype("text/html")
                    .body("Asset not found".as_bytes().to_vec())
                    .unwrap();
                return Ok(not_found_response);
            }

            let asset = asset_option.unwrap();

            #[cfg(windows)]
                let window_origin = "https://phcode.localhost";
            #[cfg(not(windows))]
                let window_origin = "phcode://localhost";

            let builder = ResponseBuilder::new()
                .header("Access-Control-Allow-Origin", window_origin)
                .header("Origin", window_origin)
                .header("Cache-Control", "private, max-age=31536000, immutable") // 1 year cache age expiry
                .mimetype(&asset.mime_type);

            let response = builder.body(asset.bytes)?;
            Ok(response)
        })
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
