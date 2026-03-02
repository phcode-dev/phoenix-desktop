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
    pub last_window_x: i32,
    pub last_window_y: i32,
    pub last_window_width: u32,
    pub last_window_height: u32,
    pub last_window_maximized: bool,
}
static BOOT_CONFIG_FILE_NAME: &'static str = "boot_config.json";

fn get_boot_config_file_path(app_local_data_dir: &PathBuf) -> PathBuf {
    let mut config_file_path = app_local_data_dir.clone();
    config_file_path.push(BOOT_CONFIG_FILE_NAME);
    return config_file_path;
}

fn _set_boot_config(boot_config: &mut BootConfig, value: &Value) {
    boot_config.version = match value["version"].as_u64() {
        Some(value) => value as u32,
        None => 0
    };
    boot_config.last_window_x = match value["last_window_x"].as_i64() {
        Some(v) => v as i32,
        None => 0
    };
    boot_config.last_window_y = match value["last_window_y"].as_i64() {
        Some(v) => v as i32,
        None => 0
    };
    boot_config.last_window_width = match value["last_window_width"].as_u64() {
        Some(v) => v as u32,
        None => 0
    };
    boot_config.last_window_height = match value["last_window_height"].as_u64() {
        Some(v) => v as u32,
        None => 0
    };
    boot_config.last_window_maximized = match value["last_window_maximized"].as_bool() {
        Some(v) => v,
        None => false
    };
}

pub fn read_boot_config() -> BootConfig {
    let mut boot_config = BootConfig {
        version: 1,
        last_window_x: 0,
        last_window_y: 0,
        last_window_width: 0,
        last_window_height: 0,
        last_window_maximized: false,
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

fn _write_boot_config(boot_config: &BootConfig) {
    if let Some(app_constants) = APP_CONSTANTS.get() {
        let boot_config_file_path = get_boot_config_file_path(&app_constants.app_local_data_dir);
        // Convert the BootConfig struct to JSON
        let json_string = serde_json::to_string(boot_config).unwrap();
        let mut file = File::create(boot_config_file_path).expect("Failed to create file");
        file.write_all(json_string.as_bytes())
            .expect("Failed to write to boot config file");   
    }
}

// WARNING: If there are multiple windows, this will be called on each window close.
pub fn write_boot_config(version: u32, x: i32, y: i32, width: u32, height: u32, maximized: bool) {
    _write_boot_config(&BootConfig {
        version,
        last_window_x: x,
        last_window_y: y,
        last_window_width: width,
        last_window_height: height,
        last_window_maximized: maximized,
    })
}