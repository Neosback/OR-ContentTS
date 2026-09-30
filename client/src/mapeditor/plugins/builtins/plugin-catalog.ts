import type { MapEditorTool } from "../../map-editor-kinds";
import type { IEditorPluginHost } from "../editor-plugin-host";
import { convertedCurrentBuiltinPlugins, parseConvertedPluginId, toConvertedPluginId } from "./converted-current-plugins.builtin";
import { BUILTIN_BRUSH_TYPE_PLUGINS } from "./current-plugin-layout.builtin";

/**
 * The plugins the Plugin Hub lists, with their enabled state read straight from the editor host (the single
 * source of truth; the manifest registry used by the React UI keeps a second copy that can drift).
 */
export interface CatalogPlugin {
    id: string;
    manifest: { icon: string; name: string; description: string; author: string; version: string; tags: string[] };
    enabled: boolean;
    /** Cannot be switched off. */
    required: boolean;
}

export const PLUGIN_HUB_ID = "openrune.plugin-hub";
export const BRUSHES_PLUGIN_ID = toConvertedPluginId("brushes", "all");
/** Icon token for the hub's own entry (the UI maps it to a component). */
export const PLUGIN_HUB_ICON = "plug-zap";

const HUB_ENTRY: Omit<CatalogPlugin, "enabled"> = {
    id: PLUGIN_HUB_ID,
    manifest: {
        icon: PLUGIN_HUB_ICON,
        name: "Plugin Hub",
        description: "Discover, filter, and manage map editor plugins.",
        author: "OpenRune",
        version: "0.1.0",
        tags: ["plugin", "management", "ui"],
    },
    required: true,
};

type WorkbenchId = Parameters<IEditorPluginHost["isWorkbenchUiPluginEnabled"]>[0];

function isEnabled(host: IEditorPluginHost, id: string): boolean {
    const converted = parseConvertedPluginId(id);
    switch (converted?.kind) {
        case "tool":
            return host.isEditorToolPluginEnabled(converted.id as MapEditorTool);
        case "toolset":
            return converted.id === "terrain-paint"
                ? host.isEditorToolPluginEnabled("underlay") && host.isEditorToolPluginEnabled("overlay")
                : true;
        case "brushes":
            return BUILTIN_BRUSH_TYPE_PLUGINS.every((brush) => host.isBrushShapePluginEnabled(brush.id));
        case "workbench":
            return host.isWorkbenchUiPluginEnabled(converted.id as WorkbenchId);
        default:
            return true;
    }
}

export function listHubPlugins(host: IEditorPluginHost): CatalogPlugin[] {
    const converted = convertedCurrentBuiltinPlugins
        .filter((plugin) => plugin.manifest.showInHub !== false)
        .map((plugin) => ({
            id: plugin.id,
            manifest: {
                icon: String(plugin.manifest.icon),
                name: plugin.manifest.name,
                description: plugin.manifest.description,
                author: plugin.manifest.author,
                version: plugin.manifest.version,
                tags: plugin.manifest.tags,
            },
            enabled: isEnabled(host, plugin.id),
            required: plugin.id === BRUSHES_PLUGIN_ID,
        }));
    return [{ ...HUB_ENTRY, enabled: true }, ...converted];
}

export function setHubPluginEnabled(host: IEditorPluginHost, id: string, enabled: boolean): void {
    const converted = parseConvertedPluginId(id);
    if (converted?.kind === "tool") {
        host.setEditorToolPluginEnabled(converted.id as MapEditorTool, enabled);
    } else if (converted?.kind === "toolset" && converted.id === "terrain-paint") {
        for (const tool of ["underlay", "overlay"] as const) host.setEditorToolPluginEnabled(tool, enabled);
    } else if (converted?.kind === "brushes") {
        for (const brush of BUILTIN_BRUSH_TYPE_PLUGINS) host.setBrushShapePluginEnabled(brush.id, enabled);
    } else if (converted?.kind === "workbench") {
        host.setWorkbenchUiPluginEnabled(converted.id as WorkbenchId, enabled);
    }
    host.notifyWorkbenchStateChanged();
}
