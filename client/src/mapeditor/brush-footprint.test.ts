import { describe, expect, it } from "vitest";

import { MAX_BRUSH_RADIUS, brushFootprint, clampBrushRadius } from "./brush-footprint";
import type { MapEditorBrushType } from "./map-editor-kinds";

const SHAPES: MapEditorBrushType[] = ["square", "circle", "diamond"];

describe("brushFootprint", () => {
    it("covers a single tile at radius 0 for every shape", () => {
        for (const shape of SHAPES) expect(brushFootprint(shape, 0)).toEqual([[0, 0]]);
    });

    it("square covers (2r+1)^2 tiles and diamond 2r^2+2r+1", () => {
        for (const r of [1, 2, 5, 9]) {
            expect(brushFootprint("square", r)).toHaveLength((2 * r + 1) ** 2);
            expect(brushFootprint("diamond", r)).toHaveLength(2 * r * r + 2 * r + 1);
        }
    });

    it("grows with the radius and stays symmetric, for every shape", () => {
        for (const shape of SHAPES) {
            let previous = 0;
            for (let r = 0; r <= MAX_BRUSH_RADIUS; r++) {
                const offsets = brushFootprint(shape, r);
                expect(offsets.length).toBeGreaterThan(previous);
                previous = offsets.length;
                const keys = new Set(offsets.map(([dx, dy]) => `${dx},${dy}`));
                for (const [dx, dy] of offsets) {
                    expect(keys.has(`${-dx},${-dy}`)).toBe(true);
                    expect(keys.has(`${dy},${dx}`)).toBe(true);
                    expect(Math.max(Math.abs(dx), Math.abs(dy))).toBeLessThanOrEqual(r);
                }
            }
        }
    });

    it("clamps and rounds the radius, so a changed slider value is always used", () => {
        expect(clampBrushRadius(-3)).toBe(0);
        expect(clampBrushRadius(99)).toBe(MAX_BRUSH_RADIUS);
        expect(clampBrushRadius(2.6)).toBe(3);
        expect(clampBrushRadius(Number.NaN)).toBe(0);
        expect(brushFootprint("square", 40)).toHaveLength((2 * MAX_BRUSH_RADIUS + 1) ** 2);
        expect(brushFootprint("square", 2)).not.toBe(brushFootprint("square", 3));
    });
});
