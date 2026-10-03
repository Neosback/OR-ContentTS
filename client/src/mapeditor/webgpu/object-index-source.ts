export type ObjectIndexSource = "original" | "priority";

/**
 * The sorted stream is only meaningful for maps that contain explicit OSRS face-priority groups. Maps without
 * priority groups stay on the original index buffer even while the harness is testing priority rendering.
 */
export function shouldUsePriorityIndices(source: ObjectIndexSource, priorityGroupCount: number): boolean {
    return source === "priority" && priorityGroupCount > 0;
}
