import { describe, expect, it } from "vitest";

import { prioritySortOrder } from "./face-priority-sort";

describe("prioritySortOrder", () => {
    it("keeps faces far-to-near inside the normal priority buckets", () => {
        const priorities = Uint8Array.from([2, 0, 1, 3]);
        const depths = Int32Array.from([100, 90, 80, 70]);

        expect(Array.from(prioritySortOrder(priorities, depths))).toEqual([1, 2, 0, 3]);
    });

    it("matches RuneLite priority 10/11 threshold interleaving", () => {
        const priorities = Uint8Array.from([10, 1, 2, 11, 0, 3, 4, 10, 5, 6, 8, 11]);
        const depths = Int32Array.from([100, 60, 40, 90, 80, 30, 20, 25, 10, 15, 5, 1]);

        // Priority 10 is exhausted before priority 11 becomes the dynamic stream, exactly as RuneLite does.
        expect(Array.from(prioritySortOrder(priorities, depths))).toEqual([
            0, 4, 1, 2, 5, 6, 7, 3, 8, 9, 10, 11,
        ]);
    });

    it("uses integer threshold averages and original model order for stable depth ties", () => {
        const priorities = Uint8Array.from([10, 1, 2, 0]);
        const depths = Int32Array.from([4, 5, 4, 4]);
        const ordinals = Uint32Array.from([7, 4, 8, 2]);

        // avg(1,2) truncates to 4, so priority 10 at depth 4 does not jump priority 0.
        // The equal-depth z bucket itself follows original model face order, not opaque/alpha packing order.
        expect(Array.from(prioritySortOrder(priorities, depths, ordinals))).toEqual([3, 1, 2, 0]);
    });

    it("uses original ordinals to break equal-depth ties", () => {
        const priorities = Uint8Array.from([0, 0, 0]);
        const depths = Int32Array.from([10, 10, 10]);
        const ordinals = Uint32Array.from([9, 2, 5]);

        expect(Array.from(prioritySortOrder(priorities, depths, ordinals))).toEqual([1, 2, 0]);
    });



    it("re-evaluates dynamic priority placement when camera depths change", () => {
        const priorities = Uint8Array.from([10, 1, 2, 0]);
        const nearCamera = Int32Array.from([100, 60, 40, 80]);
        const movedCamera = Int32Array.from([10, 60, 40, 80]);

        expect(Array.from(prioritySortOrder(priorities, nearCamera))).toEqual([0, 3, 1, 2]);
        expect(Array.from(prioritySortOrder(priorities, movedCamera))).toEqual([3, 1, 2, 0]);
    });

    it("rejects invalid OSRS face priorities", () => {
        expect(() => prioritySortOrder(Uint8Array.from([12]), Int32Array.from([1]))).toThrow(
            /invalid render priority/,
        );
    });
});
