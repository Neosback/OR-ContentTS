//! File access for the desktop app.
//!
//! The app may only touch folders the user has granted through the native folder picker (`access_pick`). Grants are
//! stored in the app config directory, so they survive restarts and can be listed and revoked. Every file command
//! resolves its path (following symlinks) and refuses anything outside a granted folder, hidden folders such as
//! `.data` included.
//!
//! This replaces tauri-plugin-fs, whose runtime scope never matches hidden folders on unix whatever the config says.

use std::{
    ffi::OsString,
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::UNIX_EPOCH,
};

use serde::Serialize;
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle, Manager, State,
};
use tauri_plugin_dialog::DialogExt;

pub struct Access {
    roots: Mutex<Vec<PathBuf>>,
    store: Option<PathBuf>,
}

fn denied(path: &Path) -> String {
    format!(
        "ACCESS_DENIED: {} is outside the folders you have granted. Add it in Settings > Folder access.",
        path.display()
    )
}

/// Resolves `raw` (an absolute path, which may not exist yet) and returns it only when it lies inside one of `roots`.
/// Symlinks are followed on the part that exists, so a link cannot lead out of a granted folder.
pub fn resolve_within(roots: &[PathBuf], raw: &str) -> Result<PathBuf, String> {
    let path = Path::new(raw);
    if !path.is_absolute() {
        return Err(format!("INVALID_PATH: {raw} is not an absolute path"));
    }
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(format!("INVALID_PATH: {raw} contains \"..\""));
    }

    // Canonicalize the deepest ancestor that exists, then re-append the parts that do not exist yet.
    let mut existing = path.to_path_buf();
    let mut missing: Vec<OsString> = Vec::new();
    let resolved = loop {
        match fs::canonicalize(&existing) {
            Ok(mut full) => {
                for part in missing.iter().rev() {
                    full.push(part);
                }
                break full;
            }
            Err(_) => match (existing.file_name(), existing.parent()) {
                (Some(name), Some(parent)) => {
                    missing.push(name.to_os_string());
                    existing = parent.to_path_buf();
                }
                _ => return Err(denied(path)),
            },
        }
    };

    if roots.iter().any(|root| resolved.starts_with(root)) {
        Ok(resolved)
    } else {
        Err(denied(path))
    }
}

impl Access {
    pub fn load(store: Option<PathBuf>) -> Self {
        let mut roots = Vec::new();
        if let Some(file) = &store {
            if let Ok(text) = fs::read_to_string(file) {
                if let Ok(saved) = serde_json::from_str::<Vec<String>>(&text) {
                    for entry in saved {
                        if let Ok(root) = fs::canonicalize(&entry) {
                            if !roots.contains(&root) {
                                roots.push(root);
                            }
                        }
                    }
                }
            }
        }
        Access { roots: Mutex::new(roots), store }
    }

    fn persist(&self, roots: &[PathBuf]) {
        let Some(file) = &self.store else { return };
        if let Some(dir) = file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let names: Vec<String> = roots.iter().map(|r| r.to_string_lossy().into_owned()).collect();
        if let Ok(text) = serde_json::to_string_pretty(&names) {
            let _ = fs::write(file, text);
        }
    }

    pub fn grant(&self, path: &Path) -> Result<PathBuf, String> {
        let root = fs::canonicalize(path).map_err(|e| format!("{}: {e}", path.display()))?;
        if !root.is_dir() {
            return Err(format!("{} is not a folder", root.display()));
        }
        let mut roots = self.roots.lock().unwrap();
        if !roots.contains(&root) {
            roots.push(root.clone());
            self.persist(&roots);
        }
        Ok(root)
    }

    pub fn revoke(&self, path: &Path) {
        let target = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let mut roots = self.roots.lock().unwrap();
        roots.retain(|root| *root != target);
        self.persist(&roots);
    }

    pub fn list(&self) -> Vec<String> {
        self.roots.lock().unwrap().iter().map(|r| r.to_string_lossy().into_owned()).collect()
    }

    fn check(&self, raw: &str) -> Result<PathBuf, String> {
        resolve_within(&self.roots.lock().unwrap(), raw)
    }
}

#[tauri::command]
pub fn access_list(state: State<'_, Access>) -> Vec<String> {
    state.list()
}

