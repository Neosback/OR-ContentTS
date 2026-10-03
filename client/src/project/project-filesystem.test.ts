import { describe, expect, it } from "vitest";

import {
    normalizeProjectPath,
    ProjectFileSystemError,
    walkProjectDirectory,
} from "./project-filesystem";
import { InMemoryProjectFileSystem } from "./in-memory-project-filesystem";

describe("ProjectFileSystem paths", () => {
    it("normalizes portable project-relative paths", () => {
        expect(normalizeProjectPath("")).toBe("");
        expect(normalizeProjectPath(".")).toBe("");
        expect(normalizeProjectPath("./content//pack/gamevals.toml")).toBe("content/pack/gamevals.toml");
        expect(normalizeProjectPath("content\\pack\\gamevals.toml")).toBe("content/pack/gamevals.toml");
    });

    it.each([
        "/etc/passwd",
        "\\rooted",
        "\\\\server\\share",
        "C:\\project\\game.yml",
        "C:/project/game.yml",
        "../outside",
        "content/../../outside",
        "file://project/game.yml",
        "bad\0path",
    ])("rejects unsafe or non-portable path %s", (path) => {
        expect(() => normalizeProjectPath(path)).toThrowError(ProjectFileSystemError);
        try {
            normalizeProjectPath(path);
        } catch (error) {
            expect(error).toMatchObject({ code: "INVALID_PATH" });
        }
    });
});

describe("InMemoryProjectFileSystem", () => {
    const seed = {
        "game.yml": "revision: 240",
        "content/woodcutting/gamevals.toml": "[gamevals.loc]\ntree = 50000",
        ".data/gamevals/loc.rscm": "tree=50000",
        ".data/cache/LIVE/main_file_cache.dat2": new Uint8Array([1, 2, 3]),
    };

    it("lists and stats project-relative entries", async () => {
        const fs = new InMemoryProjectFileSystem(seed);

        expect(await fs.list("")).toEqual([
            { name: ".data", path: ".data", kind: "directory" },
            { name: "content", path: "content", kind: "directory" },
            { name: "game.yml", path: "game.yml", kind: "file", size: 13, modifiedAt: expect.any(Number) },
        ]);

        expect(await fs.stat("content/woodcutting/gamevals.toml")).toEqual({
            name: "gamevals.toml",
            path: "content/woodcutting/gamevals.toml",
            kind: "file",
            size: 27,
            modifiedAt: expect.any(Number),
        });
        expect(await fs.stat("missing")).toBeUndefined();
        expect(await fs.exists(".data/cache/LIVE")).toBe(true);
    });

    it("reads text and bytes without exposing mutable backing storage", async () => {
        const fs = new InMemoryProjectFileSystem(seed);

        expect(await fs.readText("game.yml")).toBe("revision: 240");

        const first = await fs.readBytes(".data/cache/LIVE/main_file_cache.dat2");
        first[0] = 99;
        expect(Array.from(await fs.readBytes(".data/cache/LIVE/main_file_cache.dat2"))).toEqual([1, 2, 3]);
    });

    it("creates and replaces files inside existing directories", async () => {
        const fs = new InMemoryProjectFileSystem(seed);

        await fs.writeText("content/woodcutting/new.toml", "hello");
        expect(await fs.readText("content/woodcutting/new.toml")).toBe("hello");

        const input = new Uint8Array([9, 8, 7]);
        await fs.writeBytes(".data/cache/LIVE/new.bin", input);
        input[0] = 1;
        expect(Array.from(await fs.readBytes(".data/cache/LIVE/new.bin"))).toEqual([9, 8, 7]);
    });

    it("rejects writes whose parent directory does not exist", async () => {
        const fs = new InMemoryProjectFileSystem(seed);

        await expect(fs.writeText("missing/nested.toml", "x")).rejects.toMatchObject({
            code: "NOT_FOUND",
            path: "missing",
        });
    });

    it("rejects directory/file misuse with typed errors", async () => {
        const fs = new InMemoryProjectFileSystem(seed);

        await expect(fs.readBytes("content")).rejects.toMatchObject({ code: "IS_DIRECTORY" });
        await expect(fs.list("game.yml")).rejects.toMatchObject({ code: "NOT_DIRECTORY" });
        await expect(fs.readText("missing.txt")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects seed layouts that make one path both a file and directory", () => {
        expect(
            () =>
                new InMemoryProjectFileSystem({
                    "content/file.toml": "nested",
                    content: "file",
                }),
        ).toThrowError(ProjectFileSystemError);
    });

    it("supports read-only capability gating", async () => {
        const fs = new InMemoryProjectFileSystem(seed, { writable: false });

        expect(fs.capabilities).toEqual({ read: true, write: false, watch: true });
        expect(await fs.readText("game.yml")).toBe("revision: 240");
        await expect(fs.writeText("game.yml", "revision: 241")).rejects.toMatchObject({
            code: "WRITE_UNAVAILABLE",
        });
    });

    it("walks a directory recursively in deterministic project-path order", async () => {
        const fs = new InMemoryProjectFileSystem(seed);

        expect((await walkProjectDirectory(fs, ".data")).map((entry) => entry.path)).toEqual([
            ".data/cache",
            ".data/cache/LIVE",
            ".data/cache/LIVE/main_file_cache.dat2",
            ".data/gamevals",
            ".data/gamevals/loc.rscm",
        ]);

        await expect(walkProjectDirectory(fs, "game.yml")).rejects.toMatchObject({
            code: "NOT_DIRECTORY",
        });
    });
});
