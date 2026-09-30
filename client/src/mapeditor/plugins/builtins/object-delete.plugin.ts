import { editorCommandKeyBinding } from "../../commands/editor-command-registry";
import type { EditorToolPlugin } from "./builtin-plugin-types";

export const objectDeleteEditorTool: EditorToolPlugin = {
    id: "object-delete",
    name: "Object Delete",
    description: "Hold Delete and hover objects to remove them from the map.",
    icon: "trash-2",
    workspaces: [{ panelId: "editor-object-delete", activateTab: true }],
    actions: [{ kind: "select-tool", tool: "object-delete" }],
    usesBrushControls: false,
    keyBindings: [
        editorCommandKeyBinding("tool.select-object-delete", {
            id: "select-tool",
            defaultChords: [{ code: "Digit5" }],
        }),
        {
            id: "delete-object-mode",
            name: "Delete hovered object",
            description: "Hold Delete and hover objects to remove them.",
            defaultChords: [{ code: "Delete" }, { code: "Backspace" }],
            trigger: "HELD",
            shouldProcess: ({ host }) => host.isObjectDeleteToolActive(),
            action: () => true,
        },
    ],
};
