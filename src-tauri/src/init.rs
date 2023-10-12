use tauri::Manager;
use crate::utilities::ensure_dir_exists;
use crate::boot_config::read_boot_config;
use crate::boot_config::BootConfig;
use crate::boot_config::APP_CONSTANTS;
use crate::boot_config::AppConstants;

static PREFERRED_WIDTH: u32 = 1366;
static PREFERRED_HEIGHT: u32 = 900;
static MAXIMIZE_SIZE: u32 = 0;

fn get_window_size(last_saved_size: u32, screen_size: u32, preferred_size: u32) -> u32 {
    if last_saved_size != 0 {
        // we dont do last_saved_size<screen_size here as we leave it to os to deal with windows larger than screen size
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

    #[cfg(debug_assertions)]
    {
        println!("current_monitor_size is {}, {}", current_monitor_size.width, current_monitor_size.height);
        println!("saved window size is {}, {}", boot_config.last_window_width, boot_config.last_window_height);
    }

    let width = get_window_size(boot_config.last_window_width, current_monitor_size.width, PREFERRED_WIDTH);
    let height = get_window_size(boot_config.last_window_height, current_monitor_size.height, PREFERRED_HEIGHT);
    if width == MAXIMIZE_SIZE || height == MAXIMIZE_SIZE {
        main_window.maximize().expect("unable to maximize");
    } else {

        #[cfg(debug_assertions)]{
            println!("resizing window to {}, {}", width, height);
        }

        let size = tauri::PhysicalSize::new(width, height);
        main_window.set_size(size).expect("unable to resize");
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
        restore_window_size(app, &boot_config);
    }
}