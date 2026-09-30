import {
    executeEditorCommand,
    getEditorCommand,
    type EditorCommandId,
} from "../../commands/editor-command-registry";
import type { EditorToolKeyBinding, EditorToolKeyChord, EditorToolKeybindTrigger } from "./builtin-plugin-types";

export const WORKBENCH_KEYBIND_PLUGIN_ID = "workbench";
export const WORKBENCH_KEYBIND_PLUGIN_NAME = "Workbench";

type WorkbenchCommandBinding = {
    bindingId: string;
    commandId: EditorCommandId;
    defaultChords: readonly EditorToolKeyChord[];
    trigger: EditorToolKeybindTrigger;
};

const WORKBENCH_COMMAND_BINDINGS: readonly WorkbenchCommandBinding[] = [
    {
        bindingId: "brush-size-up",
        commandId: "workbench.brush-size-up",
        defaultChords: [{ code: "BracketRight" }],
        trigger: "PRESSED",
    },
    {
        bindingId: "brush-size-down",
        commandId: "workbench.brush-size-down",
        defaultChords: [{ code: "BracketLeft" }],
        trigger: "PRESSED",
    },
    {
        bindingId: "toggle-objects-visible",
        commandId: "workbench.toggle-objects-visible",
        defaultChords: [{ code: "KeyO" }],
        trigger: "PRESSED",
    },
    {
        bindingId: "toggle-terrain-smoothing",
        commandId: "workbench.toggle-terrain-smoothing",
        defaultChords: [{ code: "KeyM" }],
        trigger: "PRESSED",
    },
    {
        bindingId: "toggle-paint-tools-panel",
        commandId: "workbench.toggle-paint-tools-panel",
        defaultChords: [{ code: "KeyT" }],
        trigger: "PRESSED",
    },
    {
        bindingId: "undo",
        commandId: "workbench.undo",
        defaultChords: [{ code: "KeyZ", ctrlKey: true }],
        trigger: "PRESSED",
    },
    {
        bindingId: "redo",
        commandId: "workbench.redo",
        defaultChords: [
            { code: "KeyY", ctrlKey: true },
            { code: "KeyZ", ctrlKey: true, shiftKey: true },
        ],
        trigger: "PRESSED",
    },
];

export const WORKBENCH_KEY_BINDINGS: readonly EditorToolKeyBinding[] = WORKBENCH_COMMAND_BINDINGS.map(
    ({ bindingId, commandId, defaultChords, trigger }) => {
        const command = getEditorCommand(commandId);
        return {
            id: bindingId,
            name: command.name,
            description: command.description,
            defaultChords,
            trigger,
            action: (context) => executeEditorCommand(commandId, context),
        };
    },
);

const workbenchChordByBindingId = new Map<string, readonly EditorToolKeyChord[]>();
for (const binding of WORKBENCH_KEY_BINDINGS) {
    workbenchChordByBindingId.set(binding.id, binding.defaultChords);
}

export function workbenchBindingKey(bindingId: string): string {
    return `${WORKBENCH_KEYBIND_PLUGIN_ID}:${bindingId}`;
}

export function workbenchDefaultChords(bindingId: string): readonly EditorToolKeyChord[] {
    return workbenchChordByBindingId.get(bindingId) ?? [];
}
