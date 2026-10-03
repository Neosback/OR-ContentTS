import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";

import type { TauriProjectFileSystemOps, TauriWriteGuards } from "../../project/tauri-project-filesystem";

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

/** True for the "CONFLICT: ..." error a guarded write raises when the file is not what the caller last saw. */
export function isConflict(error: unknown): boolean {
    const text = typeof error === "string" ? error : error instanceof Error ? error.message : "";
    return text.startsWith("CONFLICT");
}

/** The guards of a write as the commands take them (`undefined` fields are left out). */
function guardArgs(guards: TauriWriteGuards | undefined): { options: Record<string, unknown> | null } {
    if (!guards) return { options: null };
    const options: Record<string, unknown> = {};
    if (guards.expectedMtimeMs !== undefined) options.expectedMtimeMs = guards.expectedMtimeMs;
    if (guards.mustNotExist !== undefined) options.mustNotExist = guards.mustNotExist;
    if (guards.backup !== undefined) options.backup = guards.backup;
    return { options };
}

function guardHeaders(path: string, guards: TauriWriteGuards | undefined): Record<string, string> {
    const headers: Record<string, string> = { path: encodeURIComponent(path) };
    if (guards?.expectedMtimeMs !== undefined) headers["expected-mtime"] = String(guards.expectedMtimeMs);
    if (guards?.mustNotExist !== undefined) headers["must-not-exist"] = guards.mustNotExist ? "1" : "0";
    if (guards?.backup !== undefined) headers.backup = guards.backup ? "1" : "0";
    return headers;
}

/** Creates a folder and any missing parents (inside a granted folder). */
export function makeDirectory(path: string): Promise<void> {
    return invoke("fs_mkdir", { path });
}

/** What the native watcher reports: absolute paths, already confined to granted folders. */
export type NativeFileChange = { root: string; paths: string[] };

/**
 * Starts watching a granted folder and calls `listener` for changes inside it. Returns a function that stops listening
 * (and stops the native watcher once nothing listens to that folder).
 */
export async function watchFolder(root: string, listener: (change: NativeFileChange) => void): Promise<() => void> {
    const unlisten = await listen<NativeFileChange>("project-fs-changed", (event) => {
        if (event.payload.root === root || event.payload.paths.some((path) => path.startsWith(root))) listener(event.payload);
    });
    await invoke("fs_watch_start", { path: root });
    return () => {
        unlisten();
        void invoke("fs_watch_stop", { path: root }).catch(() => undefined);
    };
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
    writeFile: (path, data, guards) => invoke("fs_write_file", data, { headers: guardHeaders(path, guards) }),
    writeTextFile: (path, text, guards) => invoke("fs_write_text", { path, text, ...guardArgs(guards) }),
    makeDirectory,
    watch: watchFolder,
};

export function removeFile(path: string): Promise<void> {
    return invoke("fs_remove", { path });
}
