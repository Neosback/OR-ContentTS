import type { DockviewApi } from "dockview-core";

import type { InputManager } from "../../../mapviewer/InputManager";
import type { MapEditorBrushType, MapEditorTool } from "../../map-editor-kinds";
import type { IEditorPluginHost } from "../editor-plugin-host";

export type MapEditorPalettePanelProps = {
    pluginHost: IEditorPluginHost;
};

export type MapEditorDataApi = Pick<
    IEditorPluginHost,
    "selectedUnderlayId" | "selectedOverlayId" | "heightAdjustStep" | "setEditorTool"
>;

export interface EditorToolDataFns {
    selectPrimary?: (host: MapEditorDataApi, id: number) => void;
    clearPrimary?: (host: MapEditorDataApi) => void;
    applyHeightStepFromRawInput?: (host: MapEditorDataApi, raw: number) => void;
    getOverlayPaintValue?: (host: MapEditorDataApi) => number;
    getHeightAdjustment?: (host: MapEditorDataApi, modifiers: Required<EditorToolPaintModifiers>) => number;
}

export interface EditorToolPaintPolicy {
    resolveUnderlayPaintTypeId?: (
        ctx: EditorToolInputContext & { worldX: number; worldY: number },
    ) => number | undefined;
    resolveOverlayPaintTypeId?: (
        ctx: EditorToolInputContext & { worldX: number; worldY: number },
    ) => number | undefined;
    getPaintModifiers?: (ctx: EditorToolInputContext) => EditorToolPaintModifiers;
}

export type MapEditorDockPanelId =
    | "editor-scene-editor"
    | "editor-scene-2d"
    | "editor-scene-live"
    | "editor-underlays"
    | "editor-overlays"
    | "editor-height"
    | "editor-object-selector"
    | "editor-inspector-tile"
    | "editor-rendering"
    | "editor-object-delete"
    | "editor-region-stamp"
    | "editor-tile-flags"
    | "editor-tile-painter"
    | "editor-sandbox-terrain"
    | "editor-paint-tools"
    | "editor-brush-workspace"
    | "editor-history"
    | "editor-minimap";

export enum EditorLayoutRegion {
    SETTINGS_BAR = "settings-bar",
    MAP_VIEW_BAR = "map-view-bar",
    LEFT_TOOL_PANEL = "left-tool-panel",
    BOTTOM = "bottom",
}

export enum EditorLayoutSnap {
    LEFT = "LEFT",
    TOP = "TOP",
    BOTTOM = "BOTTOM",
    RIGHT = "RIGHT",
    TABBED = "TABBED",
}

export interface EditorToolWorkspaceBinding {
    panelId?: MapEditorDockPanelId;
    target?: {
        region: EditorLayoutRegion | string;
        snap: EditorLayoutSnap;
    };
    activateTab?: boolean;
}

export type EditorToolAction =
    | { kind: "select-tool"; tool: MapEditorTool }
    | { kind: "focus-panel"; panelId: MapEditorDockPanelId };

export interface EditorToolPaintModifiers {
    controlWheelAdjustsBrushSize?: boolean;
    overlayRestrictToFootprintWithControl?: boolean;
    overlaySameIdFloodWithControlAlt?: boolean;
    heightInvertWithAlt?: boolean;
}

export interface EditorToolInputContext {
    host: IEditorPluginHost;
    input: InputManager;
}

export interface EditorToolKeyChord {
    code: string | readonly string[];
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
}

export type EditorToolKeybindTrigger = "PRESSED" | "HELD" | "TOGGLED";

export interface EditorToolKeyBinding {
    id: string;
    name: string;
    description?: string;
    defaultChords: readonly EditorToolKeyChord[];
    trigger?: EditorToolKeybindTrigger;
    shouldProcess?: (ctx: EditorToolInputContext) => boolean;
    action: (ctx: EditorToolInputContext) => boolean | void;
}

export type EditorToolIconName =
    | "layers-2"
    | "layout-grid"
    | "arrow-up-down"
    | "flag"
    | "mouse-pointer-2"
    | "trash-2"
    | "copy"
    | "paintbrush";

export interface EditorToolPlugin {
    id: MapEditorTool;
    name: string;
    description: string;
    /** Lucide icon name (kebab-case). Each UI maps it to its own icon component. */
    icon: EditorToolIconName;
    workspaces?: readonly EditorToolWorkspaceBinding[];
    actions?: readonly EditorToolAction[];
    data?: EditorToolDataFns;
    /** When false, brush type and radius controls are disabled (e.g. object selector). Default true. */
    usesBrushControls?: boolean;
    brushStripHint?: string;
    paintPolicy?: EditorToolPaintPolicy;
    resolveUnderlayPaintTypeId?: (
        ctx: EditorToolInputContext & { worldX: number; worldY: number },
    ) => number | undefined;
    getPaintModifiers?: (ctx: EditorToolInputContext) => EditorToolPaintModifiers;
    keyBindings?: readonly EditorToolKeyBinding[];
    onActivated?: (ctx: { host: IEditorPluginHost; dockApi: DockviewApi | null }) => void;
}

export interface BrushTypePlugin {
    id: MapEditorBrushType;
    name: string;
    description: string;
    isInBrushShape: (dx: number, dy: number, radius: number) => boolean;
    workspaces?: readonly EditorToolWorkspaceBinding[];
}

