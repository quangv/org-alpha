use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;

use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode};
use tauri::{AppHandle, Emitter};

use crate::git;

pub fn start(app: AppHandle, folder: String) {
    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel();
        let mut debouncer = new_debouncer(Duration::from_secs(2), tx).unwrap();
        debouncer
            .watcher()
            .watch(Path::new(&folder), RecursiveMode::Recursive)
            .unwrap();

        loop {
            match rx.recv() {
                Ok(Ok(_events)) => {
                    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                    let msg = format!("sync: {}", now);
                    let result = git::sync(&folder, &msg);
                    let payload = match result {
                        Ok(()) => serde_json::json!({ "status": "ok", "message": msg }),
                        Err(e) => serde_json::json!({ "status": "error", "message": e }),
                    };
                    let _ = app.emit("sync-result", payload);
                }
                Ok(Err(e)) => {
                    let _ = app.emit(
                        "sync-result",
                        serde_json::json!({ "status": "error", "message": format!("{:?}", e) }),
                    );
                }
                Err(_) => break,
            }
        }
    });
}
