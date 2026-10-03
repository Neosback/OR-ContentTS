import { describe, expect, it } from "vitest";

import { planGhostTile } from "./brush-ghost";

const bare = { u: 5, o: 0, s: 0, r: 0 };

describe("planGhostTile", () => {
    it("shows nothing when the stroke would not change the tile", () => {
        expect(planGhostTile({ current: bare, paint: {} })).toBeUndefined();
        expect(planGhostTile({ current: bare, paint: { underlayId: 4 } })).toBeUndefined();
    });

    it("shows a new underlay as a full square", () => {
        const plan = planGhostTile({ current: bare, paint: { underlayId: 9 } });
        expect(plan?.underlay?.value).toBe(10);
        expect(plan?.underlay?.triangles.length).toBeGreaterThan(0);
        expect(plan?.overlay).toBeUndefined();
    });

    it("clips the overlay to its shape and leaves the rest to the underlay", () => {
        const plan = planGhostTile({ current: bare, paint: { overlayId: 2, shape: 4, rotation: 1 } });
        expect(plan?.overlay?.value).toBe(3);
        expect(plan?.overlay?.triangles.length).toBeGreaterThan(0);
        expect(plan?.underlay?.value).toBe(5);
        expect(plan?.underlay?.triangles.length).toBeGreaterThan(0);
    });

    it("a full overlay leaves no underlay showing", () => {
        const plan = planGhostTile({ current: bare, paint: { overlayId: 2, shape: 0 } });
        expect(plan?.overlay).toBeDefined();
        expect(plan?.underlay).toBeUndefined();
    });

    it("applies a shape to the overlay the tile already has, and ignores tiles without one", () => {
        const withOverlay = { u: 5, o: 3, s: 0, r: 0 };
        expect(planGhostTile({ current: withOverlay, paint: { shape: 2 } })?.overlay?.value).toBe(3);
        expect(planGhostTile({ current: bare, paint: { shape: 2 } })).toBeUndefined();
    });

    it("clearing the overlay shows the underlay over the whole tile", () => {
        const plan = planGhostTile({ current: { u: 5, o: 3, s: 2, r: 1 }, paint: { overlayId: -1 } });
        expect(plan?.overlay).toBeUndefined();
        expect(plan?.underlay?.value).toBe(5);
    });

    it("carries a height to stamp, with no floor change", () => {
        expect(planGhostTile({ current: bare, paint: { height: -80 } })).toEqual({ height: -80 });
    });
});
