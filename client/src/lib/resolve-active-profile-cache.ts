import type { LoadedCache } from "../mapviewer/Caches";
import { clearRuntimeLoadedCache, getRuntimeLoadedCache, setRuntimeLoadedCache } from "./active-cache-runtime";
import type { LocalCacheProfile } from "./local-cache-profiles";
import { hasProfileCache, loadProfileCache } from "./profile-cache-store";

/**
 * Returns the cache for `profile`: warm runtime copy if present, otherwise loads from IndexedDB
 * (full page reload clears in-memory runtime only).
 */
/**
 * In-flight loads by profile id. React StrictMode (dev) mounts effects twice, and each call used to
 * start its own full ~190 MB load; concurrent callers now share one.
 */
const inFlight = new Map<string, Promise<LoadedCache | null>>();

export async function resolveActiveProfileCache(profile: LocalCacheProfile): Promise<LoadedCache | null> {
    const warm = getRuntimeLoadedCache(profile.id);
    if (warm) {
        return warm;
    }
    const pending = inFlight.get(profile.id);
    if (pending) {
        return pending;
    }
    const load = (async () => {
        if (!(await hasProfileCache(profile.id))) {
            return null;
        }
        clearRuntimeLoadedCache();
        const loaded = await loadProfileCache(profile);
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
