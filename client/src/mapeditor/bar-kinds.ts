import type { BarItemInfo, BarKind } from "./bar-model";
import { BUILTIN_EDITOR_TOOL_PLUGINS } from "./plugins/builtins/current-plugin-layout.builtin";
import { VIEW_CONTROLS } from "./view-controls";

/**
 * The two bars the user can customize. Item ids are saved, so keep them stable: `plane`, `undo`, `redo`,
 * `search`, `view:<control id>` for the viewport bar and the tool ids for the tool rail.
 */
export const VIEWPORT_BAR_PREFIX = "view:";

/** The bar in the 3D view's tab row. */
export const VIEWPORT_BAR: BarKind = {
    storageKey: "map-editor-viewport-bar-v1",
    title: "Viewport bar",
    catalog: (): readonly BarItemInfo[] => [
        { id: "plane", label: "Plane", description: "Step the view plane up and down" },
        { id: "undo", label: "Undo", description: "Undo the last edit" },
        { id: "redo", label: "Redo", description: "Redo the edit you undid" },
        { id: "search", label: "Command palette", description: "Search commands, objects and locations (Ctrl/Cmd+K)" },
        ...VIEW_CONTROLS.map((control) => ({ id: `${VIEWPORT_BAR_PREFIX}${control.id}`, label: control.label, description: control.description })),
    ],
    defaultVisible: () => ["plane"],
};

/** The floating tool strip (select, paint, height, delete, stamp). Tool ids match `MapEditorTool`. */
export const TOOL_RAIL: BarKind = {
    storageKey: "map-editor-tool-rail-v1",
    title: "Tool strip",
    catalog: (): readonly BarItemInfo[] => {
        // Rail order, then any other registered tool (a plugin's) so it can be shown too.
        const railOrder = ["object-selector", "object-place", "tile-brush", "height", "object-delete", "region-stamp"];
        const plugins = BUILTIN_EDITOR_TOOL_PLUGINS;
        const ordered = [...railOrder.map((id) => plugins.find((plugin) => plugin.id === id)), ...plugins.filter((plugin) => !railOrder.includes(plugin.id))];
        return ordered.filter((plugin): plugin is NonNullable<typeof plugin> => plugin !== undefined).map((plugin) => ({ id: plugin.id, label: plugin.name, description: plugin.description }));
    },
    // Only what the rail showed before this was customizable.
    defaultVisible: () => ["object-selector", "object-place", "tile-brush", "height", "object-delete", "region-stamp"],
};
