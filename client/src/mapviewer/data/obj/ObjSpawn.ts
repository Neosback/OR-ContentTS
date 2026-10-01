import type { ObjSpawn } from "../../../world/world-source";
import objSpawnsUrl from "./obj-spawns.json?url";

export type { ObjSpawn } from "../../../world/world-source";
export { getMapObjSpawns } from "../../../world/spawn-utils";

export async function fetchObjSpawns(signal?: AbortSignal): Promise<ObjSpawn[]> {
    const response = await fetch(objSpawnsUrl, { signal });
    return await response.json();
}

