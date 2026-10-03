import { describe, expect, it } from "vitest";

import { LocModelType } from "../../rs/config/loctype/LocModelType";
import { calculateEntityTag, EntityType } from "../../rs/scene/entity/EntityTag";
import { rotateWallDecorationData, type WallDecorationData } from "./sceneLocData";
import { refreshWallDecorationAt } from "./wall-decoration-sync";

const WALL_ID = 1902;

function fakeScene(wallTag: bigint, decoration?: { flags: number; offsetX: number; offsetY: number }) {
    const tile = {
        wallDecoration: decoration,
    };
    return {
        tiles: [[[tile]]],
        getWallTag: () => wallTag,
        tile,
    };
}

function loader(displacement: number) {
    return { load: () => ({ decorDisplacement: displacement }) };
}

describe("refreshWallDecorationAt", () => {
    const flags = LocModelType.WALL_DECORATION_OUTSIDE | (1 << 6);

    it("moves an outside decoration to the displacement of the wall it now hangs on", () => {
        const wallTag = calculateEntityTag(0, 0, EntityType.LOC, true, WALL_ID);
        const scene = fakeScene(wallTag, { flags, offsetX: 0, offsetY: -16 });
        const changed = refreshWallDecorationAt(scene as never, 0, 0, 0, loader(32) as never);
        expect(changed).toBe(true);
        expect(scene.tile.wallDecoration).toMatchObject({ offsetX: 0, offsetY: -32 });
    });

    it("falls back to the default 16 when the wall is gone", () => {
        const scene = fakeScene(0n, { flags, offsetX: 0, offsetY: -32 });
        refreshWallDecorationAt(scene as never, 0, 0, 0, loader(32) as never);
        expect(scene.tile.wallDecoration).toMatchObject({ offsetX: 0, offsetY: -16 });
    });

    it("reports no change when the offset is already right", () => {
        const scene = fakeScene(0n, { flags, offsetX: 0, offsetY: -16 });
        expect(refreshWallDecorationAt(scene as never, 0, 0, 0, loader(16) as never)).toBe(false);
    });

    it("ignores tiles without a decoration", () => {
        const scene = fakeScene(0n);
        expect(refreshWallDecorationAt(scene as never, 0, 0, 0, loader(16) as never)).toBe(false);
    });
});

describe("rotateWallDecorationData", () => {
    it("turns the offset together with the rotation flags", () => {
        const decoration: WallDecorationData = {
            tag: "1",
            flags: LocModelType.WALL_DECORATION_OUTSIDE,
            x: 64,
            y: 64,
            height: 0,
            offsetX: 16,
            offsetY: 0,
            entity0: { id: 1872, type: 4, rotation: 0, level: 1, tileX: 1, tileY: 1, seqId: -1, seqRandomStart: false },
        };
        const rotated = rotateWallDecorationData(decoration);
        expect(rotated.flags >> 6).toBe(1);
        expect(rotated).toMatchObject({ offsetX: 0, offsetY: -16 });
    });
});
