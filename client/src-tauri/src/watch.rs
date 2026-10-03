//! Tells the app when files in a granted folder change outside it (another editor, a Gradle build, git).
//!
//! One debounced recursive watcher per watched root. Events carry absolute paths that were already confined to the
//! granted folders; the app maps them to project-relative paths and ignores its own writes.

use std::{collections::HashMap, path::Path, sync::Mutex, time::Duration};

use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::access::Access;

/// Event name the front end listens to.
pub const CHANGED_EVENT: &str = "project-fs-changed";

#[derive(Default)]
pub struct Watchers(Mutex<HashMap<String, Debouncer<notify::RecommendedWatcher>>>);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Changed {
    root: String,
    paths: Vec<String>,
}

/// Paths that change constantly and mean nothing to an editor: version control, build output, caches, and the
/// temp files this app writes before renaming them into place. Only the part below the watched `root` counts, so a
/// project that happens to live under a folder called `build` is still watched.
pub fn is_noise(root: &Path, path: &Path) -> bool {
    path.strip_prefix(root).unwrap_or(path).components().any(|part| {
        let name = part.as_os_str().to_string_lossy();
        matches!(name.as_ref(), ".git" | ".gradle" | ".idea" | "node_modules" | "build" | "target" | ".DS_Store")
    }) || path.file_name().is_some_and(|name| name.to_string_lossy().contains(".studio-tmp-"))
}

#[tauri::command]
pub fn fs_watch_start(app: AppHandle, access: State<'_, Access>, watchers: State<'_, Watchers>, path: String) -> Result<(), String> {
    let root = access.check_path(&path)?;
    if !root.is_dir() {
        return Err(format!("{} is not a folder", root.display()));
    }
    let key = root.to_string_lossy().into_owned();
    let mut map = watchers.0.lock().unwrap();
    if map.contains_key(&key) {
        return Ok(());
    }
    let emit_root = key.clone();
    let debouncer = start_debouncer(&root, Duration::from_millis(300), move |paths| {
        let _ = app.emit(CHANGED_EVENT, Changed { root: emit_root.clone(), paths });
    })?;
    map.insert(key, debouncer);
    Ok(())
}

/// Watches `root` recursively and calls `on_paths` with the sorted, de-duplicated absolute paths of each settled burst.
fn start_debouncer(
    root: &Path,
    debounce: Duration,
    on_paths: impl Fn(Vec<String>) + Send + 'static,
) -> Result<Debouncer<notify::RecommendedWatcher>, String> {
    let watched = root.to_path_buf();
    let mut debouncer = new_debouncer(debounce, move |result: DebounceEventResult| {
        let Ok(events) = result else { return };
        let mut paths: Vec<String> = events
            .iter()
            .filter(|event| !is_noise(&watched, &event.path))
            .map(|event| event.path.to_string_lossy().into_owned())
            .collect();
        paths.sort();
        paths.dedup();
        if !paths.is_empty() {
            on_paths(paths);
        }
    })
    .map_err(|e| e.to_string())?;
    debouncer.watcher().watch(root, RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    Ok(debouncer)
}

#[tauri::command]
pub fn fs_watch_stop(access: State<'_, Access>, watchers: State<'_, Watchers>, path: String) -> Result<(), String> {
    let root = access.check_path(&path)?;
    watchers.0.lock().unwrap().remove(root.to_string_lossy().as_ref());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, sync::mpsc, time::Instant};

    #[test]
    fn ignores_version_control_build_output_and_our_own_temp_files() {
        let root = Path::new("/p");
        for noisy in ["/p/.git/index", "/p/server/build/classes/A.class", "/p/.gradle/x", "/p/a/.items.toml.studio-tmp-123", "/p/node_modules/x/y.js"] {
            assert!(is_noise(root, Path::new(noisy)), "{noisy}");
        }
        for useful in ["/p/.data/raw-cache/server/items.toml", "/p/content/mining/gamevals.toml", "/p/.data/gamevals/obj.rscm"] {
            assert!(!is_noise(root, Path::new(useful)), "{useful}");
        }
    }

    #[test]
    fn only_the_part_below_the_watched_root_counts_as_noise() {
        assert!(!is_noise(Path::new("/home/me/build/OpenRune"), Path::new("/home/me/build/OpenRune/.data/raw-cache/server/npcs.toml")));
        assert!(is_noise(Path::new("/home/me/build/OpenRune"), Path::new("/home/me/build/OpenRune/.git/HEAD")));
    }

    #[test]
    fn reports_files_changed_by_someone_else_and_skips_noise() {
        let root = std::env::temp_dir().join(format!("studio-watch-{}-{}", std::process::id(), Instant::now().elapsed().as_nanos()));
        fs::create_dir_all(root.join("server")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        let root = root.canonicalize().unwrap();
        let (sender, receiver) = mpsc::channel();
        let _watcher = start_debouncer(&root, Duration::from_millis(100), move |paths| {
            let _ = sender.send(paths);
        })
        .unwrap();

        fs::write(root.join(".git").join("index"), "x").unwrap();
        fs::write(root.join("server").join("npcs.toml"), "[[npc]]\n").unwrap();

        let mut seen: Vec<String> = Vec::new();
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline && !seen.iter().any(|p| p.ends_with("npcs.toml")) {
            if let Ok(paths) = receiver.recv_timeout(Duration::from_millis(250)) {
                seen.extend(paths);
            }
        }
        let _ = fs::remove_dir_all(&root);
        assert!(seen.iter().any(|p| p.ends_with("server/npcs.toml")), "no change event: {seen:?}");
        assert!(!seen.iter().any(|p| p.contains(".git")), "noise leaked: {seen:?}");
    }
}
