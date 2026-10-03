import type { AddPanelOptions, DockviewApi } from "dockview-core";

import { addMapEditorDockPanelRestoredOrDefault } from "./map-editor-dock-panel-restore";
import type { MapEditorDockPanelId } from "./plugins/builtins/builtin-plugin-types";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";

const EDITOR_PALETTE_COLUMN_INITIAL_WIDTH = 380;
const EDITOR_HISTORY_MINIMAP_INITIAL_HEIGHT = 240;
const EDITOR_TILE_PAINTER_INITIAL_HEIGHT = 276;
const EDITOR_SCENE_PANEL_ID = "editor-scene-editor";

export function getMapEditorFloatableDockPanelDefaults(panelId: MapEditorDockPanelId): AddPanelOptions | null {
    switch (panelId) {
        case "editor-object-selector":
            return {
                id: "editor-object-selector",
                component: "objectSelectorPalette",
                title: "Object",
                position: { referencePanel: EDITOR_SCENE_PANEL_ID, direction: "right" },
                initialWidth: EDITOR_PALETTE_COLUMN_INITIAL_WIDTH,
            };
        case "editor-inspector-tile":
            // The Tile tab of the inspector: its own panel, a tab next to Object by default, free to dock or float.
            return {
                id: "editor-inspector-tile",
                component: "inspectorTilePalette",
                title: "Tile",
                position: { referencePanel: "editor-object-selector", direction: "within" },
                inactive: true,
            };
        case "editor-rendering":
            // What the 3D view draws (planes, scene, tile flag colours); a tab beside the inspector, free to dock or float.
            return {
                id: "editor-rendering",
                component: "renderingPalette",
                title: "Rendering",
                position: { referencePanel: "editor-object-selector", direction: "within" },
                inactive: true,
            };
        case "editor-height":
            // The Height tool's palette (raise, lower, slope, smooth...): a tab beside the inspector, free to dock or float.
            return {
                id: "editor-height",
                component: "heightPalette",
                title: "Height",
                position: { referencePanel: "editor-object-selector", direction: "within" },
                inactive: true,
            };
        case "editor-tile-painter":
            // A drawer under the viewport: floor, height and flag palettes as tabs of one brush.
            return {
                id: "editor-tile-painter",
                component: "tilePainter",
                title: "Tile painter",
                position: { referencePanel: EDITOR_SCENE_PANEL_ID, direction: "below" },
                initialHeight: EDITOR_TILE_PAINTER_INITIAL_HEIGHT,
            };
        case "editor-object-delete":
            return {
                id: "editor-object-delete",
                component: "objectDeletePalette",
                title: "Delete objects",
                position: { referencePanel: "editor-object-selector", direction: "within" },
                inactive: true,
            };
        case "editor-region-stamp":
            return {
                id: "editor-region-stamp",
                component: "regionStampPalette",
                title: "Region stamp",
                position: { referencePanel: "editor-object-selector", direction: "within" },
                inactive: true,
            };
        case "editor-tile-flags":
            return {
                id: "editor-tile-flags",
                component: "tileFlagsPalette",
                title: "Tile flags",
                position: { referencePanel: "editor-object-selector", direction: "within" },
                inactive: true,
            };
        case "editor-history":
            return {
                id: "editor-history",
                component: "historyWorkspace",
                title: "History",
                position: { referencePanel: "editor-object-selector", direction: "below" },
                initialHeight: EDITOR_HISTORY_MINIMAP_INITIAL_HEIGHT,
            };
        case "editor-minimap":
            return {
                id: "editor-minimap",
                component: "minimapWorkspace",
                title: "Minimap",
                position: { referencePanel: "editor-history", direction: "within" },
                inactive: true,
            };
        default:
            return null;
    }
}

export function restoreMapEditorFloatableDockPanel(
    api: DockviewApi,
    host: IEditorPluginHost,
    panelId: MapEditorDockPanelId,
): void {
    if (api.getPanel(panelId)) {
        return;
    }
    const defaults = getMapEditorFloatableDockPanelDefaults(panelId);
    if (!defaults) {
        return;
    }
    addMapEditorDockPanelRestoredOrDefault(api, panelId, defaults, host);
}
