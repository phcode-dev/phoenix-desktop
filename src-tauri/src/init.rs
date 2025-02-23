use crate::utilities::ensure_dir_exists;
use crate::boot_config::read_boot_config;
use crate::boot_config::APP_CONSTANTS;
use crate::boot_config::AppConstants;
use crate::boot_config::BootConfig;

pub fn init_app(app: &mut tauri::App) -> BootConfig {
    let config = app.config().clone();
    println!("Appdata path is {}",  tauri::api::path::app_local_data_dir(&config).expect("failed to retrieve app_local_data_dir").display());
    ensure_dir_exists(&tauri::api::path::app_local_data_dir(&config).unwrap()); // canonicalize will work only if path exists
    let _ = APP_CONSTANTS.set(AppConstants {
        tauri_config: config.clone(),
        app_local_data_dir: tauri::api::path::app_local_data_dir(&config).expect("failed to retrieve app_local_data_dir")
            .canonicalize().expect("Failed to canonicalize app_local_data_dir")
    });

    // To get a value
    let boot_config = if let Some(app_constants) = APP_CONSTANTS.get() {
        #[cfg(debug_assertions)]
        {
            println!(
                "Bundle ID is {}",
                app_constants.tauri_config.tauri.bundle.identifier
            );
        }
        ensure_dir_exists(&app_constants.app_local_data_dir);
        let boot_config = read_boot_config();

        #[cfg(debug_assertions)]
        {
            println!("Bootconfig version is {}", boot_config.version);
            println!("start as hidden: {}", boot_config.start_as_hidden_window);
        }

        boot_config
    } else {
        // Return a default boot config if APP_CONSTANTS is not set
        BootConfig {
            version: 1,
            start_as_hidden_window: false,
        }
    };

    boot_config
}