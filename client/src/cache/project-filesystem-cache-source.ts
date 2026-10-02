import type { LocalCacheProfile } from "../lib/local-cache-profiles";
import type { ProjectFileEntry, ProjectFileSystem } from "../project/project-filesystem";
import { normalizeProjectPath } from "../project/project-filesystem";
import { CacheFiles } from "../rs/cache/CacheFiles";
import type { CacheInfo, GameType } from "../rs/cache/CacheInfo";
import { detectCacheType } from "../rs/cache/CacheType";
import {
    cacheRequiresMapXteas,
    parseXteaMapFromCacheFiles,
} from "../rs/cache/map-xtea";
import type { CacheLoadOptions, CacheSource, LoadedCache } from "./cache-source";
import {
    isCacheStoreFileName,
    isDat2CacheStore,
    validateCacheStoreFileNames,
} from "./cache-store-files";

function joinProjectPath(base: string, name: string): string {
    return normalizeProjectPath(base ? `${base}/${name}` : name);
}

function revisionFor(profile: LocalCacheProfile, hasDat2: boolean): number {
    const parsed = Number.parseInt(profile.revision, 10);
    return Number.isFinite(parsed) ? parsed : hasDat2 ? 700 : 317;
}

function gameFor(hasDat2: boolean): GameType {
    return hasDat2 ? "oldschool" : "runescape";
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.slice().buffer as ArrayBuffer;
}

/**
 * CacheSource backed by any ProjectFileSystem directory.
 *
 * This is the direct-filesystem path for Tauri and the reusable foundation for
 * browser File System Access. It does not persist a second cache copy in
 * IndexedDB or Cache Storage. The current synchronous cache engine still loads
 * the selected cache files into JS memory for decoding.
 */
export class ProjectFileSystemCacheSource implements CacheSource {
    readonly id: string;

    constructor(
        readonly profile: LocalCacheProfile,
        readonly fileSystem: ProjectFileSystem,
        readonly cachePath = "",
    ) {
        this.id = `project-filesystem-cache:${profile.id}:${normalizeProjectPath(cachePath)}`;
    }

    async listCaches(): Promise<CacheInfo[]> {
        const entries = await this.cacheEntries();
        const names = entries.map((entry) => entry.name);
        validateCacheStoreFileNames(names);

        let size = 0;
        let modifiedAt = 0;
        for (const entry of entries) {
            let detail = entry;
            if (detail.size == null || detail.modifiedAt == null) {
                detail = (await this.fileSystem.stat(entry.path)) ?? entry;
            }
            size += detail.size ?? 0;
            modifiedAt = Math.max(modifiedAt, detail.modifiedAt ?? 0);
        }

        const dat2 = isDat2CacheStore(names);
        return [
            {
                name: this.profile.name || "local-cache",
                game: gameFor(dat2),
                environment: "local",
                revision: revisionFor(this.profile, dat2),
                timestamp: modifiedAt > 0
                    ? new Date(modifiedAt).toISOString()
                    : "1970-01-01T00:00:00.000Z",
                size,
            },
        ];
    }

    async loadCache(
        info: CacheInfo,
        options: CacheLoadOptions = {},
    ): Promise<LoadedCache> {
        if (options.signal?.aborted) {
            throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
        }

        const [actualInfo] = await this.listCaches();
        if (
            !actualInfo ||
            actualInfo.name !== info.name ||
            actualInfo.game !== info.game ||
            actualInfo.revision !== info.revision
        ) {
            throw new Error(
                `Cache selection no longer matches filesystem profile "${this.profile.name}".`,
            );
        }

        const entries = await this.cacheEntries();
        const filesMap = new Map<string, ArrayBuffer>();
        let current = 0;
        const total = entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0);

        for (const entry of entries) {
            if (options.signal?.aborted) {
                throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
            }
            const bytes = await this.fileSystem.readBytes(entry.path);
            const buffer = bytesToArrayBuffer(bytes);
            filesMap.set(entry.name, buffer);
            current += buffer.byteLength;
            options.progressListener?.({
                total: Math.max(total, current),
                current,
                part: bytes,
            });
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

    private async cacheEntries(): Promise<ProjectFileEntry[]> {
        const path = normalizeProjectPath(this.cachePath);
        const entries = await this.fileSystem.list(path);
        return entries
            .filter(
                (entry) =>
                    entry.kind === "file" &&
                    isCacheStoreFileName(entry.name),
            )
            .sort((a, b) => a.name.localeCompare(b.name));
    }
}
