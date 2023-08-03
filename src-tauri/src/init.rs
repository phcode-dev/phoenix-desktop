use std::sync::Arc;
use once_cell::sync::OnceCell;
use tauri::Manager;
use crate::utilities::ensure_dir_exists;
use crate::boot_config::read_boot_config;
use crate::boot_config::BootConfig;

struct AppConstants {
    tauri_config : Arc<tauri::Config>,
    app_data_dir: std::path::PathBuf
}
static APP_CONSTANTS: OnceCell<AppConstants> = OnceCell::new();
static PREFERRED_WIDTH: u32 = 1366;
static PREFERRED_HEIGHT: u32 = 900;
static MAXIMIZE_SIZE: u32 = 0;

fn get_window_size(last_saved_size: u32, screen_size: u32, preferred_size: u32) -> u32 {
    if last_saved_size != 0 && last_saved_size <= screen_size {
        return last_saved_size;
    }
    if preferred_size < screen_size {
        return preferred_size;
    }
    return MAXIMIZE_SIZE;
}

fn restore_window_size(app: &mut tauri::App, boot_config: &BootConfig){
    let main_window = app.get_window("main").unwrap();
    let current_monitor = main_window.current_monitor().unwrap().unwrap();
    let current_monitor_size = current_monitor.size();
    println!("current_monitor_size is {}, {}", current_monitor_size.width, current_monitor_size.height);
    println!("saved window size is {}, {}", boot_config.last_window_width, boot_config.last_window_height);
    let width = get_window_size(boot_config.last_window_width, current_monitor_size.width, PREFERRED_WIDTH);
    let height = get_window_size(boot_config.last_window_height, current_monitor_size.height, PREFERRED_HEIGHT);
    if width == MAXIMIZE_SIZE || height == MAXIMIZE_SIZE {
        main_window.maximize().expect("unable to maximize");
    } else {
        println!("resizing window to {}, {}", width, height);
        let size = tauri::PhysicalSize::new(width, height);
        main_window.set_size(size).expect("unable to resize");
    }
}

pub fn init_app(app: &mut tauri::App) {
    let config = app.config().clone();
    let _ = APP_CONSTANTS.set(AppConstants {
        tauri_config: config.clone(),
        app_data_dir: tauri::api::path::app_data_dir(&config).expect("failed to retrieve app_data_dir")
            .canonicalize().expect("Failed to canonicalize app_data_dir")
    });

    // To get a value
    if let Some(app_constants) = APP_CONSTANTS.get() {
        println!("Appdata Dir is {}", app_constants.app_data_dir.display());
        ensure_dir_exists(&app_constants.app_data_dir);
        let boot_config = read_boot_config(&app_constants.app_data_dir);
        restore_window_size(app, &boot_config);
    }
}