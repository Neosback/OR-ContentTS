import type { InputManager } from "../../mapviewer/InputManager";
import type { MapEditorTool } from "../map-editor-kinds";
import { getPaintToolsStripModel } from "../plugins/builtins/paint-tools-strip-model";
import { getHeightToolModel, type HeightPaintMode } from "../plugins/builtins/height-tool-model";
import { isCopyableObjectKind } from "../plugins/builtins/object-copy-placement";
import type { IEditorPluginHost } from "../plugins/editor-plugin-host";
import type {
    EditorToolInputContext,
    EditorToolKeyBinding,
    EditorToolKeyChord,
    EditorToolKeybindTrigger,
} from "../plugins/builtins/builtin-plugin-types";

import { openCommandPalette } from "../command-palette-signal";
import { getObjectActionModel } from "../plugins/builtins/object-action-model";
import { getTileBrushModel } from "../plugins/builtins/tile-brush-model";
export type EditorCommandId =
    | "workbench.brush-size-up"
    | "workbench.brush-size-down"
    | "workbench.toggle-objects-visible"
    | "workbench.toggle-terrain-smoothing"
    | "workbench.toggle-paint-tools-panel"
    | "workbench.undo"
    | "workbench.redo"
    | "workbench.open-panel"
    | "workbench.restore-panels"
    | "workbench.reset-layout"
    | "workbench.command-palette"
    | "tool.select-underlay"
    | "tool.select-overlay"
    | "tool.select-height"
    | "tool.select-tile-flags"
    | "tool.select-tile-brush"
    | "tile-brush.eyedropper"
    | "tool.select-object-selector"
    | "tool.select-object-place"
    | "tool.select-object-delete"
    | "tool.select-region-stamp"
    | "height.mode.raise-lower"
    | "height.mode.slope"
    | "height.mode.blend"
    | "height.mode.smooth"
    | "height.mode.flatten"
    | "height.mode.terrace"
    | "height.mode.set"
    | "height.step.increase"
    | "height.step.decrease"
    | "height.slope-strength.increase"
    | "height.slope-strength.decrease"
    | "height.blend-strength.increase"
    | "height.blend-strength.decrease"
    | "object-selector.cancel"
    | "object-selector.clear-selection"
    | "object-selector.rotate-selected"
    | "object-selector.copy-object"
    | "object-selector.paste-object"
    | "object-selector.move-object"
    | "object-selector.delete-selected"
    | "region-stamp.copy"
    | "region-stamp.rotate"
    | "region-stamp.delete"
    | "region-stamp.cancel";

export type EditorCommandLayout = {
    openPanel(panelId: string): void;
    restoreAllPanels(): void;
    resetLayout(): void;
};

export type EditorCommandNotifier = {
    success?: (message: string) => void;
    message?: (message: string) => void;
    error?: (message: string) => void;
};

export type EditorCommandContext = {
    host: IEditorPluginHost;
    input?: InputManager;
    layout?: EditorCommandLayout;
    notify?: EditorCommandNotifier;
};

export type EditorCommandPayload = {
    panelId?: string;
    panelTitle?: string;
};

export type EditorCommand = {
    id: EditorCommandId;
    name: string;
    description?: string;
    isEnabled?: (context: EditorCommandContext, payload: EditorCommandPayload) => boolean;
    execute: (context: EditorCommandContext, payload: EditorCommandPayload) => boolean | void;
};

const TOOL_SELECT_COMMANDS: readonly {
    id: EditorCommandId;
    tool: MapEditorTool;
    name: string;
    description: string;
}[] = [
    { id: "tool.select-underlay", tool: "underlay", name: "Select Underlay tool", description: "Switch active paint tool to Underlay." },
    { id: "tool.select-overlay", tool: "overlay", name: "Select Overlay tool", description: "Switch active paint tool to Overlay." },
    { id: "tool.select-height", tool: "height", name: "Select Height tool", description: "Switch active paint tool to Height." },
    { id: "tool.select-tile-brush", tool: "tile-brush", name: "Select Tile painter", description: "Switch active tool to the Tile painter (underlay, overlay, height and flags in one brush)." },
    { id: "tool.select-tile-flags", tool: "tile-flags", name: "Select Tile flags tool", description: "Switch active paint tool to Tile flags." },
    { id: "tool.select-object-selector", tool: "object-selector", name: "Select Object Selector tool", description: "Switch active tool to Object Selector." },
    { id: "tool.select-object-place", tool: "object-place", name: "Select Place tool", description: "Switch active tool to Place (put copies of an object onto tiles)." },
    { id: "tool.select-object-delete", tool: "object-delete", name: "Select Object Delete tool", description: "Switch active tool to Object Delete." },
    { id: "tool.select-region-stamp", tool: "region-stamp", name: "Select Region Stamp tool", description: "Switch active tool to Region Stamp." },
];

