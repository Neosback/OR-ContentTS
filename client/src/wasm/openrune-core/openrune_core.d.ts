/* tslint:disable */
/* eslint-disable */

export class MeshPacker {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Adds the faces of one model that match `transparent` (the opaque or the translucent pass).
     * Returns how many indices were appended.
     *
     * Empty slices mean "the model has no such array" (`contour_y`, `face_textures`, `face_alphas`,
     * `priorities`, `uvs`). `offset` is applied (and `contour_y` used) only when `has_offset`.
     */
    add_model(face_count: number, vx: Int32Array, vy: Int32Array, vz: Int32Array, contour_y: Int32Array, indices1: Int32Array, indices2: Int32Array, indices3: Int32Array, colors1: Int32Array, colors2: Int32Array, colors3: Int32Array, face_textures: Int16Array, face_alphas: Int8Array, priorities: Int8Array, uvs: Float32Array, has_offset: boolean, offset_x: number, offset_y: number, offset_z: number, transparent: boolean, reuse_vertices: boolean): number;
    /**
     * Adds one model at multiple scene offsets while copying its model arrays across the JS/WASM boundary once.
     * Output order and per-placement counts are identical to sequential `add_model` calls.
     */
    add_model_offsets(face_count: number, vx: Int32Array, vy: Int32Array, vz: Int32Array, contour_y: Int32Array, indices1: Int32Array, indices2: Int32Array, indices3: Int32Array, colors1: Int32Array, colors2: Int32Array, colors3: Int32Array, face_textures: Int16Array, face_alphas: Int8Array, priorities: Int8Array, uvs: Float32Array, offsets: Int32Array, transparent: boolean, reuse_vertices: boolean): Uint32Array;
    /**
     * Runs the emit jobs (`[first, count, slot, target]` per job) against the packed vertices and indices.
     */
    build_slot_mesh(jobs: Uint32Array): SlotMeshOutput;
    index_count(): number;
    indices(): Uint32Array;
    constructor(texture_index: Int32Array, texture_transparent: Uint8Array, vertex_capacity: number);
    /**
     * Texture ids (not indices) of every atlas texture a face used, in first-use order.
     */
    used_texture_ids(): Uint32Array;
    vertex_count(): number;
    /**
     * Packed vertices as little-endian u32 words (3 per vertex).
     */
    vertices(): Uint32Array;
}

export class SlotMeshOutput {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    take_anim_indices(): Uint32Array;
    /**
     * Indices appended to the job's target, one entry per job.
     */
    take_job_lengths(): Uint32Array;
    take_static_indices(): Uint32Array;
    /**
     * Output vertices, 4 words each (x/y/z/uv/colour words, then the slot).
     */
    take_words(): Uint32Array;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_meshpacker_free: (a: number, b: number) => void;
    readonly __wbg_slotmeshoutput_free: (a: number, b: number) => void;
    readonly meshpacker_add_model: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number, x: number, y: number, z: number, a1: number, b1: number, c1: number, d1: number, e1: number, f1: number, g1: number, h1: number, i1: number, j1: number, k1: number) => void;
    readonly meshpacker_add_model_offsets: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number, x: number, y: number, z: number, a1: number, b1: number, c1: number, d1: number, e1: number, f1: number, g1: number, h1: number, i1: number) => void;
    readonly meshpacker_build_slot_mesh: (a: number, b: number, c: number, d: number) => void;
    readonly meshpacker_index_count: (a: number) => number;
    readonly meshpacker_indices: (a: number, b: number) => void;
    readonly meshpacker_new: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly meshpacker_used_texture_ids: (a: number, b: number) => void;
    readonly meshpacker_vertex_count: (a: number) => number;
    readonly meshpacker_vertices: (a: number, b: number) => void;
    readonly slotmeshoutput_take_anim_indices: (a: number, b: number) => void;
    readonly slotmeshoutput_take_job_lengths: (a: number, b: number) => void;
    readonly slotmeshoutput_take_static_indices: (a: number, b: number) => void;
    readonly slotmeshoutput_take_words: (a: number, b: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
