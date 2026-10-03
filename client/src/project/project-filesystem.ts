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

    writeText(path: string, text: string): Promise<void>;
    writeBytes(path: string, data: Uint8Array): Promise<void>;
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
