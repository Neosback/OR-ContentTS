import { describe, expect, it } from "vitest";

import { buildPrioritySortGpuData } from "./face-priority-gpu";
import {
    buildPriorityReferenceIndices,
    comparePrioritySortReadback,
} from "./face-priority-validation";
import type { StaticObjectMesh } from "./object-mesh-merge";

function mesh(): StaticObjectMesh {
    return {
        words: new Uint32Array(0),
        indices: Uint32Array.from([
            0, 1, 2,
            3, 4, 5,
            6, 7, 8,
            9, 10, 11,
        ]),
        faceRenderPriorities: Uint8Array.from([0, 10, 2, 11]),
        // Original face order differs from opaque/alpha packing order.
        faceOrdinals: Uint32Array.from([3, 0, 2, 1]),
        priorityGroups: Uint32Array.from([0, 0, 2, 2, 2]),
        slotInfo: new Uint16Array(0),
        opaqueCount: 6,
        alphaCount: 6,
        slotCount: 1,
    };
}

describe("priority-sort readback validation", () => {
    it("rebuilds the expected mixed opaque/alpha stream from GPU depths", () => {
        const source = mesh();
        const gpu = buildPrioritySortGpuData(source);
        // ScratchFace pairs [triangle, depth], in arbitrary post-sort storage order.
        const scratch = Int32Array.from([
            1, 100,
            3, 90,
            0, 80,
            2, 40,
        ]);

        const expected = buildPriorityReferenceIndices(source, gpu.groups, scratch);

        // The reference rewrites each pass range but keeps the global opaque-then-alpha layout.
        expect(expected.length).toBe(source.indices.length);
        expect(comparePrioritySortReadback(source, gpu.groups, scratch, expected)).toEqual({
            matches: true,
            mismatchCount: 0,
            firstMismatch: undefined,
        });

        const wrong = expected.slice();
        wrong[0] ^= 1;
        expect(comparePrioritySortReadback(source, gpu.groups, scratch, wrong)).toEqual({
            matches: false,
            mismatchCount: 1,
            firstMismatch: 0,
        });
    });
});
