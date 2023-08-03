use serde_json::Value;
use crate::utilities::read_json_file;
use std::path::PathBuf;

pub struct BootConfig {
    pub last_window_width: u32,
    pub last_window_height: u32,
}
static BOOT_CONFIG_FILE_NAME: &'static str = "boot_config.json";

fn get_boot_config_file_path(app_data_dir: &PathBuf) -> PathBuf {
    let mut config_file_path = app_data_dir.clone();
    config_file_path.push(BOOT_CONFIG_FILE_NAME);
    return config_file_path;
}

fn _set_boot_config(boot_config: &mut BootConfig, value: &Value) {
    boot_config.last_window_width = match value["last_window_width"].as_u64() {
        Some(value) => value as u32,
        None => 0
    };
    boot_config.last_window_height = match value["last_window_height"].as_u64() {
        Some(value) => value as u32,
        None => 0
    };
}

pub fn read_boot_config(app_data_dir: &PathBuf) -> BootConfig {
    let boot_config_file_path = get_boot_config_file_path(app_data_dir);
    let mut boot_config = BootConfig {
        last_window_width: 0,
        last_window_height: 0
    };
    match read_json_file(&boot_config_file_path) {
        Some(value) =>{
            _set_boot_config(&mut boot_config, &value);
        }
        None => {
            eprintln!("No boot restore config file found {}", boot_config_file_path.display());
        }
    }
    return boot_config;
}
