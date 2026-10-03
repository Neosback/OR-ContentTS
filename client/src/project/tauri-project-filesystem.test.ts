import { describe, expect, it } from "vitest";

import { ProjectFileSystemError } from "./project-filesystem";
import {
    TauriProjectFileSystem,
    describeIoCause,
    type TauriProjectDirEntry,
    type TauriProjectFileInfo,
    type TauriProjectFileSystemOps,
} from "./tauri-project-filesystem";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type FakeNode =
    | { kind: "directory"; mtime?: Date }
    | { kind: "file"; data: Uint8Array; mtime?: Date }
    | { kind: "symlink"; targetKind: "file" | "directory"; data?: Uint8Array; mtime?: Date };

function parent(path: string): string {
    const slash = path.lastIndexOf("/");
    if (slash <= 0) return "/";
    return path.slice(0, slash);
}

function name(path: string): string {
    const slash = path.lastIndexOf("/");
    return slash === -1 ? path : path.slice(slash + 1);
}

function createFakeOps(initial: Record<string, FakeNode>) {
    const nodes = new Map<string, FakeNode>(Object.entries(initial));
    const calls: string[] = [];

    const info = (node: FakeNode): TauriProjectFileInfo => {
        if (node.kind === "directory") {
            return {
                isDirectory: true,
                isFile: false,
                isSymlink: false,
                size: 0,
                mtime: node.mtime ?? null,
            };
        }
        if (node.kind === "file") {
            return {
                isDirectory: false,
                isFile: true,
                isSymlink: false,
                size: node.data.byteLength,
                mtime: node.mtime ?? null,
            };
        }
        return {
            isDirectory: node.targetKind === "directory",
            isFile: node.targetKind === "file",
            isSymlink: false,
            size: node.data?.byteLength ?? 0,
            mtime: node.mtime ?? null,
        };
    };

    const ops: TauriProjectFileSystemOps = {
        async join(...paths: string[]) {
            return paths.join("/").replaceAll("//", "/");
        },
        async exists(path: string) {
            calls.push(`exists:${path}`);
            return nodes.has(path);
        },
        async readDir(path: string): Promise<TauriProjectDirEntry[]> {
            calls.push(`readDir:${path}`);
            const node = nodes.get(path);
            if (!node || node.kind !== "directory") throw new Error("not directory");
            const entries: TauriProjectDirEntry[] = [];
            for (const [childPath, child] of nodes) {
                if (childPath === path || parent(childPath) !== path) continue;
                entries.push({
                    name: name(childPath),
                    isDirectory: child.kind === "directory",
                    isFile: child.kind === "file",
                    isSymlink: child.kind === "symlink",
                });
            }
            return entries;
        },
        async stat(path: string) {
            calls.push(`stat:${path}`);
            const node = nodes.get(path);
            if (!node) throw new Error("missing");
            return info(node);
        },
        async readFile(path: string) {
            calls.push(`readFile:${path}`);
            const node = nodes.get(path);
            if (!node || node.kind === "directory") throw new Error("not file");
            return (node.data ?? new Uint8Array()).slice();
        },
        async readTextFile(path: string) {
            return decoder.decode(await ops.readFile(path));
        },
        async writeFile(path: string, data: Uint8Array) {
            calls.push(`writeFile:${path}`);
            nodes.set(path, { kind: "file", data: data.slice() });
        },
        async writeTextFile(path: string, data: string) {
            calls.push(`writeTextFile:${path}`);
            nodes.set(path, { kind: "file", data: encoder.encode(data) });
        },
    };

    return { ops, nodes, calls };
}

function fixture() {
    return createFakeOps({
        "/project": { kind: "directory" },
        "/project/game.yml": { kind: "file", data: encoder.encode("revision: 240") },
        "/project/content": { kind: "directory" },
        "/project/content/gamevals.toml": {
            kind: "file",
            data: encoder.encode("[gamevals.loc]"),
            mtime: new Date(1234),
        },
        "/project/live": { kind: "symlink", targetKind: "directory" },
    });
}

