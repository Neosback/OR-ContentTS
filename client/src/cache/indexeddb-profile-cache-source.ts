import { CacheFiles } from "../rs/cache/CacheFiles";
import type { CacheInfo } from "../rs/cache/CacheInfo";
import { detectCacheType } from "../rs/cache/CacheType";
import {
    cacheRequiresMapXteas,
    parseXteaMapFromCacheFiles,
} from "../rs/cache/map-xtea";
import type { LocalCacheProfile } from "../lib/local-cache-profiles";
import {
    readImportedProfileCache,
    type StoredProfileCache,
} from "../lib/profile-cache-store";
import type { CacheLoadOptions, CacheSource, LoadedCache } from "./cache-source";

type ProfileCacheReader = (
    profileId: string,
) => Promise<StoredProfileCache | undefined>;

export type IndexedDbProfileCacheSourceOptions = {
    readRecord?: ProfileCacheReader;
};

function shareCacheFile(name: string, data: ArrayBuffer): ArrayBuffer {
    const canShare =
        typeof SharedArrayBuffer !== "undefined" &&
        typeof crossOriginIsolated !== "undefined" &&
        crossOriginIsolated &&
        name.startsWith("main_file_cache.");
    if (!canShare) return data;

    const shared = new SharedArrayBuffer(data.byteLength);
    new Uint8Array(shared).set(new Uint8Array(data));
    return shared as unknown as ArrayBuffer;
}

function buildInfo(
    profile: LocalCacheProfile,
    record: StoredProfileCache,
): CacheInfo {
    const entries = Object.entries(record.files);
    const hasDat2 = entries.some(([name]) => name === CacheFiles.DAT2_FILE_NAME);
    const parsedRevision = Number.parseInt(profile.revision, 10);
    const revision = Number.isFinite(parsedRevision)
        ? parsedRevision
        : hasDat2
          ? 700
          : 317;

    let size = 0;
    for (const [, buffer] of entries) {
        size += buffer.byteLength;
    }

    return {
        name: profile.name || "local-cache",
        game: hasDat2 ? "oldschool" : "runescape",
        environment: "local",
        revision,
        timestamp: record.savedAt,
        size,
    };
}

/**
 * CacheSource for a single cache profile imported into browser IndexedDB.
 *
 * The source is bound to one profile so profile metadata remains outside the
 * generic CacheSource contract while callers still consume the same LoadedCache
 * representation as static/range-backed sources.
 */
export class IndexedDbProfileCacheSource implements CacheSource {
    readonly id: string;

    private readonly readRecord: ProfileCacheReader;

    constructor(
        readonly profile: LocalCacheProfile,
        options: IndexedDbProfileCacheSourceOptions = {},
    ) {
        this.id = `indexeddb-profile:${profile.id}`;
        this.readRecord = options.readRecord ?? readImportedProfileCache;
    }

    async listCaches(): Promise<CacheInfo[]> {
        const record = await this.readRecord(this.profile.id);
        if (!record || Object.keys(record.files).length === 0) {
            return [];
        }
        return [buildInfo(this.profile, record)];
    }

    async loadCache(
        info: CacheInfo,
        options: CacheLoadOptions = {},
    ): Promise<LoadedCache> {
        if (options.signal?.aborted) {
            throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
        }

        const record = await this.readRecord(this.profile.id);
        if (!record || Object.keys(record.files).length === 0) {
            throw new Error(
                `No imported cache files found for profile "${this.profile.name}".`,
            );
        }

        if (options.signal?.aborted) {
            throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
        }

        const actualInfo = buildInfo(this.profile, record);
        if (
            info.name !== actualInfo.name ||
            info.game !== actualInfo.game ||
            info.revision !== actualInfo.revision
        ) {
            throw new Error(
                `Cache selection no longer matches imported profile "${this.profile.name}".`,
            );
        }

        const filesMap = new Map<string, ArrayBuffer>();
        for (const [name, data] of Object.entries(record.files)) {
            filesMap.set(name, shareCacheFile(name, data));
        }

        const type = detectCacheType(actualInfo);
        const files = new CacheFiles(filesMap);
        const xteas = cacheRequiresMapXteas(actualInfo)
            ? parseXteaMapFromCacheFiles(filesMap)
            : new Map<number, number[]>();

        return {
            info: actualInfo,
            type,
            files,
            xteas,
        };
    }
}
