import {
    normalizeProjectPath,
    projectParentPath,
    projectPathName,
    ProjectFileSystemError,
    type ProjectFileEntry,
    type ProjectFileSystem,
    type ProjectFileSystemCapabilities,
} from "./project-filesystem";

export type BrowserProjectAccessMode = "filesystem" | "import-download";

export type BrowserFileLike = {
    readonly size: number;
    readonly lastModified: number;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
};

export type BrowserWritableFile = {
    write(data: string | Uint8Array): Promise<void>;
    close(): Promise<void>;
    abort?(): Promise<void>;
};

export type BrowserFileHandle = {
    readonly kind: "file";
    readonly name: string;
    getFile(): Promise<BrowserFileLike>;
    createWritable(): Promise<BrowserWritableFile>;
};

export type BrowserDirectoryHandle = {
    readonly kind: "directory";
    readonly name: string;
    entries(): AsyncIterableIterator<[string, BrowserEntryHandle]>;
    getDirectoryHandle(name: string): Promise<BrowserDirectoryHandle>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<BrowserFileHandle>;
};

export type BrowserEntryHandle = BrowserFileHandle | BrowserDirectoryHandle;

export type BrowserDirectoryPicker = (options?: {
    id?: string;
    mode?: "read" | "readwrite";
}) => Promise<BrowserDirectoryHandle>;

export type BrowserProjectFileSystemEnvironment = {
    showDirectoryPicker?: BrowserDirectoryPicker;
};

export type SelectBrowserProjectDirectoryOptions = {
    id?: string;
};

function defaultEnvironment(): BrowserProjectFileSystemEnvironment {
    const target = globalThis as typeof globalThis & {
        showDirectoryPicker?: BrowserDirectoryPicker;
    };
    return {
        showDirectoryPicker:
            typeof target.showDirectoryPicker === "function"
                ? target.showDirectoryPicker.bind(target)
                : undefined,
    };
}

function errorName(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "name" in error
        ? String((error as { name?: unknown }).name)
        : undefined;
}

function isAbortError(error: unknown): boolean {
    return errorName(error) === "AbortError";
}

export function getBrowserProjectAccessMode(
    environment: BrowserProjectFileSystemEnvironment = defaultEnvironment(),
): BrowserProjectAccessMode {
    return typeof environment.showDirectoryPicker === "function"
        ? "filesystem"
        : "import-download";
}

/**
 * Opens the browser directory picker with read/write access.
 *
 * This must be called from a transient user activation such as a click handler.
 * Browsers without showDirectoryPicker should keep using the Studio's existing
 * project import/download workflow instead of treating direct filesystem access
 * as required.
 */
export async function selectBrowserProjectDirectory(
    options: SelectBrowserProjectDirectoryOptions = {},
    environment: BrowserProjectFileSystemEnvironment = defaultEnvironment(),
): Promise<BrowserProjectFileSystem | undefined> {
    if (!environment.showDirectoryPicker) {
        throw new ProjectFileSystemError(
            "READ_UNAVAILABLE",
            "Direct browser directory access is unavailable. Use project import/download instead.",
        );
    }

    try {
        const root = await environment.showDirectoryPicker({
            id: options.id ?? "openrune-project",
            mode: "readwrite",
        });
        return new BrowserProjectFileSystem(root);
    } catch (error) {
        if (isAbortError(error)) return undefined;
        if (errorName(error) === "SecurityError" || errorName(error) === "NotAllowedError") {
            throw new ProjectFileSystemError(
                "READ_UNAVAILABLE",
                "Browser project directory access was not granted.",
                undefined,
                { cause: error },
            );
        }
        throw new ProjectFileSystemError(
            "IO_FAILED",
            "Browser project directory selection failed.",
            undefined,
            { cause: error },
        );
    }
}

/**
 * Browser File System Access API implementation of ProjectFileSystem.
 *
 * The root handle is granted by the browser picker. All application paths stay
 * project-relative and are resolved one segment at a time beneath that handle.
 */
