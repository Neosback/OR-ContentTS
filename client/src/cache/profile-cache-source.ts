import {
    cacheSetupKind,
    type LocalCacheProfile,
} from "../lib/local-cache-profiles";
import { isTauriRuntime } from "../lib/tauri/is-tauri";
import { getActiveOpenRuneProjectRuntime } from "../lib/active-openrune-project-runtime";
import {
    openRuneProjectRootIdentity,
    resolveOpenRuneProfileFileSystem,
} from "../lib/openrune-profile-project-filesystem";
import type {
    CacheLoadOptions,
    CacheSource,
    LoadedCache,
} from "./cache-source";
import { IndexedDbProfileCacheSource } from "./indexeddb-profile-cache-source";
import { ProjectFileSystemCacheSource } from "./project-filesystem-cache-source";

export type ProfileCacheBinding = {
    source: CacheSource;
    info: Awaited<ReturnType<CacheSource["listCaches"]>>[number];
    loadOptions?: CacheLoadOptions;
};

export type ProfileCacheSourceResolverOptions = {
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

async function createOpenRuneSource(
    profile: LocalCacheProfile,
): Promise<CacheSource | undefined> {
    const rootKey = openRuneProjectRootIdentity(profile);
    const active = getActiveOpenRuneProjectRuntime(profile.id);
    if (active?.rootKey === rootKey) {
        const liveCachePath = active.snapshot.project.liveCachePath;
        if (!liveCachePath) return undefined;
        return new ProjectFileSystemCacheSource(
            profile,
            active.session.fileSystem,
            liveCachePath,
        );
    }

    // Availability probes must not mutate the globally active project runtime
    // or prompt for browser permissions.
    const fileSystem = await resolveOpenRuneProfileFileSystem(profile);
    if (!fileSystem) return undefined;

    const { indexOpenRuneProject } = await import(
        "../project/openrune-project-index"
    );
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
    const createImportedSource =
        options.createImportedSource ??
        ((candidate: LocalCacheProfile) =>
            new IndexedDbProfileCacheSource(candidate));

    if (cacheSetupKind(profile) === "openrune") {
        const source = options.createOpenRuneSource
            ? await options.createOpenRuneSource(profile)
            : await createOpenRuneSource(profile);
        if (!source) return undefined;

        const [info] = await source.listCaches();
        if (!info) return undefined;
        return { source, info };
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
        if (cacheSetupKind(profile) === "openrune") {
            throw new Error(
                `OpenRune project "${profile.name}" does not currently contain .data/cache/LIVE. The project may still be valid but needs OpenRune bootstrap before Map can load a cache.`,
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
