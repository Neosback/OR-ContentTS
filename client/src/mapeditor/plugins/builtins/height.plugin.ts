import type { EditorToolPlugin } from "./builtin-plugin-types";
import { getHeightToolModel } from "./height-tool-model";
import { isEditorToolKeybindHeld } from "../../editor-tool-input";

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
        {
            id: "select-tool",
            name: "Select Height tool",
            description: "Switch active paint tool to Height.",
            defaultChords: [{ code: "Digit3" }],
            action: ({ host }) => {
                host.setEditorTool("height");
            },
        },
        {
            id: "hold-lower-modifier",
            name: "Hold lower modifier",
            description: "While held, height paint lowers terrain and inverts slope direction.",
            defaultChords: [{ code: "AltLeft" }, { code: "AltRight" }],
            trigger: "HELD",
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: () => true,
        },
        {
            id: "mode-raise-lower",
            name: "Height mode: Raise / Lower",
            description: "Switch Height tool mode to Raise / Lower.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                getHeightToolModel(host).setMode("raise-lower");
                return true;
            },
        },
        {
            id: "mode-slope",
            name: "Height mode: Slope",
            description: "Switch Height tool mode to Slope.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                getHeightToolModel(host).setMode("slope");
                return true;
            },
        },
        {
            id: "mode-blend",
            name: "Height mode: Blend",
            description: "Switch Height tool mode to Blend.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                getHeightToolModel(host).setMode("blend");
                return true;
            },
        },
        {
            id: "mode-smooth",
            name: "Height mode: Smooth",
            description: "Switch Height tool mode to Smooth.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                getHeightToolModel(host).setMode("smooth");
                return true;
            },
        },
        {
            id: "increase-step",
            name: "Increase height step",
            description: "Increase Height step slider value.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                host.heightAdjustStep = Math.max(1, Math.min(256, host.heightAdjustStep + 1));
                host.notifyWorkbenchStateChanged();
                return true;
            },
        },
        {
            id: "decrease-step",
            name: "Decrease height step",
            description: "Decrease Height step slider value.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                host.heightAdjustStep = Math.max(1, Math.min(256, host.heightAdjustStep - 1));
                host.notifyWorkbenchStateChanged();
                return true;
            },
        },
        {
            id: "increase-slope-strength",
            name: "Increase slope strength",
            description: "Increase Slope strength slider value.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                const model = getHeightToolModel(host);
                model.setSlopeStrength(model.slopeStrength + 0.05);
                return true;
            },
        },
        {
            id: "decrease-slope-strength",
            name: "Decrease slope strength",
            description: "Decrease Slope strength slider value.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                const model = getHeightToolModel(host);
                model.setSlopeStrength(model.slopeStrength - 0.05);
                return true;
            },
        },
        {
            id: "increase-blend-strength",
            name: "Increase blend strength",
            description: "Increase Blend strength slider value.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                const model = getHeightToolModel(host);
                model.setBlendStrength(model.blendStrength + 0.05);
                return true;
            },
        },
        {
            id: "decrease-blend-strength",
            name: "Decrease blend strength",
            description: "Decrease Blend strength slider value.",
            defaultChords: [],
            shouldProcess: ({ host }) => host.getEditorTool() === "height",
            action: ({ host }) => {
                const model = getHeightToolModel(host);
                model.setBlendStrength(model.blendStrength - 0.05);
                return true;
            },
        },
    ],
};
