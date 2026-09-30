import type { ProgressListener } from "../rs/cache/CacheFiles";
import type { CacheFiles } from "../rs/cache/CacheFiles";
import type { CacheInfo } from "../rs/cache/CacheInfo";
import type { CacheType } from "../rs/cache/CacheType";
import type { XteaMap } from "../rs/cache/map-xtea";

export type LoadedCache = {
    info: CacheInfo;
    type: CacheType;
    files: CacheFiles;
    xteas: XteaMap;
};

export type CacheLoadOptions = {
    signal?: AbortSignal;
    progressListener?: ProgressListener;
    /**
     * Keep a copy in browser Cache Storage when the source supports it.
     * Local development sources can disable this to avoid duplicating large cache files.
     */
    browserCache?: boolean;
};

/**
 * Framework-neutral cache acquisition boundary.
 *
 * Callers consume decoded cache files and metadata without knowing whether the
 * bytes came from the local Vite range server, browser storage, or a future
 * OpenRune Studio backend.
 */
export interface CacheSource {
    readonly id: string;

    listCaches(): Promise<CacheInfo[]>;

    loadCache(info: CacheInfo, options?: CacheLoadOptions): Promise<LoadedCache>;
}
