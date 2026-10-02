import {
    normalizeProjectPath,
    projectParentPath,
    projectPathName,
    ProjectFileSystemError,
    type ProjectFileEntry,
    type ProjectFileSystem,
    type ProjectFileSystemCapabilities,
} from "./project-filesystem";

export type InMemoryProjectFileSystemOptions = {
    writable?: boolean;
};

export type InMemoryProjectFileSeed = Record<string, string | Uint8Array>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function cloneBytes(data: Uint8Array): Uint8Array {
    return data.slice();
}

/**
 * Deterministic test/development implementation of ProjectFileSystem.
 *
 * Parent directories are inferred from seeded file paths. Writes create or
 * replace files only inside an existing directory, matching the behavior we
 * want platform adapters to expose without silently inventing project layout.
 */
export class InMemoryProjectFileSystem implements ProjectFileSystem {
    readonly capabilities: ProjectFileSystemCapabilities;

    private readonly files = new Map<string, Uint8Array>();
    private readonly directories = new Set<string>([""]);

    constructor(
        seed: InMemoryProjectFileSeed = {},
        options: InMemoryProjectFileSystemOptions = {},
    ) {
        this.capabilities = {
            read: true,
            write: options.writable ?? true,
            watch: false,
        };

        for (const [rawPath, value] of Object.entries(seed)) {
            const path = this.requireFilePath(rawPath);
            this.ensureParentDirectories(path);
            if (this.directories.has(path)) {
                throw new ProjectFileSystemError(
                    "IS_DIRECTORY",
                    `Seed path "${path}" is already a directory.`,
                    path,
                );
            }
            this.files.set(path, typeof value === "string" ? encoder.encode(value) : cloneBytes(value));
        }
    }

    async list(path = ""): Promise<ProjectFileEntry[]> {
        this.requireRead();
        const normalized = normalizeProjectPath(path);
        this.requireDirectory(normalized);

        const entries: ProjectFileEntry[] = [];
        for (const directory of this.directories) {
            if (!directory || directory === normalized) continue;
            if (projectParentPath(directory) === normalized) {
                entries.push(this.entryForDirectory(directory));
            }
        }
        for (const [file, data] of this.files) {
            if (projectParentPath(file) === normalized) {
                entries.push(this.entryForFile(file, data));
            }
        }

        return entries.sort(
            (a, b) =>
                Number(a.kind === "file") - Number(b.kind === "file") ||
                a.name.localeCompare(b.name) ||
                a.path.localeCompare(b.path),
        );
    }

    async stat(path: string): Promise<ProjectFileEntry | undefined> {
        this.requireRead();
        const normalized = normalizeProjectPath(path);
        const file = this.files.get(normalized);
        if (file) return this.entryForFile(normalized, file);
        if (this.directories.has(normalized)) return this.entryForDirectory(normalized);
        return undefined;
    }

    async exists(path: string): Promise<boolean> {
        return (await this.stat(path)) !== undefined;
    }

    async readText(path: string): Promise<string> {
        return decoder.decode(await this.readBytes(path));
    }

    async readBytes(path: string): Promise<Uint8Array> {
        this.requireRead();
        const normalized = this.requireFilePath(path);
        if (this.directories.has(normalized)) {
            throw new ProjectFileSystemError(
                "IS_DIRECTORY",
                `Project path "${normalized}" is a directory.`,
                normalized,
            );
        }
        const data = this.files.get(normalized);
        if (!data) {
            throw new ProjectFileSystemError(
                "NOT_FOUND",
                `Project file "${normalized}" was not found.`,
                normalized,
            );
        }
        return cloneBytes(data);
    }

    async writeText(path: string, text: string): Promise<void> {
        await this.writeBytes(path, encoder.encode(text));
    }

    async writeBytes(path: string, data: Uint8Array): Promise<void> {
        this.requireWrite();
        const normalized = this.requireFilePath(path);
        if (this.directories.has(normalized)) {
            throw new ProjectFileSystemError(
                "IS_DIRECTORY",
                `Project path "${normalized}" is a directory.`,
                normalized,
            );
        }

        const parent = projectParentPath(normalized);
        if (!this.directories.has(parent)) {
            if (this.files.has(parent)) {
                throw new ProjectFileSystemError(
                    "NOT_DIRECTORY",
                    `Project parent "${parent}" is not a directory.`,
                    parent,
                );
            }
            throw new ProjectFileSystemError(
                "NOT_FOUND",
                `Project parent directory "${parent}" was not found.`,
                parent,
            );
        }

        this.files.set(normalized, cloneBytes(data));
    }

    private requireRead(): void {
        if (!this.capabilities.read) {
            throw new ProjectFileSystemError(
                "READ_UNAVAILABLE",
                "This project filesystem does not support reads.",
            );
        }
    }

    private requireWrite(): void {
        if (!this.capabilities.write) {
            throw new ProjectFileSystemError(
                "WRITE_UNAVAILABLE",
                "This project filesystem is read-only.",
            );
        }
    }

    private requireFilePath(path: string): string {
        const normalized = normalizeProjectPath(path);
        if (!normalized) {
            throw new ProjectFileSystemError(
                "IS_DIRECTORY",
                "The project root is a directory, not a file.",
                normalized,
            );
        }
        return normalized;
    }

    private requireDirectory(path: string): void {
        if (this.files.has(path)) {
            throw new ProjectFileSystemError(
                "NOT_DIRECTORY",
                `Project path "${path}" is not a directory.`,
                path,
            );
        }
        if (!this.directories.has(path)) {
            throw new ProjectFileSystemError(
                "NOT_FOUND",
                `Project directory "${path}" was not found.`,
                path,
            );
        }
    }

    private ensureParentDirectories(path: string): void {
        const segments = path.split("/");
        let current = "";
        for (let i = 0; i < segments.length - 1; i++) {
            current = current ? `${current}/${segments[i]}` : segments[i]!;
            if (this.files.has(current)) {
                throw new ProjectFileSystemError(
                    "NOT_DIRECTORY",
                    `Seed path "${current}" is already a file.`,
                    current,
                );
            }
            this.directories.add(current);
        }
    }

    private entryForFile(path: string, data: Uint8Array): ProjectFileEntry {
        return {
            name: projectPathName(path),
            path,
            kind: "file",
            size: data.byteLength,
        };
    }

    private entryForDirectory(path: string): ProjectFileEntry {
        return {
            name: projectPathName(path),
            path,
            kind: "directory",
        };
    }
}
