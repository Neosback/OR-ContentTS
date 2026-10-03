import { describe, expect, it } from "vitest";

import type { StaticObjectMesh } from "./object-mesh-merge";
import { buildPrioritySortGpuData } from "./face-priority-gpu";

function mesh(): StaticObjectMesh {
    return {
        words: new Uint32Array(0),
        indices: new Uint32Array(15),
        faceRenderPriorities: Uint8Array.from([0, 10, 2, 11, 4]),
        faceOrdinals: Uint32Array.from([4, 1, 8, 3, 9]),
        priorityGroups: Uint32Array.from([
            3, 0, 2, 3, 1,
            8, 2, 1, 4, 1,
        ]),
        slotInfo: new Uint16Array(0),
        opaqueCount: 9,
        alphaCount: 6,
        slotCount: 9,
    };
}

describe("buildPrioritySortGpuData", () => {
    it("widens priorities and assigns contiguous scratch ranges per model", () => {
        const data = buildPrioritySortGpuData(mesh());

        expect(Array.from(data.priorities)).toEqual([0, 10, 2, 11, 4]);
        expect(Array.from(data.ordinals)).toEqual([4, 1, 8, 3, 9]);
        expect(Array.from(data.groups)).toEqual([
            3, 0, 2, 3, 1, 0,
            8, 2, 1, 4, 1, 3,
        ]);
        expect(data.scratchFaces).toBe(5);
    });

    it("rejects groups that accidentally include sentinel/no-priority faces", () => {
        const source = mesh();
        source.faceRenderPriorities[1] = 0xff;

        expect(() => buildPrioritySortGpuData(source)).toThrow(/without explicit priority/);
    });

    it("rejects overlapping model ranges before they can race in compute", () => {
        const source = mesh();
        source.priorityGroups = Uint32Array.from([
            3, 0, 2, 3, 1,
            8, 1, 2, 4, 1,
        ]);

        expect(() => buildPrioritySortGpuData(source)).toThrow(/belongs to multiple groups/);
    });

    it("rejects pass ranges outside the packed opaque/alpha streams", () => {
        const source = mesh();
        source.priorityGroups = Uint32Array.from([3, 2, 2, 3, 1]);

        expect(() => buildPrioritySortGpuData(source)).toThrow(/opaque range is outside/);
    });
});
