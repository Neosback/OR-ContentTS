import { describe, expect, it } from "vitest";

import { fuzzyScore, rankByFuzzy } from "./fuzzy";

describe("fuzzy", () => {
    it("requires the characters in order", () => {
        expect(fuzzyScore("rot", "Rotate selected object")).toBeDefined();
        expect(fuzzyScore("rte", "Rotate")).toBeDefined();
        expect(fuzzyScore("tor", "Rotate")).toBeUndefined();
        expect(fuzzyScore("xyz", "Rotate")).toBeUndefined();
        expect(fuzzyScore("", "anything")).toBe(0);
    });

    it("ranks prefixes and word starts first", () => {
        const items = ["Select Roof tool", "Rotate selected object", "Open Rendering panel"];
        expect(rankByFuzzy(items, "rot", (item) => item)[0]).toBe("Rotate selected object");
        expect(rankByFuzzy(items, "ren", (item) => item)[0]).toBe("Open Rendering panel");
        expect(rankByFuzzy(items, "zzz", (item) => item)).toEqual([]);
        expect(rankByFuzzy(items, "", (item) => item)).toEqual(items);
    });
});
