mod http_proxy;

use tauri_plugin_sql::{Migration, MigrationKind};

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
        .invoke_handler(tauri::generate_handler![http_proxy::fetch_external_api])
        .run(tauri::generate_context!())
        .expect("error while running wi-mod");
}