const HEIGHT_MODE_COMMANDS: readonly {
    id: EditorCommandId;
    mode: HeightPaintMode;
    name: string;
    description: string;
}[] = [
    { id: "height.mode.raise-lower", mode: "raise-lower", name: "Height mode: Raise / Lower", description: "Switch Height tool mode to Raise / Lower." },
    { id: "height.mode.slope", mode: "slope", name: "Height mode: Slope", description: "Switch Height tool mode to Slope." },
    { id: "height.mode.blend", mode: "blend", name: "Height mode: Blend", description: "Switch Height tool mode to Blend." },
    { id: "height.mode.smooth", mode: "smooth", name: "Height mode: Smooth", description: "Switch Height tool mode to Smooth." },
    { id: "height.mode.flatten", mode: "flatten", name: "Height mode: Flatten", description: "Switch Height tool mode to Flatten." },
    { id: "height.mode.terrace", mode: "terrace", name: "Height mode: Terrace", description: "Switch Height tool mode to Terrace." },
    { id: "height.mode.set", mode: "set", name: "Height mode: Set height", description: "Switch Height tool mode to Set height." },
];

const BASE_COMMANDS: readonly EditorCommand[] = [
    {
        id: "workbench.brush-size-up",
        name: "Increase brush size",
        description: "Increase the active map-editor brush radius.",
        execute: ({ host }) => void host.adjustBrushSize(1),
    },
    {
        id: "workbench.brush-size-down",
        name: "Decrease brush size",
        description: "Decrease the active map-editor brush radius.",
        execute: ({ host }) => void host.adjustBrushSize(-1),
    },
    {
        id: "workbench.toggle-objects-visible",
        name: "Toggle objects visible",
        description: "Show or hide world objects in the editor viewport.",
        execute: ({ host }) => void host.toggleObjectsVisible(),
    },
    {
        id: "workbench.toggle-terrain-smoothing",
        name: "Toggle terrain smoothing",
        description: "Enable or disable terrain underlay smoothing/blending in the editor view.",
        execute: ({ host }) => void host.toggleTerrainSmoothingEnabled(),
    },
    {
        id: "workbench.toggle-paint-tools-panel",
        name: "Toggle paint tools panel",
        description: "Show or hide the floating paint tools panel.",
        execute: ({ host }) => {
            getPaintToolsStripModel(host).toggleFloatingPanelVisible();
        },
    },
    {
        id: "workbench.undo",
        name: "Undo",
        description: "Undo the last map edit.",
        isEnabled: ({ host }) => host.getHistorySnapshot().canUndo,
        execute: ({ host }) => void host.undoHistory(),
    },
    {
        id: "workbench.redo",
        name: "Redo",
        description: "Redo the last undone map edit.",
        isEnabled: ({ host }) => host.getHistorySnapshot().canRedo,
        execute: ({ host }) => void host.redoHistory(),
    },
    {
        id: "workbench.open-panel",
        name: "Open panel",
        description: "Open a workbench panel by id.",
        isEnabled: ({ layout }, payload) => !!layout && !!payload.panelId,
        execute: ({ layout, notify }, payload) => {
            if (!layout || !payload.panelId) return false;
            layout.openPanel(payload.panelId);
            notify?.success?.(`${payload.panelTitle ?? "Panel"} opened`);
        },
    },
    {
        id: "workbench.restore-panels",
        name: "Restore missing panels",
        description: "Restore all reopenable workbench panels that are currently closed.",
        isEnabled: ({ layout }) => !!layout,
        execute: ({ layout, notify }) => {
            if (!layout) return false;
            layout.restoreAllPanels();
            notify?.success?.("Closed panels restored where possible.");
        },
    },
    {
        id: "workbench.command-palette",
        name: "Command palette",
        description: "Search commands, panels, layouts and objects, or jump to a region or coordinates (Ctrl/Cmd+K).",
        execute: () => openCommandPalette(),
    },
    {
        id: "workbench.reset-layout",
        name: "Reset workspace layout",
        description: "Reset the map-editor workspace to its default layout.",
        isEnabled: ({ layout }) => !!layout,
        execute: ({ layout, notify }) => {
            if (!layout) return false;
            layout.resetLayout();
            notify?.message?.("Workspace reset to default layout.");
        },
    },
    {
        id: "height.step.increase",
        name: "Increase height step",
        description: "Increase Height step slider value.",
        isEnabled: ({ host }) => host.getEditorTool() === "height",
        execute: ({ host }) => {
            host.heightAdjustStep = Math.max(1, Math.min(256, host.heightAdjustStep + 1));
            host.notifyWorkbenchStateChanged();
        },
    },
    {
        id: "height.step.decrease",
        name: "Decrease height step",
        description: "Decrease Height step slider value.",
        isEnabled: ({ host }) => host.getEditorTool() === "height",
        execute: ({ host }) => {
            host.heightAdjustStep = Math.max(1, Math.min(256, host.heightAdjustStep - 1));
            host.notifyWorkbenchStateChanged();
        },
    },
    {
        id: "height.slope-strength.increase",
        name: "Increase slope strength",
        description: "Increase Slope strength slider value.",
        isEnabled: ({ host }) => host.getEditorTool() === "height",
        execute: ({ host }) => {
            const model = getHeightToolModel(host);
            model.setSlopeStrength(model.slopeStrength + 0.05);
        },
    },
    {
        id: "height.slope-strength.decrease",
        name: "Decrease slope strength",
        description: "Decrease Slope strength slider value.",
        isEnabled: ({ host }) => host.getEditorTool() === "height",
        execute: ({ host }) => {
            const model = getHeightToolModel(host);
            model.setSlopeStrength(model.slopeStrength - 0.05);
        },
    },
    {
        id: "height.blend-strength.increase",
        name: "Increase blend strength",
        description: "Increase Blend strength slider value.",
        isEnabled: ({ host }) => host.getEditorTool() === "height",
        execute: ({ host }) => {
            const model = getHeightToolModel(host);
            model.setBlendStrength(model.blendStrength + 0.05);
        },
    },
    {
        id: "height.blend-strength.decrease",
        name: "Decrease blend strength",
        description: "Decrease Blend strength slider value.",
        isEnabled: ({ host }) => host.getEditorTool() === "height",
        execute: ({ host }) => {
            const model = getHeightToolModel(host);
            model.setBlendStrength(model.blendStrength - 0.05);
        },
    },
    {
        id: "object-selector.cancel",
        name: "Deselect / finish placing",
        description: "Finish placing (Place goes back to Select; the copied object stays on the clipboard), or clear the current object selection.",
        isEnabled: ({ host }) =>
            host.isObjectSelectorToolActive() &&
            (host.isObjectPlaceToolActive() ||
                getObjectActionModel(host).mode !== undefined ||
                host.isObjectCopyPlacementActive() ||
                host.selectedObject != null),
        execute: ({ host }) => {
            if (host.isObjectPlaceToolActive()) {
                // Placing is its own tool: Esc ends it and returns to Select. The clipboard is kept for V.
                getObjectActionModel(host).cancel();
                host.cancelObjectCopyPlacement();
                host.setEditorTool("object-selector");
            } else if (getObjectActionModel(host).mode !== undefined) getObjectActionModel(host).cancel();
            else if (host.isObjectCopyPlacementActive()) host.cancelObjectCopyPlacement();
            else host.clearSelectedObject();
            host.notifyWorkbenchStateChanged();
        },
    },
    {
        id: "tile-brush.eyedropper",
        name: "Pick tile into brush",
        description: "Load the hovered tile (underlay, overlay, shape, rotation, height and flags) into the Tile painter brush.",
        isEnabled: ({ host }) => host.getEditorTool() === "tile-brush" && host.getHoveredTile() !== undefined,
        execute: ({ host }) => {
            const hovered = host.getHoveredTile();
            const tile = hovered ? host.getTileInfo(host.selectedLevel, hovered.worldX, hovered.worldY) : undefined;
            if (!tile) return false;
            getTileBrushModel(host).sendTile(tile);
        },
    },
    {
        id: "object-selector.clear-selection",
        name: "Clear object selection",
        description: "Cancel copy placement and clear the current object selection.",
        isEnabled: ({ host }) =>
            host.isObjectSelectorToolActive() &&
            (host.isObjectCopyPlacementActive() || host.selectedObject != null),
        execute: ({ host }) => {
            host.cancelObjectCopyPlacement();
            host.clearSelectedObject();
            host.notifyWorkbenchStateChanged();
        },
    },
    {
        id: "object-selector.rotate-selected",
        name: "Rotate selected object",
        description: "Rotate the selected object 90° on its tile.",
        isEnabled: ({ host }) => {
            const ref = host.selectedObject;
            return (
                host.isObjectSelectorToolActive() &&
                !host.isObjectCopyPlacementActive() &&
                (getObjectActionModel(host).mode === "place" || (ref != null && isCopyableObjectKind(ref.kind)))
            );
        },
        // While placing a new object, R turns the ghost; otherwise it turns the selected object.
        execute: ({ host }) => {
            const actions = getObjectActionModel(host);
            if (actions.mode === "place") actions.rotatePlacement();
            else void host.rotateSelectedObject();
        },
    },
    {
        id: "object-selector.move-object",
        name: "Move object",
        description: "Pick the selected object up; click a tile to put it down (Esc cancels).",
        isEnabled: ({ host }) => {
            const ref = host.selectedObject;
            return host.isObjectSelectorToolActive() && ref != null && isCopyableObjectKind(ref.kind) && !host.isObjectCopyPlacementActive();
        },
        execute: ({ host }) => getObjectActionModel(host).startMove(),
    },
    {
        id: "object-selector.delete-selected",
        name: "Delete selected object",
        description: "Remove the selected object from the map (Ctrl+Z restores it).",
        isEnabled: ({ host }) => host.isObjectSelectorToolActive() && host.selectedObject != null,
        execute: ({ host }) => getObjectActionModel(host).request({ type: "delete-selected" }),
    },
    {
        id: "object-selector.copy-object",
        name: "Copy object placement",
        description: "Stamp copies of the selected object onto clicked tiles.",
        isEnabled: ({ host }) => {
            const ref = host.selectedObject;
            return host.isObjectSelectorToolActive() && ref != null && isCopyableObjectKind(ref.kind);
        },
        execute: ({ host }) => {
            host.startObjectCopyPlacement();
            host.notifyWorkbenchStateChanged();
        },
    },
    {
        id: "object-selector.paste-object",
        name: "Paste copied object",
        description: "Place more copies of the last copied object (switches to the Place tool).",
        isEnabled: ({ host }) => host.isObjectSelectorToolActive() && host.hasObjectClipboard() && !host.isObjectCopyPlacementActive(),
        execute: ({ host }) => {
            host.resumeObjectCopyPlacement();
            host.notifyWorkbenchStateChanged();
        },
    },
    {
        id: "region-stamp.copy",
        name: "Copy region / start paste",
        description: "Copy the selected region to the clipboard and enter paste mode.",
        isEnabled: ({ host }) =>
            host.isRegionStampToolActive() &&
            !host.isRegionStampCopyDialogOpen() &&
            host.getRegionStampSelectBounds() != null,
        execute: ({ host }) => {
            host.openRegionStampCopyDialog();
            host.notifyWorkbenchStateChanged();
        },
    },
    {
        id: "region-stamp.rotate",
        name: "Rotate region stamp",
        description: "Rotate the clipboard stamp 90° while pasting.",
        isEnabled: ({ host }) => host.isRegionStampToolActive() && host.isRegionStampPlacementActive(),
        execute: ({ host }) => void host.rotateRegionStamp(),
    },
    {
        id: "region-stamp.delete",
        name: "Delete selected region",
        description: "Clear terrain, objects, and flags in the selected region.",
        isEnabled: ({ host }) =>
            host.isRegionStampToolActive() &&
            !host.isRegionStampPlacementActive() &&
            host.getRegionStampSelectBounds() != null,
        execute: ({ host }) => void host.deleteRegionStampSelection(),
    },
    {
        id: "region-stamp.cancel",
        name: "Cancel paste / clear selection",
        description: "Cancel copy options, paste placement, or the current region selection.",
        isEnabled: ({ host }) =>
            host.isRegionStampToolActive() &&
            (host.isRegionStampCopyDialogOpen() ||
                host.isRegionStampPlacementActive() ||
                host.getRegionStampSelectBounds() != null ||
                host.getRegionStampDraftBounds() != null),
        execute: ({ host }) => {
            if (host.isRegionStampCopyDialogOpen()) host.cancelRegionStampCopyDialog();
            else if (host.isRegionStampPlacementActive()) host.cancelRegionStampPlacement();
            else host.clearRegionStampSelection();
            host.notifyWorkbenchStateChanged();
        },
    },
];

