import type { CacheInfo } from "../rs/cache/CacheInfo";
import type { NpcSpawn } from "../mapviewer/data/npc/NpcSpawn";
import type { ObjSpawn } from "../mapviewer/data/obj/ObjSpawn";

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
