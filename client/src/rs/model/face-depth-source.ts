import type { Model } from "./Model";

/**
 * Where the per-face depth bias of map object meshes comes from.
 *
 * - `priority`: the model's face render priorities (the original software renderer's painter order), turned into a
 *   small clip-space bias. This is what the editor has always done, and 76% of loc model faces have one.
 * - `bias`: the per-face bias authored into newer model files, the way RuneLite's GPU plugin does it (`faceBias`,
 *   `screenPos.z += bias / 128`). Only about 1.5% of faces carry one: decals and other faces that sit on another
 *   surface. Static map objects are never priority-sorted there.
 *
 * Switch with `?faceDepth=bias` (or `localStorage["openrune.faceDepth"] = "bias"`). Meshes and the object shader must
 * agree, so the choice is made once per page load and sent to the render workers.
 */
export type FaceDepthSource = "priority" | "bias";

/** The vertex word keeps 3 bits for it, stored as value + 1 (see VertexBuffer), so 0..6 is all that fits. */
export const MAX_FACE_BIAS = 6;

let source: FaceDepthSource | undefined;

export function setFaceDepthSource(next: FaceDepthSource): void {
    source = next;
}

export function getFaceDepthSource(): FaceDepthSource {
    source ??= readFaceDepthPreference();
    return source;
}

export function readFaceDepthPreference(): FaceDepthSource {
    try {
        const fromUrl = new URLSearchParams(globalThis.location?.search ?? "").get("faceDepth");
        const value = fromUrl ?? globalThis.localStorage?.getItem("openrune.faceDepth") ?? "priority";
        return value === "bias" ? "bias" : "priority";
    } catch {
        return "priority";
    }
}

const clampedBias = new WeakMap<Int8Array, Int8Array>();

/** The authored bias clamped to what the vertex word can hold. Cached per source array. */
export function clampFaceBias(bias: Int8Array): Int8Array {
    let clamped = clampedBias.get(bias);
    if (!clamped) {
        clamped = new Int8Array(bias.length);
        for (let i = 0; i < bias.length; i++) {
            clamped[i] = Math.max(0, Math.min(bias[i], MAX_FACE_BIAS));
        }
        clampedBias.set(bias, clamped);
    }
    return clamped;
}

/** The per-face values the depth bias is built from, or undefined when every face has none. */
export function faceDepthValues(model: Model, from: FaceDepthSource = getFaceDepthSource()): Int8Array | undefined {
    if (from === "priority") {
        return model.faceRenderPriorities;
    }
    return model.faceBias ? clampFaceBias(model.faceBias) : undefined;
}
