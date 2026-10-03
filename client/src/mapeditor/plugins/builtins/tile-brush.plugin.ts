import { editorCommandKeyBinding } from "../../commands/editor-command-registry";
import type { EditorToolPlugin } from "./builtin-plugin-types";
import { overlayEditorTool } from "./overlay.plugin";
import { underlayEditorTool } from "./underlay.plugin";
import { heightEditorTool } from "./height.plugin";
import { getTileBrushModel } from "./tile-brush-model";

/**
 * The Tile painter: one brush that applies the underlay, overlay, height and tile-flags parts you have switched on.
 * Its palettes live in the Tile painter drawer; the older single-purpose tools (`underlay`, `overlay`, `height`,
 * `tile-flags`) now resolve to this tool with the matching tab in front (see `MapEditor.setEditorTool`).
 */
export const tileBrushEditorTool: EditorToolPlugin = {
    id: "tile-brush",
    name: "Tile painter",
    description: "Paint floors, height and tile flags in one stroke. Pick what to apply in the Tile painter drawer.",
    icon: "paintbrush",
    workspaces: [{ panelId: "editor-tile-painter", activateTab: true }],
    actions: [{ kind: "select-tool", tool: "tile-brush" }],
    usesBrushControls: true,
    keyBindings: [
        editorCommandKeyBinding("tool.select-tile-brush", {
            id: "select-tool",
            defaultChords: [{ code: "KeyB" }],
        }),
        editorCommandKeyBinding("tile-brush.eyedropper", {
            id: "eyedropper",
            defaultChords: [{ code: "KeyI" }],
        }),
    ],
    paintPolicy: {
        // Overlay fill/footprint modifiers and the height Alt-inversion apply when those parts are switched on.
        getPaintModifiers: (context) => {
            const brush = getTileBrushModel(context.host);
            return {
                ...(brush.isEnabled("underlay") ? underlayEditorTool.paintPolicy?.getPaintModifiers?.(context) : undefined),
                ...(brush.isEnabled("height") ? heightEditorTool.paintPolicy?.getPaintModifiers?.(context) : undefined),
                ...(brush.isEnabled("overlay") ? overlayEditorTool.paintPolicy?.getPaintModifiers?.(context) : undefined),
            };
        },
        resolveUnderlayPaintTypeId: (context) => underlayEditorTool.paintPolicy?.resolveUnderlayPaintTypeId?.(context),
        resolveOverlayPaintTypeId: (context) => overlayEditorTool.paintPolicy?.resolveOverlayPaintTypeId?.(context) ?? context.host.selectedOverlayId,
    },
};
