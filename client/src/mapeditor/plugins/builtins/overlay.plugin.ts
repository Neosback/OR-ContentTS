import { getTileBrushModel } from "./tile-brush-model";
import { isEditorToolKeybindHeld } from "../../editor-tool-input";
import { editorCommandKeyBinding } from "../../commands/editor-command-registry";
import type { EditorToolDataFns, EditorToolPlugin } from "./builtin-plugin-types";
import { getOverlayGradientModel } from "./overlay-gradient-model";

export const overlayToolData: EditorToolDataFns = {
    selectPrimary: (host, id) => {
        host.selectedOverlayId = id;
        host.setEditorTool("overlay");
    },
    clearPrimary: (host) => {
        host.selectedOverlayId = -1;
    },
};

export const overlayEditorTool: EditorToolPlugin = {
    id: "overlay",
    name: "Overlay",
    description:
        "Paint overlay floors on tiles. Use the Overlays panel to pick a type. Fill/target modes are controlled by held keybinds.",
    icon: "layout-grid",
    workspaces: [
        { panelId: "editor-overlays", activateTab: true },
        { panelId: "editor-underlays", activateTab: true },
    ],
    actions: [{ kind: "select-tool", tool: "overlay" }],
    data: overlayToolData,
    keyBindings: [
        editorCommandKeyBinding("tool.select-overlay", {
            id: "select-tool",
            defaultChords: [{ code: "Digit2" }],
        }),
        {
            id: "toggle-flood-mode",
            name: "Toggle fill mode",
            description: "Enable same-id flood fill while Ctrl+Shift or Ctrl+Alt is held.",
            defaultChords: [
                { code: ["ControlLeft", "ShiftLeft"] },
                { code: ["ControlRight", "ShiftRight"] },
                { code: ["ControlLeft", "AltLeft"] },
                { code: ["ControlRight", "AltRight"] },
            ],
            trigger: "HELD",
            shouldProcess: ({ host }) => host.getEditorTool() === "tile-brush" && getTileBrushModel(host).isEnabled("overlay"),
            action: () => true,
        },
        {
            id: "toggle-target-mode",
            name: "Hold target mode",
            description: "Restrict to overlay footprint while Ctrl is held.",
            defaultChords: [{ code: "ControlLeft" }, { code: "ControlRight" }],
            trigger: "HELD",
            shouldProcess: ({ host }) => host.getEditorTool() === "tile-brush" && getTileBrushModel(host).isEnabled("overlay"),
            action: () => true,
        },
    ],
    paintPolicy: {
        resolveOverlayPaintTypeId: ({ host, worldX, worldY }) =>
            getOverlayGradientModel(host).resolvePaintTypeId(worldX, worldY, host.selectedOverlayId),
        getPaintModifiers: ({ host, input }) => {
            const floodHeldByKeybind = isEditorToolKeybindHeld(host, "overlay:toggle-flood-mode", [
                { code: ["ControlLeft", "ShiftLeft"] },
                { code: ["ControlRight", "ShiftRight"] },
                { code: ["ControlLeft", "AltLeft"] },
                { code: ["ControlRight", "AltRight"] },
            ]);
            const targetHeldByKeybind = isEditorToolKeybindHeld(host, "overlay:toggle-target-mode", [
                { code: "ControlLeft" },
                { code: "ControlRight" },
            ]);
            // Hard fallback so default behavior still works even if user keybind overrides are cleared/remapped.
            const targetHeld = targetHeldByKeybind || input.isControlDown();
            const floodHeld =
                floodHeldByKeybind ||
                (input.isControlDown() && (input.isShiftDown() || input.isAltDown()));
            return {
                overlayRestrictToFootprintWithControl: targetHeld || floodHeld,
                overlaySameIdFloodWithControlAlt: floodHeld,
            };
        },
    },
};
