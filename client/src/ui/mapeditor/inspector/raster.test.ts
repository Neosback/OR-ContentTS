import { describe, expect, it } from "vitest";

import { Rasterizer, type RasterTriangle, type RasterVertex } from "./raster";

const vertex = (x: number, y: number, z: number, r: number, g: number, b: number, u = 0, v = 0): RasterVertex => ({ x, y, z, r, g, b, u, v });

/** A triangle covering the whole of a 10x10 raster at depth `z` in a flat colour. */
function cover(z: number, r: number, g: number, b: number, extra: Partial<RasterTriangle> = {}): RasterTriangle {
    return { vertices: [vertex(-5, -5, z, r, g, b), vertex(30, -5, z, r, g, b), vertex(-5, 30, z, r, g, b)], ...extra };
}

const pixel = (raster: Rasterizer, x: number, y: number): number[] => Array.from(raster.color.slice((y * raster.width + x) * 4, (y * raster.width + x) * 4 + 4));

describe("Rasterizer", () => {
    it("keeps the nearer triangle whatever the draw order", () => {
        const near = new Rasterizer(10, 10);
        near.draw(cover(5, 255, 0, 0));
        near.draw(cover(1, 0, 255, 0)); // nearer, drawn second
        expect(pixel(near, 5, 5)).toEqual([0, 255, 0, 255]);

        const far = new Rasterizer(10, 10);
        far.draw(cover(1, 0, 255, 0)); // nearer, drawn first
        far.draw(cover(5, 255, 0, 0));
        expect(pixel(far, 5, 5)).toEqual([0, 255, 0, 255]);
    });

    it("lets the later of two coplanar triangles win within the depth tolerance", () => {
        const raster = new Rasterizer(10, 10);
        raster.depthTolerance = 0.01;
        raster.draw(cover(2, 255, 0, 0));
        raster.draw(cover(2.001, 0, 255, 0)); // a hair farther, but coplanar: later wins instead of flickering
        expect(pixel(raster, 5, 5)).toEqual([0, 255, 0, 255]);
        raster.draw(cover(3, 0, 0, 255)); // clearly farther: rejected
        expect(pixel(raster, 5, 5)).toEqual([0, 255, 0, 255]);
    });

    it("leaves untouched pixels transparent", () => {
        const raster = new Rasterizer(10, 10);
        raster.draw({ vertices: [vertex(0, 0, 1, 9, 9, 9), vertex(4, 0, 1, 9, 9, 9), vertex(0, 4, 1, 9, 9, 9)] });
        expect(pixel(raster, 1, 1)[3]).toBe(255);
        expect(pixel(raster, 9, 9)[3]).toBe(0);
    });

    it("interpolates vertex colours across a face", () => {
        const raster = new Rasterizer(10, 10);
        raster.draw({ vertices: [vertex(0, 0, 1, 255, 0, 0), vertex(10, 0, 1, 0, 0, 0), vertex(0, 10, 1, 0, 0, 0)] });
        const nearCorner = pixel(raster, 0, 0)[0];
        const farFromCorner = pixel(raster, 6, 2)[0];
        expect(nearCorner).toBeGreaterThan(farFromCorner);
    });

    it("skips texels with low alpha so the surface behind shows through", () => {
        // 2x2 texture: top row opaque white, bottom row fully transparent.
        const pixels = Int32Array.from([0xffffffff, 0xffffffff, 0x00000000, 0x00000000]);
        const raster = new Rasterizer(10, 10);
        raster.draw(cover(5, 255, 0, 0));
        raster.draw({
            vertices: [vertex(-5, -5, 1, 255, 255, 255, 0, 0), vertex(30, -5, 1, 255, 255, 255, 6, 0), vertex(-5, 30, 1, 255, 255, 255, 0, 6)],
            texture: { size: 2, pixels },
        });
        // u,v run 0..6 over 35 pixels, so pixel (5,5) is at v ~ 1.7 -> texel row 1 (transparent): red shows through.
        expect(pixel(raster, 5, 5)).toEqual([255, 0, 0, 255]);
    });

    it("blends translucent triangles over what is behind without writing depth", () => {
        const raster = new Rasterizer(10, 10);
        raster.draw(cover(5, 0, 0, 255));
        raster.draw(cover(1, 255, 0, 0, { opacity: 0.5 }));
        const [r, , b] = pixel(raster, 5, 5);
        expect(r).toBeGreaterThan(100);
        expect(b).toBeGreaterThan(100);
        // A later opaque triangle between them still draws because the glass wrote no depth.
        raster.draw(cover(3, 0, 255, 0));
        expect(pixel(raster, 5, 5)).toEqual([0, 255, 0, 255]);
    });
});
