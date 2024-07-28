// https://bugsnagerrorreportingapi.docs.apiary.io/#reference/0/minidump

use serde::{Serialize, Deserialize};
use backtrace::{self, Symbol};
use std::path::Path;
use serde_json::to_string_pretty;
use std::collections::HashMap;
use reqwest::header::{HeaderMap, CONTENT_TYPE};
use tokio::runtime::Runtime;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsonFrame {
    file: String,
    line_number: u32,
    column_number: u32,
    method: String,
    in_project: bool,
    code: HashMap<u32, String>,
}



#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BugsnagEvent {
    exceptions: Vec<BugsnagException>,
    breadcrumbs: Vec<()>,
    request: HashMap<String, String>,
    threads: Vec<()>,
    context: String,
    grouping_hash: String,
    unhandled: bool,
    severity: String,
    severity_reason: BugsnagSeverityReason,
    project_packages: Vec<()>,
    user: HashMap<String, String>,
    app: BugsnagApp,
    device: BugsnagDevice,
    session: HashMap<String, String>,
    feature_flags: Vec<()>,
    meta_data: HashMap<String, String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BugsnagException {
    error_class: String,
    message: String,
    stacktrace: Vec<JsonFrame>,
    #[serde(rename = "type")]  // Specific field that conflicts with a Rust keyword
    error_type: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BugsnagSeverityReason {
    reason_type: String,
    attributes: HashMap<String, String>,
    unhandled_overridden: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BugsnagApp {
    id: String,
    version: String,
    release_stage: String,
    binary_arch: String,
    running_on_rosetta: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BugsnagDevice {
    os_name: String,
    os_version: String,
    time: String,
    cpu_abi: Vec<String>,
    runtime_versions: HashMap<String, String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BugsnagNotification {
    api_key: String,
    payload_version: String,
    notifier: BugsnagNotifier,
    events: Vec<BugsnagEvent>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BugsnagNotifier {
    name: String,
    version: String,
    url: String,
    dependencies: Vec<()>,
}

// The function `from_symbol` now returns a JSON string
pub fn from_symbol(trace: &Symbol) -> JsonFrame
{
    let file = trace
        .filename()
        .unwrap_or_else(|| Path::new(""))
        .to_str()
        .unwrap_or("");
    let file = if file.is_empty() { "unknown".to_string() } else { file.to_string() };

    let linenumber = trace.lineno().unwrap_or(0);
    let columnnumber = trace.colno().unwrap_or(0);
    let method = trace.name()
        .map(|name| name.to_string())
        .unwrap_or_else(|| "unknown".to_string());

    // Example hardcoded code snippet, this part should be dynamically populated based on your context
    let code_snippet = std::collections::HashMap::new();
    // code_snippet.insert(1, "def a".to_string()); // add here is there are code snippets to show

    JsonFrame {
        file: file.to_string(),
        line_number: linenumber,
        column_number: columnnumber,
        method: method.clone(),
        in_project: file.starts_with(env!("CARGO_MANIFEST_DIR")),
        code: code_snippet,
    }
}

async fn send_bugsnag_notification(notification: BugsnagNotification) -> Result<(), reqwest::Error> {
    let client = reqwest::Client::new();
    let headers = construct_headers();

    let response = client.post("https://notify.bugsnag.com/")
        .headers(headers)
        .json(&notification)
        .send()
        .await?;

    if response.status().is_success() {
        println!("Status: {}", response.status());
        if let Ok(resp_body) = response.text().await {
            println!("Response: {}", resp_body);
        }
    } else {
        eprintln!("Failed to send notification: {}", response.status());
    }

    Ok(())
}

fn construct_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, "application/json".parse().unwrap());
    headers.insert("Bugsnag-Api-Key", "4dc115247125339aa551f3b11a5bee6b".parse().unwrap());
    headers.insert("Bugsnag-Payload-Version", "5".parse().unwrap());
    headers
}

pub fn handle(message: &String){
    let mut result: Vec<JsonFrame> = Vec::new();
    backtrace::trace(|frame| {
        backtrace::resolve(frame.ip(), |symbol| {
            result.push(from_symbol(&symbol))
        });
        true
    });
     let event = BugsnagEvent {
        exceptions: vec![
            BugsnagException {
                error_class: "Rust_Panic".to_string(),
                message: message.to_string(),
                stacktrace: result,
                error_type: "rust".to_string(),
            }
        ],
        breadcrumbs: vec![],
        request: HashMap::new(),
        threads: vec![],
        context: message.to_string(),
        grouping_hash: "bugsnag.rs".to_string(),
        unhandled: true,
        severity: "error".to_string(),
        severity_reason: BugsnagSeverityReason {
            reason_type: "unhandledError".to_string(),
            attributes: HashMap::new(),
            unhandled_overridden: false,
        },
        project_packages: vec![],
        user: HashMap::new(),
        app: BugsnagApp {
            id: "phcode.io".to_string(),
            version: "1.1.3".to_string(),
            release_stage: "staging".to_string(),
            binary_arch: "x86_64".to_string(),
            running_on_rosetta: false,
        },
        device: BugsnagDevice {
            os_name: "android".to_string(),
            os_version: "8.0.1".to_string(),
            time: "2018-08-07T10:16:34.564Z".to_string(),
            cpu_abi: vec!["x86_64".to_string()],
            runtime_versions: HashMap::new(),
        },
        session: HashMap::new(),
        feature_flags: vec![],
        meta_data: HashMap::new(),
    };

    let notification = BugsnagNotification {
        api_key: "4dc115247125339aa551f3b11a5bee6b".to_string(),
        payload_version: "5".to_string(),
        notifier: BugsnagNotifier {
            name: "Bugsnag Ruby".to_string(),
            version: "1.0.11".to_string(),
            url: "https://github.com/bugsnag/bugsnag-ruby".to_string(),
            dependencies: vec![],
        },
        events: vec![event],
    };

    // Serialize and print the notification object
    if let Ok(json_string) = to_string_pretty(&notification) {
        println!("Complete Bugsnag error report JSON:\n{}", json_string);
    } else {
        println!("Failed to serialize Bugsnag notification.");
    }
   // Spawning a new thread to handle the asynchronous task
   let handle = std::thread::spawn(move || {
       // Creating a new Tokio runtime
       let rt = Runtime::new().unwrap();
       rt.block_on(async {
           if let Err(e) = send_bugsnag_notification(notification).await {
               eprintln!("Failed to send notification to Bugsnag: {}", e);
           }
       });
   });
   // Wait for the thread to finish
   handle.join().unwrap();
}