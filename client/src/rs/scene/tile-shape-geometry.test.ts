import { describe, expect, it } from "vitest";

import { getTileShapeTriangles, type TileShapeTriangle } from "./SceneTileModel";

const area = (triangles: readonly TileShapeTriangle[]): number =>
    triangles.reduce((sum, [x0, y0, x1, y1, x2, y2]) => sum + Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) / 2, 0);

describe("getTileShapeTriangles", () => {
    it("a tile without an overlay is a full underlay square", () => {
        const { underlay, overlay } = getTileShapeTriangles(undefined, 0);
        expect(overlay).toHaveLength(0);
        expect(area(underlay)).toBeCloseTo(1);
    });

    it("shape 0 is a full overlay tile at every rotation", () => {
        for (let rotation = 0; rotation < 4; rotation++) {
            const { underlay, overlay } = getTileShapeTriangles(0, rotation);
            expect(underlay).toHaveLength(0);
            expect(area(overlay)).toBeCloseTo(1);
        }
    });

    it("every shape and rotation covers the whole tile between its underlay and overlay", () => {
        for (let shape = 0; shape < 12; shape++) {
            for (let rotation = 0; rotation < 4; rotation++) {
                const { underlay, overlay } = getTileShapeTriangles(shape, rotation);
                expect(area(underlay) + area(overlay)).toBeCloseTo(1, 5);
            }
        }
    });

    it("rotating a shape keeps its overlay area but moves it", () => {
        for (const shape of [1, 3, 6, 9]) {
            const base = getTileShapeTriangles(shape, 0).overlay;
            for (let rotation = 1; rotation < 4; rotation++) {
                const turned = getTileShapeTriangles(shape, rotation).overlay;
                expect(area(turned)).toBeCloseTo(area(base), 5);
                expect(JSON.stringify(turned)).not.toBe(JSON.stringify(base));
            }
        }
    });

    it("stays inside the unit square", () => {
        for (let shape = 0; shape < 12; shape++) {
            for (const [x0, y0, x1, y1, x2, y2] of getTileShapeTriangles(shape, 1).overlay) {
                for (const v of [x0, y0, x1, y1, x2, y2]) {
                    expect(v).toBeGreaterThanOrEqual(0);
                    expect(v).toBeLessThanOrEqual(1);
                }
            }
        }
    });
});