export class BrowserProjectFileSystem implements ProjectFileSystem {
    readonly capabilities: ProjectFileSystemCapabilities = {
        read: true,
        write: true,
        watch: false,
    };

    constructor(readonly rootHandle: BrowserDirectoryHandle) {}

    async list(path = ""): Promise<ProjectFileEntry[]> {
        const normalized = normalizeProjectPath(path);
        const directory = await this.resolveDirectory(normalized);
        const entries: ProjectFileEntry[] = [];

        try {
            for await (const [name, handle] of directory.entries()) {
                const childPath = normalizeProjectPath(
                    normalized ? `${normalized}/${name}` : name,
                );
                entries.push({
                    name,
                    path: childPath,
                    kind: handle.kind,
                });
            }
        } catch (error) {
            throw this.mapReadError(normalized, error);
        }

        return entries.sort(
            (a, b) =>
                Number(a.kind === "file") - Number(b.kind === "file") ||
                a.name.localeCompare(b.name) ||
                a.path.localeCompare(b.path),
        );
    }

    async stat(path: string): Promise<ProjectFileEntry | undefined> {
        const normalized = normalizeProjectPath(path);
        if (!normalized) {
            return { name: "", path: "", kind: "directory" };
        }

        let handle: BrowserEntryHandle | undefined;
        try {
            handle = await this.findEntry(normalized);
        } catch (error) {
            if (error instanceof ProjectFileSystemError && error.code === "NOT_FOUND") {
                return undefined;
            }
            throw error;
        }
        if (!handle) return undefined;

        if (handle.kind === "directory") {
            return {
                name: projectPathName(normalized),
                path: normalized,
                kind: "directory",
            };
        }

        const file = await this.withReadIo(normalized, () => handle.getFile());
        return {
            name: projectPathName(normalized),
            path: normalized,
            kind: "file",
            size: file.size,
            modifiedAt: file.lastModified,
        };
    }

    async exists(path: string): Promise<boolean> {
        return (await this.stat(path)) !== undefined;
    }

    async readText(path: string): Promise<string> {
        const normalized = normalizeProjectPath(path);
        const handle = await this.requireFile(normalized);
        const file = await this.withReadIo(normalized, () => handle.getFile());
        return this.withReadIo(normalized, () => file.text());
    }

    async readBytes(path: string): Promise<Uint8Array> {
        const normalized = normalizeProjectPath(path);
        const handle = await this.requireFile(normalized);
        const file = await this.withReadIo(normalized, () => handle.getFile());
        const data = await this.withReadIo(normalized, () => file.arrayBuffer());
        return new Uint8Array(data).slice();
    }

    async writeText(path: string, text: string): Promise<void> {
        await this.write(path, text);
    }

    async writeBytes(path: string, data: Uint8Array): Promise<void> {
        await this.write(path, data.slice());
    }

    private async write(path: string, data: string | Uint8Array): Promise<void> {
        const normalized = normalizeProjectPath(path);
        if (!normalized) {
            throw new ProjectFileSystemError(
                "IS_DIRECTORY",
                "The project root is a directory, not a file.",
                normalized,
            );
        }

        const parent = projectParentPath(normalized);
        const directory = await this.resolveDirectory(parent);
        const name = projectPathName(normalized);

        let handle: BrowserFileHandle;
        try {
            handle = await directory.getFileHandle(name, { create: true });
        } catch (error) {
            if (errorName(error) === "TypeMismatchError") {
                throw new ProjectFileSystemError(
                    "IS_DIRECTORY",
                    `Project path "${normalized}" is a directory.`,
                    normalized,
                    { cause: error },
                );
            }
            throw this.mapWriteError(normalized, error);
        }

        const writable = await this.withWriteIo(normalized, () => handle.createWritable());
        try {
            await this.withWriteIo(normalized, () => writable.write(data));
            await this.withWriteIo(normalized, () => writable.close());
        } catch (error) {
            try {
                await writable.abort?.();
            } catch {
                // Preserve the original write failure.
            }
            throw error;
        }
    }

