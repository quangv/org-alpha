mod git;
mod watcher;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Manager, State,
};

#[derive(Serialize, Deserialize, Clone, Default)]
struct Config {
    folder: Option<String>,
    github_repo: Option<String>,
    github_token: Option<String>,
}

struct AppState(Mutex<Config>);

fn config_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .expect("no config dir")
        .join("config.json")
}

fn load_config(app: &AppHandle) -> Config {
    let path = config_path(app);
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_config(app: &AppHandle, config: &Config) {
    let path = config_path(app);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(config) {
        let _ = fs::write(path, json);
    }
}

#[tauri::command]
fn get_config(state: State<AppState>) -> Config {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn set_folder(app: AppHandle, state: State<AppState>, folder: String) -> Result<(), String> {
    if !git::is_git_repo(&folder) {
        let (repo_url, token) = {
            let c = state.0.lock().unwrap();
            (c.github_repo.clone(), c.github_token.clone())
        };
        match repo_url {
            Some(url) => {
                let effective_url = token.as_deref().map(|t| authed_url(&url, t)).unwrap_or(url);
                if let Err(e) = git::clone(&effective_url, &folder) {
                    let mut config = state.0.lock().unwrap();
                    config.folder = None;
                    save_config(&app, &config);
                    return Err(format!("Clone failed: {}", e));
                }
            }
            None => return Err("Choose a GitHub repo first, then select a folder".to_string()),
        }
    }
    let mut config = state.0.lock().unwrap();
    config.folder = Some(folder.clone());
    save_config(&app, &config);
    drop(config);
    watcher::start(app, folder);
    Ok(())
}

fn authed_url(repo: &str, token: &str) -> String {
    if let Some(rest) = repo.strip_prefix("https://") {
        format!("https://{}@{}", token, rest)
    } else {
        repo.to_string()
    }
}

#[tauri::command]
fn set_github_token(app: AppHandle, state: State<AppState>, token: String) -> Result<(), String> {
    let mut config = state.0.lock().unwrap();
    config.github_token = Some(token);
    save_config(&app, &config);
    Ok(())
}

#[tauri::command]
fn set_github_repo(app: AppHandle, state: State<AppState>, repo: String) -> Result<(), String> {
    let mut config = state.0.lock().unwrap();
    if let Some(folder) = config.folder.clone() {
        if git::is_git_repo(&folder) {
            let effective_url = config.github_token.as_deref()
                .map(|t| authed_url(&repo, t))
                .unwrap_or_else(|| repo.clone());
            git::set_remote(&folder, &effective_url)?;
        }
    }
    config.github_repo = Some(repo);
    save_config(&app, &config);
    Ok(())
}

#[tauri::command]
fn trigger_sync(state: State<AppState>) -> Result<String, String> {
    let config = state.0.lock().unwrap().clone();
    let folder = config.folder.ok_or("No folder configured")?;
    if !git::is_git_repo(&folder) {
        return Err("Folder is not a git repository — re-select it to clone from your remote".to_string());
    }
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    git::sync(&folder, &format!("sync: {}", now))
}

#[tauri::command]
fn get_watch_folder(state: State<AppState>) -> Option<String> {
    state.0.lock().unwrap().folder.clone()
}

#[tauri::command]
fn set_watch_folder(app: AppHandle, state: State<AppState>, folder: String) -> Result<(), String> {
    set_folder(app, state, folder)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState(Mutex::new(Config::default())))
        .setup(|app| {
            let config = load_config(app.handle());
            *app.state::<AppState>().0.lock().unwrap() = config.clone();

            if let Some(folder) = config.folder.clone() {
                if git::is_git_repo(&folder) {
                    watcher::start(app.handle().clone(), folder);
                }
            }

            // Build a minimal menu: org-sync > Sync Now, separator, Quit
            let sync_item = MenuItem::with_id(app, "sync", "Sync Now", true, Some("CmdOrCtrl+S"))?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings...", true, Some("CmdOrCtrl+,"))?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = PredefinedMenuItem::quit(app, Some("Quit org-sync"))?;

            let app_submenu = Submenu::with_id_and_items(
                app,
                "app",
                "org-sync",
                true,
                &[&settings_item, &sync_item, &separator, &quit_item],
            )?;

            let menu = Menu::with_items(app, &[&app_submenu])?;
            app.set_menu(menu)?;

            app.on_menu_event(|app, event| match event.id().as_ref() {
                "settings" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
                "sync" => {
                    let config = app.state::<AppState>().0.lock().unwrap().clone();
                    if let Some(folder) = config.folder {
                        let now = chrono::Local::now()
                            .format("%Y-%m-%d %H:%M:%S")
                            .to_string();
                        let result = git::sync(&folder, &format!("sync: {}", now));
                        let payload = match result {
                            Ok(msg) => serde_json::json!({ "status": "ok", "message": msg }),
                            Err(e) => serde_json::json!({ "status": "error", "message": e }),
                        };
                        let _ = app.emit("sync-result", payload);
                    }
                }
                _ => {}
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_folder,
            set_github_repo,
            set_github_token,
            trigger_sync,
            get_watch_folder,
            set_watch_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
