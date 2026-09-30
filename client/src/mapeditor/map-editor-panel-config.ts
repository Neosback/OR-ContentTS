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
    { panelId: "editor-underlays", title: "Underlays", canExternal: true, defaultWidth: 380, defaultHeight: 520 },
    { panelId: "editor-overlays", title: "Overlays", canExternal: true, defaultWidth: 380, defaultHeight: 520 },
    { panelId: "editor-height", title: "Height", canExternal: true, defaultWidth: 380, defaultHeight: 520 },
    { panelId: "editor-object-selector", title: "Objects", canExternal: true, defaultWidth: 380, defaultHeight: 420 },
    { panelId: "editor-object-delete", title: "Delete objects", canExternal: true, defaultWidth: 380, defaultHeight: 420 },
    { panelId: "editor-region-stamp", title: "Region stamp", canExternal: true, defaultWidth: 380, defaultHeight: 420 },
    { panelId: "editor-tile-flags", title: "Tile flags", canExternal: true, defaultWidth: 380, defaultHeight: 520 },
    { panelId: "editor-history", title: "History", canExternal: true, defaultWidth: 420, defaultHeight: 380 },
    { panelId: "editor-minimap", title: "Minimap", canExternal: true, defaultWidth: 360, defaultHeight: 360 },
];

/** Dock panel for each paint tool's palette tab. */
export const EDITOR_TOOL_DOCK_PANEL: Partial<Record<MapEditorTool, MapEditorDockPanelId>> = {
    underlay: "editor-underlays",
    overlay: "editor-overlays",
    height: "editor-height",
    "tile-flags": "editor-tile-flags",
    "object-selector": "editor-object-selector",
    "object-delete": "editor-object-delete",
    "region-stamp": "editor-region-stamp",
};
