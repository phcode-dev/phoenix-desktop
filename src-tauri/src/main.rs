#![cfg_attr(
all(not(debug_assertions), target_os = "windows"),
windows_subsystem = "windows"
)]
use std::env;
use std::panic;

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

#[cfg(target_os = "linux")]
use dialog::DialogBox;

#[cfg(any(target_os = "macos", target_os = "windows"))]
use native_dialog::{MessageDialog, MessageType};

use regex::Regex;
extern crate percent_encoding;
use tauri::http::ResponseBuilder;
use tauri::GlobalWindowEvent;
mod init;
mod bugsnag;
mod utilities;
mod boot_config;
use trash;

mod platform;
use tauri_plugin_window_state::StateFlags;

use keyring::Entry;
use whoami;

#[derive(Clone, serde::Serialize)]
struct Payload {
  args: Vec<String>,
  cwd: String,
}

// AES Key Trust Management Structure
#[derive(Clone, Debug)]
struct AesKeyData {
    key: String,
    iv: String,
}

struct WindowAesTrust {
    trust_map: Mutex<HashMap<String, AesKeyData>>,
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
fn move_to_trash(delete_path: &str) -> Result<(), String> {
     trash::delete(delete_path)
             .map_err(|e| e.to_string())
}

#[tauri::command]
fn _get_window_labels(app: tauri::AppHandle) -> Vec<String> {
    app.windows()
        .iter()
        .map(|(label, _window)| label.to_string())
        .collect()
}

#[tauri::command]
fn get_process_id() -> u32 {
    std::process::id()
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

#[tauri::command]
fn _open_url_in_browser_win(url: String, browser: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let browser_path = match browser.as_str() {
                "firefox" => "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
                "chrome" => "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                "edge" => "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
                _ => return Err(format!("Browser '{}' is not supported.", browser))
            };

            // Spawn the browser process without waiting for it to finish
            Command::new(browser_path)
                .arg(url)
                .spawn()
                .map_err(|e| format!("Failed to open URL in {}: {}", browser, e.to_string()))?;

            Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("This API is only supported on Windows.".to_string())
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

// AES Key Trust Management Commands
#[tauri::command]
fn trust_window_aes_key(window: tauri::Window, key: String, iv: String, trust_state: State<'_, WindowAesTrust>) -> Result<(), String> {
    let window_label = window.label().to_string();
    let mut trust_map = trust_state.trust_map.lock().unwrap();

    // Check if trust is already established
    if trust_map.contains_key(&window_label) {
        return Err("Trust has already been established for this window. remove trust to set again.".to_string());
    }

    // Validate AES key format and length
    let key_bytes = hex::decode(&key).map_err(|_| "Invalid AES key format. Key must be a valid hex string.".to_string())?;
    if key_bytes.len() != 32 {
        return Err("Invalid AES key length. Key must be 32 bytes (64 hex characters) for AES-256.".to_string());
    }

    // Validate nonce format and length
    let nonce_bytes = hex::decode(&iv).map_err(|_| "Invalid nonce format. Nonce must be a valid hex string.".to_string())?;
    if nonce_bytes.len() != 12 {
        return Err("Invalid nonce length. Nonce must be 12 bytes (24 hex characters) for AES-GCM.".to_string());
    }

    // Test that we can create a valid cipher with these parameters
    use aes_gcm::{Aes256Gcm, Key};
    use aes_gcm::aead::KeyInit;

    let aes_key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let _cipher = Aes256Gcm::new(aes_key);

    // Just verify we can create a slice of the right size - no need to store it
    if nonce_bytes.len() == 12 {
        // This validates that we have the right size for AES-GCM nonce
    } else {
        return Err("Invalid nonce length. Nonce must be 12 bytes (24 hex characters) for AES-GCM.".to_string());
    }

    // If we get here, the key and nonce are valid
    // Store the AES key and IV for this window
    trust_map.insert(window_label.clone(), AesKeyData { key, iv });

    println!("AES trust established for window: {}", window_label);
    Ok(())
}

#[tauri::command]
fn remove_trust_window_aes_key(window: tauri::Window, key: String, iv: String, trust_state: State<'_, WindowAesTrust>) -> Result<(), String> {
    let window_label = window.label().to_string();
    let mut trust_map = trust_state.trust_map.lock().unwrap();

    // Check if trust exists for this window
    match trust_map.get(&window_label) {
        Some(stored_data) => {
            // Verify the provided key and IV match the stored ones
            if stored_data.key == key && stored_data.iv == iv {
                trust_map.remove(&window_label);
                println!("AES trust removed for window: {}", window_label);
                Ok(())
            } else {
                Err("Provided key and IV do not match the stored trust data.".to_string())
            }
        }
        None => {
            Err("No trust association found for this window.".to_string())
        }
    }
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
                .arg(format!("array:string:file://{}", path))
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

fn process_window_event(event: &GlobalWindowEvent, trust_state: &State<WindowAesTrust>) {
    if let tauri::WindowEvent::CloseRequested { .. } = event.event() {
        // Remove AES trust for the closing window
        let window_label = event.window().label().to_string();
        let mut trust_map = trust_state.trust_map.lock().unwrap();

        if trust_map.remove(&window_label).is_some() {
            println!("AES trust removed for closing window: {}", window_label);
        }

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

const PHOENIX_CRED_PREFIX: &str = "phcode_";

fn get_username() -> String {
    // Ensure a fallback username in case retrieval fails
    match whoami::username().as_str() {
        "" => "unknown_user".to_string(), // Fallback if username is empty
        username => username.to_string(), // Otherwise, use the retrieved username
    }
}

// Stores the secret value securely in the system keyring
#[tauri::command]
fn store_credential(scope_name: String, secret_val: String) -> Result<(), String> {
    let service = format!("{}{}", PHOENIX_CRED_PREFIX, scope_name); // Unique service name per scope
    let user = get_username();

    let entry = Entry::new(&service, &user).map_err(|e| e.to_string())?;
    entry.set_password(&secret_val).map_err(|e| e.to_string())?;

    Ok(())
}

// Deletes a stored credential securely
#[tauri::command]
fn delete_credential(scope_name: String) -> Result<(), String> {
    let service = format!("{}{}", PHOENIX_CRED_PREFIX, scope_name);
    let user = get_username();

    let entry = Entry::new(&service, &user).map_err(|e| e.to_string())?;
    entry.delete_password().map_err(|e| e.to_string())?;

    Ok(())
}

// Gets the stored credential, encrypts it with the window's AES key, and returns the encrypted value
// Returns None if no credential is found
#[tauri::command]
fn get_credential(window: tauri::Window, scope_name: String, trust_state: State<'_, WindowAesTrust>) -> Result<Option<String>, String> {
    let window_label = window.label().to_string();

    // Check if AES trust is established for this window
    let trust_map = trust_state.trust_map.lock().unwrap();
    let aes_data = match trust_map.get(&window_label) {
        Some(data) => data.clone(),
        None => {
            return Err("Trust needs to be first established by calling the trust_window_aes_key API to use this API.".to_string());
        }
    };
    drop(trust_map); // Release the lock early

    // Retrieve the stored credential
    let service = format!("{}{}", PHOENIX_CRED_PREFIX, scope_name);
    let user = get_username();
    let entry = Entry::new(&service, &user).map_err(|e| e.to_string())?;

    let stored_credential = match entry.get_password() {
        Ok(data) => data,
        Err(keyring::Error::NoEntry) => return Ok(None), // Return None if no credential found
        Err(e) => return Err(format!("Failed to retrieve credential: {}", e.to_string())),
    };

    // Encrypt the credential using AES-GCM
    use aes_gcm::{Aes256Gcm, Key, Nonce};
    use aes_gcm::aead::{Aead, KeyInit};

    // Decode the key and nonce from hex strings
    let key_bytes = hex::decode(&aes_data.key).map_err(|_| "Invalid AES key format".to_string())?;
    let nonce_bytes = hex::decode(&aes_data.iv).map_err(|_| "Invalid nonce format".to_string())?;

    if key_bytes.len() != 32 {
        return Err("AES key must be 32 bytes (256 bits)".to_string());
    }
    if nonce_bytes.len() != 12 {
        return Err("Nonce must be 12 bytes for AES-GCM".to_string());
    }

    // Create cipher
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Encrypt the credential
    let encrypted_data = cipher.encrypt(nonce, stored_credential.as_bytes())
        .map_err(|_| "Failed to encrypt credential".to_string())?;

    // Return the encrypted data as a hex string wrapped in Some
    Ok(Some(hex::encode(encrypted_data)))
}

fn main() {
    let args: Vec<String> = env::args().collect();

    panic::set_hook(Box::new(|panic_info| {
        let panic_message = panic_info.payload().downcast_ref::<&str>().unwrap_or(&"No specific error message available");
        eprintln!("Application panicked: {:?}", panic_message);

        // Construct the error message with the panic message included
        let error_message = format!(
            "The app crashed unexpectedly with error: \n\n'{}'\n\nOpening support page. Would you like to send an anonymised error report to help us fix the problem?",
            panic_message
        );

        let should_log_to_bugsnag;
        #[cfg(target_os = "linux")]
        {
            let choice = dialog::Question::new(&error_message)
                .title("Oops! Phoenix Code Crashed :(")
                .show()
                .expect("Could not display dialog box");
            if choice == dialog::Choice::Yes {
                should_log_to_bugsnag = true;
            } else {
                should_log_to_bugsnag = false;
            }
        }

        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            should_log_to_bugsnag = MessageDialog::new()
                .set_type(MessageType::Error)
                .set_title("Oops! Phoenix Code Crashed :(")
                .set_text(&error_message)
                .show_confirm()
                .unwrap();
        }

        // take user to support page. maybe we will have some notifications pinned there if its a large scale outage
        let support_url = "https://github.com/orgs/phcode-dev/discussions";
        if webbrowser::open(support_url).is_ok() {
            println!("Opened support_url {} in the default browser.", support_url);
        } else {
            println!("Failed to open support_url {}.", support_url);
        }
        let args: Vec<String> = env::args().collect();
        if should_log_to_bugsnag && !args.contains(&"--runVerify".to_string()) {
            let message = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
                s.to_string()
            } else {
                "Unknown panic message".to_string()
            };
            bugsnag::handle(&message);
        }
    }));

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
        .manage(WindowAesTrust {
            trust_map: Mutex::new(HashMap::new()),
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
        .on_window_event(|event| {
            // Get the trust state from the app handle
            let app_handle = event.window().app_handle();
            let trust_state = app_handle.state::<WindowAesTrust>();
            process_window_event(&event, &trust_state);
        })
        .invoke_handler(tauri::generate_handler![
            get_mac_deep_link_requests, get_process_id,
            toggle_devtools, console_log, console_error, _get_commandline_args, get_current_working_dir,
            _get_window_labels,
            store_credential, get_credential, delete_credential,
            put_item, get_item, get_all_items, delete_item,
            trust_window_aes_key, remove_trust_window_aes_key,
            _get_windows_drives, _rename_path, show_in_folder, move_to_trash, zoom_window,
            _get_clipboard_files, _open_url_in_browser_win])
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
