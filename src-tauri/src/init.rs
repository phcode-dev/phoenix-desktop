use crate::utilities::ensure_dir_exists;
use crate::boot_config::read_boot_config;
use crate::boot_config::APP_CONSTANTS;
use crate::boot_config::AppConstants;

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
        read_boot_config();
        #[cfg(debug_assertions)]{
            println!("Bootconfig version is {}", read_boot_config().version);
        }
    }
}