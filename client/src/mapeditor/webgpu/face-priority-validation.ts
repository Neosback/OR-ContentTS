import { prioritySortOrder } from "./face-priority-sort";
import { GPU_PRIORITY_GROUP_WORDS } from "./face-priority-gpu";
import type { StaticObjectMesh } from "./object-mesh-merge";

export interface PrioritySortValidation {
    matches: boolean;
    mismatchCount: number;
    firstMismatch?: number;
}

/**
 * Builds the CPU-reference index stream from GPU-computed per-triangle depths.
 *
 * The scratch buffer is intentionally used as the depth source here. That keeps validation focused on the priority
 * bucket/interleave logic while still exercising the real camera/contouring depth calculation performed by WGSL.
 */
export function buildPriorityReferenceIndices(
    mesh: StaticObjectMesh,
    groups: Uint32Array,
    scratchWords: Int32Array,
): Uint32Array {
    const expected = mesh.indices.slice();

    for (let group = 0; group < groups.length / GPU_PRIORITY_GROUP_WORDS; group++) {
        const base = group * GPU_PRIORITY_GROUP_WORDS;
        const opaqueFirst = groups[base + 1];
        const opaqueCount = groups[base + 2];
        const alphaFirst = groups[base + 3];
        const alphaCount = groups[base + 4];
        const scratchOffset = groups[base + 5];
        const faceCount = opaqueCount + alphaCount;

        const triangles = new Uint32Array(faceCount);
        const priorities = new Uint8Array(faceCount);
        const ordinals = new Uint32Array(faceCount);
        const depths = new Int32Array(faceCount);
        const depthByTriangle = new Map<number, number>();

        for (let i = 0; i < faceCount; i++) {
            const scratchBase = (scratchOffset + i) * 2;
            const triangle = scratchWords[scratchBase] >>> 0;
            depthByTriangle.set(triangle, scratchWords[scratchBase + 1]);
        }

        for (let i = 0; i < faceCount; i++) {
            const triangle =
                i < opaqueCount
                    ? opaqueFirst + i
                    : alphaFirst + (i - opaqueCount);
            const depth = depthByTriangle.get(triangle);
            if (depth === undefined) {
                throw new Error(`priority scratch missing triangle ${triangle}`);
            }
            triangles[i] = triangle;
            priorities[i] = mesh.faceRenderPriorities[triangle];
            ordinals[i] = mesh.faceOrdinals[triangle];
            depths[i] = depth;
        }

        const order = prioritySortOrder(priorities, depths, ordinals);
        let opaqueWrite = opaqueFirst;
        let alphaWrite = alphaFirst;
        for (const localFace of order) {
            const triangle = triangles[localFace];
            const alpha =
                alphaCount > 0 &&
                triangle >= alphaFirst &&
                triangle < alphaFirst + alphaCount;
            const destination = alpha ? alphaWrite++ : opaqueWrite++;
            const sourceBase = triangle * 3;
            const destinationBase = destination * 3;
            expected[destinationBase] = mesh.indices[sourceBase];
            expected[destinationBase + 1] = mesh.indices[sourceBase + 1];
            expected[destinationBase + 2] = mesh.indices[sourceBase + 2];
        }
    }

    return expected;
}

export function comparePrioritySortReadback(
    mesh: StaticObjectMesh,
    groups: Uint32Array,
    scratchWords: Int32Array,
    actual: Uint32Array,
): PrioritySortValidation {
    const expected = buildPriorityReferenceIndices(mesh, groups, scratchWords);
    if (actual.length !== expected.length) {
        return { matches: false, mismatchCount: Math.abs(actual.length - expected.length), firstMismatch: 0 };
    }

    let mismatchCount = 0;
    let firstMismatch: number | undefined;
    for (let i = 0; i < expected.length; i++) {
        if (actual[i] !== expected[i]) {
            mismatchCount++;
            firstMismatch ??= i;
        }
    }
    return { matches: mismatchCount === 0, mismatchCount, firstMismatch };
}
