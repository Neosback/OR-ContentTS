import { describe, expect, it } from "vitest";

import { clampRotation, clampShape, paintTileShape, resolveTileShape } from "./tile-shape-paint";

describe("resolveTileShape", () => {
    it("leaves tiles without an overlay alone", () => {
        expect(resolveTileShape({ overlay: 0, shape: 0, rotation: 0 }, { shape: 5, rotation: 2 })).toEqual({ shape: 0, rotation: 0 });
    });

    it("sets shape and rotation together on a tile with an overlay", () => {
        expect(resolveTileShape({ overlay: 4, shape: 0, rotation: 0 }, { shape: 5, rotation: 2 })).toEqual({ shape: 5, rotation: 2 });
    });

    it("keeps the tile's own value for a part that is switched off", () => {
        expect(resolveTileShape({ overlay: 4, shape: 3, rotation: 1 }, { shape: 7 })).toEqual({ shape: 7, rotation: 1 });
        expect(resolveTileShape({ overlay: 4, shape: 3, rotation: 1 }, { rotation: 3 })).toEqual({ shape: 3, rotation: 3 });
    });

    it("a full-tile overlay (shape 0) has no rotation", () => {
        expect(resolveTileShape({ overlay: 4, shape: 3, rotation: 2 }, { shape: 0 })).toEqual({ shape: 0, rotation: 0 });
        expect(resolveTileShape({ overlay: 4, shape: 0, rotation: 0 }, { rotation: 2 })).toEqual({ shape: 0, rotation: 0 });
    });

    it("clamps out-of-range values", () => {
        expect(clampShape(99)).toBe(11);
        expect(clampShape(-4)).toBe(0);
        expect(clampRotation(5)).toBe(1);
        expect(clampRotation(-1)).toBe(3);
    });
});

describe("paintTileShape", () => {
    it("reports whether the tile changed", () => {
        const tile = { overlays: 2, shape: 0, rotation: 0, set(shape: number, rotation: number) { tile.shape = shape; tile.rotation = rotation; } };
        expect(paintTileShape(tile, { shape: 4, rotation: 1 })).toBe(true);
        expect(tile).toMatchObject({ shape: 4, rotation: 1 });
        expect(paintTileShape(tile, { shape: 4, rotation: 1 })).toBe(false);
    });
});
