#![cfg_attr(
all(not(debug_assertions), target_os = "windows"),
windows_subsystem = "windows"
)]
use std::env;

use tauri::{Manager};
use std::path::PathBuf;

use tauri::{State};
use std::collections::HashMap;
use std::sync::Mutex;

#[cfg(target_os = "linux")]
use std::fs::metadata;
#[cfg(target_os = "linux")]
use gtk::{glib::ObjectExt, prelude::WidgetExt};

use std::process::Command;
#[cfg(target_os = "linux")]
extern crate webkit2gtk;

#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

use clipboard_files;

use regex::Regex;
extern crate percent_encoding;
use tauri::http::ResponseBuilder;
use tauri::GlobalWindowEvent;
mod init;
mod utilities;
mod boot_config;

mod platform;
use tauri_plugin_window_state::StateFlags;

#[derive(Clone, serde::Serialize)]
struct Payload {
  args: Vec<String>,
  cwd: String,
}

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
fn _get_commandline_args() -> Option<Vec<String>> {
    Some(env::args().collect())
}

#[tauri::command]
fn get_current_working_dir() -> Result<PathBuf, String> {
    env::current_dir().map_err(|e| e.to_string())
}

#[tauri::command]
fn _rename_path(old_path: &str, new_path: &str) -> Result<(), String> {
    platform::rename_path(old_path, new_path)
}

#[tauri::command]
fn _get_window_labels(app: tauri::AppHandle) -> Vec<String> {
    app.windows()
        .iter()
        .map(|(label, _window)| label.to_string())
        .collect()
}


#[tauri::command]
fn _get_clipboard_files() -> Option<Vec<String>> {
    match clipboard_files::read() {
        Ok(paths) => Some(
            paths.into_iter()
                .map(|path| path.to_string_lossy().into_owned())
                .collect()
        ),
        Err(_) => None,
    }
}

// this in memory hashmap is used to supplement the LMDB node layer in a multi window environment.
struct Storage {
    map: Mutex<HashMap<String, String>>,
}

#[tauri::command]
fn put_item(state: State<'_, Storage>, key: String, value: String) {
    let mut map = state.map.lock().unwrap();
    map.insert(key, value);
}

#[tauri::command]
fn get_item(state: State<'_, Storage>, key: String) -> Option<String> {
    let map = state.map.lock().unwrap();
    map.get(&key).cloned()
}

#[tauri::command]
fn get_all_items(state: State<'_, Storage>) -> HashMap<String, String> {
    let map = state.map.lock().unwrap();
    map.clone()
}

#[tauri::command]
fn delete_item(state: State<'_, Storage>, key: String) {
    let mut map = state.map.lock().unwrap();
    map.remove(&key);
}
// in memory hashmap end

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

#[tauri::command]
fn zoom_window(window: tauri::Window, scale_factor: f64) {
    let _ = window.with_webview(move |webview| {
        #[cfg(target_os = "linux")]
        {
          // see https://docs.rs/webkit2gtk/0.18.2/webkit2gtk/struct.WebView.html
          // and https://docs.rs/webkit2gtk/0.18.2/webkit2gtk/trait.WebViewExt.html
          use webkit2gtk::traits::WebViewExt;
          webview.inner().set_zoom_level(scale_factor);
        }

        #[cfg(windows)]
        unsafe {
          // see https://docs.rs/webview2-com/0.19.1/webview2_com/Microsoft/Web/WebView2/Win32/struct.ICoreWebView2Controller.html
          webview.controller().SetZoomFactor(scale_factor).unwrap();
        }

        #[cfg(target_os = "macos")]
        unsafe {
          let () = msg_send![webview.inner(), setPageZoom: scale_factor];
        }
      });
}

fn process_window_event(event: &GlobalWindowEvent) {
    if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
        // this does nothing and is here if in future you need to persist something on window close.
        boot_config::write_boot_config(1);
    }
}

// convert url of form "protocol://host/v1.2.3/path/to/something" to "protocol://host/path/to/something"
fn remove_version_from_url(url: &str) -> String {
    let re = Regex::new(r"([a-zA-Z]+://[^/]+)/v[\d+\.]+/").unwrap();
    re.replace(url, "$1/").to_string()
}

#[cfg(target_os = "macos")]
use std::sync::{Arc};

#[cfg(target_os = "macos")]
use lazy_static::lazy_static;

#[cfg(target_os = "macos")]
lazy_static! {
    static ref GLOBAL_STRING_VECTOR: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
}

