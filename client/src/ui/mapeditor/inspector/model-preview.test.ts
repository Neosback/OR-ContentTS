import { describe, expect, it } from "vitest";

import { projectModel, type PreviewModel } from "./model-preview";

/** Two triangles at different depths (z = -50 and z = +50), centred on the origin. */
function twoTriangles(): PreviewModel {
    return {
        faceCount: 2,
        verticesX: Int32Array.from([-40, 40, 0, -40, 40, 0]),
        verticesY: Int32Array.from([0, 0, -80, 0, 0, -80]),
        verticesZ: Int32Array.from([-50, -50, -50, 50, 50, 50]),
        indices1: Int32Array.from([0, 3]),
        indices2: Int32Array.from([1, 4]),
        indices3: Int32Array.from([2, 5]),
        faceColors1: Int32Array.from([0x1234, 0x2345]),
        faceColors3: Int32Array.from([-1, -1]),
    };
}

describe("projectModel", () => {
    it("fits the model inside the preview square", () => {
        const { polygons } = projectModel(twoTriangles(), 0.6, 0.3, 160, 10);
        expect(polygons).toHaveLength(2);
        for (const polygon of polygons) {
            for (const [x, y] of polygon.points) {
                expect(x).toBeGreaterThanOrEqual(0);
                expect(x).toBeLessThanOrEqual(160);
                expect(y).toBeGreaterThanOrEqual(0);
                expect(y).toBeLessThanOrEqual(160);
            }
        }
    });

    it("puts the top of the model at the top of the view and sorts far polygons first", () => {
        const { polygons } = projectModel(twoTriangles(), 0, 0, 160);
        // Model Y is down, so vertex (0, -80) (the apex) is the highest point on screen.
        const apexY = Math.min(...polygons.flatMap((p) => p.points.map((pt) => pt[1])));
        const baseY = Math.max(...polygons.flatMap((p) => p.points.map((pt) => pt[1])));
        expect(apexY).toBeLessThan(baseY);
        expect(polygons[0].depth).toBeGreaterThanOrEqual(polygons[1].depth);
    });

    it("skips hidden faces and fully transparent faces", () => {
        const model = twoTriangles();
        model.faceColors3 = Int32Array.from([-2, -1]);
        expect(projectModel(model, 0, 0, 160).polygons).toHaveLength(1);

        const transparent = twoTriangles();
        transparent.faceAlphas = Int8Array.from([0, -1]); // -1 as a byte = 255 = invisible
        expect(projectModel(transparent, 0, 0, 160).polygons).toHaveLength(1);
    });

    it("shades textured faces from the texture's average colour", () => {
        const model = twoTriangles();
        model.faceTextures = Int16Array.from([7, -1]);
        model.faceColors1 = Int32Array.from([127, 0x2345]); // full lightness on the textured face
        const { polygons } = projectModel(model, 0, 0, 160, 10, (id) => (id === 7 ? 0x804020 : undefined));
        expect(polygons.some((p) => p.rgb === 0x804020)).toBe(true);
        // Without a texture colour the face falls back to its HSL colour instead of failing.
        expect(projectModel(model, 0, 0, 160).polygons).toHaveLength(2);
    });

    it("skips hidden faces of unlit models (render type 2)", () => {
        const model = twoTriangles();
        model.faceColors1 = undefined;
        model.faceColors3 = undefined;
        model.faceColors = Uint16Array.from([127, 127]);
        model.faceRenderTypes = Int8Array.from([0, 2]);
        expect(projectModel(model, 0, 0, 160).polygons).toHaveLength(1);
    });

    it("reports the model extent and handles empty models", () => {
        expect(projectModel(twoTriangles(), 0, 0, 160).extent).toEqual({ x: 80, y: 80, z: 100 });
        const empty: PreviewModel = {
            faceCount: 0,
            verticesX: new Int32Array(0),
            verticesY: new Int32Array(0),
            verticesZ: new Int32Array(0),
            indices1: new Int32Array(0),
            indices2: new Int32Array(0),
            indices3: new Int32Array(0),
        };
        expect(projectModel(empty, 0, 0, 160).polygons).toEqual([]);
    });
});
