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

use serde::{Deserialize, Serialize};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle, Manager, State,
};
use tauri_plugin_dialog::DialogExt;

pub struct Access {
    roots: Mutex<Vec<PathBuf>>,
    store: Option<PathBuf>,
    /// Where copies of overwritten files go (the app data folder, never inside a granted project).
    backups: Option<PathBuf>,
}

/// How many backups of one file are kept.
const BACKUPS_KEPT: usize = 10;

/// Optional guards and extras for a write. All fields are optional so a plain write behaves like before, plus the
/// atomic replace and a backup of what it overwrote.
#[derive(Deserialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WriteOptions {
    /// The file's modified time (ms) the caller last saw; a different time means someone else changed it.
    pub expected_mtime_ms: Option<f64>,
    /// The caller expects the file not to exist yet.
    pub must_not_exist: Option<bool>,
    /// Copy the file being replaced to the backup folder first (default true).
    pub backup: Option<bool>,
}

fn mtime_ms(meta: &fs::Metadata) -> Option<f64> {
    meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs_f64() * 1000.0)
}

/// 64-bit FNV-1a: a short, stable folder name for a file's backups.
fn fnv1a(text: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Copies `target` into `<backups>/<hash of its path>/<name>.<unix ms>.bak` and keeps only the newest `BACKUPS_KEPT`.
fn backup_file(backups: &Path, target: &Path) -> Result<(), String> {
    let folder = backups.join(format!("{:016x}", fnv1a(&target.to_string_lossy())));
    fs::create_dir_all(&folder).map_err(io)?;
    let name = target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into());
    let stamp = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    fs::copy(target, folder.join(format!("{name}.{stamp:015}.bak"))).map_err(io)?;

    let mut kept: Vec<PathBuf> = fs::read_dir(&folder)
        .map_err(io)?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| path.extension().is_some_and(|ext| ext == "bak"))
        .collect();
    kept.sort();
    while kept.len() > BACKUPS_KEPT {
        let _ = fs::remove_file(kept.remove(0));
    }
    Ok(())
}

