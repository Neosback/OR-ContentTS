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
        expect(groups[0]).toEqual(["tile-brush"]);
        expect(groups[1]).toEqual(["object-delete"]);
        expect(groups.flat()).not.toContain("object-selector");
        expect(visibleRailGroups(() => false)).toEqual([]);
    });
});
