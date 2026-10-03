use tauri::Manager;

mod access;
mod devlog;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      app.manage(access::init(app.handle()));
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      access::access_list,
      access::access_pick,
      access::access_revoke,
      access::fs_exists,
      access::fs_stat,
      access::fs_read_dir,
      access::fs_read_file,
      access::fs_write_text,
      access::fs_write_file,
      access::fs_remove,
      devlog::dev_log,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
