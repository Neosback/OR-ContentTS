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

const cacheInfo: CacheInfo = {
    name: "OpenRune LIVE",
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
    it("maps basic browser profiles to imported cache storage", async () => {
        const importedSource = source("indexeddb-profile:local-1", [cacheInfo]);
        const createImportedSource = vi.fn(() => importedSource);
        const profile: LocalCacheProfile = {
            id: "local-1",
            name: "Imported cache",
            revision: "240",
            locationNotes: "Browser storage",
            setupKind: "basic",
        };

        const binding = await resolveProfileCacheSource(profile, {
            createImportedSource,
        });

        expect(createImportedSource).toHaveBeenCalledWith(profile);
        expect(binding).toEqual({
            source: importedSource,
            info: cacheInfo,
        });
    });

    it("maps basic Tauri profiles to their selected cache directory", async () => {
        const systemSource = source("project-filesystem-cache:local-disk", [cacheInfo]);
        const createSystemSource = vi.fn(() => systemSource);
        const createImportedSource = vi.fn(() =>
            source("indexeddb-profile:should-not-run", []),
        );

        const profile: LocalCacheProfile = {
            id: "local-disk",
            name: "Basic disk cache",
            revision: "240",
            locationNotes: "C:/cache",
            setupKind: "basic",
            systemCachePath: "C:/cache",
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
            info: cacheInfo,
        });
    });

    it("maps OpenRune profiles to a cache source resolved from the project root", async () => {
        const openRuneSource = source(
            "project-filesystem-cache:openrune:.data/cache/LIVE",
            [cacheInfo],
        );
        const createOpenRuneSource = vi.fn(() => openRuneSource);
        const createSystemSource = vi.fn(() =>
            source("project-filesystem-cache:wrong", []),
        );
        const createImportedSource = vi.fn(() =>
            source("indexeddb-profile:wrong", []),
        );

        const profile: LocalCacheProfile = {
            id: "openrune-1",
            name: "OpenRune",
            revision: "240",
            locationNotes: "C:/OpenRune-Server",
            setupKind: "openrune",
            openRuneRootPath: "C:/OpenRune-Server",
        };

        const binding = await resolveProfileCacheSource(profile, {
            createOpenRuneSource,
            createSystemSource,
            createImportedSource,
        });

        expect(createOpenRuneSource).toHaveBeenCalledWith(profile);
        expect(createSystemSource).not.toHaveBeenCalled();
        expect(createImportedSource).not.toHaveBeenCalled();
        expect(binding).toEqual({
            source: openRuneSource,
            info: cacheInfo,
        });
    });

    it("treats missing OpenRune LIVE as unavailable during repository probing", async () => {
        const profile: LocalCacheProfile = {
            id: "openrune-missing-live",
            name: "OpenRune",
            revision: "240",
            locationNotes: "/openrune",
            setupKind: "openrune",
            openRuneRootPath: "/openrune",
        };

        await expect(
            hasResolvedProfileCache(profile, {
                createOpenRuneSource: () => undefined,
            }),
        ).resolves.toBe(false);
    });

    it("reports an unavailable imported profile without throwing", async () => {
        const profile: LocalCacheProfile = {
            id: "missing",
            name: "Missing",
            revision: "240",
            locationNotes: "",
            setupKind: "basic",
        };

        await expect(
            hasResolvedProfileCache(profile, {
                createImportedSource: () =>
                    source("indexeddb-profile:missing", []),
            }),
        ).resolves.toBe(false);
    });

    it("loads an OpenRune project cache through its resolved LIVE source", async () => {
        const openRuneSource = source("openrune-live", [cacheInfo]);
        const profile: LocalCacheProfile = {
            id: "openrune-1",
            name: "OpenRune",
            revision: "240",
            locationNotes: "/openrune",
            setupKind: "openrune",
            openRuneRootPath: "/openrune",
        };

        await expect(
            loadResolvedProfileCache(profile, {
                createOpenRuneSource: () => openRuneSource,
            }),
        ).resolves.toEqual(loaded(cacheInfo));
        expect(openRuneSource.loadCache).toHaveBeenCalledWith(
            cacheInfo,
            undefined,
        );
    });
});
