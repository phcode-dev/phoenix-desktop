// platform.rs
// IMPORTANT!!!: Editing this file is a Major version change

#[cfg(target_os = "windows")]
extern crate winapi;
use std::fs;

#[cfg(target_os = "windows")]
use winapi::um::fileapi::GetLogicalDriveStringsW;

pub fn get_windows_drives() -> Option<Vec<char>> {
    #[cfg(target_os = "windows")] {
        let mut buffer: [u16; 1024] = [0; 1024];

        unsafe {
            let res = GetLogicalDriveStringsW(1024, buffer.as_mut_ptr());
            if res == 0 {
                return None;
            }

            let drives: Vec<char> = buffer
                .chunks(4)  // Each drive letter representation is 4 bytes (letter, colon, slash, null terminator)
                .filter_map(|chunk| {
                    if chunk[0] != 0 {
                        Some(chunk[0] as u8 as char)
                    } else {
                        None
                    }
                })
                .collect();

            Some(drives)
        }
    }

    #[cfg(not(target_os = "windows"))] {
        None
    }
}

pub fn rename_path(old_path: &str, new_path: &str) -> Result<(), String> {
    fs::rename(old_path, new_path).map_err(|e| e.to_string())
}