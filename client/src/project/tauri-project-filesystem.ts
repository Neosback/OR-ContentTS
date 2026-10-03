import { desktopFileOps, isAccessDenied, isConflict, pickAndGrantFolder } from "../lib/tauri/desktop-access";
import {
    normalizeProjectPath,
    projectParentPath,
    projectPathName,
    ProjectFileSystemError,
    type ProjectFileEntry,
    type ProjectFileSystem,
    type ProjectFileChange,
    type ProjectFileSystemCapabilities,
    type ProjectWriteOptions,
} from "./project-filesystem";

export type TauriProjectDirEntry = {
    name: string;
    isDirectory: boolean;
    isFile: boolean;
    isSymlink: boolean;
};

export type TauriProjectFileInfo = {
    isDirectory: boolean;
    isFile: boolean;
    isSymlink: boolean;
    size: number;
    mtime: Date | null;
};

/** Guards for a write, in the units the desktop commands use. */
export type TauriWriteGuards = { expectedMtimeMs?: number; mustNotExist?: boolean; backup?: boolean };

export interface TauriProjectFileSystemOps {
    join(...paths: string[]): Promise<string>;
    exists(path: string): Promise<boolean>;
    readDir(path: string): Promise<TauriProjectDirEntry[]>;
    stat(path: string): Promise<TauriProjectFileInfo>;
    readFile(path: string): Promise<Uint8Array>;
    readTextFile(path: string): Promise<string>;
    writeFile(path: string, data: Uint8Array, guards?: TauriWriteGuards): Promise<void>;
    writeTextFile(path: string, data: string, guards?: TauriWriteGuards): Promise<void>;
    /** Optional so older fakes keep working; the desktop ops provide them. */
    makeDirectory?(path: string): Promise<void>;
    watch?(root: string, listener: (change: { root: string; paths: string[] }) => void): Promise<() => void>;
}

function guardsFor(options: ProjectWriteOptions | undefined): TauriWriteGuards | undefined {
    if (!options) return undefined;
    const guards: TauriWriteGuards = {};
    if (options.expectedModifiedAt === null) guards.mustNotExist = true;
    else if (options.expectedModifiedAt !== undefined) guards.expectedMtimeMs = options.expectedModifiedAt;
    if (options.backup !== undefined) guards.backup = options.backup;
    return guards;
}


