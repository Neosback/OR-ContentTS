import { describe, expect, it } from "vitest";

import type { PreviewModel } from "./model-preview";
import { buildCamera, clampView, DEFAULT_SCENE_VIEW, MAX_ELEVATION, renderObjectScene, type SceneTheme } from "./object-scene";
import { Rasterizer } from "./raster";

const theme: SceneTheme = { background: 0x101827, gridFill: 0x3a5a7a, gridLine: 0xb8c8dc, footprint: 0x4fa3ff };

/** A pyramid standing on y = 0 (model Y is down, so the apex has a negative Y). */
function pyramid(): PreviewModel {
    return {
        faceCount: 1,
        verticesX: Int32Array.from([-40, 40, 0]),
        verticesY: Int32Array.from([0, 0, -100]),
        verticesZ: Int32Array.from([0, 0, 0]),
        indices1: Int32Array.from([0]),
        indices2: Int32Array.from([1]),
        indices3: Int32Array.from([2]),
        faceColors: Uint16Array.from([0x2345]),
    };
}

const pixel = (out: Uint8ClampedArray, size: number, x: number, y: number): number[] => Array.from(out.slice((y * size + x) * 4, (y * size + x) * 4 + 4));

describe("object scene", () => {
    it("clamps the orbit elevation and zoom", () => {
        expect(clampView({ yaw: 5, elevation: 9, zoom: 100 })).toEqual({ yaw: 5, elevation: MAX_ELEVATION, zoom: 4 });
        expect(clampView({ yaw: 0, elevation: -9, zoom: 0 }).zoom).toBe(0.35);
    });

    it("puts the camera in front of and above the model, looking at its centre", () => {
        const camera = buildCamera(pyramid(), DEFAULT_SCENE_VIEW, 160);
        expect(camera.eye[1]).toBeGreaterThan(camera.center[1]);
        // forward points from the eye towards the centre
        const toCentre = [camera.center[0] - camera.eye[0], camera.center[1] - camera.eye[1], camera.center[2] - camera.eye[2]];
        const dot = toCentre[0] * camera.forward[0] + toCentre[1] * camera.forward[1] + toCentre[2] * camera.forward[2];
        expect(dot).toBeGreaterThan(0);
    });

    it("draws the model in the middle and the ground grid below it, with the background elsewhere", () => {
        const size = 160;
        const raster = new Rasterizer(size, size);
        const out = new Uint8ClampedArray(new ArrayBuffer(size * size * 4));
        renderObjectScene(raster, out, pyramid(), DEFAULT_SCENE_VIEW, { tilesX: 1, tilesZ: 1 }, theme);

        // Top-left corner: nothing but the background colour.
        expect(pixel(out, size, 1, 1)).toEqual([0x10, 0x18, 0x27, 255]);
        // Somewhere on the ground below the model the grid tint has changed the colour away from the background.
        let tinted = 0;
        for (let x = 0; x < size; x++) {
            const [r, g, b] = pixel(out, size, x, Math.round(size * 0.82));
            if (r !== 0x10 || g !== 0x18 || b !== 0x27) tinted++;
        }
        expect(tinted).toBeGreaterThan(10);
        // The model itself covers pixels near the centre of the view.
        const centre = pixel(out, size, size / 2, Math.round(size * 0.55));
        expect(centre[3]).toBe(255);
    });

    it("hides the grid behind the model (the model occludes it)", () => {
        const size = 160;
        const raster = new Rasterizer(size, size);
        const out = new Uint8ClampedArray(new ArrayBuffer(size * size * 4));
        renderObjectScene(raster, out, pyramid(), DEFAULT_SCENE_VIEW, { tilesX: 1, tilesZ: 1 }, theme);
        // Find a pixel the model covers and check the output uses the model colour, not the grid tint.
        let covered = -1;
        for (let i = 0; i < size * size; i++) {
            if (raster.color[i * 4 + 3] === 255) {
                covered = i;
                break;
            }
        }
        expect(covered).toBeGreaterThanOrEqual(0);
        expect(Array.from(out.slice(covered * 4, covered * 4 + 3))).toEqual(Array.from(raster.color.slice(covered * 4, covered * 4 + 3)));
    });
});
