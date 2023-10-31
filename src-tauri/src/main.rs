#![cfg_attr(
all(not(debug_assertions), target_os = "windows"),
windows_subsystem = "windows"
)]

#[cfg(target_os = "linux")]
use std::fs::metadata;
use std::path::PathBuf;
use std::process::Command;

use regex::Regex;
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

#[tauri::command]
fn show_in_folder(path: String) {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &path]) // The comma after select is not a typo
            .spawn()
            .unwrap();
    }

    #[cfg(target_os = "linux")]
    {
        if path.contains(",") {
            // see https://gitlab.freedesktop.org/dbus/dbus/-/issues/76
            let new_path = match metadata(&path).unwrap().is_dir() {
                true => path,
                false => {
                    let mut path2 = PathBuf::from(path);
                    path2.pop();
                    path2.into_os_string().into_string().unwrap()
                }
            };
            Command::new("xdg-open")
                .arg(&new_path)
                .spawn()
                .unwrap();
        } else {
            Command::new("dbus-send")
                .arg("--session")
                .arg("--dest=org.freedesktop.FileManager1")
                .arg("--type=method_call")
                .arg("/org/freedesktop/FileManager1")
                .arg("org.freedesktop.FileManager1.ShowItems")
                .arg(format!("array:string:file:///{}", path))
                .arg("string:\"\"")
                .spawn()
                .unwrap();
        }
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .unwrap();
    }
}

fn process_window_event(event: &GlobalWindowEvent) {
    if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
        let size = event.window().inner_size().unwrap();
        boot_config::write_boot_config(size.width, size.height);
    }
}

// convert url of form "protocol://host/v1.2.3/path/to/something" to "protocol://host/path/to/something"
fn remove_version_from_url(url: &str) -> String {
    let re = Regex::new(r"([a-zA-Z]+://[^/]+)/v[\d+\.]+/").unwrap();
    re.replace(url, "$1/").to_string()
}

fn main() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("phcode", move |app, request| { // can't use `tauri` because that's already in use
            let path = remove_version_from_url(request.uri());
            let path = path.strip_prefix("phcode://localhost").unwrap();
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
            _get_windows_drives, _rename_path, show_in_folder])
        .setup(|app| {
            init::init_app(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
