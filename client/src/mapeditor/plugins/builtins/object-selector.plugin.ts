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
        {
            id: "select-tool",
            name: "Select Object Selector tool",
            description: "Switch active tool to Object Selector.",
            defaultChords: [{ code: "Digit4" }],
            action: ({ host }) => {
                host.setEditorTool("object-selector");
            },
        },
        {
            id: "deselect-or-cancel-copy",
            name: "Deselect / cancel copy",
            description: "Cancel copy placement, or clear the current object selection.",
            defaultChords: [{ code: "Escape" }],
            shouldProcess: ({ host }) =>
                host.isObjectSelectorToolActive() &&
                (host.isObjectCopyPlacementActive() || host.selectedObject != null),
            action: ({ host }) => {
                if (host.isObjectCopyPlacementActive()) {
                    host.cancelObjectCopyPlacement();
                } else {
                    host.clearSelectedObject();
                }
                host.notifyWorkbenchStateChanged();
            },
        },
        {
            id: "rotate-selected",
            name: "Rotate selected object",
            description: "Rotate the selected object 90° on its tile.",
            defaultChords: [{ code: "KeyR" }],
            shouldProcess: ({ host }) => {
                const ref = host.selectedObject;
                return (
                    host.isObjectSelectorToolActive() &&
                    !host.isObjectCopyPlacementActive() &&
                    ref != null &&
                    isCopyableObjectKind(ref.kind)
                );
            },
            action: ({ host }) => {
                host.rotateSelectedObject();
            },
        },
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
        {
            id: "copy-object",
            name: "Copy object placement",
            description: "Stamp copies of the selected object — click tiles to place, Esc to cancel.",
            defaultChords: [{ code: "KeyC" }],
            shouldProcess: ({ host }) => {
                const ref = host.selectedObject;
                return (
                    host.isObjectSelectorToolActive() &&
                    ref != null &&
                    isCopyableObjectKind(ref.kind)
                );
            },
            action: ({ host }) => {
                host.startObjectCopyPlacement();
                host.notifyWorkbenchStateChanged();
            },
        },
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
