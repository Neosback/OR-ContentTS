import { isOpenRuneCoreActive } from "./openrune-core-loader";
import { pack_terrain_vertex_batch } from "./openrune-core/openrune_core";

export const TERRAIN_TILE_SLOT_VERTICES = 36;
export const TERRAIN_VERTEX_STRIDE = 8;
export const TERRAIN_TILE_SLOT_BYTES = TERRAIN_TILE_SLOT_VERTICES * TERRAIN_VERTEX_STRIDE;

export interface TerrainVertexBatchInput {
    tileCounts: Uint32Array;
    xs: Int32Array;
    zs: Int32Array;
    hsls: Int32Array;
    textureIndices: Int32Array;
}

function validateTerrainBatch(input: TerrainVertexBatchInput): number {
    const vertexCount = input.xs.length;
    if (
        input.zs.length !== vertexCount ||
        input.hsls.length !== vertexCount ||
        input.textureIndices.length !== vertexCount
    ) {
        throw new Error("terrain vertex arrays must have equal lengths");
    }

    let expected = 0;
    for (const count of input.tileCounts) {
        if (count > TERRAIN_TILE_SLOT_VERTICES) {
            throw new Error("terrain tile exceeds the 36-vertex slot");
        }
        expected += count;
    }
    if (expected !== vertexCount) {
        throw new Error("terrain tile counts do not match vertex array length");
    }
    return vertexCount;
}

/** Byte-identical TypeScript reference implementation of the Rust terrain batch packer. */
export function packTerrainVertexBatchTs(input: TerrainVertexBatchInput): Uint8Array {
    validateTerrainBatch(input);
    const output = new Uint8Array(input.tileCounts.length * TERRAIN_TILE_SLOT_BYTES);
    const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
    let source = 0;

    for (let tile = 0; tile < input.tileCounts.length; tile++) {
        const count = input.tileCounts[tile]!;
        const tileByteOffset = tile * TERRAIN_TILE_SLOT_BYTES;
        for (let local = 0; local < count; local++) {
            const textureIndex = input.textureIndices[source]!;
            let hsl = input.hsls[source]!;
            if (textureIndex !== -1) {
                hsl &= 127;
            }

            const offset = tileByteOffset + local * TERRAIN_VERTEX_STRIDE;
            view.setUint16(offset, input.xs[source]!, true);
            view.setUint16(offset + 2, input.zs[source]!, true);
            view.setUint16(offset + 4, hsl, true);
            view.setUint16(offset + 6, textureIndex + 1, true);
            source++;
        }
    }

    return output;
}

/** Direct WASM call, exposed separately so parity tests do not depend on the runtime preference switch. */
export function packTerrainVertexBatchWasm(input: TerrainVertexBatchInput): Uint8Array {
    validateTerrainBatch(input);
    return pack_terrain_vertex_batch(
        input.tileCounts,
        input.xs,
        input.zs,
        input.hsls,
        input.textureIndices,
    );
}

/** Runtime path: Rust/WASM when active, otherwise the TypeScript reference implementation. */
export function packTerrainVertexBatch(input: TerrainVertexBatchInput): Uint8Array {
    return isOpenRuneCoreActive()
        ? packTerrainVertexBatchWasm(input)
        : packTerrainVertexBatchTs(input);
}
