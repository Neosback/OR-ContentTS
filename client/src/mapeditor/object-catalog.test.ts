import { describe, expect, it } from "vitest";

import { ObjectCatalog } from "./object-catalog";

const loader = (names: (string | undefined)[]) => ({
    getCount: () => names.length,
    load: (id: number) => {
        if (names[id] === undefined && id === 3) throw new Error("missing");
        return { name: names[id] ?? "null" };
    },
});

describe("ObjectCatalog", () => {
    it("scans in the background, skips unnamed and broken types, and searches by name and id", async () => {
        const catalog = new ObjectCatalog({ locTypeLoader: loader(["Oak tree", "null", "Tree stump", undefined, "Treasure chest", "Bank booth"]) as never });
        catalog.start();
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(catalog.done).toBe(true);
        expect(catalog.entries.map((e) => e.id)).toEqual([0, 2, 4, 5]);
        expect(catalog.search("tre").map((e) => e.id)).toEqual([2, 4, 0]);
        expect(catalog.search("tree").map((e) => e.id)).toEqual([2, 0]);
        expect(catalog.search("5").map((e) => e.id)).toContain(5);
        expect(catalog.search("")).toEqual([]);
        catalog.dispose();
    });
});
