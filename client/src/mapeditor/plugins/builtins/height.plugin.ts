import { getTileBrushFocus } from "./tile-brush-model";
import { editorCommandKeyBinding } from "../../commands/editor-command-registry";
import { isEditorToolKeybindHeld } from "../../editor-tool-input";
import type { EditorToolPlugin } from "./builtin-plugin-types";

export const heightEditorTool: EditorToolPlugin = {
    id: "height",
    name: "Height",
    description: "Terrain height editing with raise/lower, slope, blend, and smooth modes.",
    icon: "arrow-up-down",
    workspaces: [{ panelId: "editor-height", activateTab: true }],
    actions: [{ kind: "select-tool", tool: "height" }],
    data: {
        applyHeightStepFromRawInput: (host, raw) => {
            host.heightAdjustStep = Math.max(1, Math.min(256, Math.round(raw) || 1));
        },
        getHeightAdjustment: (host, modifiers) =>
            modifiers.heightInvertWithAlt ? host.heightAdjustStep : -host.heightAdjustStep,
    },
    paintPolicy: {
        getPaintModifiers: ({ host }) => {
            const lowerModifierHeld = isEditorToolKeybindHeld(host, "height:hold-lower-modifier", [
                { code: "AltLeft" },
                { code: "AltRight" },
            ]);
            return {
                heightInvertWithAlt: lowerModifierHeld,
                controlWheelAdjustsBrushSize: true,
            };
        },
    },
    keyBindings: [
        editorCommandKeyBinding("tool.select-height", {
            id: "select-tool",
            defaultChords: [{ code: "Digit3" }],
        }),
        {
            id: "hold-lower-modifier",
            name: "Hold lower modifier",
            description: "While held, height paint lowers terrain and inverts slope direction.",
            defaultChords: [{ code: "AltLeft" }, { code: "AltRight" }],
            trigger: "HELD",
            shouldProcess: ({ host }) => getTileBrushFocus(host) === "height",
            action: () => true,
        },
        editorCommandKeyBinding("height.mode.raise-lower", { id: "mode-raise-lower", defaultChords: [] }),
        editorCommandKeyBinding("height.mode.slope", { id: "mode-slope", defaultChords: [] }),
        editorCommandKeyBinding("height.mode.blend", { id: "mode-blend", defaultChords: [] }),
        editorCommandKeyBinding("height.mode.smooth", { id: "mode-smooth", defaultChords: [] }),
        editorCommandKeyBinding("height.step.increase", { id: "increase-step", defaultChords: [] }),
        editorCommandKeyBinding("height.step.decrease", { id: "decrease-step", defaultChords: [] }),
        editorCommandKeyBinding("height.slope-strength.increase", {
            id: "increase-slope-strength",
            defaultChords: [],
        }),
        editorCommandKeyBinding("height.slope-strength.decrease", {
            id: "decrease-slope-strength",
            defaultChords: [],
        }),
        editorCommandKeyBinding("height.blend-strength.increase", {
            id: "increase-blend-strength",
            defaultChords: [],
        }),
        editorCommandKeyBinding("height.blend-strength.decrease", {
            id: "decrease-blend-strength",
            defaultChords: [],
        }),
    ],
};
