import { describe, expect, it } from "vitest";

import { computeVirtualWindow, scrollTopToReveal } from "./virtual-window";

describe("computeVirtualWindow", () => {
    it("renders only what is in view plus overscan", () => {
        expect(computeVirtualWindow(0, 100, 20, 1000, 2)).toEqual({ start: 0, end: 8, offset: 0, total: 20000 });
        expect(computeVirtualWindow(2000, 100, 20, 1000, 2)).toEqual({ start: 98, end: 108, offset: 1960, total: 20000 });
    });

    it("clamps at the end and handles empty lists", () => {
        const end = computeVirtualWindow(19900, 100, 20, 1000, 4);
        expect(end.end).toBe(1000);
        expect(end.start).toBeLessThan(1000);
        expect(computeVirtualWindow(0, 100, 20, 0)).toEqual({ start: 0, end: 0, offset: 0, total: 0 });
        expect(computeVirtualWindow(-50, 100, 20, 3).start).toBe(0);
    });
});

describe("scrollTopToReveal", () => {
    it("moves only as far as needed", () => {
        expect(scrollTopToReveal(5, 0, 100, 20)).toBe(20);
        expect(scrollTopToReveal(1, 100, 100, 20)).toBe(20);
        expect(scrollTopToReveal(6, 100, 100, 20)).toBe(100);
    });
});
