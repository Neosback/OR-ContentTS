import { describe, expect, it } from "vitest";

import { LocModelType } from "../config/loctype/LocModelType";
import {
    embeddedWallDecorationShift,
    rotateWallDecorationOffset,
    wallDecorationNudge,
    wallDecorationOffset,
} from "./WallDecorationOffset";

describe("wallDecorationOffset", () => {
    it("pushes an outside decoration by the wall's displacement, per rotation", () => {
        const type = LocModelType.WALL_DECORATION_OUTSIDE;
        expect(wallDecorationOffset(type, 0, 16)).toEqual({ x: 16, y: 0 });
        expect(wallDecorationOffset(type, 1, 16)).toEqual({ x: 0, y: -16 });
        expect(wallDecorationOffset(type, 2, 32)).toEqual({ x: -32, y: 0 });
        expect(wallDecorationOffset(type, 3, 32)).toEqual({ x: 0, y: 32 });
    });

    it("uses half the displacement on the diagonals", () => {
        expect(wallDecorationOffset(LocModelType.WALL_DECORATION_DIAGONAL_OUTSIDE, 0, 16)).toEqual({ x: 8, y: -8 });
        expect(wallDecorationOffset(LocModelType.WALL_DECORATION_DIAGONAL_DOUBLE, 2, 32)).toEqual({ x: -16, y: 16 });
    });

    it("does not push inside decorations", () => {
        expect(wallDecorationOffset(LocModelType.WALL_DECORATION_INSIDE, 1, 16)).toEqual({ x: 0, y: 0 });
        expect(wallDecorationOffset(LocModelType.WALL_DECORATION_DIAGONAL_INSIDE, 3, 16)).toEqual({ x: 0, y: 0 });
    });

    it("defaults to the standard 16-unit displacement", () => {
        expect(wallDecorationOffset(LocModelType.WALL_DECORATION_OUTSIDE, 0)).toEqual({ x: 16, y: 0 });
    });
});

describe("rotateWallDecorationOffset", () => {
    it("keeps the distance from the wall and turns the direction", () => {
        const type = LocModelType.WALL_DECORATION_OUTSIDE;
        expect(rotateWallDecorationOffset(type, 1, 16, 0)).toEqual({ x: 0, y: -16 });
        expect(rotateWallDecorationOffset(type, 2, 0, -32)).toEqual({ x: -32, y: 0 });
    });

    it("turns diagonal offsets without changing their distance", () => {
        const type = LocModelType.WALL_DECORATION_DIAGONAL_OUTSIDE;
        expect(rotateWallDecorationOffset(type, 1, 8, -8)).toEqual({ x: -8, y: -8 });
    });

    it("leaves an unpushed decoration where it is", () => {
        expect(rotateWallDecorationOffset(LocModelType.WALL_DECORATION_INSIDE, 2, 0, 0)).toEqual({ x: 0, y: 0 });
    });

    it("full turn returns to the starting offset", () => {
        const type = LocModelType.WALL_DECORATION_OUTSIDE;
        let off = { x: 16, y: 0 };
        for (let rot = 1; rot <= 4; rot++) {
            off = rotateWallDecorationOffset(type, rot & 3, off.x, off.y);
        }
        expect(off).toEqual({ x: 16, y: 0 });
    });
});

describe("wallDecorationNudge", () => {
    it("matches the client's 1-unit step toward the tile interior", () => {
        const type = LocModelType.WALL_DECORATION_INSIDE;
        expect([0, 1, 2, 3].map((rot) => wallDecorationNudge(type, rot))).toEqual([
            { x: 1, y: 0 },
            { x: 0, y: -1 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
        ]);
    });

    it("only applies to inside and outside decorations", () => {
        expect(wallDecorationNudge(LocModelType.WALL_DECORATION_DIAGONAL_OUTSIDE, 1)).toEqual({ x: 0, y: 0 });
        expect(wallDecorationNudge(LocModelType.WALL, 1)).toEqual({ x: 0, y: 0 });
    });
});

describe("embeddedWallDecorationShift", () => {
    const inside = LocModelType.WALL_DECORATION_INSIDE;

    it("stands an inside decoration on the inner face of a wall on its own edge", () => {
        expect(embeddedWallDecorationShift(inside, 0, LocModelType.WALL, 0, 16)).toEqual({ x: 16, y: 0 });
        expect(embeddedWallDecorationShift(inside, 2, LocModelType.WALL, 2, 16)).toEqual({ x: -16, y: 0 });
        expect(embeddedWallDecorationShift(inside, 1, LocModelType.WALL, 1, 32)).toEqual({ x: 0, y: -32 });
    });

    it("follows the wall's own displacement", () => {
        expect(embeddedWallDecorationShift(inside, 3, LocModelType.WALL, 3, 8)).toEqual({ x: 0, y: 8 });
    });

    it("leaves decorations on a different edge than the wall alone", () => {
        expect(embeddedWallDecorationShift(inside, 0, LocModelType.WALL, 2, 16)).toEqual({ x: 0, y: 0 });
        expect(embeddedWallDecorationShift(inside, 1, LocModelType.WALL, 0, 16)).toEqual({ x: 0, y: 0 });
    });

    it("counts both legs of an L-wall", () => {
        expect(embeddedWallDecorationShift(inside, 2, LocModelType.WALL_CORNER, 2, 16)).toEqual({ x: -16, y: 0 });
        expect(embeddedWallDecorationShift(inside, 3, LocModelType.WALL_CORNER, 2, 16)).toEqual({ x: 0, y: 16 });
        expect(embeddedWallDecorationShift(inside, 0, LocModelType.WALL_CORNER, 2, 16)).toEqual({ x: 0, y: 0 });
    });

    it("only moves inside decorations", () => {
        expect(embeddedWallDecorationShift(LocModelType.WALL_DECORATION_OUTSIDE, 0, LocModelType.WALL, 0, 16)).toEqual({ x: 0, y: 0 });
        expect(embeddedWallDecorationShift(inside, 0, LocModelType.WALL_TRI_CORNER, 0, 16)).toEqual({ x: 0, y: 0 });
    });
});