    private async findEntry(path: string): Promise<BrowserEntryHandle | undefined> {
        const normalized = normalizeProjectPath(path);
        if (!normalized) return this.rootHandle;

        const parent = await this.resolveDirectory(projectParentPath(normalized));
        const expectedName = projectPathName(normalized);

        try {
            for await (const [name, handle] of parent.entries()) {
                if (name === expectedName) return handle;
            }
            return undefined;
        } catch (error) {
            throw this.mapReadError(normalized, error);
        }
    }

    private async requireFile(path: string): Promise<BrowserFileHandle> {
        if (!path) {
            throw new ProjectFileSystemError(
                "IS_DIRECTORY",
                "The project root is a directory, not a file.",
                path,
            );
        }

        const handle = await this.findEntry(path);
        if (!handle) {
            throw new ProjectFileSystemError(
                "NOT_FOUND",
                `Project file "${path}" was not found.`,
                path,
            );
        }
        if (handle.kind === "directory") {
            throw new ProjectFileSystemError(
                "IS_DIRECTORY",
                `Project path "${path}" is a directory.`,
                path,
            );
        }
        return handle;
    }

    private async resolveDirectory(path: string): Promise<BrowserDirectoryHandle> {
        const normalized = normalizeProjectPath(path);
        let current = this.rootHandle;
        if (!normalized) return current;

        let currentPath = "";
        for (const segment of normalized.split("/")) {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            try {
                current = await current.getDirectoryHandle(segment);
            } catch (error) {
                if (errorName(error) === "NotFoundError") {
                    throw new ProjectFileSystemError(
                        "NOT_FOUND",
                        `Project directory "${currentPath}" was not found.`,
                        currentPath,
                        { cause: error },
                    );
                }
                if (errorName(error) === "TypeMismatchError") {
                    throw new ProjectFileSystemError(
                        "NOT_DIRECTORY",
                        `Project path "${currentPath}" is not a directory.`,
                        currentPath,
                        { cause: error },
                    );
                }
                throw this.mapReadError(currentPath, error);
            }
        }
        return current;
    }

    private async withReadIo<T>(path: string, operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (error instanceof ProjectFileSystemError) throw error;
            throw this.mapReadError(path, error);
        }
    }

    private async withWriteIo<T>(path: string, operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (error instanceof ProjectFileSystemError) throw error;
            throw this.mapWriteError(path, error);
        }
    }

    private mapReadError(path: string, error: unknown): ProjectFileSystemError {
        if (error instanceof ProjectFileSystemError) return error;
        const name = errorName(error);
        if (name === "NotFoundError") {
            return new ProjectFileSystemError(
                "NOT_FOUND",
                `Project path "${path}" was not found.`,
                path,
                { cause: error },
            );
        }
        if (name === "NotAllowedError" || name === "SecurityError") {
            return new ProjectFileSystemError(
                "READ_UNAVAILABLE",
                `Read access is unavailable for project path "${path}".`,
                path,
                { cause: error },
            );
        }
        return new ProjectFileSystemError(
            "IO_FAILED",
            `Browser filesystem operation failed for "${path}".`,
            path,
            { cause: error },
        );
    }

    private mapWriteError(path: string, error: unknown): ProjectFileSystemError {
        if (error instanceof ProjectFileSystemError) return error;
        const name = errorName(error);
        if (name === "NotAllowedError" || name === "SecurityError") {
            return new ProjectFileSystemError(
                "WRITE_UNAVAILABLE",
                `Write access is unavailable for project path "${path}".`,
                path,
                { cause: error },
            );
        }
        if (name === "NotFoundError") {
            return new ProjectFileSystemError(
                "NOT_FOUND",
                `Project path "${path}" was not found.`,
                path,
                { cause: error },
            );
        }
        return new ProjectFileSystemError(
            "IO_FAILED",
            `Browser filesystem write failed for "${path}".`,
            path,
            { cause: error },
        );
    }
}
