import { describe, expect, it } from "vitest";

import { DEFAULT_EDITOR_TOOL, TOOL_RAIL_GROUPS, TOOL_RAIL_ORDER, visibleRailGroups } from "./tool-rail";

describe("tool rail", () => {
    it("starts with the Select tool, which is also the default", () => {
        expect(TOOL_RAIL_ORDER[0]).toBe("object-selector");
        expect(DEFAULT_EDITOR_TOOL).toBe("object-selector");
    });

    it("lists every tool exactly once", () => {
        expect(new Set(TOOL_RAIL_ORDER).size).toBe(TOOL_RAIL_ORDER.length);
        expect(TOOL_RAIL_GROUPS.length).toBeGreaterThan(1);
    });

    it("drops unavailable tools and empty groups", () => {
        const groups = visibleRailGroups((tool) => tool !== "object-selector" && tool !== "region-stamp");
        expect(groups[0]).toEqual(["object-place"]);
        expect(groups[1]).toEqual(["tile-brush", "height"]);
        expect(groups[2]).toEqual(["object-delete"]);
        expect(groups.flat()).not.toContain("object-selector");
        expect(visibleRailGroups(() => false)).toEqual([]);
    });
});

describe("railGroupsFor", () => {
    it("keeps the chosen order, drops unavailable tools and breaks groups where the built-in groups change", async () => {
        const { railGroupsFor } = await import("./tool-rail");
        const all = () => true;
        expect(railGroupsFor(["object-selector", "object-place", "tile-brush", "height", "object-delete", "region-stamp"], all)).toEqual([["object-selector", "object-place"], ["tile-brush", "height"], ["object-delete", "region-stamp"]]);
        expect(railGroupsFor(["height", "tile-brush", "region-stamp"], all)).toEqual([["height", "tile-brush"], ["region-stamp"]]);
        expect(railGroupsFor(["height", "tile-brush", "object-selector"], (tool) => tool !== "tile-brush")).toEqual([["height"], ["object-selector"]]);
        expect(railGroupsFor([], all)).toEqual([]);
    });
});
