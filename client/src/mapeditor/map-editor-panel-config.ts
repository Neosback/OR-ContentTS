import type { MapEditorTool } from "./map-editor-kinds";
import type { MapEditorDockPanelId } from "./plugins/builtins/builtin-plugin-types";

export type MapEditorFloatablePanelConfig = {
    panelId: MapEditorDockPanelId;
    title: string;
    canExternal?: boolean;
    defaultWidth?: number;
    defaultHeight?: number;
};

/** Palette-style panels that can be docked, floated or popped out. */
export const MAP_EDITOR_FLOATABLE_DOCK_PANELS: readonly MapEditorFloatablePanelConfig[] = [
    { panelId: "editor-object-selector", title: "Object", canExternal: true, defaultWidth: 380, defaultHeight: 420 },
    { panelId: "editor-inspector-tile", title: "Tile", canExternal: true, defaultWidth: 380, defaultHeight: 420 },
    { panelId: "editor-object-delete", title: "Delete objects", canExternal: true, defaultWidth: 380, defaultHeight: 420 },
    { panelId: "editor-region-stamp", title: "Region stamp", canExternal: true, defaultWidth: 380, defaultHeight: 420 },
    { panelId: "editor-height", title: "Height", canExternal: true, defaultWidth: 380, defaultHeight: 420 },
    { panelId: "editor-tile-painter", title: "Tile painter", canExternal: true, defaultWidth: 900, defaultHeight: 320 },
    { panelId: "editor-rendering", title: "Rendering", canExternal: true, defaultWidth: 340, defaultHeight: 520 },
    { panelId: "editor-history", title: "History", canExternal: true, defaultWidth: 420, defaultHeight: 380 },
    { panelId: "editor-minimap", title: "Minimap", canExternal: true, defaultWidth: 360, defaultHeight: 360 },
];

/** Dock panel for each paint tool's palette tab. */
export const EDITOR_TOOL_DOCK_PANEL: Partial<Record<MapEditorTool, MapEditorDockPanelId>> = {
    "tile-brush": "editor-tile-painter",
    height: "editor-height",
    "object-selector": "editor-object-selector",
    "object-place": "editor-object-selector",
    "object-delete": "editor-object-delete",
    "region-stamp": "editor-region-stamp",
};
