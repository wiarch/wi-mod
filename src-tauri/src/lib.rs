mod http_proxy;

use std::fs;
use std::thread;
use std::time::Duration;

use tauri::{Emitter, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

fn init_app_state(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let dir = app.path().app_data_dir()?;
    fs::create_dir_all(&dir)?;
    let settings = dir.join("settings.json");
    if !settings.exists() {
        fs::write(&settings, br#"{"language":"es","theme":"nexus"}"#)?;
    }
    Ok(())
}

#[tauri::command]
fn destroy_splashscreen(app: tauri::AppHandle) -> Result<(), String> {
    init_app_state(&app).map_err(|err| err.to_string())?;
    thread::spawn(move || {
        if let Some(splash) = app.get_webview_window("splashscreen") {
            let _ = splash.emit("splash-finish", ());
            thread::sleep(Duration::from_millis(720));
            let _ = splash.close();
        }
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.show();
            let _ = main.set_focus();
        }
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create_mods_and_settings",
        sql: r#"
CREATE TABLE IF NOT EXISTS mods (
  id TEXT PRIMARY KEY NOT NULL,
  game_domain TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mods_game ON mods(game_domain);
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL
);
"#,
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:wi-mod.db", migrations)
                .build(),
        )
        .setup(|app| {
            init_app_state(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            http_proxy::fetch_external_api,
            destroy_splashscreen
        ])
        .run(tauri::generate_context!())
        .expect("error while running wi-mod");
}
