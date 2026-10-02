import { describe, expect, it } from "vitest";

import type { DrawCommand, ModelInfo, SceneBuffer } from "../../../mapviewer/webgl/buffer/SceneBuffer";
import type { LocAnimatedData } from "../../../mapviewer/webgl/loc/LocAnimatedData";
import { SLOT_FLAG_ROOF, SLOT_INFO_STRIDE, SLOT_VERTEX_STRIDE, buildSlotMesh } from "./object-slot-mesh";

function info(overrides: Partial<ModelInfo> = {}): ModelInfo {
    return {
        sceneX: 5,
        sceneZ: 7,
        heightOffset: 16,
        level: 1,
        contourGround: 3,
        priority: 2,
        interactType: 1,
        interactId: 0x1_0005,
        ...overrides,
    };
}

/** Minimal stand-in for the parts of SceneBuffer that buildSlotMesh reads. */
function fakeSceneBuffer(
    vertexWords: number[][],
    indices: number[],
    interact: DrawCommand[],
    interactAlpha: DrawCommand[] = [],
): SceneBuffer {
    const view = new DataView(new ArrayBuffer(vertexWords.length * 12));
    vertexWords.forEach((words, v) => words.forEach((w, k) => view.setUint32(v * 12 + k * 4, w, true)));
    return {
        packedGeometry: () => ({ view, vertexCount: vertexWords.length, indices }),
        drawCommandsInteract: interact,
        drawCommandsInteractAlpha: interactAlpha,
    } as unknown as SceneBuffer;
}

function words(mesh: { vertices: Uint8Array }): Uint32Array {
    return new Uint32Array(mesh.vertices.buffer, mesh.vertices.byteOffset, mesh.vertices.byteLength / 4);
}

describe("buildSlotMesh", () => {
    it("gives every placed model its own slot and tags its vertices with it", () => {
        // One triangle drawn by two instances (e.g. a repeated tree), plus one single placement.
        const scene = fakeSceneBuffer(
            [
                [1, 2, 3],
                [4, 5, 6],
                [7, 8, 9],
            ],
            [0, 1, 2],
            [{ offset: 0, elements: 3, instances: [info({ sceneX: 1 }), info({ sceneX: 2, roof: true })] }],
        );
        const mesh = buildSlotMesh(scene, []);

        expect(mesh.slotCount).toBe(2);
        expect(mesh.staticOpaqueCount).toBe(6);
        expect(mesh.staticAlphaCount).toBe(0);
        // Each instance owns a copy of the vertices: 2 slots x 3 vertices.
        expect(mesh.vertices.length / SLOT_VERTEX_STRIDE).toBe(6);
        const w = words(mesh);
        expect([w[3], w[7], w[11]]).toEqual([0, 0, 0]);
        expect([w[15], w[19], w[23]]).toEqual([1, 1, 1]);
        expect(Array.from(mesh.indices)).toEqual([0, 1, 2, 3, 4, 5]);
        // The vertex words themselves are preserved.
        expect([w[0], w[1], w[2]]).toEqual([1, 2, 3]);

        // Slot record: x | level<<14, z | contour<<14, priority/pick bits, id, then the roof flag texel.
        expect(mesh.slotInfo[0]).toBe(1 | (1 << 14));
        expect(mesh.slotInfo[1]).toBe(7 | (3 << 14));
        expect(mesh.slotInfo[4]).toBe(0);
        expect(mesh.slotInfo[SLOT_INFO_STRIDE + 4]).toBe(SLOT_FLAG_ROOF);
    });

    it("shares one vertex between triangles of the same slot and keeps alpha geometry separate", () => {
        const scene = fakeSceneBuffer(
            [
                [1, 0, 0],
                [2, 0, 0],
                [3, 0, 0],
                [4, 0, 0],
            ],
            [0, 1, 2, 2, 1, 3],
            [{ offset: 0, elements: 3, instances: [info()] }],
            [{ offset: 12, elements: 3, instances: [info({ interactId: 9 })] }],
        );
        const mesh = buildSlotMesh(scene, []);

        expect(mesh.staticOpaqueCount).toBe(3);
        expect(mesh.staticAlphaCount).toBe(3);
        expect(mesh.slotCount).toBe(2);
        // Opaque triangle (0,1,2) and alpha triangle (2,1,3) use different slots, so vertices 2 and 1 are duplicated.
        expect(mesh.vertices.length / SLOT_VERTEX_STRIDE).toBe(6);
        expect(Array.from(mesh.indices.slice(mesh.staticOpaqueCount))).toEqual([3, 4, 5]);
    });

    it("moves animated locs out of the static draw and stores their frames per loc", () => {
        const placeholder: DrawCommand = { offset: 0, elements: 0, instances: [info({ sceneX: 9 })] };
        const scene = fakeSceneBuffer(
            [
                [1, 0, 0],
                [2, 0, 0],
                [3, 0, 0],
            ],
            [0, 1, 2, 2, 1, 0],
            [placeholder],
        );
        const animated = {
            drawRangeInteractIndex: 0,
            anim: {
                frames: [
                    [0, 3, 1],
                    [12, 3, 1],
                ],
                framesAlpha: undefined,
            },
            seqId: 42,
            randomStart: true,
        } as unknown as LocAnimatedData;
        const mesh = buildSlotMesh(scene, [animated]);

        expect(mesh.staticOpaqueCount).toBe(0);
        expect(mesh.slotCount).toBe(1);
        expect(mesh.locsAnimated).toHaveLength(1);
        const [loc] = mesh.locsAnimated;
        expect(loc.slot).toBe(0);
        expect(loc.seqId).toBe(42);
        expect(loc.frames).toEqual([
            [0, 3],
            [3, 3],
        ]);
        expect(mesh.animIndices.length).toBe(6);
        // Both frames reuse this loc's three vertices (same slot, same source vertices).
        expect(mesh.vertices.length / SLOT_VERTEX_STRIDE).toBe(3);
    });
});
