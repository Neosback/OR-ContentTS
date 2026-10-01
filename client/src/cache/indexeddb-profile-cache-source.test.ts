import { describe, expect, it } from "vitest";

import type { StoredProfileCache } from "../lib/profile-cache-store";
import type { LocalCacheProfile } from "../lib/local-cache-profiles";
import { IndexedDbProfileCacheSource } from "./indexeddb-profile-cache-source";

const profile: LocalCacheProfile = {
    id: "profile-1",
    name: "Imported OSRS",
    revision: "236",
    locationNotes: "Browser storage",
};

function buffer(size: number): ArrayBuffer {
    return new Uint8Array(size).buffer;
}

function record(): StoredProfileCache {
    return {
        savedAt: "2026-09-30T12:00:00.000Z",
        files: {
            "main_file_cache.dat2": buffer(8),
            "main_file_cache.idx255": buffer(6),
            "main_file_cache.idx0": buffer(3),
            "keys.json": new TextEncoder().encode(
                JSON.stringify({ "12850": [1, 2, 3, 4] }),
            ).buffer,
        },
    };
}

describe("IndexedDbProfileCacheSource", () => {
    it("describes the imported profile using stable persisted metadata", async () => {
        const source = new IndexedDbProfileCacheSource(profile, {
            readRecord: async () => record(),
        });

        await expect(source.listCaches()).resolves.toEqual([
            {
                name: "Imported OSRS",
                game: "oldschool",
                environment: "local",
                revision: 236,
                timestamp: "2026-09-30T12:00:00.000Z",
                size: 8 + 6 + 3 + new TextEncoder().encode(
                    JSON.stringify({ "12850": [1, 2, 3, 4] }),
                ).byteLength,
            },
        ]);
    });

    it("loads imported files into the shared LoadedCache contract", async () => {
        const source = new IndexedDbProfileCacheSource(profile, {
            readRecord: async () => record(),
        });
        const [info] = await source.listCaches();

        const loaded = await source.loadCache(info!);

        expect(loaded.info).toEqual(info);
        expect(loaded.type).toBe("dat2");
        expect(loaded.files.files.has("main_file_cache.dat2")).toBe(true);
        expect(loaded.xteas.get(12850)).toEqual([1, 2, 3, 4]);
    });

    it("returns no entries when the profile has no imported cache", async () => {
        const source = new IndexedDbProfileCacheSource(profile, {
            readRecord: async () => undefined,
        });

        await expect(source.listCaches()).resolves.toEqual([]);
    });

    it("rejects a stale selection whose metadata no longer matches the profile", async () => {
        const source = new IndexedDbProfileCacheSource(profile, {
            readRecord: async () => record(),
        });
        const [info] = await source.listCaches();

        await expect(
            source.loadCache({ ...info!, revision: 240 }),
        ).rejects.toThrow("no longer matches");
    });

    it("honors an already-aborted cache load", async () => {
        const source = new IndexedDbProfileCacheSource(profile, {
            readRecord: async () => record(),
        });
        const [info] = await source.listCaches();
        const controller = new AbortController();
        controller.abort();

        await expect(
            source.loadCache(info!, { signal: controller.signal }),
        ).rejects.toMatchObject({ name: "AbortError" });
    });
});
