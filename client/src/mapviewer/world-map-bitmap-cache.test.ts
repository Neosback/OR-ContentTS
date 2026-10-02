import { describe, expect, it } from "vitest";

import {
    WorldMapBitmapCache,
    worldMapDecodePixels,
} from "./world-map-bitmap-cache";

class FakeBitmap {
    closed = false;

    constructor(
        readonly width: number,
        readonly height: number,
    ) {}

    close(): void {
        this.closed = true;
    }
}

describe("worldMapDecodePixels", () => {
    it("matches displayed physical pixels without exceeding source resolution", () => {
        expect(worldMapDecodePixels(16, 1)).toBe(16);
        expect(worldMapDecodePixels(16, 2)).toBe(32);
        expect(worldMapDecodePixels(128, 2)).toBe(256);
        expect(worldMapDecodePixels(640, 2)).toBe(256);
    });
});

describe("WorldMapBitmapCache", () => {
    it("evicts least-recently-used unpinned bitmaps and closes them", () => {
        const cache = new WorldMapBitmapCache<string, FakeBitmap>(8 * 8 * 4 * 2);
        const a = new FakeBitmap(8, 8);
        const b = new FakeBitmap(8, 8);
        const c = new FakeBitmap(8, 8);

        cache.set("a", a);
        cache.set("b", b);
        cache.get("a");
        cache.set("c", c);

        expect(cache.get("a")).toBe(a);
        expect(cache.get("b")).toBeUndefined();
        expect(cache.get("c")).toBe(c);
        expect(b.closed).toBe(true);
        expect(a.closed).toBe(false);
        expect(c.closed).toBe(false);
    });

    it("keeps pinned visible entries even when they temporarily exceed the budget", () => {
        const cache = new WorldMapBitmapCache<string, FakeBitmap>(8 * 8 * 4);
        const a = new FakeBitmap(8, 8);
        const b = new FakeBitmap(8, 8);

        cache.set("a", a);
        cache.set("b", b, new Set(["a", "b"]));

        expect(cache.size).toBe(2);
        expect(cache.usedBytes).toBe(8 * 8 * 4 * 2);
        expect(a.closed).toBe(false);
        expect(b.closed).toBe(false);

        cache.evict(new Set(["b"]));

        expect(cache.get("a")).toBeUndefined();
        expect(cache.get("b")).toBe(b);
        expect(a.closed).toBe(true);
    });

    it("closes all decoded bitmaps on clear", () => {
        const cache = new WorldMapBitmapCache<string, FakeBitmap>();
        const a = new FakeBitmap(4, 4);
        const b = new FakeBitmap(4, 4);

        cache.set("a", a);
        cache.set("b", b);
        cache.clear();

        expect(a.closed).toBe(true);
        expect(b.closed).toBe(true);
        expect(cache.size).toBe(0);
        expect(cache.usedBytes).toBe(0);
    });
});
