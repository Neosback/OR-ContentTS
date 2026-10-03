import { describe, expect, it } from "vitest";

import {
    PRIORITY_GROUP_WORDS,
    SLOT_INFO_STRIDE,
    SLOT_VERTEX_STRIDE,
} from "../webgl/loader/object-slot-mesh";
import type { EditorMapObjectChunkData } from "../webgl/loader/EditorMapObjectChunkData";
import { mergeStaticObjectChunks } from "./object-mesh-merge";

function chunk(
    chunkId: number,
    vertexCount: number,
    slotCount: number,
    opaque: number[],
    alpha: number[],
    priorities: number[],
    priorityGroups: number[] = [],
): EditorMapObjectChunkData {
    const vertices = new Uint8Array(vertexCount * SLOT_VERTEX_STRIDE);
    const words = new Uint32Array(vertices.buffer);
    for (let v = 0; v < vertexCount; v++) {
        words[v * 4] = chunkId * 1000 + v;
        words[v * 4 + 3] = v % slotCount; // slot local to the chunk
    }
    const slotInfo = new Uint16Array(slotCount * SLOT_INFO_STRIDE);
    for (let s = 0; s < slotCount; s++) slotInfo[s * SLOT_INFO_STRIDE] = chunkId * 100 + s;
    return {
        chunkId,
        vertices,
        indices: Int32Array.from([...opaque, ...alpha]),
        staticOpaqueCount: opaque.length,
        staticAlphaCount: alpha.length,
        faceRenderPriorities: Uint8Array.from(priorities),
        priorityGroups: Uint32Array.from(priorityGroups),
        animIndices: new Int32Array(0),
        slotInfo,
        slotCount,
        locsAnimated: [],
    };
}

describe("mergeStaticObjectChunks", () => {
    it("offsets vertices, slots and indices per chunk and keeps opaque before transparent", () => {
        const merged = mergeStaticObjectChunks([
            chunk(
                0,
                3,
                2,
                [0, 1, 2],
                [2, 1, 0],
                [2, 10],
                [1, 0, 1, 1, 1],
            ),
            undefined,
            chunk(
                5,
                4,
                3,
                [0, 2, 3],
                [1, 2, 3],
                [4, 11],
                [2, 0, 1, 1, 1],
            ),
        ]);

        expect(merged.opaqueCount).toBe(6);
        expect(merged.alphaCount).toBe(6);
        expect(merged.slotCount).toBe(5);
        expect(merged.words.length).toBe(7 * 4);

        // Second chunk starts after 3 vertices and 2 slots.
        expect(Array.from(merged.indices)).toEqual([0, 1, 2, 3, 5, 6, 2, 1, 0, 4, 5, 6]);
        expect(merged.words[3 * 4]).toBe(5000);
        expect(merged.words[3 * 4 + 3]).toBe(0 + 2);
        expect(merged.words[6 * 4 + 3]).toBe((6 - 3) % 3 + 2);
        expect(merged.slotInfo[2 * SLOT_INFO_STRIDE]).toBe(500);
        // Priorities follow the same map-wide opaque-then-alpha ordering as the merged index buffer.
        expect(Array.from(merged.faceRenderPriorities)).toEqual([2, 4, 10, 11]);
        expect(merged.priorityGroups.length).toBe(2 * PRIORITY_GROUP_WORDS);
        expect(Array.from(merged.priorityGroups)).toEqual([
            1, 0, 1, 2, 1,
            4, 1, 1, 3, 1,
        ]);
    });

    it("handles no chunks", () => {
        const merged = mergeStaticObjectChunks([undefined]);
        expect(merged.opaqueCount + merged.alphaCount + merged.slotCount).toBe(0);
        expect(merged.words.length).toBe(0);
        expect(merged.faceRenderPriorities.length).toBe(0);
        expect(merged.priorityGroups.length).toBe(0);
    });
});
