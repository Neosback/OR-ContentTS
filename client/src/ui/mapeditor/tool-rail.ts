import type { MapEditorTool } from "../../mapeditor/map-editor-kinds";

/**
 * The tool rail: one flat column, like the reference client's. The Select tool comes first and is what the editor
 * opens with; it picks both tiles and objects. Dividers separate the groups.
 */
export const TOOL_RAIL_GROUPS: readonly (readonly MapEditorTool[])[] = [
    ["object-selector"],
    ["tile-brush", "height"],
    ["object-delete", "region-stamp"],
];

/** Tool the editor opens with: Select, the top of the rail. */
export const DEFAULT_EDITOR_TOOL: MapEditorTool = "object-selector";

/** Tools in rail order, for ordering palette tabs the same way. */
export const TOOL_RAIL_ORDER: readonly MapEditorTool[] = TOOL_RAIL_GROUPS.flat();

/** Tools of `groups` that are currently available, dropping groups that end up empty. */
export function visibleRailGroups(isAvailable: (tool: MapEditorTool) => boolean): MapEditorTool[][] {
    return TOOL_RAIL_GROUPS.map((group) => group.filter(isAvailable)).filter((group) => group.length > 0);
}

/**
 * The rail's groups for a chosen list of tools (in the user's order): consecutive tools that belong to different
 * built-in groups are separated by a divider, tools the rail does not know sit in their own trailing group.
 */
export function railGroupsFor(chosen: readonly string[], isAvailable: (tool: MapEditorTool) => boolean): MapEditorTool[][] {
    const groupOf = (tool: string): number => {
        const index = TOOL_RAIL_GROUPS.findIndex((group) => (group as readonly string[]).includes(tool));
        return index < 0 ? TOOL_RAIL_GROUPS.length : index;
    };
    const groups: MapEditorTool[][] = [];
    let current: MapEditorTool[] = [];
    let currentGroup = -1;
    for (const id of chosen) {
        const tool = id as MapEditorTool;
        if (!isAvailable(tool)) continue;
        const group = groupOf(id);
        if (current.length > 0 && group !== currentGroup) {
            groups.push(current);
            current = [];
        }
        currentGroup = group;
        current.push(tool);
    }
    if (current.length > 0) groups.push(current);
    return groups;
}