/// Opens the native folder picker and grants the chosen folder. This is the only way a folder becomes accessible.
#[tauri::command]
pub async fn access_pick(
    app: AppHandle,
    state: State<'_, Access>,
    title: Option<String>,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    let mut dialog = app.dialog().file();
    if let Some(title) = title {
        dialog = dialog.set_title(title);
    }
    if let Some(start) = default_path {
        let start = PathBuf::from(start);
        if start.is_dir() {
            dialog = dialog.set_directory(start);
        } else if let Some(parent) = start.parent().filter(|p| p.is_dir()) {
            dialog = dialog.set_directory(parent);
        }
    }
    let Some(picked) = dialog.blocking_pick_folder() else {
        return Ok(None);
    };
    let picked = picked.into_path().map_err(|e| e.to_string())?;
    let root = state.grant(&picked)?;
    Ok(Some(root.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn access_revoke(state: State<'_, Access>, path: String) {
    state.revoke(Path::new(&path));
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatInfo {
    is_directory: bool,
    is_file: bool,
    is_symlink: bool,
    size: u64,
    mtime_ms: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    name: String,
    is_directory: bool,
    is_file: bool,
    is_symlink: bool,
}

fn io(error: std::io::Error) -> String {
    error.to_string()
}

#[tauri::command]
pub fn fs_exists(state: State<'_, Access>, path: String) -> Result<bool, String> {
    Ok(state.check(&path)?.exists())
}

#[tauri::command]
pub fn fs_stat(state: State<'_, Access>, path: String) -> Result<StatInfo, String> {
    let resolved = state.check(&path)?;
    let meta = fs::metadata(&resolved).map_err(io)?;
    let is_symlink = fs::symlink_metadata(&path).map(|m| m.file_type().is_symlink()).unwrap_or(false);
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0);
    Ok(StatInfo { is_directory: meta.is_dir(), is_file: meta.is_file(), is_symlink, size: meta.len(), mtime_ms })
}

#[tauri::command]
pub fn fs_read_dir(state: State<'_, Access>, path: String) -> Result<Vec<DirEntryInfo>, String> {
    let resolved = state.check(&path)?;
    let mut entries = Vec::new();
    for entry in fs::read_dir(resolved).map_err(io)? {
        let entry = entry.map_err(io)?;
        let kind = entry.file_type().map_err(io)?;
        entries.push(DirEntryInfo {
            name: entry.file_name().to_string_lossy().into_owned(),
            is_directory: kind.is_dir(),
            is_file: kind.is_file(),
            is_symlink: kind.is_symlink(),
        });
    }
    Ok(entries)
}

#[tauri::command]
pub fn fs_read_file(state: State<'_, Access>, path: String) -> Result<Response, String> {
    let resolved = state.check(&path)?;
    Ok(Response::new(fs::read(resolved).map_err(io)?))
}

#[tauri::command]
pub fn fs_write_text(state: State<'_, Access>, path: String, text: String) -> Result<(), String> {
    fs::write(state.check(&path)?, text).map_err(io)
}

/// Raw bytes as the request body, the (percent-encoded) path in the `path` header.
#[tauri::command]
pub fn fs_write_file(state: State<'_, Access>, request: Request<'_>) -> Result<(), String> {
    let header = request
        .headers()
        .get("path")
        .and_then(|value| value.to_str().ok())
        .ok_or("INVALID_PATH: missing path header")?;
    let path = percent_encoding::percent_decode_str(header).decode_utf8().map_err(|e| e.to_string())?;
    let InvokeBody::Raw(data) = request.body() else {
        return Err("expected the file contents as raw bytes".into());
    };
    fs::write(state.check(&path)?, data).map_err(io)
}

/// Removes a file (never a folder).
#[tauri::command]
pub fn fs_remove(state: State<'_, Access>, path: String) -> Result<(), String> {
    let resolved = state.check(&path)?;
    if resolved.is_dir() {
        return Err(format!("{} is a folder; only files can be removed", resolved.display()));
    }
    fs::remove_file(resolved).map_err(io)
}

pub fn init(app: &AppHandle) -> Access {
    let store = app.path().app_config_dir().ok().map(|dir| dir.join("granted-folders.json"));
    Access::load(store)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("openrune-access-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::canonicalize(dir).unwrap()
    }

    #[test]
    fn allows_files_and_hidden_folders_inside_a_granted_folder() {
        let root = scratch("hidden");
        fs::create_dir_all(root.join(".data/gamevals")).unwrap();
        let roots = vec![root.clone()];
        for rel in ["settings.gradle.kts", ".data", ".data/gamevals", ".data/gamevals/new/deep.txt"] {
            let raw = root.join(rel);
            assert!(resolve_within(&roots, raw.to_str().unwrap()).is_ok(), "{rel} should be allowed");
        }
    }

    #[test]
    fn refuses_other_folders_dot_dot_and_relative_paths() {
        let root = scratch("deny");
        let sibling = scratch("deny-sibling");
        let roots = vec![root.clone()];
        assert!(resolve_within(&roots, sibling.to_str().unwrap()).unwrap_err().starts_with("ACCESS_DENIED"));
        let sneaky = format!("{}/../{}", root.display(), sibling.file_name().unwrap().to_string_lossy());
        assert!(resolve_within(&roots, &sneaky).unwrap_err().starts_with("INVALID_PATH"));
        assert!(resolve_within(&roots, "relative/path").unwrap_err().starts_with("INVALID_PATH"));
        assert!(resolve_within(&[], root.to_str().unwrap()).unwrap_err().starts_with("ACCESS_DENIED"));
    }

    #[test]
    fn a_folder_that_only_shares_a_name_prefix_is_not_inside() {
        let base = scratch("prefix");
        let granted = base.join("project");
        let lookalike = base.join("project-other");
        fs::create_dir_all(&granted).unwrap();
        fs::create_dir_all(&lookalike).unwrap();
        let roots = vec![granted];
        assert!(resolve_within(&roots, lookalike.to_str().unwrap()).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_cannot_lead_out_of_the_granted_folder() {
        let root = scratch("link-root");
        let outside = scratch("link-outside");
        fs::write(outside.join("secret.txt"), "x").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("escape")).unwrap();
        let roots = vec![root.clone()];
        let through_link = root.join("escape/secret.txt");
        assert!(resolve_within(&roots, through_link.to_str().unwrap()).unwrap_err().starts_with("ACCESS_DENIED"));
        // a link that stays inside is fine
        fs::create_dir_all(root.join("real")).unwrap();
        std::os::unix::fs::symlink(root.join("real"), root.join("alias")).unwrap();
        assert!(resolve_within(&roots, root.join("alias").to_str().unwrap()).is_ok());
    }

    #[test]
    fn grants_persist_and_can_be_revoked() {
        let root = scratch("persist-root");
        let store = scratch("persist-store").join("granted-folders.json");
        let access = Access::load(Some(store.clone()));
        access.grant(&root).unwrap();
        assert_eq!(Access::load(Some(store.clone())).list(), access.list());
        assert_eq!(access.list().len(), 1);
        access.revoke(&root);
        assert!(Access::load(Some(store)).list().is_empty());
        assert!(access.grant(&root.join("missing")).is_err());
    }
}
