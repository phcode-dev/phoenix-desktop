use crate::utilities::ensure_dir_exists;
use crate::boot_config::{read_boot_config, BootConfig};
use crate::boot_config::APP_CONSTANTS;
use crate::boot_config::AppConstants;
use tauri::Manager;

/// Returns true if the point (x, y) falls within any of the available monitors.
fn is_position_on_any_monitor(x: i32, y: i32, monitors: &[tauri::Monitor]) -> bool {
    for monitor in monitors {
        let mon_pos = monitor.position();
        let mon_size = monitor.size();
        if x >= mon_pos.x
            && x < mon_pos.x + mon_size.width as i32
            && y >= mon_pos.y
            && y < mon_pos.y + mon_size.height as i32
        {
            return true;
        }
    }
    false
}

/// Restores the main window's position, size, and maximized state from boot_config.
/// This is intentionally fault-tolerant: any failure is logged and silently ignored
/// so the app always starts, even with a corrupted or missing config.
fn restore_window_state(app: &mut tauri::App, boot_config: &BootConfig) {
    let win = match app.get_window("main") {
        Some(w) => w,
        None => {
            eprintln!("restore_window_state: could not find main window");
            return;
        }
    };

    if boot_config.last_window_maximized {
        if let Err(e) = win.maximize() {
            eprintln!("restore_window_state: failed to maximize window: {}", e);
        }
        return;
    }

    let saved_w = boot_config.last_window_width;
    let saved_h = boot_config.last_window_height;

    if saved_w > 0 && saved_h > 0 {
        // If the saved size exceeds the current screen, maximize instead of clamping.
        // Clamping to raw pixels would still ignore taskbar/dock; maximizing lets the
        // OS place the window correctly within the usable work area.
        let fits_screen = match win.current_monitor() {
            Ok(Some(monitor)) => {
                let screen = monitor.size();
                saved_w <= screen.width && saved_h <= screen.height
            }
            _ => true, // can't determine screen size, assume it fits
        };

        if !fits_screen {
            if let Err(e) = win.maximize() {
                eprintln!("restore_window_state: failed to maximize for oversized saved state: {}", e);
            }
        } else {
            if let Err(e) = win.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: saved_w,
                height: saved_h,
            })) {
                eprintln!("restore_window_state: failed to set window size: {}", e);
            }

            // Restore position only if the saved position is on a currently connected monitor
            let saved_x = boot_config.last_window_x;
            let saved_y = boot_config.last_window_y;
            match win.available_monitors() {
                Ok(monitors) => {
                    if is_position_on_any_monitor(saved_x, saved_y, &monitors) {
                        if let Err(e) = win.set_position(tauri::Position::Physical(
                            tauri::PhysicalPosition { x: saved_x, y: saved_y },
                        )) {
                            eprintln!("restore_window_state: failed to set window position: {}", e);
                        }
                    }
                    // else: monitor disconnected, let the OS place the window
                }
                Err(e) => {
                    eprintln!("restore_window_state: failed to list monitors: {}", e);
                    // Cannot validate position; skip position restore, size is already set
                }
            }
        }
    } else {
        // First launch (no saved state) - use preferred size or maximize if screen is too small
        match win.current_monitor() {
            Ok(Some(monitor)) => {
                let screen = monitor.size();
                if screen.width > 1366 && screen.height > 900 {
                    if let Err(e) = win.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                        width: 1366,
                        height: 900,
                    })) {
                        eprintln!("restore_window_state: failed to set default size: {}", e);
                    }
                } else {
                    if let Err(e) = win.maximize() {
                        eprintln!("restore_window_state: failed to maximize on small screen: {}", e);
                    }
                }
            }
            Ok(None) => {
                eprintln!("restore_window_state: no current monitor detected");
            }
            Err(e) => {
                eprintln!("restore_window_state: failed to get current monitor: {}", e);
            }
        }
    }
}

pub fn init_app(app: &mut tauri::App) {
    let config = app.config().clone();
    println!("Appdata path is {}",  tauri::api::path::app_local_data_dir(&config).expect("failed to retrieve app_local_data_dir").display());
    ensure_dir_exists(&tauri::api::path::app_local_data_dir(&config).unwrap()); // canonicalize will work only if path exists
    let _ = APP_CONSTANTS.set(AppConstants {
        tauri_config: config.clone(),
        app_local_data_dir: tauri::api::path::app_local_data_dir(&config).expect("failed to retrieve app_local_data_dir")
            .canonicalize().expect("Failed to canonicalize app_local_data_dir")
    });

    // To get a value
    if let Some(app_constants) = APP_CONSTANTS.get() {
        #[cfg(debug_assertions)]{
            println!("Bundle ID is {}", app_constants.tauri_config.tauri.bundle.identifier);
        }
        ensure_dir_exists(&app_constants.app_local_data_dir);
        let boot_config = read_boot_config();
        #[cfg(debug_assertions)]{
            println!("Bootconfig version is {}", boot_config.version);
        }
        restore_window_state(app, &boot_config);
    }
}