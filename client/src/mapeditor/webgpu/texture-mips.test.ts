import { describe, expect, it } from "vitest";

import { generateLayerMips, mipLevelCount } from "./texture-mips";

describe("generateLayerMips", () => {
    it("builds a full chain down to 1x1 per layer", () => {
        const size = 8;
        const layers = 3;
        const mips = generateLayerMips(new Uint8Array(layers * size * size * 4).fill(100), size, layers);
        expect(mips.length).toBe(mipLevelCount(size));
        expect(mips.map((m) => m.length)).toEqual([3 * 64 * 4, 3 * 16 * 4, 3 * 4 * 4, 3 * 1 * 4]);
        expect(Array.from(mips[3])).toEqual(new Array(12).fill(100));
    });

    it("averages 2x2 blocks per channel without mixing layers", () => {
        // 2x2, two layers: layer 0 = 0/100/200/40, layer 1 = all 255.
        const base = new Uint8Array([0, 0, 0, 255, 100, 0, 0, 255, 200, 0, 0, 255, 40, 0, 0, 255, ...new Array(16).fill(255)]);
        const mips = generateLayerMips(base, 2, 2);
        expect(Array.from(mips[1])).toEqual([85, 0, 0, 255, 255, 255, 255, 255]);
    });
});
