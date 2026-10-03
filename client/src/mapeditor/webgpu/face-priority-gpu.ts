import { PRIORITY_GROUP_WORDS } from "../webgl/loader/object-slot-mesh";
import type { StaticObjectMesh } from "./object-mesh-merge";

/** GPU group adds one word to the graphics-independent group: scratch offset. */
export const GPU_PRIORITY_GROUP_WORDS = 6;

export interface PrioritySortGpuData {
    priorities: Uint32Array;
    groups: Uint32Array;
    scratchFaces: number;
}

/**
 * Expands byte priorities to storage-buffer-friendly u32s and appends a contiguous scratch offset to each model
 * group. The compute shader uses one invocation per group and never needs to allocate or discover ranges on-GPU.
 */
export function buildPrioritySortGpuData(mesh: StaticObjectMesh): PrioritySortGpuData {
    const priorities = Uint32Array.from(mesh.faceRenderPriorities);
    const groupCount = mesh.priorityGroups.length / PRIORITY_GROUP_WORDS;
    const groups = new Uint32Array(groupCount * GPU_PRIORITY_GROUP_WORDS);
    let scratchFaces = 0;

    for (let group = 0; group < groupCount; group++) {
        const source = group * PRIORITY_GROUP_WORDS;
        const target = group * GPU_PRIORITY_GROUP_WORDS;
        const opaqueCount = mesh.priorityGroups[source + 2];
        const alphaCount = mesh.priorityGroups[source + 4];

        groups[target] = mesh.priorityGroups[source];
        groups[target + 1] = mesh.priorityGroups[source + 1];
        groups[target + 2] = opaqueCount;
        groups[target + 3] = mesh.priorityGroups[source + 3];
        groups[target + 4] = alphaCount;
        groups[target + 5] = scratchFaces;
        scratchFaces += opaqueCount + alphaCount;
    }

    return { priorities, groups, scratchFaces };
}
