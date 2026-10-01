import type { CacheInfo } from "../rs/cache/CacheInfo";
import npcSpawns2004Url from "../mapviewer/data/npc/npc-spawns-2004.json?url";
import npcSpawns2009Url from "../mapviewer/data/npc/npc-spawns-2009.json?url";
import npcSpawnsOsrsUrl from "../mapviewer/data/npc/npc-spawns-osrs.json?url";
import objSpawnsUrl from "../mapviewer/data/obj/obj-spawns.json?url";
import type { NpcSpawn, ObjSpawn } from "./world-source";

export function getNpcSpawnsUrl(cacheInfo: CacheInfo): string {
    if (cacheInfo.game === "oldschool") {
        return npcSpawnsOsrsUrl;
    }
    return cacheInfo.revision > 474
        ? npcSpawns2009Url
        : npcSpawns2004Url;
}

export async function fetchNpcSpawns(
    url: string,
    signal?: AbortSignal,
): Promise<NpcSpawn[]> {
    const response = await fetch(url, { signal });
    return await response.json();
}

export function fetchOsrsNpcSpawns(
    signal?: AbortSignal,
): Promise<NpcSpawn[]> {
    return fetchNpcSpawns(npcSpawnsOsrsUrl, signal);
}

export function fetchLegacyNpcSpawns(
    signal?: AbortSignal,
): Promise<NpcSpawn[]> {
    return fetchNpcSpawns(npcSpawns2004Url, signal);
}

export async function fetchObjSpawns(
    signal?: AbortSignal,
): Promise<ObjSpawn[]> {
    const response = await fetch(objSpawnsUrl, { signal });
    return await response.json();
}
