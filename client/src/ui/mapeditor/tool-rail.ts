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
