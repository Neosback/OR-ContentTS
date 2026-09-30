import { editorCommandKeyBinding } from "../../commands/editor-command-registry";
import type { EditorToolPlugin } from "./builtin-plugin-types";

export const regionStampEditorTool: EditorToolPlugin = {
    id: "region-stamp",
    name: "Region Stamp",
    description: "Select a tile region, copy it, and paste terrain plus objects elsewhere.",
    icon: "copy",
    workspaces: [{ panelId: "editor-region-stamp", activateTab: true }],
    actions: [{ kind: "select-tool", tool: "region-stamp" }],
    usesBrushControls: false,
    keyBindings: [
        editorCommandKeyBinding("tool.select-region-stamp", {
            id: "select-tool",
            defaultChords: [{ code: "Digit6" }],
        }),
        editorCommandKeyBinding("region-stamp.copy", {
            id: "copy-region",
            defaultChords: [{ code: "KeyC" }],
        }),
        {
            id: "copy-region-suppress",
            name: "Copy region (camera suppress)",
            defaultChords: [{ code: "KeyC" }],
            trigger: "HELD",
            shouldProcess: ({ host }) =>
                host.isRegionStampToolActive() &&
                (host.isRegionStampCopyDialogOpen() ||
                    host.isRegionStampPlacementActive() ||
                    host.getRegionStampSelectBounds() != null),
            action: () => true,
        },
        editorCommandKeyBinding("region-stamp.rotate", {
            id: "rotate-stamp",
            defaultChords: [{ code: "KeyR" }],
        }),
        {
            id: "rotate-stamp-suppress",
            name: "Rotate stamp (camera suppress)",
            defaultChords: [{ code: "KeyR" }],
            trigger: "HELD",
            shouldProcess: ({ host }) => host.isRegionStampToolActive() && host.isRegionStampPlacementActive(),
            action: () => true,
        },
        editorCommandKeyBinding("region-stamp.delete", {
            id: "delete-region",
            defaultChords: [{ code: "Delete" }, { code: "Backspace" }],
        }),
        editorCommandKeyBinding("region-stamp.cancel", {
            id: "cancel-stamp",
            defaultChords: [{ code: "Escape" }],
        }),
    ],
};
