import { describe, expect, it } from "vitest";

import type { StaticObjectMesh } from "./object-mesh-merge";
import { buildPrioritySortGpuData } from "./face-priority-gpu";

function mesh(): StaticObjectMesh {
    return {
        words: new Uint32Array(0),
        indices: new Uint32Array(0),
        faceRenderPriorities: Uint8Array.from([0, 10, 2, 11, 4]),
        priorityGroups: Uint32Array.from([
            3, 0, 2, 3, 1,
            8, 2, 1, 4, 1,
        ]),
        slotInfo: new Uint16Array(0),
        opaqueCount: 0,
        alphaCount: 0,
        slotCount: 0,
    };
}

describe("buildPrioritySortGpuData", () => {
    it("widens priorities and assigns contiguous scratch ranges per model", () => {
        const data = buildPrioritySortGpuData(mesh());

        expect(Array.from(data.priorities)).toEqual([0, 10, 2, 11, 4]);
        expect(Array.from(data.groups)).toEqual([
            3, 0, 2, 3, 1, 0,
            8, 2, 1, 4, 1, 3,
        ]);
        expect(data.scratchFaces).toBe(5);
    });
});
