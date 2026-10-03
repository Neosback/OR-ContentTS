import { describe, expect, it } from "vitest";

import type { LocalCacheProfile } from "../lib/local-cache-profiles";
import { InMemoryProjectFileSystem } from "../project/in-memory-project-filesystem";
import { ProjectFileSystemCacheSource } from "./project-filesystem-cache-source";

const profile: LocalCacheProfile = {
    id: "direct-1",
    name: "OpenRune LIVE",
    revision: "240",
    locationNotes: ".data/cache/LIVE",
};

function bytes(size: number): Uint8Array {
    return new Uint8Array(size);
}

describe("ProjectFileSystemCacheSource", () => {
    it("describes a DAT2 cache directly from a filesystem directory", async () => {
        const fs = new InMemoryProjectFileSystem({
            ".data/cache/LIVE/main_file_cache.dat2": bytes(8),
            ".data/cache/LIVE/main_file_cache.idx255": bytes(6),
            ".data/cache/LIVE/main_file_cache.idx0": bytes(3),
            ".data/cache/LIVE/ignored.txt": bytes(20),
        });
        const source = new ProjectFileSystemCacheSource(
            profile,
            fs,
            ".data/cache/LIVE",
        );

        await expect(source.listCaches()).resolves.toEqual([
            {
                name: "OpenRune LIVE",
                game: "oldschool",
                environment: "local",
                revision: 240,
                timestamp: expect.any(String),
                size: 17,
            },
        ]);
    });

    it("loads cache store bytes without writing a browser-storage mirror", async () => {
        const fs = new InMemoryProjectFileSystem({
            "main_file_cache.dat2": bytes(8),
            "main_file_cache.idx255": bytes(6),
            "main_file_cache.idx0": bytes(3),
            "keys.json": new TextEncoder().encode(
                JSON.stringify({ "12850": [1, 2, 3, 4] }),
            ),
        });
        const source = new ProjectFileSystemCacheSource(
            { ...profile, revision: "236" },
            fs,
        );
        const [info] = await source.listCaches();
        const loaded = await source.loadCache(info!);

        expect(loaded.type).toBe("dat2");
        expect(loaded.files.files.has("main_file_cache.dat2")).toBe(true);
        expect(loaded.xteas.get(12850)).toEqual([1, 2, 3, 4]);
    });

    it("rejects a folder that is not a complete cache store", async () => {
        const fs = new InMemoryProjectFileSystem({
            "main_file_cache.dat2": bytes(8),
        });
        const source = new ProjectFileSystemCacheSource(profile, fs);

        await expect(source.listCaches()).rejects.toThrow(
            "main_file_cache.idx255",
        );
    });
});
