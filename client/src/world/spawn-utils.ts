import type { NpcSpawn, ObjSpawn } from "./world-source";

export function getMapNpcSpawns(
    spawns: NpcSpawn[],
    maxLevel: number,
    mapX: number,
    mapY: number,
): NpcSpawn[] {
    return spawns.filter((spawn) => {
        const npcMapX = (spawn.x / 64) | 0;
        const npcMapY = (spawn.y / 64) | 0;
        return (
            mapX === npcMapX &&
            mapY === npcMapY &&
            spawn.level <= maxLevel
        );
    });
}

export function getMapObjSpawns(
    spawns: ObjSpawn[],
    maxLevel: number,
    mapX: number,
    mapY: number,
): ObjSpawn[] {
    return spawns.filter((spawn) => {
        const objMapX = (spawn.x / 64) | 0;
        const objMapY = (spawn.y / 64) | 0;
        return (
            mapX === objMapX &&
            mapY === objMapY &&
            spawn.plane <= maxLevel
        );
    });
}