describe("TauriProjectFileSystem", () => {
    it("maps the selected absolute root to project-relative entries", async () => {
        const { ops } = fixture();
        const fs = new TauriProjectFileSystem("/project", ops);

        expect(await fs.stat("")).toEqual({
            name: "",
            path: "",
            kind: "directory",
            size: undefined,
            modifiedAt: undefined,
        });
        expect(await fs.stat("content/gamevals.toml")).toEqual({
            name: "gamevals.toml",
            path: "content/gamevals.toml",
            kind: "file",
            size: 14,
            modifiedAt: 1234,
        });

        expect(await fs.list("")).toEqual([
            { name: "content", path: "content", kind: "directory" },
            { name: "live", path: "live", kind: "directory", size: undefined, modifiedAt: undefined },
            { name: "game.yml", path: "game.yml", kind: "file" },
        ]);
    });

    it("reads text and bytes through resolved paths and defensively copies bytes", async () => {
        const { ops, nodes } = fixture();
        const fs = new TauriProjectFileSystem("/project", ops);

        expect(await fs.readText("game.yml")).toBe("revision: 240");

        const first = await fs.readBytes("game.yml");
        first[0] = 0;
        const stored = nodes.get("/project/game.yml");
        expect(stored?.kind).toBe("file");
        if (stored?.kind === "file") {
            expect(decoder.decode(stored.data)).toBe("revision: 240");
        }
    });

    it("writes only inside an existing project directory", async () => {
        const { ops, nodes } = fixture();
        const fs = new TauriProjectFileSystem("/project", ops);

        await fs.writeText("content/new.toml", "hello");
        const text = nodes.get("/project/content/new.toml");
        expect(text?.kind).toBe("file");
        if (text?.kind === "file") expect(decoder.decode(text.data)).toBe("hello");

        const bytes = new Uint8Array([1, 2, 3]);
        await fs.writeBytes("content/new.bin", bytes);
        bytes[0] = 99;
        const binary = nodes.get("/project/content/new.bin");
        expect(binary?.kind).toBe("file");
        if (binary?.kind === "file") expect(Array.from(binary.data)).toEqual([1, 2, 3]);

        await expect(fs.writeText("missing/new.toml", "x")).rejects.toMatchObject({
            code: "NOT_FOUND",
            path: "missing",
        });
    });

    it("preserves typed file/directory errors", async () => {
        const { ops } = fixture();
        const fs = new TauriProjectFileSystem("/project", ops);

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
    });

    it("rejects traversal before calling native filesystem operations", async () => {
        const { ops, calls } = fixture();
        const fs = new TauriProjectFileSystem("/project", ops);

        await expect(fs.readText("../outside.txt")).rejects.toBeInstanceOf(ProjectFileSystemError);
        expect(calls).toEqual([]);
    });

    it("wraps native filesystem failures in a portable IO error", async () => {
        const { ops } = fixture();
        ops.readFile = async () => {
            throw new Error("native read failed");
        };
        const fs = new TauriProjectFileSystem("/project", ops);

        await expect(fs.readBytes("game.yml")).rejects.toMatchObject({
            code: "IO_FAILED",
            path: "game.yml",
        });
    });

    it("reports paths outside the granted folders as ACCESS_DENIED, with the app's own message", async () => {
        const { ops } = fixture();
        ops.exists = async () => {
            throw "ACCESS_DENIED: /project/.data is outside the folders you have granted. Add it in Settings > Folder access.";
        };
        const fs = new TauriProjectFileSystem("/project", ops);

        await expect(fs.exists(".data/gamevals")).rejects.toMatchObject({
            code: "ACCESS_DENIED",
            path: ".data/gamevals",
            message: expect.stringContaining("Settings > Folder access"),
        });
    });

    it("rejects an empty selected root", () => {
        const { ops } = fixture();
        expect(() => new TauriProjectFileSystem("", ops)).toThrowError(ProjectFileSystemError);
    });
});

describe("describeIoCause", () => {
    it("keeps the folder-access error text as it is (it already says what to do)", () => {
        const text = "ACCESS_DENIED: /x/.data is outside the folders you have granted. Add it in Settings > Folder access.";
        expect(describeIoCause(text)).toBe(text);
    });

    it("keeps other errors, truncating very long ones", () => {
        expect(describeIoCause(new Error("No such file"))).toBe("No such file");
        expect(describeIoCause("x".repeat(500)).length).toBe(301);
        expect(describeIoCause({ code: 5 })).toBe('{"code":5}');
    });
});
