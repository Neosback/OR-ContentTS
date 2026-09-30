import type { EditorToolPlugin } from "./builtin-plugin-types";
import { getUnderlayGradientModel } from "./underlay-gradient-model";
import { isEditorToolKeybindHeld } from "../../editor-tool-input";

export const underlayEditorTool: EditorToolPlugin = {
    id: "underlay",
    name: "Underlay",
    description: "Paint underlay floors with swatches or generated gradient palettes.",
    icon: "layers-2",
    workspaces: [
        { panelId: "editor-underlays", activateTab: true },
        { panelId: "editor-overlays", activateTab: true },
    ],
    actions: [{ kind: "select-tool", tool: "underlay" }],
    data: {
        selectPrimary: (host, id) => {
            host.selectedUnderlayId = id;
            host.setEditorTool("underlay");
        },
    },
    keyBindings: [
        {
            id: "select-tool",
            name: "Select Underlay tool",
            description: "Switch active paint tool to Underlay.",
            defaultChords: [{ code: "Digit1" }],
            action: ({ host }) => {
                host.setEditorTool("underlay");
            },
        },
        {
            id: "toggle-gradient-phase",
            name: "Hold gradient phase modifier",
            description: "Reserved keybind for underlay gradient workflows.",
            defaultChords: [{ code: "ControlLeft" }, { code: "ControlRight" }],
            trigger: "HELD",
            shouldProcess: ({ host }) => host.getEditorTool() === "underlay",
            action: () => true,
        },
    ],
    paintPolicy: {
        resolveUnderlayPaintTypeId: ({ host, worldX, worldY }) =>
            getUnderlayGradientModel(host).resolvePaintTypeId(worldX, worldY, host.selectedUnderlayId),
        getPaintModifiers: ({ host }) => {
            const ctrlHeld = isEditorToolKeybindHeld(host, "underlay:toggle-gradient-phase", [
                { code: "ControlLeft" },
                { code: "ControlRight" },
            ]);
            return {
                overlayRestrictToFootprintWithControl: false,
                overlaySameIdFloodWithControlAlt: false,
                heightInvertWithAlt: false,
                controlWheelAdjustsBrushSize: !ctrlHeld,
            };
        },
    },
};
