export type ProjectFileSystemCapabilities = {
    read: boolean;
    write: boolean;
    watch: boolean;
};

export type ProjectEntryKind = "file" | "directory";

export type ProjectFileEntry = {
    name: string;
    path: string;
    kind: ProjectEntryKind;
    size?: number;
    modifiedAt?: number;
};

export type ProjectFileSystemErrorCode =
    | "INVALID_PATH"
    | "NOT_FOUND"
    | "NOT_DIRECTORY"
    | "IS_DIRECTORY"
    | "READ_UNAVAILABLE"
    | "WRITE_UNAVAILABLE"
    | "ACCESS_DENIED"
    /** The file is not what the caller last saw (changed, removed or already present); re-read and retry. */
    | "CONFLICT"
    | "IO_FAILED";

export class ProjectFileSystemError extends Error {
    constructor(
        readonly code: ProjectFileSystemErrorCode,
        message: string,
        readonly path?: string,
        options: ErrorOptions = {},
    ) {
        super(message, options);
        this.name = "ProjectFileSystemError";
    }
}

/**
 * Normalizes a project-relative path to forward slashes with no leading slash.
 *
 * The project root is represented by the empty string. Absolute paths, drive
 * paths, UNC paths, NUL bytes, colon-bearing paths, and any `..` segment are
 * rejected instead of being silently resolved. This keeps path semantics
 * portable and prevents callers from escaping the selected project root.
 */
export function normalizeProjectPath(input: string): string {
    if (input.includes("\0")) {
        throw new ProjectFileSystemError("INVALID_PATH", "Project paths must not contain NUL bytes.", input);
    }

    if (input.startsWith("\\\\") || input.startsWith("//")) {
        throw new ProjectFileSystemError("INVALID_PATH", "UNC/network paths are not project-relative.", input);
    }

    const slashed = input.replaceAll("\\", "/");
    if (slashed.startsWith("/")) {
        throw new ProjectFileSystemError("INVALID_PATH", "Absolute paths are not project-relative.", input);
    }
    if (slashed.includes(":")) {
        throw new ProjectFileSystemError(
            "INVALID_PATH",
            "Project paths must not contain ':' or a drive/protocol prefix.",
            input,
        );
    }

    const segments: string[] = [];
    for (const segment of slashed.split("/")) {
        if (!segment || segment === ".") continue;
        if (segment === "..") {
            throw new ProjectFileSystemError(
                "INVALID_PATH",
                "Project paths must not contain '..' traversal segments.",
                input,
            );
        }
        segments.push(segment);
    }
    return segments.join("/");
}

export function projectPathName(path: string): string {
    const normalized = normalizeProjectPath(path);
    if (!normalized) return "";
    const slash = normalized.lastIndexOf("/");
    return slash === -1 ? normalized : normalized.slice(slash + 1);
}

export function projectParentPath(path: string): string {
    const normalized = normalizeProjectPath(path);
    if (!normalized) return "";
    const slash = normalized.lastIndexOf("/");
    return slash === -1 ? "" : normalized.slice(0, slash);
}

/** Guards for a write. Adapters that cannot honour one (for example a backup in the browser) ignore it. */
export type ProjectWriteOptions = {
    /**
     * The modified time (`ProjectFileEntry.modifiedAt`) the caller last saw. If the file's time differs, or the file is
     * gone, the write fails with `CONFLICT`. `null` means the file must not exist yet.
     */
    expectedModifiedAt?: number | null;
    /** Keep a copy of the file being replaced where the platform supports it (the desktop app does; default true). */
    backup?: boolean;
};

/** Something changed outside this app: project-relative paths (a path may be a folder). */
export type ProjectFileChange = { paths: string[] };

/**
 * Framework-neutral filesystem rooted at a user-selected project directory.
 *
 * Implementations must never interpret a project-relative path as permission to
 * access outside their selected backing root. Platform adapters must retain
 * root confinement even when the backing filesystem contains symlinks.
 */
