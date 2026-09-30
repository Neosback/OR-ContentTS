import { CacheFiles } from "../rs/cache/CacheFiles";
import type { ProgressListener } from "../rs/cache/CacheFiles";
import type { CacheInfo } from "../rs/cache/CacheInfo";
import type { CacheType } from "../rs/cache/CacheType";
import { detectCacheType } from "../rs/cache/CacheType";
import {
    cacheRequiresMapXteas,
    parseXteaMapFromJsonText,
    type XteaMap,
} from "../rs/cache/map-xtea";
import type { CacheLoadOptions, CacheSource, LoadedCache } from "./cache-source";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type CacheFilesLoader = (
    cacheType: CacheType,
    baseUrl: string,
    name: string,
    shared: boolean,
    signal?: AbortSignal,
    progressListener?: ProgressListener,
    browserCache?: boolean,
) => Promise<CacheFiles>;

export type StaticRangeCacheSourceOptions = {
    id?: string;
    basePath?: string;
    fetchImpl?: FetchLike;
    loadFiles?: CacheFilesLoader;
};

function normalizeBasePath(basePath: string): string {
    return basePath.endsWith("/") ? basePath : basePath + "/";
}

function defaultLoadFiles(
    cacheType: CacheType,
    baseUrl: string,
    name: string,
    shared: boolean,
    signal?: AbortSignal,
    progressListener?: ProgressListener,
    browserCache?: boolean,
): Promise<CacheFiles> {
    return CacheFiles.fetchFiles(
        cacheType,
        baseUrl,
        name,
        shared,
        signal,
        progressListener,
        browserCache,
    );
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Cache source for the Studio-owned static cache directory.
 *
 * The Vite development server and compatible deployments serve this directory
 * with HTTP Range support. The source intentionally returns the same in-memory
 * CacheFiles representation used by the renderer today.
 */
export class StaticRangeCacheSource implements CacheSource {
    readonly id: string;

    private readonly basePath: string;
    private readonly fetchImpl: FetchLike;
    private readonly loadFiles: CacheFilesLoader;

    constructor(options: StaticRangeCacheSourceOptions = {}) {
        this.id = options.id ?? "static-range";
        this.basePath = normalizeBasePath(options.basePath ?? "/caches/");
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.loadFiles = options.loadFiles ?? defaultLoadFiles;
    }

    async listCaches(): Promise<CacheInfo[]> {
        const response = await this.fetchImpl(this.basePath + "caches.json");
        if (!response.ok) {
            throw new Error(
                `Failed to list caches from ${this.basePath}caches.json: ${response.status} ${response.statusText}`,
            );
        }

        const value: unknown = await response.json();
        if (!Array.isArray(value)) {
            throw new Error("Cache source returned an invalid cache list.");
        }
        return value as CacheInfo[];
    }

    async loadCache(info: CacheInfo, options: CacheLoadOptions = {}): Promise<LoadedCache> {
        const cachePath = this.basePath + info.name + "/";
        const cacheType = detectCacheType(info);
        const files = await this.loadFiles(
            cacheType,
            cachePath,
            info.name,
            true,
            options.signal,
            options.progressListener,
            options.browserCache ?? true,
        );

        const xteas = cacheRequiresMapXteas(info)
            ? await fetchMapXteas(cachePath, options.signal, this.fetchImpl)
            : new Map<number, number[]>();

        return {
            info,
            type: cacheType,
            files,
            xteas,
        };
    }
}

async function fetchMapXteas(
    cachePath: string,
    signal: AbortSignal | undefined,
    fetchImpl: FetchLike,
): Promise<XteaMap> {
    const fromKeys = await fetchXteasOptional(cachePath + "keys.json", signal, fetchImpl);
    if (fromKeys.size > 0) {
        return fromKeys;
    }
    return fetchXteasOptional(cachePath + "xteas.json", signal, fetchImpl);
}

export async function fetchXteasOptional(
    url: RequestInfo | URL,
    signal?: AbortSignal,
    fetchImpl: FetchLike = fetch,
): Promise<XteaMap> {
    try {
        const response = await fetchImpl(url, { signal });
        if (!response.ok) {
            return new Map();
        }
        const text = await response.text();
        return parseXteaMapFromJsonText(text);
    } catch (error) {
        if (signal?.aborted || isAbortError(error)) {
            throw error;
        }
        return new Map();
    }
}

export const staticRangeCacheSource = new StaticRangeCacheSource();