const TOOL_COMMANDS: readonly EditorCommand[] = TOOL_SELECT_COMMANDS.map(({ id, tool, name, description }) => ({
    id,
    name,
    description,
    execute: ({ host }) => void host.setEditorTool(tool),
}));

const HEIGHT_COMMANDS: readonly EditorCommand[] = HEIGHT_MODE_COMMANDS.map(({ id, mode, name, description }) => ({
    id,
    name,
    description,
    isEnabled: ({ host }) => host.getEditorTool() === "height",
    execute: ({ host }) => {
        getHeightToolModel(host).setMode(mode);
        host.setEditorTool("height");
    },
}));

const COMMANDS: readonly EditorCommand[] = [...BASE_COMMANDS, ...TOOL_COMMANDS, ...HEIGHT_COMMANDS];

const commandById = new Map<EditorCommandId, EditorCommand>(COMMANDS.map((command) => [command.id, command]));

export function editorToolSelectCommandId(tool: MapEditorTool): EditorCommandId {
    return `tool.select-${tool}` as EditorCommandId;
}

export function heightModeCommandId(mode: HeightPaintMode): EditorCommandId {
    return `height.mode.${mode}` as EditorCommandId;
}

export function getRegisteredEditorCommands(): readonly EditorCommand[] {
    return COMMANDS;
}

