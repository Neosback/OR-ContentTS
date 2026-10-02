import type { vec3 } from "gl-matrix";

import type { Model } from "../rs/model/Model";
import { MeshPacker } from "./openrune-core/openrune_core";

export { MeshPacker };

const EMPTY_I32 = new Int32Array(0);
const EMPTY_I16 = new Int16Array(0);
const EMPTY_I8 = new Int8Array(0);
const EMPTY_F32 = new Float32Array(0);

/** Dense per-texture-id tables the packer indexes by texture id. */
export interface TextureTables {
    /** Texture id -> atlas array index, -1 when absent. */
    index: Int32Array;
    /** Texture id -> 1 when the texture has translucent pixels. */
    transparent: Uint8Array;
}

export function buildTextureTables(
    textureIndexMap: Map<number, number>,
    isTransparent: (textureId: number) => boolean,
): TextureTables {
    let maxId = -1;
    for (const id of textureIndexMap.keys()) maxId = Math.max(maxId, id);
    const index = new Int32Array(maxId + 1).fill(-1);
    const transparent = new Uint8Array(maxId + 1);
    for (const [id, atlasIndex] of textureIndexMap) {
        index[id] = atlasIndex;
        transparent[id] = isTransparent(id) ? 1 : 0;
    }
    return { index, transparent };
}

/**
 * The WebAssembly counterpart of `SceneBuffer.addModel` + `getModelFaces` for one pass (opaque or translucent):
 * appends the model's matching faces to the packer and returns how many indices were added.
 */
export function packModel(
    packer: MeshPacker,
    model: Model,
    transparent: boolean,
    offset?: vec3,
    reuseVertices = true,
): number {
    return packer.add_model(
        model.faceCount,
        model.verticesX,
        model.verticesY,
        model.verticesZ,
        model.contourVerticesY ?? EMPTY_I32,
        model.indices1,
        model.indices2,
        model.indices3,
        model.faceColors1,
        model.faceColors2,
        model.faceColors3,
        model.faceTextures ?? EMPTY_I16,
        model.faceAlphas ?? EMPTY_I8,
        model.faceRenderPriorities ?? EMPTY_I8,
        model.uvs ?? EMPTY_F32,
        offset !== undefined,
        offset?.[0] ?? 0,
        offset?.[1] ?? 0,
        offset?.[2] ?? 0,
        transparent,
        reuseVertices,
    );
}

/**
 * Packs one model at multiple scene offsets in one WASM call. The model arrays cross
 * the JS/WASM boundary once; returned counts match sequential `packModel` calls.
 */
export function packModelOffsets(
    packer: MeshPacker,
    model: Model,
    transparent: boolean,
    offsets: Int32Array,
    reuseVertices = true,
): Uint32Array {
    return packer.add_model_offsets(
        model.faceCount,
        model.verticesX,
        model.verticesY,
        model.verticesZ,
        model.contourVerticesY ?? EMPTY_I32,
        model.indices1,
        model.indices2,
        model.indices3,
        model.faceColors1,
        model.faceColors2,
        model.faceColors3,
        model.faceTextures ?? EMPTY_I16,
        model.faceAlphas ?? EMPTY_I8,
        model.faceRenderPriorities ?? EMPTY_I8,
        model.uvs ?? EMPTY_F32,
        offsets,
        transparent,
        reuseVertices,
    );
}

/** Result of running slot-mesh emit jobs (see `buildSlotMesh`). */
export interface SlotJobOutput {
    /** Output vertices, 4 words each: the three packed words, then the slot. */
    words: Uint32Array;
    staticIndices: Uint32Array;
    animIndices: Uint32Array;
    /** Indices each job appended to its target. */
    jobLengths: Uint32Array;
}

/** Runs the emit jobs (`[first, count, slot, target]` per job) in the wasm kernel against the packer's geometry. */
export function runSlotJobs(packer: MeshPacker, jobs: Uint32Array): SlotJobOutput {
    const output = packer.build_slot_mesh(jobs);
    const result = {
        words: output.take_words(),
        staticIndices: output.take_static_indices(),
        animIndices: output.take_anim_indices(),
        jobLengths: output.take_job_lengths(),
    };
    output.free();
    return result;
}
