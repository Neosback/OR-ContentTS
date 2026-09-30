import { editorCommandKeyBinding } from "../../commands/editor-command-registry";
import { isCopyableObjectKind } from "./object-copy-placement";
import type { EditorToolPlugin } from "./builtin-plugin-types";

export const objectSelectorEditorTool: EditorToolPlugin = {
    id: "object-selector",
    name: "Object Selector",
    description: "Hover and click world objects to inspect them with wireframe highlights.",
    icon: "mouse-pointer-2",
    workspaces: [{ panelId: "editor-object-selector", activateTab: true }],
    actions: [{ kind: "select-tool", tool: "object-selector" }],
    usesBrushControls: false,
    keyBindings: [
        editorCommandKeyBinding("tool.select-object-selector", {
            id: "select-tool",
            defaultChords: [{ code: "Digit4" }],
        }),
        editorCommandKeyBinding("object-selector.cancel", {
            id: "deselect-or-cancel-copy",
            defaultChords: [{ code: "Escape" }],
        }),
        editorCommandKeyBinding("object-selector.rotate-selected", {
            id: "rotate-selected",
            defaultChords: [{ code: "KeyR" }],
        }),
        {
            id: "rotate-selected-suppress",
            name: "Rotate selected object (camera suppress)",
            description: "While held, suppress camera move-up when an object is selected.",
            defaultChords: [{ code: "KeyR" }],
            trigger: "HELD",
            shouldProcess: ({ host }) => {
                const ref = host.selectedObject;
                return (
                    host.isObjectSelectorToolActive() &&
                    !host.isObjectCopyPlacementActive() &&
                    ref != null &&
                    isCopyableObjectKind(ref.kind)
                );
            },
            action: () => true,
        },
        editorCommandKeyBinding("object-selector.copy-object", {
            id: "copy-object",
            defaultChords: [{ code: "KeyC" }],
        }),
        {
            id: "copy-object-suppress",
            name: "Copy object (camera suppress)",
            description: "While copy mode is active or starting copy, suppress camera move-down on C.",
            defaultChords: [{ code: "KeyC" }],
            trigger: "HELD",
            shouldProcess: ({ host }) =>
                host.isObjectSelectorToolActive() &&
                (host.isObjectCopyPlacementActive() ||
                    (host.selectedObject != null && isCopyableObjectKind(host.selectedObject.kind))),
            action: () => true,
        },
    ],
};
