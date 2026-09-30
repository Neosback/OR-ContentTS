import type { LoadedCache } from "../cache/cache-source";
import { resolveProfileCacheSource } from "../cache/profile-cache-source";
import {
    clearRuntimeLoadedCache,
    getRuntimeLoadedCache,
    setRuntimeLoadedCache,
} from "./active-cache-runtime";
import type { LocalCacheProfile } from "./local-cache-profiles";

/**
 * Returns the cache for `profile`: warm runtime copy if present, otherwise
 * resolves its CacheSource and loads it.
 *
 * In-flight loads by profile id are shared so repeated lifecycle/effect calls do
 * not start multiple full cache loads.
 */
const inFlight = new Map<string, Promise<LoadedCache | null>>();

export async function resolveActiveProfileCache(
    profile: LocalCacheProfile,
): Promise<LoadedCache | null> {
    const warm = getRuntimeLoadedCache(profile.id);
    if (warm) {
        return warm;
    }

    const pending = inFlight.get(profile.id);
    if (pending) {
        return pending;
    }

    const load = (async () => {
        const binding = await resolveProfileCacheSource(profile);
        if (!binding) {
            return null;
        }

        clearRuntimeLoadedCache();
        const loaded = await binding.source.loadCache(
            binding.info,
            binding.loadOptions,
        );
        setRuntimeLoadedCache(profile.id, loaded);
        return loaded;
    })();

    inFlight.set(profile.id, load);
    try {
        return await load;
    } finally {
        inFlight.delete(profile.id);
    }
}
