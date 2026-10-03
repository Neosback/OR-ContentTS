import { describe, expect, it } from "vitest";

import { ProjectFileSystemError } from "./project-filesystem";
import {
    BrowserProjectFileSystem,
    getBrowserProjectAccessMode,
    selectBrowserProjectDirectory,
    type BrowserDirectoryHandle,
    type BrowserEntryHandle,
    type BrowserFileHandle,
    type BrowserFileLike,
    type BrowserWritableFile,
} from "./browser-project-filesystem";

function domError(name: string): Error {
    const error = new Error(name);
    error.name = name;
    return error;
}

class FakeFile implements BrowserFileLike {
    constructor(
        private data: Uint8Array,
        readonly lastModified = 1_234,
    ) {}

    get size(): number {
        return this.data.byteLength;
    }

    async text(): Promise<string> {
        return new TextDecoder().decode(this.data);
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
        return this.data.slice().buffer;
    }

    replace(data: string | Uint8Array): void {
        this.data =
            typeof data === "string"
                ? new TextEncoder().encode(data)
                : data.slice();
    }
}

class FakeFileHandle implements BrowserFileHandle {
    readonly kind = "file" as const;

    constructor(
        readonly name: string,
        readonly file: FakeFile,
        private writable = true,
    ) {}

    async getFile(): Promise<BrowserFileLike> {
        return this.file;
    }

    async createWritable(): Promise<BrowserWritableFile> {
        if (!this.writable) throw domError("NotAllowedError");

        let pending: string | Uint8Array | undefined;
        return {
            write: async (data) => {
                pending = typeof data === "string" ? data : data.slice();
            },
            close: async () => {
                if (pending !== undefined) this.file.replace(pending);
            },
            abort: async () => {
                pending = undefined;
            },
        };
    }
}

class FakeDirectoryHandle implements BrowserDirectoryHandle {
    readonly kind = "directory" as const;
    readonly children = new Map<string, BrowserEntryHandle>();
    calls = 0;

    constructor(readonly name: string) {}

    entries(): AsyncIterableIterator<[string, BrowserEntryHandle]> {
        this.calls += 1;
        return this.iterate();
    }

    private async *iterate(): AsyncIterableIterator<[string, BrowserEntryHandle]> {
        for (const entry of this.children) yield entry;
    }

    async getDirectoryHandle(name: string): Promise<BrowserDirectoryHandle> {
        this.calls += 1;
        const entry = this.children.get(name);
        if (!entry) throw domError("NotFoundError");
        if (entry.kind !== "directory") throw domError("TypeMismatchError");
        return entry;
    }

    async getFileHandle(
        name: string,
        options: { create?: boolean } = {},
    ): Promise<BrowserFileHandle> {
        this.calls += 1;
        const entry = this.children.get(name);
        if (entry?.kind === "directory") throw domError("TypeMismatchError");
        if (entry?.kind === "file") return entry;
        if (!options.create) throw domError("NotFoundError");

        const created = new FakeFileHandle(name, new FakeFile(new Uint8Array()));
        this.children.set(name, created);
        return created;
    }

    directory(name: string): FakeDirectoryHandle {
        const child = new FakeDirectoryHandle(name);
        this.children.set(name, child);
        return child;
    }

    file(name: string, contents: string | Uint8Array, writable = true): FakeFileHandle {
        const data =
            typeof contents === "string"
                ? new TextEncoder().encode(contents)
                : contents.slice();
        const child = new FakeFileHandle(name, new FakeFile(data), writable);
        this.children.set(name, child);
        return child;
    }
}

function fixture() {
    const root = new FakeDirectoryHandle("project");
    root.file("game.yml", "revision: 240");
    const content = root.directory("content");
    content.file("gamevals.toml", "[gamevals.loc]");
    const cache = root.directory(".data").directory("cache");
    cache.file("data.bin", new Uint8Array([1, 2, 3]));
    return { root, content, cache };
}

