use std::fs;
use serde_json;
use std::path::PathBuf;
use std::fs::File;
use std::io::Read;
use serde_json::Value;

/// This function prints the type of the input value.
///
/// It uses Rust's reflection capabilities to determine and print the type
/// of the input. This can be useful for debugging and understanding
/// what types are being used in certain parts of your code.
///
/// # Examples
///
/// ```
/// let x = 5;
/// _print_type_of(&x);
/// // prints: "i32"
/// ```
///
/// # Panics
///
/// This function does not panic.
///
/// # Errors
///
/// This function does not return any errors.
pub fn _print_type_of<T>(_: &T) {
    println!("{}", std::any::type_name::<T>());
}

pub fn ensure_dir_exists(path: &PathBuf){
    if let Err(e) = fs::create_dir_all(path) {
        eprintln!("Failed to create directory: {}", e);
    } else {
        #[cfg(debug_assertions)]{
            println!("Directory created successfully {}", path.display());
        }
    }
}

pub fn read_json_file(path: &PathBuf) -> Option<Value> {
    let filename = match path.to_str() {
        Some(file) => file.to_string(), // Convert &str to String
        None => return None, // File not present or cannot be opened
    };

    let mut file = match File::open(filename) {
        Ok(file) => file,
        Err(_) => return None, // File not present or cannot be opened
    };

    let mut contents = String::new();
    if let Err(_) = file.read_to_string(&mut contents) {
        eprintln!("Failed to read file: {}", path.display());
        return None; // Error reading the file
    }

    match serde_json::from_str(&contents) {
        Ok(data) => Some(data),
        Err(err) => {
            eprintln!("Failed to parse JSON in {}: {}", path.display(), err);
            None
        }
    }
}
