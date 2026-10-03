import { TILE_RENDER_FLAG_DESCRIPTORS } from "../rs/map/TileRenderFlags";
import { executeEditorCommand } from "./commands/editor-command-registry";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { getTileBrushModel } from "./plugins/builtins/tile-brush-model";
import { getTileFlagsToolModel } from "./plugins/builtins/tile-flags-tool-model";

/**
 * Rendering controls: the switches that change what the 3D view draws (plane view, objects, smoothing and the tile
 * flag colours). The Rendering panel lists all of them; any of them can be pinned to Quick controls (the menu in the 3D
 * view). One registry feeds both, so a control only has to be described once.
 */
export type ViewControlGroup = "plane" | "scene" | "flags" | "plugins";

export type ViewControl = {
    /** Stable id, saved in the pinned list. */
    id: string;
    group: ViewControlGroup;
    label: string;
    /** One line on what it does. */
    description: string;
    /** RGBA 0-1, for controls that stand for a colour on the map (flags). */
    swatch?: readonly number[];
    get: (host: IEditorPluginHost) => boolean;
    set: (host: IEditorPluginHost, value: boolean) => void;
};

export const VIEW_CONTROL_GROUPS: readonly { id: ViewControlGroup; title: string }[] = [
    { id: "plane", title: "Plane view" },
    { id: "scene", title: "Scene" },
    { id: "flags", title: "Tile flags" },
    { id: "plugins", title: "Plugins" },
];

/** What each render flag means, in plain words (the descriptor only has a name and a colour). */
export const FLAG_MEANING: Record<string, string> = {
    Unwalkable: "Nothing can walk on this tile",
    Bridge: "Part of a bridge (drawn on the plane above)",
    "Remove roof": "Roofs above this tile are hidden",
    "Render Z-1": "Drawn on the plane below",
    "No map draw": "Left off the minimap",
};

const baseControls: readonly ViewControl[] = [
    {
        id: "hide-below",
        group: "plane",
        label: "Hide below",
        description: "Hide the planes below the view plane (an editing aid)",
        get: (host) => host.hideBelowViewPlane,
        set: (host, value) => {
            host.hideBelowViewPlane = value;
            host.notifyWorkbenchStateChanged();
        },
    },
    {
        id: "roofs",
        group: "plane",
        label: "Roofs",
        description: "Draw the planes above the view plane, like the game with roofs shown",
        get: (host) => host.showRoofs,
        set: (host, value) => host.setShowRoofs(value),
    },
    {
        id: "bridges",
        group: "plane",
        label: "Bridges",
        description: "Draw plane-1 bridge tiles one plane lower, as the game renders them",
        get: (host) => host.bridgeLinkBelow,
        set: (host, value) => host.setBridgeLinkBelow(value),
    },
    {
        id: "objects",
        group: "scene",
        label: "Objects",
        description: "Show or hide every object in the 3D view",
        get: (host) => host.objectsVisible,
        set: (host, value) => {
            if (host.objectsVisible !== value) executeEditorCommand("workbench.toggle-objects-visible", { host });
        },
    },
    {
        id: "smoothing",
        group: "scene",
        label: "Terrain smoothing",
        description: "Blend underlay colours over neighbouring tiles, like the game",
        get: (host) => host.terrainSmoothingEnabled,
        set: (host, value) => {
            if (host.terrainSmoothingEnabled !== value) executeEditorCommand("workbench.toggle-terrain-smoothing", { host });
        },
    },
    {
        id: "brush-ghost",
        group: "scene",
        label: "Brush ghost",
        description: "Preview what the Tile painter would paint under the cursor, before you paint it",
        get: (host) => getTileBrushModel(host).ghost,
        set: (host, value) => getTileBrushModel(host).setGhost(value),
    },
];

const flagControls: readonly ViewControl[] = TILE_RENDER_FLAG_DESCRIPTORS.map((descriptor) => ({
    id: `flag-${descriptor.flag}`,
    group: "flags" as const,
    label: `${descriptor.shortLabel} flag`,
    description: FLAG_MEANING[descriptor.shortLabel] ?? descriptor.label,
    swatch: descriptor.color,
    get: (host: IEditorPluginHost) => getTileFlagsToolModel(host).isShowEnabled(descriptor.flag),
    set: (host: IEditorPluginHost, value: boolean) => getTileFlagsToolModel(host).setShowFlag(descriptor.flag, value),
}));

const builtinControls: readonly ViewControl[] = [...baseControls, ...flagControls];
const extraControls: ViewControl[] = [];
const byId = new Map(builtinControls.map((control) => [control.id, control]));

/**
 * Every rendering control: the built-in ones, then any a plugin registered. A getter so the Rendering panel and Quick
 * controls always see late registrations (the array is rebuilt only when something is registered).
 */
export let VIEW_CONTROLS: readonly ViewControl[] = builtinControls;

/**
 * Lets a plugin add a toggle to the Rendering panel (and so to Quick controls). Ids must be unique and are saved in the
 * pinned list, so keep them stable (`my-plugin.show-grid`). Returns a function that removes the control again.
 */
export function registerViewControl(control: ViewControl): () => void {
    if (byId.has(control.id)) throw new Error(`View control "${control.id}" is already registered`);
    extraControls.push(control);
    byId.set(control.id, control);
    VIEW_CONTROLS = [...builtinControls, ...extraControls];
    return () => {
        const index = extraControls.indexOf(control);
        if (index < 0) return;
        extraControls.splice(index, 1);
        byId.delete(control.id);
        VIEW_CONTROLS = [...builtinControls, ...extraControls];
    };
}

export function getViewControl(id: string): ViewControl | undefined {
    return byId.get(id);
}

/** Pinned to Quick controls until the user changes it. */
export const DEFAULT_QUICK_CONTROLS: readonly string[] = ["hide-below", "roofs", "bridges", "objects", "smoothing", "brush-ghost"];