export interface ProjectFileSystem {
    readonly capabilities: ProjectFileSystemCapabilities;

    list(path?: string): Promise<ProjectFileEntry[]>;
    stat(path: string): Promise<ProjectFileEntry | undefined>;
    exists(path: string): Promise<boolean>;

    readText(path: string): Promise<string>;
    readBytes(path: string): Promise<Uint8Array>;

    writeText(path: string, text: string, options?: ProjectWriteOptions): Promise<void>;
    writeBytes(path: string, data: Uint8Array, options?: ProjectWriteOptions): Promise<void>;

    /**
     * Calls `listener` when files change outside this app's own writes (only when `capabilities.watch`). Returns the
     * function that stops watching.
     */
    watch?(listener: (change: ProjectFileChange) => void): () => void;
}

/** The `CONFLICT` error for a write whose guard failed. */
export function conflictError(path: string, reason: "changed" | "removed" | "exists"): ProjectFileSystemError {
    const text = reason === "changed" ? "changed on disk since it was read" : reason === "removed" ? "was removed since it was read" : "already exists";
    return new ProjectFileSystemError("CONFLICT", `Project file "${path}" ${text}.`, path);
}

/** Checks a write's guard against the file's current modified time (undefined = no such file). */
export function checkWriteGuard(path: string, current: number | undefined, options: ProjectWriteOptions | undefined): void {
    if (!options || options.expectedModifiedAt === undefined) return;
    if (options.expectedModifiedAt === null) {
        if (current !== undefined) throw conflictError(path, "exists");
        return;
    }
    if (current === undefined) throw conflictError(path, "removed");
    if (Math.floor(current) !== Math.floor(options.expectedModifiedAt)) throw conflictError(path, "changed");
}

/**
 * Reads a text file together with the modified time it had *before* the read, so a later `writeTextGuarded` fails if
 * anything touched the file in between (statting first errs towards a false conflict, never a lost edit).
 */
export async function readTextStamped(fileSystem: ProjectFileSystem, path: string): Promise<{ text: string; modifiedAt: number | undefined }> {
    const modifiedAt = (await fileSystem.stat(path))?.modifiedAt;
    return { text: await fileSystem.readText(path), modifiedAt };
}

/**
 * Writes text only if the file still has the modified time `readTextStamped` saw. A failed guard is reported through
 * `onConflict` so callers can raise their own typed error; without a stamp (the platform reports no times) it is a plain write.
 */
export async function writeTextGuarded(
    fileSystem: ProjectFileSystem,
    path: string,
    text: string,
    modifiedAt: number | undefined,
    onConflict: (error: ProjectFileSystemError) => Error,
): Promise<void> {
    try {
        await fileSystem.writeText(path, text, modifiedAt === undefined ? undefined : { expectedModifiedAt: modifiedAt });
    } catch (error) {
        if (error instanceof ProjectFileSystemError && error.code === "CONFLICT") throw onConflict(error);
        throw error;
    }
}

/**
 * Recursively lists descendants of a directory. The root directory itself is
 * not included in the result. Entries are returned in deterministic path order.
 */
export async function walkProjectDirectory(
    fileSystem: ProjectFileSystem,
    path = "",
): Promise<ProjectFileEntry[]> {
    const root = normalizeProjectPath(path);
    const stat = await fileSystem.stat(root);
    if (!stat) {
        throw new ProjectFileSystemError("NOT_FOUND", `Project path "${root}" was not found.`, root);
    }
    if (stat.kind !== "directory") {
        throw new ProjectFileSystemError("NOT_DIRECTORY", `Project path "${root}" is not a directory.`, root);
    }

    const result: ProjectFileEntry[] = [];
    const visit = async (directory: string): Promise<void> => {
        const entries = await fileSystem.list(directory);
        for (const entry of entries) {
            result.push(entry);
            if (entry.kind === "directory") {
                await visit(entry.path);
            }
        }
    };

    await visit(root);
    return result.sort((a, b) => a.path.localeCompare(b.path));
}
