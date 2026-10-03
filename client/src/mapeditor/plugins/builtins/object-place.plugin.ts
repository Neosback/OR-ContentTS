import { editorCommandKeyBinding } from "../../commands/editor-command-registry";
import type { EditorToolPlugin } from "./builtin-plugin-types";

/**
 * Putting objects down. Select keeps picking, moving, rotating and copying; Place is where copies go: the object you copied
 * (C in Select) or one picked from the catalog follows the cursor and every click puts one down. The clipboard outlives
 * the tool, so switching back to Select does not lose it (V pastes it again). The keys it shares with Select (R, Esc, ...)
 * are defined once, on the Select plugin, which serves both.
 */
export const objectPlaceEditorTool: EditorToolPlugin = {
    id: "object-place",
    name: "Place",
    description: "Put copies of an object onto tiles: the one you copied (C in Select, V to paste again) or one picked from the catalog. Click to place, R rotates, Esc finishes.",
    icon: "package-plus",
    workspaces: [{ panelId: "editor-object-selector", activateTab: true }],
    actions: [{ kind: "select-tool", tool: "object-place" }],
    usesBrushControls: false,
    keyBindings: [
        editorCommandKeyBinding("tool.select-object-place", {
            id: "select-tool",
            defaultChords: [{ code: "Digit7" }],
        }),
    ],
};
