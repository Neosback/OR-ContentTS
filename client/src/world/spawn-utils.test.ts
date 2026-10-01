import { describe, expect, it } from "vitest";

import { getMapNpcSpawns, getMapObjSpawns } from "./spawn-utils";
import type { NpcSpawn, ObjSpawn } from "./world-source";

describe("world spawn map filtering", () => {
    it("returns NPC spawns in the requested map square up to max level", () => {
        const spawns: NpcSpawn[] = [
            { id: 1, x: 3200, y: 3200, level: 0 },
            { id: 2, x: 3263, y: 3263, level: 2 },
            { id: 3, x: 3264, y: 3200, level: 0 },
            { id: 4, x: 3200, y: 3200, level: 3 },
        ];

        expect(getMapNpcSpawns(spawns, 2, 50, 50)).toEqual([
            spawns[0],
            spawns[1],
        ]);
    });

    it("returns object spawns in the requested map square up to max plane", () => {
        const spawns: ObjSpawn[] = [
            { id: 100, count: 1, x: 3200, y: 3200, plane: 0 },
            { id: 101, count: 2, x: 3263, y: 3263, plane: 1 },
            { id: 102, count: 3, x: 3200, y: 3264, plane: 0 },
            { id: 103, count: 4, x: 3200, y: 3200, plane: 2 },
        ];

        expect(getMapObjSpawns(spawns, 1, 50, 50)).toEqual([
            spawns[0],
            spawns[1],
        ]);
    });
});
