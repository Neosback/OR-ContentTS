import {
    BUILTIN_BRUSH_TYPE_PLUGINS,
    BUILTIN_WORKBENCH_UI_PLUGINS,
} from "./current-plugin-layout.builtin";

export type ConvertedPluginKind = "tool" | "toolset" | "brushes" | "workbench";
export interface ConvertedMapEditorPlugin {
    id: string;
    manifest: {
        icon: string;
        name: string;
        description: string;
        author: string;
        version: string;
        tags: string[];
        showInHub?: boolean;
    };
}

const CONVERTED_PLUGIN_PREFIX = "openrune.internal";

export function toConvertedPluginId(kind: ConvertedPluginKind, id: string): string {
    return `${CONVERTED_PLUGIN_PREFIX}.${kind}.${id}`;
}

export function parseConvertedPluginId(
    pluginId: string,
): { kind: ConvertedPluginKind; id: string } | null {
    const prefix = `${CONVERTED_PLUGIN_PREFIX}.`;
    if (!pluginId.startsWith(prefix)) {
        return null;
    }
    const rest = pluginId.slice(prefix.length);
    const parts = rest.split(".");
    if (parts.length < 2) {
        return null;
    }
    const [kind, ...idParts] = parts;
    if (kind !== "tool" && kind !== "toolset" && kind !== "brushes" && kind !== "workbench") {
        return null;
    }
    const id = idParts.join(".");
    if (!id) {
        return null;
    }
    return { kind, id };
}

export const terrainPaintToolsPlugin: ConvertedMapEditorPlugin = {
    id: toConvertedPluginId("toolset", "terrain-paint"),
    manifest: {
        icon: "🧩",
        name: "Terrain Paint",
        description: "Combined terrain paint tools bundle for underlay and overlay workflows.",
        author: "OpenRune",
        version: "1.0.0",
        tags: ["toolset", "converted", "terrain"],
        showInHub: true,
    },
};

export const heightToolPlugin: ConvertedMapEditorPlugin = {
    id: toConvertedPluginId("tool", "height"),
    manifest: {
        icon: "🧩",
        name: "Height",
        description: "Terrain height editing with raise/lower, slope, blend, and smooth modes.",
        author: "OpenRune",
        version: "1.0.0",
        tags: ["tool", "converted"],
        showInHub: true,
    },
};

export const brushesPlugin: ConvertedMapEditorPlugin = {
    id: toConvertedPluginId("brushes", "all"),
    manifest: {
        icon: "🧩",
        name: "Brushes",
        description: `Brush footprint bundle (${BUILTIN_BRUSH_TYPE_PLUGINS.map((b) => b.name).join(", ")}).`,
        author: "OpenRune",
        version: "1.0.0",
        tags: ["brush", "converted", "bundle"],
        showInHub: true,
    },
};

export const paintToolsStripWorkbenchPlugin: ConvertedMapEditorPlugin = {
    id: toConvertedPluginId("workbench", BUILTIN_WORKBENCH_UI_PLUGINS[0].id),
    manifest: {
        icon: "🧩",
        name: BUILTIN_WORKBENCH_UI_PLUGINS[0].name,
        description: BUILTIN_WORKBENCH_UI_PLUGINS[0].description,
        author: "OpenRune",
        version: "1.0.0",
        tags: ["workbench", "converted"],
        showInHub: false,
    },
};

export const brushWorkspaceWorkbenchPlugin: ConvertedMapEditorPlugin = {
    id: toConvertedPluginId("workbench", BUILTIN_WORKBENCH_UI_PLUGINS[1].id),
    manifest: {
        icon: "🧩",
        name: BUILTIN_WORKBENCH_UI_PLUGINS[1].name,
        description: BUILTIN_WORKBENCH_UI_PLUGINS[1].description,
        author: "OpenRune",
        version: "1.0.0",
        tags: ["workbench", "converted"],
        showInHub: false,
    },
};

