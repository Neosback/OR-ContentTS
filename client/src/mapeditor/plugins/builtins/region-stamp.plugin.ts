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
        {
            id: "select-tool",
            name: "Select Region Stamp tool",
            description: "Switch active tool to Region Stamp.",
            defaultChords: [{ code: "Digit6" }],
            action: ({ host }) => {
                host.setEditorTool("region-stamp");
            },
        },
        {
            id: "copy-region",
            name: "Copy region / start paste",
            description: "Copy the selected region to the clipboard and enter paste mode.",
            defaultChords: [{ code: "KeyC" }],
            shouldProcess: ({ host }) =>
                host.isRegionStampToolActive() &&
                !host.isRegionStampCopyDialogOpen() &&
                host.getRegionStampSelectBounds() != null,
            action: ({ host }) => {
                host.openRegionStampCopyDialog();
                host.notifyWorkbenchStateChanged();
            },
        },
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
        {
            id: "rotate-stamp",
            name: "Rotate region stamp",
            description: "Rotate the clipboard stamp 90° while pasting.",
            defaultChords: [{ code: "KeyR" }],
            shouldProcess: ({ host }) => host.isRegionStampToolActive() && host.isRegionStampPlacementActive(),
            action: ({ host }) => {
                host.rotateRegionStamp();
            },
        },
        {
            id: "rotate-stamp-suppress",
            name: "Rotate stamp (camera suppress)",
            defaultChords: [{ code: "KeyR" }],
            trigger: "HELD",
            shouldProcess: ({ host }) => host.isRegionStampToolActive() && host.isRegionStampPlacementActive(),
            action: () => true,
        },
        {
            id: "delete-region",
            name: "Delete selected region",
            description: "Clear terrain, objects, and flags in the selected region.",
            defaultChords: [{ code: "Delete" }, { code: "Backspace" }],
            shouldProcess: ({ host }) =>
                host.isRegionStampToolActive() &&
                !host.isRegionStampPlacementActive() &&
                host.getRegionStampSelectBounds() != null,
            action: ({ host }) => {
                host.deleteRegionStampSelection();
            },
        },
        {
            id: "cancel-stamp",
            name: "Cancel paste / clear selection",
            defaultChords: [{ code: "Escape" }],
            shouldProcess: ({ host }) =>
                host.isRegionStampToolActive() &&
                (host.isRegionStampCopyDialogOpen() ||
                    host.isRegionStampPlacementActive() ||
                    host.getRegionStampSelectBounds() != null ||
                    host.getRegionStampDraftBounds() != null),
            action: ({ host }) => {
                if (host.isRegionStampCopyDialogOpen()) {
                    host.cancelRegionStampCopyDialog();
                } else if (host.isRegionStampPlacementActive()) {
                    host.cancelRegionStampPlacement();
                } else {
                    host.clearRegionStampSelection();
                }
                host.notifyWorkbenchStateChanged();
            },
        },
    ],
};
