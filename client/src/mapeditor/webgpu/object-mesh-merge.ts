import type { EditorMapObjectChunkData } from "../webgl/loader/EditorMapObjectChunkData";
import { SLOT_INFO_STRIDE, SLOT_VERTEX_STRIDE } from "../webgl/loader/object-slot-mesh";

/**
 * One map square's static object geometry in slot form, independent of any graphics API: the same merge
 * `EditorObjectMesh.rebuildIfDirty` performs for WebGL2, without the animated-loc ranges (the WebGPU harness draws
 * the static frame only).
 */
export interface StaticObjectMesh {
    /** Four uint32 per vertex: the three packed vertex words, then the model's slot. */
    words: Uint32Array;
    /** Opaque indices first (`opaqueCount`), then the transparent ones (`alphaCount`). */
    indices: Uint32Array;
    /** One original OSRS face render priority per triangle, opaque first then transparent. */
    faceRenderPriorities: Uint8Array;
    /** SLOT_INFO_STRIDE uint16 per slot. */
    slotInfo: Uint16Array;
    opaqueCount: number;
    alphaCount: number;
    slotCount: number;
}

export function mergeStaticObjectChunks(chunks: readonly (EditorMapObjectChunkData | undefined)[]): StaticObjectMesh {
    let vertexTotal = 0;
    let slotTotal = 0;
    let opaqueTotal = 0;
    let alphaTotal = 0;
    for (const chunk of chunks) {
        if (!chunk) continue;
        vertexTotal += chunk.vertices.length / SLOT_VERTEX_STRIDE;
        slotTotal += chunk.slotCount;
        opaqueTotal += chunk.staticOpaqueCount;
        alphaTotal += chunk.staticAlphaCount;
    }

    const words = new Uint32Array(vertexTotal * 4);
    const indices = new Uint32Array(opaqueTotal + alphaTotal);
    const faceRenderPriorities = new Uint8Array((opaqueTotal + alphaTotal) / 3).fill(0xff);
    const slotInfo = new Uint16Array(Math.max(slotTotal, 1) * SLOT_INFO_STRIDE);

    let vertexBase = 0;
    let slotBase = 0;
    let opaqueCursor = 0;
    let alphaCursor = opaqueTotal;
    let opaquePriorityCursor = 0;
    let alphaPriorityCursor = opaqueTotal / 3;
    for (const chunk of chunks) {
        if (!chunk) continue;
        const vertexCount = chunk.vertices.length / SLOT_VERTEX_STRIDE;
        // The chunk's vertex bytes are not guaranteed to be 4-byte aligned inside their buffer.
        const source = new Uint32Array(vertexCount * 4);
        new Uint8Array(source.buffer).set(
            new Uint8Array(chunk.vertices.buffer, chunk.vertices.byteOffset, vertexCount * SLOT_VERTEX_STRIDE),
        );
        words.set(source, vertexBase * 4);
        for (let v = 0; v < vertexCount; v++) {
            words[(vertexBase + v) * 4 + 3] += slotBase;
        }

        for (let k = 0; k < chunk.staticOpaqueCount; k++) {
            indices[opaqueCursor + k] = chunk.indices[k] + vertexBase;
        }
        opaqueCursor += chunk.staticOpaqueCount;
        for (let k = 0; k < chunk.staticAlphaCount; k++) {
            indices[alphaCursor + k] = chunk.indices[chunk.staticOpaqueCount + k] + vertexBase;
        }
        alphaCursor += chunk.staticAlphaCount;

        const opaqueTriangles = chunk.staticOpaqueCount / 3;
        const alphaTriangles = chunk.staticAlphaCount / 3;
        faceRenderPriorities.set(
            chunk.faceRenderPriorities.subarray(0, opaqueTriangles),
            opaquePriorityCursor,
        );
        faceRenderPriorities.set(
            chunk.faceRenderPriorities.subarray(opaqueTriangles, opaqueTriangles + alphaTriangles),
            alphaPriorityCursor,
        );
        opaquePriorityCursor += opaqueTriangles;
        alphaPriorityCursor += alphaTriangles;

        slotInfo.set(chunk.slotInfo.subarray(0, chunk.slotCount * SLOT_INFO_STRIDE), slotBase * SLOT_INFO_STRIDE);
        vertexBase += vertexCount;
        slotBase += chunk.slotCount;
    }

    return {
        words,
        indices,
        faceRenderPriorities,
        slotInfo,
        opaqueCount: opaqueTotal,
        alphaCount: alphaTotal,
        slotCount: slotTotal,
    };
}
