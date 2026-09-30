import { editorCommandKeyBinding } from "../../commands/editor-command-registry";
import type { EditorToolPlugin } from "./builtin-plugin-types";

export const tileFlagsEditorTool: EditorToolPlugin = {
    id: "tile-flags",
    name: "Tile flags",
    description: "View and paint OSRS tile render flags (unwalkable, bridge, roof, Z-1, map draw).",
    icon: "flag",
    workspaces: [{ panelId: "editor-tile-flags", activateTab: true }],
    actions: [{ kind: "select-tool", tool: "tile-flags" }],
    keyBindings: [
        editorCommandKeyBinding("tool.select-tile-flags", {
            id: "select-tool",
            defaultChords: [{ code: "Digit5" }],
        }),
    ],
};