describe("browser project access selection", () => {
    it("reports direct filesystem access only when the directory picker exists", () => {
        expect(getBrowserProjectAccessMode({})).toBe("import-download");
        expect(
            getBrowserProjectAccessMode({
                showDirectoryPicker: async () => fixture().root,
            }),
        ).toBe("filesystem");
    });

    it("opens a directory with read/write mode and stable picker id", async () => {
        const { root } = fixture();
        let options: unknown;

        const selected = await selectBrowserProjectDirectory(
            {},
            {
                showDirectoryPicker: async (input) => {
                    options = input;
                    return root;
                },
            },
        );

        expect(selected).toBeInstanceOf(BrowserProjectFileSystem);
        expect(options).toEqual({ id: "openrune-project", mode: "readwrite" });
    });

    it("treats picker cancellation as no selection", async () => {
        let clock = 0;
        expect(
            await selectBrowserProjectDirectory(
                {},
                {
                    now: () => clock,
                    showDirectoryPicker: async () => {
                        clock += 4_000; // the person looked at the dialog and closed it
                        throw domError("AbortError");
                    },
                },
            ),
        ).toBeUndefined();
    });

    it("explains a picker that is refused instantly instead of silently doing nothing", async () => {
        await expect(
            selectBrowserProjectDirectory(
                {},
                {
                    now: () => 0,
                    showDirectoryPicker: async () => {
                        throw domError("AbortError");
                    },
                },
            ),
        ).rejects.toMatchObject({ code: "READ_UNAVAILABLE", message: expect.stringContaining("desktop app") });
    });

    it("directs unsupported browsers to the import/download fallback", async () => {
        await expect(selectBrowserProjectDirectory({}, {})).rejects.toMatchObject({
            code: "READ_UNAVAILABLE",
        });
    });
});

describe("BrowserProjectFileSystem", () => {
    it("lists and stats project-relative entries", async () => {
        const { root } = fixture();
        const fs = new BrowserProjectFileSystem(root);

        expect(await fs.list("")).toEqual([
            { name: ".data", path: ".data", kind: "directory" },
            { name: "content", path: "content", kind: "directory" },
            { name: "game.yml", path: "game.yml", kind: "file" },
        ]);

        expect(await fs.stat("")).toEqual({
            name: "",
            path: "",
            kind: "directory",
        });
        expect(await fs.stat("content/gamevals.toml")).toEqual({
            name: "gamevals.toml",
            path: "content/gamevals.toml",
            kind: "file",
            size: 14,
            modifiedAt: 1234,
        });
        expect(await fs.stat("missing")).toBeUndefined();
        expect(await fs.stat("missing/nested.toml")).toBeUndefined();
    });

    it("reads text and bytes without exposing mutable file data", async () => {
        const { root } = fixture();
        const fs = new BrowserProjectFileSystem(root);

        expect(await fs.readText("game.yml")).toBe("revision: 240");

        const first = await fs.readBytes(".data/cache/data.bin");
        first[0] = 99;
        expect(Array.from(await fs.readBytes(".data/cache/data.bin"))).toEqual([1, 2, 3]);
    });

    it("creates and replaces files inside existing directories", async () => {
        const { root } = fixture();
        const fs = new BrowserProjectFileSystem(root);

        await fs.writeText("content/new.toml", "hello");
        expect(await fs.readText("content/new.toml")).toBe("hello");

        const input = new Uint8Array([9, 8, 7]);
        await fs.writeBytes(".data/cache/new.bin", input);
        input[0] = 1;
        expect(Array.from(await fs.readBytes(".data/cache/new.bin"))).toEqual([9, 8, 7]);
    });

    it("preserves missing and file/directory misuse as typed errors", async () => {
        const { root } = fixture();
        const fs = new BrowserProjectFileSystem(root);

        await expect(fs.readText("content")).rejects.toMatchObject({
            code: "IS_DIRECTORY",
            path: "content",
        });
        await expect(fs.list("game.yml")).rejects.toMatchObject({
            code: "NOT_DIRECTORY",
            path: "game.yml",
        });
        await expect(fs.readText("missing.txt")).rejects.toMatchObject({
            code: "NOT_FOUND",
            path: "missing.txt",
        });
        await expect(fs.writeText("missing/new.toml", "x")).rejects.toMatchObject({
            code: "NOT_FOUND",
            path: "missing",
        });
    });

    it("rejects traversal before touching directory handles", async () => {
        const { root } = fixture();
        const fs = new BrowserProjectFileSystem(root);

        await expect(fs.readText("../outside.txt")).rejects.toBeInstanceOf(ProjectFileSystemError);
        expect(root.calls).toBe(0);
    });

    it("maps denied write permission to WRITE_UNAVAILABLE", async () => {
        const { root, content } = fixture();
        content.file("readonly.toml", "old", false);
        const fs = new BrowserProjectFileSystem(root);

        await expect(fs.writeText("content/readonly.toml", "new")).rejects.toMatchObject({
            code: "WRITE_UNAVAILABLE",
            path: "content/readonly.toml",
        });
    });
});
