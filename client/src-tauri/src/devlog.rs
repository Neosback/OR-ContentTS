//! Dev-only bridge: the web view's console errors, warnings and uncaught errors are forwarded here and printed in the
//! terminal that runs `tauri dev`, where the web view's own console is not visible. The command does nothing useful in
//! release builds (no logger is registered there).

#[tauri::command]
pub fn dev_log(level: String, message: String) {
    let message: String = message.chars().take(8000).collect();
    match level.as_str() {
        "error" => log::error!("[webview] {message}"),
        "warn" => log::warn!("[webview] {message}"),
        _ => log::info!("[webview] {message}"),
    }
}
