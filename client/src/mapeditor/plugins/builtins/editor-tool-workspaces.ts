import type { DockviewApi } from "dockview-core";

import type { MapEditorTool } from "../../map-editor-kinds";
import type { IEditorPluginHost } from "../editor-plugin-host";
import { EditorLayoutRegion, type EditorToolWorkspaceBinding, type MapEditorDockPanelId } from "./builtin-plugin-types";
import { getBuiltinEditorToolPlugin } from "./current-plugin-layout.builtin";

function resolveWorkspaceBindingPanelId(binding: EditorToolWorkspaceBinding): MapEditorDockPanelId | null {
    if (binding.panelId) {
        return binding.panelId;
    }
    if (!binding.target) {
        return null;
    }
    switch (binding.target.region) {
        case EditorLayoutRegion.LEFT_TOOL_PANEL:
            return "editor-paint-tools";
        case EditorLayoutRegion.BOTTOM:
            return "editor-brush-workspace";
        case EditorLayoutRegion.MAP_VIEW_BAR:
            return "editor-scene-editor";
        default:
            return "editor-underlays";
    }
}

/**
 * Brings a tool's palette tab(s) forward when the tool is selected. Bindings with `activateTab: false` are skipped.
 *
 * The first binding with an open panel wins: activating every listed panel in order (as the React version did)
 * made the *last* one win, so choosing Underlay showed the Overlays tab and vice versa.
 */
export function activateEditorToolWorkspaces(api: DockviewApi | null, host: IEditorPluginHost, tool: MapEditorTool): void {
    if (!api) {
        return;
    }
    const plugin = getBuiltinEditorToolPlugin(tool);
    for (const binding of plugin.workspaces ?? []) {
        if (binding.activateTab === false) {
            continue;
        }
        const panelId = resolveWorkspaceBindingPanelId(binding);
        const panel = panelId ? api.getPanel(panelId) : undefined;
        if (panel) {
            panel.api.setActive();
            break;
        }
    }
    plugin.onActivated?.({ host, dockApi: api });
}
