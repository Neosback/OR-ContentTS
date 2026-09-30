import type { EditorToolPlugin } from "./builtin-plugin-types";

export const tileFlagsEditorTool: EditorToolPlugin = {
    id: "tile-flags",
    name: "Tile flags",
    description: "View and paint OSRS tile render flags (unwalkable, bridge, roof, Z-1, map draw).",
    icon: "flag",
    workspaces: [{ panelId: "editor-tile-flags", activateTab: true }],
    actions: [{ kind: "select-tool", tool: "tile-flags" }],
    keyBindings: [
        {
            id: "select-tool",
            name: "Select Tile flags tool",
            description: "Switch active paint tool to Tile flags.",
            defaultChords: [{ code: "Digit5" }],
            action: ({ host }) => {
                host.setEditorTool("tile-flags");
            },
        },
    ],
};
