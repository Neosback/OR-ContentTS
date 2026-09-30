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
        {
            id: "select-tool",
            name: "Select Object Delete tool",
            description: "Switch active tool to Object Delete.",
            defaultChords: [{ code: "Digit5" }],
            action: ({ host }) => {
                host.setEditorTool("object-delete");
            },
        },
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
