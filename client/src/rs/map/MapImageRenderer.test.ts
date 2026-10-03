import { describe, expect, it } from "vitest";

import type { LocTypeLoader } from "../config/loctype/LocTypeLoader";
import { Scene } from "../scene/Scene";
import { EntityType, calculateEntityTag } from "../scene/entity/EntityTag";
import type { Entity } from "../scene/entity/Entity";
import { MapImageRenderer } from "./MapImageRenderer";

const entity = {} as Entity;
const types: Record<number, { mapFunctionId: number; sizeX: number; sizeY: number }> = {
    10: { mapFunctionId: 0, sizeX: 1, sizeY: 1 }, // a bank booth: an ordinary object
    11: { mapFunctionId: 4, sizeX: 2, sizeY: 1 }, // an altar-like wall decoration
    12: { mapFunctionId: -1, sizeX: 1, sizeY: 1 },
};
const locTypeLoader = { load: (id: number) => types[id] ?? { mapFunctionId: -1, sizeX: 1, sizeY: 1 } } as unknown as LocTypeLoader;

function sceneWithOpenTiles(): Scene {
    const scene = new Scene(4, 16, 16);
    for (let level = 0; level < 4; level++) for (let x = 0; x < 16; x++) scene.tileRenderFlags[level][x].fill(0);
    return scene;
}

describe("map function icons", () => {
    const renderer = new MapImageRenderer({} as never, locTypeLoader, [], []);

    it("finds icons on every kind of object, not only floor decorations", () => {
        const scene = sceneWithOpenTiles();
        scene.newLoc(0, 3, 4, 0, 1, 1, entity, 0, calculateEntityTag(3, 4, EntityType.LOC, true, 10), 10);
        scene.newWallDecoration(0, 6, 7, 0, entity, undefined, 0, 0, calculateEntityTag(6, 7, EntityType.LOC, false, 11), 0);
        scene.newFloorDecoration(0, 9, 9, 0, entity, calculateEntityTag(9, 9, EntityType.LOC, false, 12), 0);

        const found = renderer.mapFunctionPlacements(scene, 0);
        expect(found).toEqual([
            { mapFunctionId: 0, tileX: 3, tileY: 4, sizeX: 1, sizeY: 1 },
            { mapFunctionId: 4, tileX: 6, tileY: 7, sizeX: 2, sizeY: 1 },
        ]);
    });

    it("skips tiles hidden under a bridge or roof and other levels", () => {
        const scene = sceneWithOpenTiles();
        scene.newLoc(0, 3, 4, 0, 1, 1, entity, 0, calculateEntityTag(3, 4, EntityType.LOC, true, 10), 10);
        scene.newLoc(1, 5, 5, 0, 1, 1, entity, 0, calculateEntityTag(5, 5, EntityType.LOC, true, 10), 10);
        scene.tileRenderFlags[0][3][4] = 0x8; // not drawn on the minimap at this level
        expect(renderer.mapFunctionPlacements(scene, 0)).toEqual([]);
    });
});