/// Writes `data` to `target` so a reader never sees half a file: a temp file next to it is written, flushed and renamed
/// over it. Fails with `CONFLICT: ...` when the caller's expectation about the existing file does not hold.
pub fn write_checked(target: &Path, data: &[u8], options: &WriteOptions, backups: Option<&Path>) -> Result<(), String> {
    let existing = fs::metadata(target).ok();
    if options.must_not_exist == Some(true) && existing.is_some() {
        return Err(format!("CONFLICT: {} already exists", target.display()));
    }
    if let Some(expected) = options.expected_mtime_ms {
        match &existing {
            None => return Err(format!("CONFLICT: {} was removed since it was read", target.display())),
            Some(meta) => {
                if mtime_ms(meta).map(f64::floor) != Some(expected.floor()) {
                    return Err(format!("CONFLICT: {} changed on disk since it was read", target.display()));
                }
            }
        }
    }
    if existing.as_ref().is_some_and(|meta| meta.is_dir()) {
        return Err(format!("IS_DIRECTORY: {} is a folder", target.display()));
    }

    if let (Some(backups), Some(_), true) = (backups, &existing, options.backup != Some(false)) {
        backup_file(backups, target)?;
    }

    let parent = target.parent().ok_or_else(|| format!("INVALID_PATH: {} has no parent folder", target.display()))?;
    let name = target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into());
    let temp = parent.join(format!(".{name}.studio-tmp-{}", std::process::id()));
    let result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&temp).map_err(io)?;
        std::io::Write::write_all(&mut file, data).map_err(io)?;
        file.sync_all().map_err(io)?;
        if let Some(meta) = &existing {
            let _ = fs::set_permissions(&temp, meta.permissions());
        }
        fs::rename(&temp, target).map_err(io)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
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
        Access { roots: Mutex::new(roots), store, backups: None }
    }

    pub fn with_backups(mut self, backups: Option<PathBuf>) -> Self {
        self.backups = backups;
        self
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

    /// Resolves a path the way every file command does (inside a granted folder, symlinks followed).
    pub fn check_path(&self, raw: &str) -> Result<PathBuf, String> {
        self.check(raw)
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
pub fn fs_write_text(state: State<'_, Access>, path: String, text: String, options: Option<WriteOptions>) -> Result<(), String> {
    let resolved = state.check(&path)?;
    write_checked(&resolved, text.as_bytes(), &options.unwrap_or_default(), state.backups.as_deref())
}

/// Raw bytes as the request body, the (percent-encoded) path in the `path` header. The optional guards travel as the
/// `expected-mtime`, `must-not-exist` and `backup` headers.
#[tauri::command]
pub fn fs_write_file(state: State<'_, Access>, request: Request<'_>) -> Result<(), String> {
    let header = |name: &str| request.headers().get(name).and_then(|value| value.to_str().ok());
    let path = percent_encoding::percent_decode_str(header("path").ok_or("INVALID_PATH: missing path header")?)
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .into_owned();
    let options = WriteOptions {
        expected_mtime_ms: header("expected-mtime").and_then(|value| value.parse().ok()),
        must_not_exist: header("must-not-exist").map(|value| value == "1"),
        backup: header("backup").map(|value| value != "0"),
    };
    let InvokeBody::Raw(data) = request.body() else {
        return Err("expected the file contents as raw bytes".into());
    };
    write_checked(&state.check(&path)?, data, &options, state.backups.as_deref())
}

/// Creates a folder and any missing parents, inside a granted folder.
#[tauri::command]
pub fn fs_mkdir(state: State<'_, Access>, path: String) -> Result<(), String> {
    fs::create_dir_all(state.check(&path)?).map_err(io)
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
    let backups = app.path().app_data_dir().ok().map(|dir| dir.join("backups"));
    Access::load(store).with_backups(backups)
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

    #[test]
    fn writes_atomically_and_leaves_no_temp_file() {
        let dir = scratch("atomic");
        let target = dir.join("items.toml");
        write_checked(&target, b"one", &WriteOptions::default(), None).unwrap();
        write_checked(&target, b"two", &WriteOptions::default(), None).unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "two");
        let leftovers: Vec<_> = fs::read_dir(&dir).unwrap().filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(leftovers, vec!["items.toml".to_string()]);
    }

    #[test]
    fn refuses_a_write_when_the_file_changed_since_it_was_read() {
        let dir = scratch("conflict");
        let target = dir.join("npcs.toml");
        fs::write(&target, "a").unwrap();
        let seen = mtime_ms(&fs::metadata(&target).unwrap()).unwrap();
        let guard = WriteOptions { expected_mtime_ms: Some(seen), ..Default::default() };
        write_checked(&target, b"b", &guard, None).unwrap();
        // someone else writes in between: bump the mtime into the future so the test does not depend on clock resolution
        let file = fs::OpenOptions::new().write(true).open(&target).unwrap();
        file.set_modified(std::time::SystemTime::now() + std::time::Duration::from_secs(5)).unwrap();
        let error = write_checked(&target, b"c", &guard, None).unwrap_err();
        assert!(error.starts_with("CONFLICT"), "{error}");
        assert_eq!(fs::read_to_string(&target).unwrap(), "b");
        let missing = write_checked(&dir.join("gone.toml"), b"x", &guard, None).unwrap_err();
        assert!(missing.starts_with("CONFLICT"));
    }

    #[test]
    fn must_not_exist_protects_an_existing_file() {
        let dir = scratch("create");
        let target = dir.join("new.toml");
        let create = WriteOptions { must_not_exist: Some(true), ..Default::default() };
        write_checked(&target, b"x", &create, None).unwrap();
        assert!(write_checked(&target, b"y", &create, None).unwrap_err().starts_with("CONFLICT"));
        assert_eq!(fs::read_to_string(&target).unwrap(), "x");
    }

    #[test]
    fn backs_up_what_it_overwrites_and_keeps_only_the_newest() {
        let dir = scratch("backup");
        let backups = scratch("backup-store");
        let target = dir.join("items.toml");
        fs::write(&target, "v0").unwrap();
        for n in 1..=(BACKUPS_KEPT + 3) {
            write_checked(&target, format!("v{n}").as_bytes(), &WriteOptions::default(), Some(&backups)).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
        let folder = fs::read_dir(&backups).unwrap().next().unwrap().unwrap().path();
        let mut files: Vec<_> = fs::read_dir(&folder).unwrap().map(|e| e.unwrap().path()).collect();
        files.sort();
        assert_eq!(files.len(), BACKUPS_KEPT);
        // the newest backup holds the content just before the last write
        assert_eq!(fs::read_to_string(files.last().unwrap()).unwrap(), format!("v{}", BACKUPS_KEPT + 2));
        // opting out leaves the folder alone
        let before = fs::read_dir(&folder).unwrap().count();
        write_checked(&target, b"quiet", &WriteOptions { backup: Some(false), ..Default::default() }, Some(&backups)).unwrap();
        assert_eq!(fs::read_dir(&folder).unwrap().count(), before);
        // a first write has nothing to back up
        let fresh = dir.join("fresh.toml");
        write_checked(&fresh, b"x", &WriteOptions::default(), Some(&backups)).unwrap();
        assert_eq!(fs::read_dir(&backups).unwrap().count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn keeps_the_permissions_of_the_file_it_replaces() {
        use std::os::unix::fs::PermissionsExt;
        let dir = scratch("perm");
        let target = dir.join("run.sh");
        fs::write(&target, "a").unwrap();
        fs::set_permissions(&target, fs::Permissions::from_mode(0o751)).unwrap();
        write_checked(&target, b"b", &WriteOptions::default(), None).unwrap();
        assert_eq!(fs::metadata(&target).unwrap().permissions().mode() & 0o777, 0o751);
    }

    #[test]
    fn mkdir_stays_inside_a_granted_folder() {
        let root = scratch("mkdir");
        let roots = vec![root.clone()];
        let inside = resolve_within(&roots, root.join("a/b/c").to_str().unwrap()).unwrap();
        fs::create_dir_all(&inside).unwrap();
        assert!(root.join("a/b/c").is_dir());
        let outside = scratch("mkdir-outside").join("x");
        assert!(resolve_within(&roots, outside.to_str().unwrap()).is_err());
    }
}
