import {
    normalizeProjectPath,
    type ProjectFileEntry,
    type ProjectFileSystem,
    type ProjectFileChange,
    type ProjectFileSystemCapabilities,
    type ProjectWriteOptions,
} from "./project-filesystem";

/**
 * A view of a subfolder of another ProjectFileSystem, with paths relative to that subfolder. Used to treat a project
 * found inside a larger selected folder as its own root. Confinement is inherited: every path is joined onto the
 * prefix after normalization, so `..` cannot leave the subfolder.
 */
export class ScopedProjectFileSystem implements ProjectFileSystem {
    readonly prefix: string;

    constructor(
        private readonly inner: ProjectFileSystem,
        prefix: string,
    ) {
        this.prefix = normalizeProjectPath(prefix);
    }

    get capabilities(): ProjectFileSystemCapabilities {
        return this.inner.capabilities;
    }

    private resolve(path: string): string {
        const relative = normalizeProjectPath(path);
        if (!this.prefix) return relative;
        return relative ? `${this.prefix}/${relative}` : this.prefix;
    }

    private relative(path: string): string {
        if (!this.prefix) return path;
        return path === this.prefix ? "" : path.startsWith(`${this.prefix}/`) ? path.slice(this.prefix.length + 1) : path;
    }

    private entry(entry: ProjectFileEntry): ProjectFileEntry {
        return { ...entry, path: this.relative(entry.path) };
    }

    async list(path = ""): Promise<ProjectFileEntry[]> {
        return (await this.inner.list(this.resolve(path))).map((entry) => this.entry(entry));
    }

    async stat(path: string): Promise<ProjectFileEntry | undefined> {
        const found = await this.inner.stat(this.resolve(path));
        return found ? this.entry(found) : undefined;
    }

    async exists(path: string): Promise<boolean> {
        return this.inner.exists(this.resolve(path));
    }

    async readText(path: string): Promise<string> {
        return this.inner.readText(this.resolve(path));
    }

    async readBytes(path: string): Promise<Uint8Array> {
        return this.inner.readBytes(this.resolve(path));
    }

    async writeText(path: string, text: string, options?: ProjectWriteOptions): Promise<void> {
        return this.inner.writeText(this.resolve(path), text, options);
    }

    async writeBytes(path: string, data: Uint8Array, options?: ProjectWriteOptions): Promise<void> {
        return this.inner.writeBytes(this.resolve(path), data, options);
    }

    /** Changes inside the subfolder only, with paths relative to it. */
    get watch(): ProjectFileSystem["watch"] {
        const inner = this.inner.watch?.bind(this.inner);
        if (!inner) return undefined;
        return (listener) =>
            inner((change) => {
                const paths = change.paths
                    .filter((path) => !this.prefix || path === this.prefix || path.startsWith(`${this.prefix}/`))
                    .map((path) => this.relative(path));
                if (paths.length > 0) listener({ paths });
            });
    }
}
