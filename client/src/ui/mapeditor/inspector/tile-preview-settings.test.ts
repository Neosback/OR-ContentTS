import { describe, expect, it } from "vitest";

import { DEFAULT_TILE_PREVIEW_SETTINGS, projectTilePoint, sanitizeTilePreviewSettings } from "./tile-preview-settings";

describe("tile preview settings", () => {
    it("falls back to the defaults for anything it does not recognise", () => {
        expect(sanitizeTilePreviewSettings(null)).toEqual(DEFAULT_TILE_PREVIEW_SETTINGS);
        expect(sanitizeTilePreviewSettings({ mode: "sideways", grid: 5, tilt: "high", wireframe: 1 })).toEqual(DEFAULT_TILE_PREVIEW_SETTINGS);
    });

    it("keeps valid values and clamps the tilt", () => {
        expect(sanitizeTilePreviewSettings({ mode: "raw", wireframe: true, tintFaces: true, blend: false, tilt: 12 })).toEqual({
            mode: "raw",
            wireframe: true,
            tintFaces: true,
            blend: false,
            tilt: 20,
        });
        expect(sanitizeTilePreviewSettings({ tilt: 400 }).tilt).toBe(90);
    });
});

describe("projectTilePoint", () => {
    it("looks straight down at 90 degrees: height changes nothing, north is up", () => {
        const flat = projectTilePoint(10, 20, 0, 90);
        const raised = projectTilePoint(10, 20, 50, 90);
        expect(flat.x).toBe(10);
        expect(flat.up).toBeCloseTo(20);
        expect(raised.up).toBeCloseTo(20);
    });

    it("lets height lift a point up the screen when tilted, and brings higher ground nearer", () => {
        const flat = projectTilePoint(0, 0, 0, 45);
        const raised = projectTilePoint(0, 0, 40, 45);
        expect(raised.up).toBeGreaterThan(flat.up);
        expect(raised.depth).toBeLessThan(flat.depth);
        // a point further north is both higher on screen and further away
        const north = projectTilePoint(0, 40, 0, 45);
        expect(north.up).toBeGreaterThan(flat.up);
        expect(north.depth).toBeGreaterThan(flat.depth);
    });
});
