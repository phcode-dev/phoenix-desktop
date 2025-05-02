use serde_json::Value;
use serde::Serialize;
use crate::utilities::read_json_file;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct BootConfig {
    pub version: u32,
    pub start_as_hidden_window: bool,
}

fn get_boot_config_file_path(base_path: &Path) -> PathBuf {
    let mut config_file_path = base_path.to_path_buf();
    config_file_path.push("boot_config.json");
    config_file_path
}

fn _set_boot_config(boot_config: &mut BootConfig, value: &Value) {
    boot_config.version = value["version"].as_u64().map(|v| v as u32).unwrap_or(0);

    boot_config.start_as_hidden_window = value["start_as_hidden_window"]
        .as_bool()
        .unwrap_or(false); // Default to `false` if missing or invalid
}

/// Reads boot_config.json from the given `Option<PathBuf>`.
/// If `None` is provided, it returns a default `BootConfig`.
pub fn read_boot_config(base_path: &Option<PathBuf>) -> BootConfig {
    let mut boot_config = BootConfig {
        version: 1,
        start_as_hidden_window: false,
    };

    if let Some(ref path) = base_path {
        let boot_config_file_path = get_boot_config_file_path(path);

        match read_json_file(&boot_config_file_path) {
            Some(value) => {
                _set_boot_config(&mut boot_config, &value);
            }
            None => {
                eprintln!(
                    "No boot restore config file found at {}",
                    boot_config_file_path.display()
                );
            }
        }
    } else {
        eprintln!("Base path is None, using default boot config.");
    }

    boot_config
}