export function getEditorCommand(id: EditorCommandId): EditorCommand {
    const command = commandById.get(id);
    if (!command) throw new Error(`Unknown editor command: ${id}`);
    return command;
}

export function canExecuteEditorCommand(
    id: EditorCommandId,
    context: EditorCommandContext,
    payload: EditorCommandPayload = {},
): boolean {
    return getEditorCommand(id).isEnabled?.(context, payload) ?? true;
}

/**
 * Executes a command through the shared registry.
 * Returns false when the command is disabled, otherwise true unless it explicitly returns false.
 */
export function executeEditorCommand(
    id: EditorCommandId,
    context: EditorCommandContext,
    payload: EditorCommandPayload = {},
): boolean {
    const command = getEditorCommand(id);
    if (command.isEnabled && !command.isEnabled(context, payload)) return false;
    return command.execute(context, payload) !== false;
}


export type EditorCommandKeyBindingOptions = {
    id: string;
    defaultChords: readonly EditorToolKeyChord[];
    trigger?: EditorToolKeybindTrigger;
    shouldProcess?: (context: EditorToolInputContext) => boolean;
};

/** Builds a keybinding whose metadata, enabled state, and action all come from a shared command. */
export function editorCommandKeyBinding(
    commandId: EditorCommandId,
    options: EditorCommandKeyBindingOptions,
): EditorToolKeyBinding {
    const command = getEditorCommand(commandId);
    return {
        id: options.id,
        name: command.name,
        description: command.description,
        defaultChords: options.defaultChords,
        trigger: options.trigger,
        shouldProcess: (context) =>
            canExecuteEditorCommand(commandId, context) && (options.shouldProcess?.(context) ?? true),
        action: (context) => executeEditorCommand(commandId, context),
    };
}
