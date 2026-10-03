import { PRIORITY_GROUP_WORDS } from "../webgl/loader/object-slot-mesh";
import type { StaticObjectMesh } from "./object-mesh-merge";

/** GPU group adds one word to the graphics-independent group: scratch offset. */
export const GPU_PRIORITY_GROUP_WORDS = 6;

export interface PrioritySortGpuData {
    priorities: Uint32Array;
    ordinals: Uint32Array;
    groups: Uint32Array;
    scratchFaces: number;
}

/**
 * Expands byte priorities to storage-buffer-friendly u32s and appends a contiguous scratch offset to each model
 * group. The compute shader uses one invocation per group and never needs to allocate or discover ranges on-GPU.
 */
export function buildPrioritySortGpuData(mesh: StaticObjectMesh): PrioritySortGpuData {
    if ((mesh.opaqueCount + mesh.alphaCount) % 3 !== 0) {
        throw new Error("static object index counts must describe whole triangles");
    }
    if (mesh.priorityGroups.length % PRIORITY_GROUP_WORDS !== 0) {
        throw new Error("priority group metadata has a partial group");
    }

    const triangleCount = (mesh.opaqueCount + mesh.alphaCount) / 3;
    const opaqueTriangles = mesh.opaqueCount / 3;
    if (
        mesh.faceRenderPriorities.length !== triangleCount ||
        mesh.faceOrdinals.length !== triangleCount
    ) {
        throw new Error("face priority sidecars must align with the static triangle stream");
    }

    const priorities = Uint32Array.from(mesh.faceRenderPriorities);
    const ordinals = Uint32Array.from(mesh.faceOrdinals);
    const groupCount = mesh.priorityGroups.length / PRIORITY_GROUP_WORDS;
    const covered = new Uint8Array(triangleCount);
    const groups = new Uint32Array(groupCount * GPU_PRIORITY_GROUP_WORDS);
    let scratchFaces = 0;

    for (let group = 0; group < groupCount; group++) {
        const source = group * PRIORITY_GROUP_WORDS;
        const target = group * GPU_PRIORITY_GROUP_WORDS;
        const slot = mesh.priorityGroups[source];
        const opaqueFirst = mesh.priorityGroups[source + 1];
        const opaqueCount = mesh.priorityGroups[source + 2];
        const alphaFirst = mesh.priorityGroups[source + 3];
        const alphaCount = mesh.priorityGroups[source + 4];

        if (slot >= mesh.slotCount) {
            throw new Error(`priority group ${group} references missing slot ${slot}`);
        }
        if (opaqueCount > 0 && opaqueFirst + opaqueCount > opaqueTriangles) {
            throw new Error(`priority group ${group} opaque range is outside the opaque stream`);
        }
        if (
            alphaCount > 0 &&
            (alphaFirst < opaqueTriangles || alphaFirst + alphaCount > triangleCount)
        ) {
            throw new Error(`priority group ${group} alpha range is outside the alpha stream`);
        }

        const validateRange = (first: number, count: number): void => {
            for (let triangle = first; triangle < first + count; triangle++) {
                if (covered[triangle]) {
                    throw new Error(`priority triangle ${triangle} belongs to multiple groups`);
                }
                if (mesh.faceRenderPriorities[triangle] > 11) {
                    throw new Error(`priority group ${group} includes triangle ${triangle} without explicit priority`);
                }
                covered[triangle] = 1;
            }
        };
        validateRange(opaqueFirst, opaqueCount);
        validateRange(alphaFirst, alphaCount);

        groups[target] = slot;
        groups[target + 1] = opaqueFirst;
        groups[target + 2] = opaqueCount;
        groups[target + 3] = alphaFirst;
        groups[target + 4] = alphaCount;
        groups[target + 5] = scratchFaces;
        scratchFaces += opaqueCount + alphaCount;
    }

    return { priorities, ordinals, groups, scratchFaces };
}
