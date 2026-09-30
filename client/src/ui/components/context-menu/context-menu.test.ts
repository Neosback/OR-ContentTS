import { describe, expect, it } from "vitest";

import { clampMenuPosition } from "./context-menu.svelte";

const viewport = { width: 1000, height: 800 };
const size = { width: 200, height: 300 };

describe("clampMenuPosition", () => {
    it("keeps the anchor when the menu fits", () => {
        expect(clampMenuPosition({ x: 100, y: 100 }, size, viewport)).toEqual({ x: 100, y: 100 });
    });

    it("flips above/left of the anchor near the bottom-right edge", () => {
        expect(clampMenuPosition({ x: 950, y: 780 }, size, viewport)).toEqual({ x: 750, y: 480 });
    });

    it("never leaves the viewport margin", () => {
        const position = clampMenuPosition({ x: -50, y: -50 }, size, viewport);
        expect(position.x).toBeGreaterThanOrEqual(8);
        expect(position.y).toBeGreaterThanOrEqual(8);
    });
});
