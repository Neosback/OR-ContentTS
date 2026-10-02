import { describe, expect, it, vi } from "vitest";

import { CacheFiles } from "../rs/cache/CacheFiles";
import type { CacheInfo } from "../rs/cache/CacheInfo";
import type { LocalCacheProfile } from "../lib/local-cache-profiles";
import type {
    CacheLoadOptions,
    CacheSource,
    LoadedCache,
} from "./cache-source";
import {
    hasResolvedProfileCache,
    loadResolvedProfileCache,
    resolveProfileCacheSource,
} from "./profile-cache-source";

const staticInfo: CacheInfo = {
    name: "openrune-240",
    game: "oldschool",
    environment: "local",
    revision: 240,
    timestamp: "2026-09-30T00:00:00.000Z",
    size: 10,
};

const importedInfo: CacheInfo = {
    name: "Imported cache",
    game: "oldschool",
    environment: "local",
    revision: 240,
    timestamp: "2026-09-30T00:00:00.000Z",
    size: 20,
};

function loaded(info: CacheInfo): LoadedCache {
    return {
        info,
        type: "dat2",
        files: new CacheFiles(new Map()),
        xteas: new Map(),
    };
}

function source(
    id: string,
    infos: CacheInfo[],
): CacheSource & { loadCache: ReturnType<typeof vi.fn> } {
    return {
        id,
        listCaches: vi.fn(async () => infos),
        loadCache: vi.fn(
            async (info: CacheInfo, _options?: CacheLoadOptions) => loaded(info),
        ),
    };
}

describe("profile CacheSource resolution", () => {
    it("maps legacy server profile ids to the static range source", async () => {
        const staticSource = source("static-range", [staticInfo]);
        const profile: LocalCacheProfile = {
            id: "server:openrune-240",
            name: "OpenRune 240",
            revision: "240",
            locationNotes: "Legacy profile binding",
        };

        const binding = await resolveProfileCacheSource(profile, {
            staticSource,
        });

        expect(binding).toEqual({
            source: staticSource,
            info: staticInfo,
            loadOptions: { browserCache: false },
        });
    });

    it("maps normal profiles to an imported-cache source", async () => {
        const importedSource = source("indexeddb-profile:local-1", [importedInfo]);
        const createImportedSource = vi.fn(() => importedSource);
        const profile: LocalCacheProfile = {
            id: "local-1",
            name: "Imported cache",
            revision: "240",
            locationNotes: "Browser storage",
        };

        const binding = await resolveProfileCacheSource(profile, {
            staticSource: source("static-range", []),
            createImportedSource,
        });

        expect(createImportedSource).toHaveBeenCalledWith(profile);
        expect(binding).toEqual({
            source: importedSource,
            info: importedInfo,
        });
    });

    it("maps Tauri system-folder profiles to a direct filesystem source", async () => {
        const systemSource = source("project-filesystem-cache:local-disk", [importedInfo]);
        const createSystemSource = vi.fn(() => systemSource);
        const createImportedSource = vi.fn(() => source("indexeddb-profile:should-not-run", []));

        const profile: LocalCacheProfile = {
            id: "local-disk",
            name: "OpenRune LIVE",
            revision: "240",
            locationNotes: "C:/openrune/.data/cache/LIVE",
            systemCachePath: "C:/openrune/.data/cache/LIVE",
            useSystemFolder: true,
        };

        const binding = await resolveProfileCacheSource(profile, {
            createSystemSource,
            createImportedSource,
        });

        expect(createSystemSource).toHaveBeenCalledWith(profile);
        expect(createImportedSource).not.toHaveBeenCalled();
        expect(binding).toEqual({
            source: systemSource,
            info: importedInfo,
        });
    });

    it("reports an unavailable imported profile without throwing", async () => {
        const profile: LocalCacheProfile = {
            id: "missing",
            name: "Missing",
            revision: "240",
            locationNotes: "",
        };

        await expect(
            hasResolvedProfileCache(profile, {
                staticSource: source("static-range", []),
                createImportedSource: () => source("indexeddb-profile:missing", []),
            }),
        ).resolves.toBe(false);
    });

    it("treats direct filesystem access failures as unavailable during repository probing", async () => {
        const profile: LocalCacheProfile = {
            id: "disk-denied",
            name: "Disk cache",
            revision: "240",
            locationNotes: "/cache",
            systemCachePath: "/cache",
            useSystemFolder: true,
        };

        await expect(
            hasResolvedProfileCache(profile, {
                createSystemSource: () => ({
                    id: "disk",
                    listCaches: async () => {
                        throw new Error("scope expired");
                    },
                    loadCache: async () => loaded(importedInfo),
                }),
            }),
        ).resolves.toBe(false);
    });

    it("loads a static profile with browser Cache Storage disabled", async () => {
        const staticSource = source("static-range", [staticInfo]);
        const profile: LocalCacheProfile = {
            id: "server:openrune-240",
            name: "OpenRune 240",
            revision: "240",
            locationNotes: "",
        };

        await expect(
            loadResolvedProfileCache(profile, { staticSource }),
        ).resolves.toEqual(loaded(staticInfo));
        expect(staticSource.loadCache).toHaveBeenCalledWith(staticInfo, {
            browserCache: false,
        });
    });
});
