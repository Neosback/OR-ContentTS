import type { LoadedCache } from "../cache/cache-source";
import {
    fetchXteasOptional,
    staticRangeCacheSource,
} from "../cache/static-range-cache-source";
import type { ProgressListener } from "../rs/cache/CacheFiles";
import { type CacheInfo, getLatestCache } from "../rs/cache/CacheInfo";
import { parseXteaMapFromJsonText, type XteaMap } from "../rs/cache/map-xtea";

export async function fetchCacheInfos(): Promise<CacheInfo[]> {
    return staticRangeCacheSource.listCaches();
}

export type CacheList = {
    caches: CacheInfo[];
    latest: CacheInfo;
};

export async function fetchCacheList(): Promise<CacheList | undefined> {
    const caches = await fetchCacheInfos();
    const latest = getLatestCache(caches);
    if (!latest) {
        return undefined;
    }
    return {
        caches,
        latest,
    };
}

export type { LoadedCache } from "../cache/cache-source";
export type { XteaMap } from "../rs/cache/map-xtea";
export { fetchXteasOptional } from "../cache/static-range-cache-source";

export async function loadCacheFiles(
    info: CacheInfo,
    signal?: AbortSignal,
    progressListener?: ProgressListener,
    /** false skips the browser's Cache Storage copy (a local dev server is already fast). */
    browserCache: boolean = true,
): Promise<LoadedCache> {
    return staticRangeCacheSource.loadCache(info, {
        signal,
        progressListener,
        browserCache,
    });
}

/** @deprecated Prefer {@link fetchXteasOptional} or revision-aware loading via {@link loadCacheFiles}. */
export async function fetchXteas(url: RequestInfo, signal?: AbortSignal): Promise<XteaMap> {
    const resp = await fetch(url, { signal });
    if (!resp.ok) {
        throw new Error(`Failed to load map keys: ${resp.status} ${resp.statusText}`);
    }
    const text = await resp.text();
    return parseXteaMapFromJsonText(text);
}
