import { TauriProjectFileSystem, describeIoCause } from "../../project/tauri-project-filesystem";

/**
 * What the desktop app is allowed to do with files, for the Settings "Folder access" panel.
 *
 * All file access goes through the app's own commands (src-tauri/src/access.rs), which only work inside folders the
 * user granted with the native picker. `APP_FILE_COMMANDS` mirrors the commands registered in src-tauri/src/lib.rs and
 * a test keeps them equal.
 */
export const APP_FILE_COMMANDS = [
    "fs_exists",
    "fs_stat",
    "fs_read_dir",
    "fs_read_file",
    "fs_remove",
    "fs_write_file",
    "fs_write_text",
] as const;

export interface AccessRow {
    id: "read" | "write" | "delete" | "other";
    label: string;
    detail: string;
    allowed: boolean;
}

/** The permission matrix shown in Settings, derived from the registered file commands. */
export function describePermissions(commands: readonly string[] = APP_FILE_COMMANDS): AccessRow[] {
    const has = (name: string): boolean => commands.includes(`fs_${name}`);
    return [
        {
            id: "read",
            label: "Read",
            detail: "Look for files, list folders, read files and text",
            allowed: ["exists", "stat", "read_dir", "read_file"].every(has),
        },
        {
            id: "write",
            label: "Write",
            detail: "Create and overwrite files (project edits, exports)",
            allowed: has("write_file") && has("write_text"),
        },
        {
            id: "delete",
            label: "Delete",
            detail: "Files only, and only used to remove the temporary file of the write test",
            allowed: has("remove"),
        },
        {
            id: "other",
            label: "Rename, create folders, copy, delete folders",
            detail: "Not available",
            allowed: ["rename", "mkdir", "copy", "remove_dir"].some(has),
        },
    ];
}

export interface ProbeResult {
    ok: boolean;
    detail: string;
}

export interface WriteProbeOps {
    join(...paths: string[]): Promise<string>;
    writeTextFile(path: string, data: string): Promise<void>;
    remove(path: string): Promise<void>;
}

/** Reads the folder listing: proves the folder is inside the granted scope and readable. */
export async function probeRead(rootPath: string): Promise<ProbeResult> {
    try {
        const entries = await new TauriProjectFileSystem(rootPath).list("");
        return { ok: true, detail: `${entries.length} entries readable` };
    } catch (error) {
        return { ok: false, detail: describeIoCause((error as { cause?: unknown }).cause ?? error) };
    }
}

const WRITE_PROBE_FILE = ".openrune-write-test";

/** Creates and removes one small file. Only runs when the user clicks "Test write"; leaves nothing behind. */
export async function probeWrite(rootPath: string, ops: WriteProbeOps): Promise<ProbeResult> {
    let file: string;
    try {
        file = await ops.join(rootPath, WRITE_PROBE_FILE);
        await ops.writeTextFile(file, "OpenRune write access test\n");
    } catch (error) {
        return { ok: false, detail: describeIoCause(error) };
    }
    try {
        await ops.remove(file);
    } catch (error) {
        return { ok: true, detail: `writable, but the test file ${WRITE_PROBE_FILE} could not be removed: ${describeIoCause(error)}` };
    }
    return { ok: true, detail: "writable" };
}
