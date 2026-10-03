import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";

import type { TauriProjectFileSystemOps } from "../../project/tauri-project-filesystem";

/**
 * Client of the desktop app's file layer (src-tauri/src/access.rs). The app may only touch folders granted through
 * `pickAndGrantFolder`; grants are stored by the app, survive restarts, and are listed by `listGrantedFolders`.
 */

/** Folders the app currently has access to. */
export function listGrantedFolders(): Promise<string[]> {
    return invoke<string[]>("access_list");
}

/**
 * Opens the native folder picker (starting at `defaultPath`) and grants the chosen folder. This is the app's
 * "ask for access" prompt: nothing can be read or written outside granted folders. Resolves to the granted path, or
 * null when the user cancels.
 */
export function pickAndGrantFolder(options: { title?: string; defaultPath?: string } = {}): Promise<string | null> {
    return invoke<string | null>("access_pick", { title: options.title ?? null, defaultPath: options.defaultPath ?? null });
}

export function revokeFolder(path: string): Promise<void> {
    return invoke("access_revoke", { path });
}

/** True for the "ACCESS_DENIED: ..." error the file commands raise for paths outside every granted folder. */
export function isAccessDenied(error: unknown): boolean {
    const text = typeof error === "string" ? error : error instanceof Error ? error.message : "";
    return text.startsWith("ACCESS_DENIED");
}

interface RawStat {
    isDirectory: boolean;
    isFile: boolean;
    isSymlink: boolean;
    size: number;
    mtimeMs: number | null;
}

/** File operations for `TauriProjectFileSystem`, running through the app's access layer. */
export const desktopFileOps: TauriProjectFileSystemOps = {
    join,
    exists: (path) => invoke<boolean>("fs_exists", { path }),
    readDir: (path) => invoke("fs_read_dir", { path }),
    async stat(path) {
        const info = await invoke<RawStat>("fs_stat", { path });
        return { ...info, mtime: info.mtimeMs === null ? null : new Date(info.mtimeMs) };
    },
    async readFile(path) {
        return new Uint8Array(await invoke<ArrayBuffer>("fs_read_file", { path }));
    },
    async readTextFile(path) {
        return new TextDecoder().decode(await invoke<ArrayBuffer>("fs_read_file", { path }));
    },
    writeFile: (path, data) => invoke("fs_write_file", data, { headers: { path: encodeURIComponent(path) } }),
    writeTextFile: (path, text) => invoke("fs_write_text", { path, text }),
};

export function removeFile(path: string): Promise<void> {
    return invoke("fs_remove", { path });
}
