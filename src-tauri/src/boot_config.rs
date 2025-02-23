use std::sync::Arc;
use once_cell::sync::OnceCell;
use serde_json::Value;
use serde::Serialize;
use crate::utilities::read_json_file;
use std::path::PathBuf;
use std::fs::File;
use std::io::Write;

pub struct AppConstants {
    pub tauri_config : Arc<tauri::Config>,
    pub app_local_data_dir: std::path::PathBuf
}
pub static APP_CONSTANTS: OnceCell<AppConstants> = OnceCell::new();

#[derive(Serialize)]
pub struct BootConfig {
    pub version: u32,
    pub start_as_hidden_window: bool,
}
static BOOT_CONFIG_FILE_NAME: &'static str = "boot_config.json";

fn get_boot_config_file_path(app_local_data_dir: &PathBuf) -> PathBuf {
    let mut config_file_path = app_local_data_dir.clone();
    config_file_path.push(BOOT_CONFIG_FILE_NAME);
    return config_file_path;
}

fn _set_boot_config(boot_config: &mut BootConfig, value: &Value) {
    boot_config.version = value["version"].as_u64().map(|v| v as u32).unwrap_or(0);

    boot_config.start_as_hidden_window = value["start_as_hidden_window"]
        .as_bool()
        .unwrap_or(false); // Default to `false` if missing or invalid
}

pub fn read_boot_config() -> BootConfig {
    let mut boot_config = BootConfig {
        version: 1,
        start_as_hidden_window: false
    };
    if let Some(app_constants) = APP_CONSTANTS.get() {
        let boot_config_file_path = get_boot_config_file_path(&app_constants.app_local_data_dir);
        match read_json_file(&boot_config_file_path) {
            Some(value) =>{
                _set_boot_config(&mut boot_config, &value);
            }
            None => {
                eprintln!("No boot restore config file found {}", boot_config_file_path.display());
            }
        }
    }
    return boot_config;
}

// writing the boot config is always done from js to be simpler, as js is eazier to handle json.