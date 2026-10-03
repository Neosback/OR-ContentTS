import { describe, expect, it } from "vitest";

import { trianglesForDraw } from "./gl-memory";

describe("trianglesForDraw", () => {
    it("counts triangles for each primitive mode and ignores lines and points", () => {
        expect(trianglesForDraw(0x0004, 9)).toBe(3);
        expect(trianglesForDraw(0x0004, 10)).toBe(3);
        expect(trianglesForDraw(0x0005, 6)).toBe(4);
        expect(trianglesForDraw(0x0006, 5)).toBe(3);
        expect(trianglesForDraw(0x0001, 100)).toBe(0);
        expect(trianglesForDraw(0x0004, 2)).toBe(0);
    });
});
