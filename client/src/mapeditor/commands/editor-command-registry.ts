import type { InputManager } from "../../mapviewer/InputManager";
import type { IEditorPluginHost } from "../plugins/editor-plugin-host";
import { getPaintToolsStripModel } from "../plugins/builtins/paint-tools-strip-model";

export type EditorCommandId =
    | "workbench.brush-size-up"
    | "workbench.brush-size-down"
    | "workbench.toggle-objects-visible"
    | "workbench.toggle-terrain-smoothing"
    | "workbench.toggle-paint-tools-panel"
    | "workbench.undo"
    | "workbench.redo";

export type EditorCommandContext = {
    host: IEditorPluginHost;
    input?: InputManager;
};

export type EditorCommand = {
    id: EditorCommandId;
    name: string;
    description?: string;
    isEnabled?: (context: EditorCommandContext) => boolean;
    execute: (context: EditorCommandContext) => boolean | void;
};

const COMMANDS: readonly EditorCommand[] = [
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
];

const commandById = new Map<EditorCommandId, EditorCommand>(COMMANDS.map((command) => [command.id, command]));

export function getRegisteredEditorCommands(): readonly EditorCommand[] {
    return COMMANDS;
}

export function getEditorCommand(id: EditorCommandId): EditorCommand {
    const command = commandById.get(id);
    if (!command) {
        throw new Error(`Unknown editor command: ${id}`);
    }
    return command;
}

export function canExecuteEditorCommand(id: EditorCommandId, context: EditorCommandContext): boolean {
    return getEditorCommand(id).isEnabled?.(context) ?? true;
}

/**
 * Executes a command through the shared registry.
 * Returns false when the command is currently disabled, otherwise true unless the command explicitly returns false.
 */
export function executeEditorCommand(id: EditorCommandId, context: EditorCommandContext): boolean {
    const command = getEditorCommand(id);
    if (command.isEnabled && !command.isEnabled(context)) {
        return false;
    }
    return command.execute(context) !== false;
}