/** Tauri rejects with plain strings (scope/permission errors name the capability), not Error objects. */
export function describeIoCause(error: unknown): string {
    let text: string;
    if (typeof error === "string") text = error;
    else if (error instanceof Error) text = error.message;
    else {
        try {
            text = JSON.stringify(error);
        } catch {
            text = String(error);
        }
    }
    return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

export type SelectTauriProjectDirectoryOptions = {
    title?: string;
};

export async function selectTauriProjectDirectory(
    options: SelectTauriProjectDirectoryOptions = {},
): Promise<TauriProjectFileSystem | undefined> {
    const rootPath = await pickAndGrantFolder({ title: options.title ?? "Open OpenRune project" });
    if (!rootPath) return undefined;
    return new TauriProjectFileSystem(rootPath);
}

/**
 * ProjectFileSystem backed by a directory selected through Tauri's native
 * directory picker.
 *
 * The picker grants the selected directory (and everything under it, hidden folders
 * included) in the app's access layer (src-tauri/src/access.rs). Every file command
 * resolves symlinks and rejects paths outside a granted folder, providing the backing
 * filesystem confinement required by ProjectFileSystem.
 */
export class TauriProjectFileSystem implements ProjectFileSystem {
    readonly capabilities: ProjectFileSystemCapabilities;

    /** Own writes that the watcher must not report back as external changes: path -> time of the write. */
    private readonly recentWrites = new Map<string, number>();

    constructor(
        readonly rootPath: string,
        private readonly ops: TauriProjectFileSystemOps = desktopFileOps,
    ) {
        this.capabilities = { read: true, write: true, watch: typeof ops.watch === "function" };
        if (!rootPath) {
            throw new ProjectFileSystemError(
                "INVALID_PATH",
                "Tauri project root must not be empty.",
                rootPath,
            );
        }
    }

    async list(path = ""): Promise<ProjectFileEntry[]> {
        const normalized = normalizeProjectPath(path);
        const directory = await this.requireDirectory(normalized);
        const entries = await this.withIo(normalized, () => this.ops.readDir(directory));

        const result: ProjectFileEntry[] = [];
        for (const entry of entries) {
            const childPath = normalizeProjectPath(
                normalized ? `${normalized}/${entry.name}` : entry.name,
            );

            if (entry.isDirectory) {
                result.push({ name: entry.name, path: childPath, kind: "directory" });
                continue;
            }
            if (entry.isFile) {
                result.push({ name: entry.name, path: childPath, kind: "file" });
                continue;
            }

            if (entry.isSymlink) {
                const info = await this.statRequired(childPath);
                result.push(info);
            }
        }

        return result.sort(
            (a, b) =>
                Number(a.kind === "file") - Number(b.kind === "file") ||
                a.name.localeCompare(b.name) ||
                a.path.localeCompare(b.path),
        );
    }

    async stat(path: string): Promise<ProjectFileEntry | undefined> {
        const normalized = normalizeProjectPath(path);
        const resolved = await this.resolve(normalized);
        const exists = await this.withIo(normalized, () => this.ops.exists(resolved));
        if (!exists) return undefined;

        const info = await this.withIo(normalized, () => this.ops.stat(resolved));
        return this.entryFromInfo(normalized, info);
    }

    async exists(path: string): Promise<boolean> {
        return (await this.stat(path)) !== undefined;
    }

    async readText(path: string): Promise<string> {
        const normalized = await this.requireFile(path);
        const resolved = await this.resolve(normalized);
        return this.withIo(normalized, () => this.ops.readTextFile(resolved));
    }

    async readBytes(path: string): Promise<Uint8Array> {
        const normalized = await this.requireFile(path);
        const resolved = await this.resolve(normalized);
        const data = await this.withIo(normalized, () => this.ops.readFile(resolved));
        return data.slice();
    }

    async writeText(path: string, text: string, options?: ProjectWriteOptions): Promise<void> {
        const normalized = await this.prepareWrite(path);
        const resolved = await this.resolve(normalized);
        this.noteOwnWrite(normalized);
        await this.withIo(normalized, () => this.ops.writeTextFile(resolved, text, guardsFor(options)));
    }

    async writeBytes(path: string, data: Uint8Array, options?: ProjectWriteOptions): Promise<void> {
        const normalized = await this.prepareWrite(path);
        const resolved = await this.resolve(normalized);
        this.noteOwnWrite(normalized);
        await this.withIo(normalized, () => this.ops.writeFile(resolved, data.slice(), guardsFor(options)));
    }

    /** Creates a folder (and parents) inside the project; used before writing a new file into a new place. */
    async makeDirectory(path: string): Promise<void> {
        const normalized = normalizeProjectPath(path);
        const make = this.ops.makeDirectory;
        if (!make) {
            throw new ProjectFileSystemError("WRITE_UNAVAILABLE", "This build cannot create folders.", normalized);
        }
        const resolved = await this.resolve(normalized);
        await this.withIo(normalized, () => make(resolved));
    }

    /**
     * Calls `listener` for changes made outside this app. A change to a path this instance wrote in the last couple of
     * seconds is our own write coming back from the watcher and is dropped.
     */
    watch(listener: (change: ProjectFileChange) => void): () => void {
        const start = this.ops.watch;
        if (!start) return () => undefined;
        let stopped = false;
        let stop: (() => void) | undefined;
        const prefix = this.rootPath.replace(/[\\/]+$/, "");
        void start(this.rootPath, (change) => {
            const now = Date.now();
            const paths: string[] = [];
            for (const absolute of change.paths) {
                if (!absolute.startsWith(prefix)) continue;
                const relative = absolute.slice(prefix.length).replaceAll("\\", "/").replace(/^\/+/, "");
                const wroteAt = this.recentWrites.get(relative);
                if (wroteAt !== undefined && now - wroteAt < 2000) continue;
                paths.push(relative);
            }
            if (paths.length > 0) listener({ paths });
        }).then((unlisten) => {
            if (stopped) unlisten();
            else stop = unlisten;
        });
        return () => {
            stopped = true;
            stop?.();
        };
    }

    private noteOwnWrite(path: string): void {
        const now = Date.now();
        this.recentWrites.set(path, now);
        for (const [key, at] of this.recentWrites) if (now - at > 5000) this.recentWrites.delete(key);
    }

    private async prepareWrite(path: string): Promise<string> {
        const normalized = normalizeProjectPath(path);
        if (!normalized) {
            throw new ProjectFileSystemError(
                "IS_DIRECTORY",
                "The project root is a directory, not a file.",
                normalized,
            );
        }

        const parent = projectParentPath(normalized);
        await this.requireDirectory(parent);

        const existing = await this.stat(normalized);
        if (existing?.kind === "directory") {
            throw new ProjectFileSystemError(
                "IS_DIRECTORY",
                `Project path "${normalized}" is a directory.`,
                normalized,
            );
        }
        return normalized;
    }

    private async requireFile(path: string): Promise<string> {
        const normalized = normalizeProjectPath(path);
        if (!normalized) {
            throw new ProjectFileSystemError(
                "IS_DIRECTORY",
                "The project root is a directory, not a file.",
                normalized,
            );
        }

        const entry = await this.stat(normalized);
        if (!entry) {
            throw new ProjectFileSystemError(
                "NOT_FOUND",
                `Project file "${normalized}" was not found.`,
                normalized,
            );
        }
        if (entry.kind === "directory") {
            throw new ProjectFileSystemError(
                "IS_DIRECTORY",
                `Project path "${normalized}" is a directory.`,
                normalized,
            );
        }
        return normalized;
    }

    private async requireDirectory(path: string): Promise<string> {
        const normalized = normalizeProjectPath(path);
        const entry = await this.stat(normalized);
        if (!entry) {
            throw new ProjectFileSystemError(
                "NOT_FOUND",
                `Project directory "${normalized}" was not found.`,
                normalized,
            );
        }
        if (entry.kind !== "directory") {
            throw new ProjectFileSystemError(
                "NOT_DIRECTORY",
                `Project path "${normalized}" is not a directory.`,
                normalized,
            );
        }
        return this.resolve(normalized);
    }

    private async statRequired(path: string): Promise<ProjectFileEntry> {
        const entry = await this.stat(path);
        if (!entry) {
            throw new ProjectFileSystemError(
                "NOT_FOUND",
                `Project path "${path}" was not found.`,
                path,
            );
        }
        return entry;
    }

    private async resolve(path: string): Promise<string> {
        const normalized = normalizeProjectPath(path);
        if (!normalized) return this.rootPath;
        return this.ops.join(this.rootPath, ...normalized.split("/"));
    }

    private entryFromInfo(path: string, info: TauriProjectFileInfo): ProjectFileEntry {
        const kind = info.isDirectory ? "directory" : "file";
        return {
            name: projectPathName(path),
            path,
            kind,
            size: kind === "file" ? info.size : undefined,
            modifiedAt: info.mtime?.getTime(),
        };
    }

    private async withIo<T>(path: string, operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (error instanceof ProjectFileSystemError) throw error;
            if (isConflict(error)) {
                throw new ProjectFileSystemError("CONFLICT", describeIoCause(error), path, { cause: error });
            }
            if (isAccessDenied(error)) {
                throw new ProjectFileSystemError("ACCESS_DENIED", describeIoCause(error), path, { cause: error });
            }
            throw new ProjectFileSystemError(
                "IO_FAILED",
                `Project filesystem operation failed for "${path}": ${describeIoCause(error)}`,
                path,
                { cause: error },
            );
        }
    }
}