export const scene2dWorkbenchPlugin: ConvertedMapEditorPlugin = {
    id: toConvertedPluginId("workbench", BUILTIN_WORKBENCH_UI_PLUGINS[2].id),
    manifest: {
        icon: "🧩",
        name: BUILTIN_WORKBENCH_UI_PLUGINS[2].name,
        description: BUILTIN_WORKBENCH_UI_PLUGINS[2].description,
        author: "OpenRune",
        version: "1.0.0",
        tags: ["workbench", "converted"],
        showInHub: false,
    },
};

export const sceneLiveWorkbenchPlugin: ConvertedMapEditorPlugin = {
    id: toConvertedPluginId("workbench", BUILTIN_WORKBENCH_UI_PLUGINS[3].id),
    manifest: {
        icon: "🧩",
        name: BUILTIN_WORKBENCH_UI_PLUGINS[3].name,
        description: BUILTIN_WORKBENCH_UI_PLUGINS[3].description,
        author: "OpenRune",
        version: "1.0.0",
        tags: ["workbench", "converted"],
        showInHub: false,
    },
};

export const historyWorkbenchPlugin: ConvertedMapEditorPlugin = {
    id: toConvertedPluginId("workbench", BUILTIN_WORKBENCH_UI_PLUGINS[4].id),
    manifest: {
        icon: "🧩",
        name: BUILTIN_WORKBENCH_UI_PLUGINS[4].name,
        description: BUILTIN_WORKBENCH_UI_PLUGINS[4].description,
        author: "OpenRune",
        version: "1.0.0",
        tags: ["workbench", "converted"],
        showInHub: true,
    },
};

export const minimapWorkbenchPlugin: ConvertedMapEditorPlugin = {
    id: toConvertedPluginId("workbench", BUILTIN_WORKBENCH_UI_PLUGINS[5].id),
    manifest: {
        icon: "🧩",
        name: BUILTIN_WORKBENCH_UI_PLUGINS[5].name,
        description: BUILTIN_WORKBENCH_UI_PLUGINS[5].description,
        author: "OpenRune",
        version: "1.0.0",
        tags: ["workbench", "converted"],
        showInHub: true,
    },
};

export const objectSelectorToolPlugin: ConvertedMapEditorPlugin = {
    id: toConvertedPluginId("tool", "object-selector"),
    manifest: {
        icon: "🧩",
        name: "Object Selector",
        description: "Hover and click world objects to inspect them with wireframe highlights.",
        author: "OpenRune",
        version: "1.0.0",
        tags: ["tool", "converted", "objects"],
        showInHub: true,
    },
};

export const objectDeleteToolPlugin: ConvertedMapEditorPlugin = {
    id: toConvertedPluginId("tool", "object-delete"),
    manifest: {
        icon: "🗑",
        name: "Object Delete",
        description: "Hold Delete and hover objects to remove them from the map.",
        author: "OpenRune",
        version: "1.0.0",
        tags: ["tool", "converted", "objects"],
        showInHub: true,
    },
};

export const regionStampToolPlugin: ConvertedMapEditorPlugin = {
    id: toConvertedPluginId("tool", "region-stamp"),
    manifest: {
        icon: "📋",
        name: "Region Stamp",
        description: "Select a tile region, copy terrain and objects, and paste elsewhere.",
        author: "OpenRune",
        version: "1.0.0",
        tags: ["tool", "converted", "terrain"],
        showInHub: true,
    },
};

export const convertedCurrentBuiltinPlugins: readonly ConvertedMapEditorPlugin[] = [
    terrainPaintToolsPlugin,
    heightToolPlugin,
    objectSelectorToolPlugin,
    objectDeleteToolPlugin,
    regionStampToolPlugin,
    brushesPlugin,
    paintToolsStripWorkbenchPlugin,
    brushWorkspaceWorkbenchPlugin,
    scene2dWorkbenchPlugin,
    sceneLiveWorkbenchPlugin,
    historyWorkbenchPlugin,
    minimapWorkbenchPlugin,
];
