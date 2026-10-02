import {
    cacheSetupKind,
    type LocalCacheProfile,
} from "../lib/local-cache-profiles";
import { isTauriRuntime } from "../lib/tauri/is-tauri";
import type {
    CacheLoadOptions,
    CacheSource,
    LoadedCache,
} from "./cache-source";
import { IndexedDbProfileCacheSource } from "./indexeddb-profile-cache-source";
import { ProjectFileSystemCacheSource } from "./project-filesystem-cache-source";
import { staticRangeCacheSource } from "./static-range-cache-source";

export const SERVER_PROFILE_PREFIX = "server:";

export function serverProfileId(cacheName: string): string {
    return SERVER_PROFILE_PREFIX + cacheName;
}

export function serverCacheName(profileId: string): string | undefined {
    return profileId.startsWith(SERVER_PROFILE_PREFIX)
        ? profileId.slice(SERVER_PROFILE_PREFIX.length)
        : undefined;
}

export type ProfileCacheBinding = {
    source: CacheSource;
    info: Awaited<ReturnType<CacheSource["listCaches"]>>[number];
    loadOptions?: CacheLoadOptions;
};

export type ProfileCacheSourceResolverOptions = {
    staticSource?: CacheSource;
    createImportedSource?: (profile: LocalCacheProfile) => CacheSource;
    createSystemSource?: (
        profile: LocalCacheProfile,
    ) => CacheSource | undefined | Promise<CacheSource | undefined>;
    createOpenRuneSource?: (
        profile: LocalCacheProfile,
    ) => CacheSource | undefined | Promise<CacheSource | undefined>;
};

async function createTauriSystemSource(
    profile: LocalCacheProfile,
): Promise<CacheSource | undefined> {
    if (!isTauriRuntime() || !profile.systemCachePath) return undefined;

    const { TauriProjectFileSystem } = await import(
        "../project/tauri-project-filesystem"
    );
    return new ProjectFileSystemCacheSource(
        profile,
        new TauriProjectFileSystem(profile.systemCachePath),
    );
}

async function createTauriOpenRuneSource(
    profile: LocalCacheProfile,
): Promise<CacheSource | undefined> {
    if (!isTauriRuntime() || !profile.openRuneRootPath) return undefined;

    const [{ TauriProjectFileSystem }, { indexOpenRuneProject }] =
        await Promise.all([
            import("../project/tauri-project-filesystem"),
            import("../project/openrune-project-index"),
        ]);
    const fileSystem = new TauriProjectFileSystem(profile.openRuneRootPath);
    const project = await indexOpenRuneProject(fileSystem);
    if (!project.isOpenRuneProject || !project.liveCachePath) return undefined;

    return new ProjectFileSystemCacheSource(
        profile,
        fileSystem,
        project.liveCachePath,
    );
}

export async function resolveProfileCacheSource(
    profile: LocalCacheProfile,
    options: ProfileCacheSourceResolverOptions = {},
): Promise<ProfileCacheBinding | undefined> {
    const staticSource = options.staticSource ?? staticRangeCacheSource;
    const createImportedSource =
        options.createImportedSource ??
        ((candidate: LocalCacheProfile) =>
            new IndexedDbProfileCacheSource(candidate));

    if (cacheSetupKind(profile) === "openrune") {
        const source = options.createOpenRuneSource
            ? await options.createOpenRuneSource(profile)
            : await createTauriOpenRuneSource(profile);
        if (!source) return undefined;

        const [info] = await source.listCaches();
        if (!info) return undefined;
        return { source, info };
    }

    const staticCacheName = serverCacheName(profile.id);
    if (staticCacheName) {
        const info = (await staticSource.listCaches()).find(
            (candidate) => candidate.name === staticCacheName,
        );
        if (!info) return undefined;

        return {
            source: staticSource,
            info,
            // The Studio-owned local range server is already fast. Duplicating a
            // full cache in Cache Storage adds substantial browser storage and IO.
            loadOptions: { browserCache: false },
        };
    }

    if (profile.useSystemFolder && profile.systemCachePath) {
        const source = options.createSystemSource
            ? await options.createSystemSource(profile)
            : await createTauriSystemSource(profile);
        if (!source) return undefined;

        const [info] = await source.listCaches();
        if (!info) return undefined;
        return { source, info };
    }

    const source = createImportedSource(profile);
    const [info] = await source.listCaches();
    if (!info) return undefined;

    return {
        source,
        info,
    };
}

export async function hasResolvedProfileCache(
    profile: LocalCacheProfile,
    options: ProfileCacheSourceResolverOptions = {},
): Promise<boolean> {
    try {
        return (await resolveProfileCacheSource(profile, options)) !== undefined;
    } catch {
        return false;
    }
}

export async function loadResolvedProfileCache(
    profile: LocalCacheProfile,
    options: ProfileCacheSourceResolverOptions = {},
): Promise<LoadedCache> {
    const binding = await resolveProfileCacheSource(profile, options);
    if (!binding) {
        const staticCacheName = serverCacheName(profile.id);
        if (staticCacheName) {
            throw new Error(
                `The local cache source no longer serves "${staticCacheName}".`,
            );
        }
        if (cacheSetupKind(profile) === "openrune") {
            throw new Error(
                `OpenRune project "${profile.name}" is unavailable or does not currently contain .data/cache/LIVE. Re-open the OpenRune project root in Manage.`,
            );
        }
        if (profile.useSystemFolder && profile.systemCachePath) {
            throw new Error(
                `Direct cache folder access is unavailable for "${profile.name}". Re-open its cache folder in Manage.`,
            );
        }
        throw new Error(
            `No imported cache files found for profile "${profile.name}".`,
        );
    }

    return binding.source.loadCache(binding.info, binding.loadOptions);
}
