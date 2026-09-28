mod git;
mod watcher;

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, State,
};

struct WatchState(Mutex<Option<String>>);

#[tauri::command]
fn get_watch_folder(state: State<WatchState>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn set_watch_folder(app: AppHandle, state: State<WatchState>, folder: String) -> Result<(), String> {
    if !git::is_git_repo(&folder) {
        return Err(format!("{} is not a git repository", folder));
    }
    *state.0.lock().unwrap() = Some(folder.clone());
    watcher::start(app, folder);
    Ok(())
}

#[tauri::command]
fn trigger_sync(state: State<WatchState>) -> Result<(), String> {
    let folder = state
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or("No folder configured")?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    git::sync(&folder, &format!("sync: {}", now))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(WatchState(Mutex::new(None)))
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let sync = MenuItem::with_id(app, "sync", "Sync Now", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &sync, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "sync" => {
                        let state = app.state::<WatchState>();
                        let folder = state.0.lock().unwrap().clone();
                        if let Some(f) = folder {
                            let now = chrono::Local::now()
                                .format("%Y-%m-%d %H:%M:%S")
                                .to_string();
                            let _ = git::sync(&f, &format!("sync: {}", now));
                        }
                    }
                    "quit" => std::process::exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_watch_folder,
            set_watch_folder,
            trigger_sync
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