#[tauri::command]
fn get_mac_deep_link_requests() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        let mut vector = GLOBAL_STRING_VECTOR.lock().unwrap();
        let cloned_vector = vector.clone(); // Clone the vector's contents
        vector.clear(); // Clear the vector
        cloned_vector // Return the cloned vector
    }
    #[cfg(not(target_os = "macos"))]
    {
        // This code will be compiled and run on operating systems other than macOS (like Linux and Windows)
        Vec::new() // Return an empty vector
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.contains(&"--runVerify".to_string()) {
        // Mainly used by linux installer to see if the app loaded successfully with all libs
        std::process::exit(0);
    }
    let app_version = env!("CARGO_PKG_VERSION");
    if args.contains(&"--version".to_string()) || args.contains(&"-v".to_string()) {
        // Display the version and exit
        println!("{}", app_version);
        std::process::exit(0);
    }
    #[cfg(target_os = "macos")]{
        tauri_plugin_deep_link::prepare("io.phcode");
    }

    // warning: any string that resembles the following strings will be rewritten in source in prod by build scripts.
    // This is so that app bundle IDs are correct. IF they are app bundle IDs use the strings. else dont.
    // do not use strings: "io.phcode.dev" "io.phcode.staging" "io.phcode" for anything other than bundle identifiers
    // in this file!!!

    // GUI apps on macOS and Linux do not inherit the $PATH from your shell dotfiles (.bashrc, .bash_profile, .zshrc, etc).
    // fix that https://github.com/tauri-apps/fix-path-env-rs
    let _ = fix_path_env::fix();

    tauri::Builder::default()
        .manage(Storage {
                map: Mutex::new(HashMap::new()),
        })
        .register_uri_scheme_protocol("phtauri", move |app, request| { // can't use `tauri` because that's already in use
            let path = remove_version_from_url(request.uri());
            let path = path.strip_prefix("phtauri://localhost");
            if path.is_none() {
                let not_found_response = ResponseBuilder::new()
                    .status(404)
                    .mimetype("text/html")
                    .body("Asset not found".as_bytes().to_vec())
                    .unwrap();
                return Ok(not_found_response);
            }
            let path = path.unwrap();
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
                let window_origin = "https://phtauri.localhost";
            #[cfg(not(windows))]
                let window_origin = "phtauri://localhost";

            let builder = ResponseBuilder::new()
                .header("Access-Control-Allow-Origin", window_origin)
                .header("Origin", window_origin)
                .header("Cache-Control", "private, max-age=7776000, immutable") // 3 month cache age expiry
                .mimetype(&asset.mime_type);

            let response = builder.body(asset.bytes)?;
            Ok(response)
        })
        .plugin(tauri_plugin_fs_extra::init())
        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(StateFlags::all() & !StateFlags::VISIBLE).build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
                    println!("{}, {argv:?}, {cwd}", app.package_info().name);

                    app.emit_all("single-instance", Payload { args: argv, cwd }).unwrap();
                }))
        .on_window_event(|event| process_window_event(&event))
        .invoke_handler(tauri::generate_handler![
            get_mac_deep_link_requests,
            toggle_devtools, console_log, console_error, _get_commandline_args, get_current_working_dir,
            _get_window_labels,
            put_item, get_item, get_all_items, delete_item,
            _get_windows_drives, _rename_path, show_in_folder, zoom_window, _get_clipboard_files])
        .setup(|app| {
            init::init_app(app);
            #[cfg(target_os = "linux")]
            {
                // In linux, f10 key press events are reserved for gtk-menu-bar-accel and not passed.
                // So we assing f25 key to it to free f10 and make it available to app
                // https://discord.com/channels/616186924390023171/1192844593557950474
                let win = app.get_window("main").unwrap();
                let gtk_win = win.gtk_window().unwrap();
                let gtk_settings = gtk_win.settings().unwrap();
                gtk_settings.set_property("gtk-menu-bar-accel", "F25");
            }
            #[cfg(target_os = "macos")]
            {
                let handle = app.handle();
                tauri_plugin_deep_link::register(
                    "file-scheme",
                    move |request| {
                        // Print the request for debugging
                        dbg!(&request);
                        // save the requests as at boot, the js layer may not yet be present to process
                        // the file open requests from mac os.
                        let mut vec = GLOBAL_STRING_VECTOR.lock().unwrap();
                        vec.push(request.clone());
                        // Emit the event (as in the original code)
                        handle.emit_all("scheme-request-received", &request).unwrap();
                    },
                )
                .unwrap();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
