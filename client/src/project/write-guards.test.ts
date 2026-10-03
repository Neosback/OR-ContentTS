import { describe, expect, it } from "vitest";

import { InMemoryProjectFileSystem } from "./in-memory-project-filesystem";
import { checkWriteGuard, ProjectFileSystemError } from "./project-filesystem";
import { ScopedProjectFileSystem } from "./scoped-project-filesystem";
import { TauriProjectFileSystem, type TauriProjectFileSystemOps, type TauriWriteGuards } from "./tauri-project-filesystem";

const conflict = async (run: () => Promise<unknown> | void): Promise<boolean> => {
    try {
        await run();
        return false;
    } catch (error) {
        return error instanceof ProjectFileSystemError && error.code === "CONFLICT";
    }
};

describe("checkWriteGuard", () => {
    it("passes when nothing is expected, or what is expected is true", () => {
        expect(() => checkWriteGuard("a", 5, undefined)).not.toThrow();
        expect(() => checkWriteGuard("a", 5, {})).not.toThrow();
        expect(() => checkWriteGuard("a", 5.4, { expectedModifiedAt: 5.9 })).not.toThrow();
        expect(() => checkWriteGuard("a", undefined, { expectedModifiedAt: null })).not.toThrow();
    });

    it("raises CONFLICT for changed, removed and already-present files", () => {
        expect(() => checkWriteGuard("a", 6, { expectedModifiedAt: 5 })).toThrow(/changed on disk/);
        expect(() => checkWriteGuard("a", undefined, { expectedModifiedAt: 5 })).toThrow(/removed/);
        expect(() => checkWriteGuard("a", 5, { expectedModifiedAt: null })).toThrow(/already exists/);
    });
});

describe("guarded writes in memory", () => {
    it("lets a write through only while the file is what the caller read", async () => {
        const fs = new InMemoryProjectFileSystem({ "server/items.toml": "a" });
        const seen = (await fs.stat("server/items.toml"))!.modifiedAt!;
        await fs.writeText("server/items.toml", "b", { expectedModifiedAt: seen });
        // the write moved the time on, so the same stale expectation is now refused
        expect(await conflict(() => fs.writeText("server/items.toml", "c", { expectedModifiedAt: seen }))).toBe(true);
        expect(await fs.readText("server/items.toml")).toBe("b");
        expect(await conflict(() => fs.writeText("server/new.toml", "x", { expectedModifiedAt: 1 }))).toBe(true);
        await fs.writeText("server/new.toml", "x", { expectedModifiedAt: null });
        expect(await conflict(() => fs.writeText("server/new.toml", "y", { expectedModifiedAt: null }))).toBe(true);
    });

    it("tells watchers about external writes and stays quiet about its own", async () => {
        const fs = new InMemoryProjectFileSystem({ "a/b.toml": "1" });
        const heard: string[][] = [];
        const stop = fs.watch((change) => heard.push(change.paths));
        await fs.writeText("a/b.toml", "2");
        expect(heard).toEqual([]);
        fs.simulateExternalWrite("a/b.toml", "3");
        expect(heard).toEqual([["a/b.toml"]]);
        stop();
        fs.simulateExternalWrite("a/b.toml", "4");
        expect(heard).toHaveLength(1);
    });

    it("a scoped view only hears its own folder, with relative paths", () => {
        const fs = new InMemoryProjectFileSystem({ "proj/a.toml": "1", "other/b.toml": "1" });
        const scoped = new ScopedProjectFileSystem(fs, "proj");
        const heard: string[][] = [];
        scoped.watch!((change) => heard.push(change.paths));
        fs.simulateExternalWrite("other/b.toml", "2");
        fs.simulateExternalWrite("proj/a.toml", "2");
        expect(heard).toEqual([["a.toml"]]);
    });
});

describe("TauriProjectFileSystem guards and watching", () => {
    const makeOps = () => {
        const writes: { path: string; guards?: TauriWriteGuards }[] = [];
        let emit: ((change: { root: string; paths: string[] }) => void) | undefined;
        let stopped = 0;
        const ops: TauriProjectFileSystemOps = {
            join: async (...paths) => paths.join("/"),
            exists: async () => true,
            readDir: async () => [],
            stat: async (path) => (path === "/root" ? { isDirectory: true, isFile: false, isSymlink: false, size: 0, mtime: null } : { isDirectory: false, isFile: true, isSymlink: false, size: 1, mtime: new Date(5) }),
            readFile: async () => new Uint8Array(),
            readTextFile: async () => "",
            writeFile: async (path, _data, guards) => void writes.push({ path, guards }),
            writeTextFile: async (path, _text, guards) => {
                if (guards?.expectedMtimeMs === 1) throw "CONFLICT: /root/a.toml changed on disk since it was read";
                writes.push({ path, guards });
            },
            watch: async (_root, listener) => {
                emit = listener;
                return () => void stopped++;
            },
        };
        return { ops, writes, emit: (change: { root: string; paths: string[] }) => emit?.(change), stopped: () => stopped };
    };

    it("passes the guards to the desktop commands and maps CONFLICT", async () => {
        const { ops, writes } = makeOps();
        const fs = new TauriProjectFileSystem("/root", ops);
        await fs.writeText("a.toml", "x", { expectedModifiedAt: 7, backup: false });
        await fs.writeText("b.toml", "x", { expectedModifiedAt: null });
        await fs.writeBytes("c.bin", new Uint8Array([1]));
        expect(writes.map((write) => write.guards)).toEqual([{ expectedMtimeMs: 7, backup: false }, { mustNotExist: true }, undefined]);
        expect(await conflict(() => fs.writeText("a.toml", "y", { expectedModifiedAt: 1 }))).toBe(true);
    });

    it("reports watch support from the ops and relays external changes, dropping its own writes", async () => {
        const { ops, emit, stopped } = makeOps();
        const fs = new TauriProjectFileSystem("/root", ops);
        expect(fs.capabilities.watch).toBe(true);
        const heard: string[][] = [];
        const stop = fs.watch((change) => heard.push(change.paths));
        await Promise.resolve();
        await fs.writeText("items.toml", "x");
        emit({ root: "/root", paths: ["/root/items.toml", "/root/npcs.toml", "/elsewhere/x"] });
        expect(heard).toEqual([["npcs.toml"]]);
        stop();
        expect(stopped()).toBe(1);
        expect(new TauriProjectFileSystem("/root", { ...ops, watch: undefined }).capabilities.watch).toBe(false);
    });
});
