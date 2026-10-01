import type { CacheInfo } from "../rs/cache/CacheInfo";
export interface NpcSpawn {
    id: number;
    name?: string;
    x: number;
    y: number;
    level: number;
}

export interface ObjSpawn {
    id: number;
    count: number;
    x: number;
    y: number;
    plane: number;
}

export type WorldSourceContext = {
    cacheInfo: CacheInfo;
};

export type WorldLoadOptions = {
    signal?: AbortSignal;
};

export type WorldData = {
    npcSpawns: NpcSpawn[];
    objSpawns: ObjSpawn[];
};

/**
 * Framework-neutral source for world/content data that is not authoritative
 * cache-map content.
 *
 * Current Studio consumers need NPC and ground-item/object spawn snapshots.
 * Future OpenRune-backed world data such as zones/areas should extend this
 * boundary when a concrete domain model and consumer exist rather than leaking
 * backend transport details into Svelte or rendering code.
 */
export interface WorldSource {
    readonly id: string;

    loadWorld(
        context: WorldSourceContext,
        options?: WorldLoadOptions,
    ): Promise<WorldData>;
}
