import ArrowDownToLine from "@lucide/svelte/icons/arrow-down-to-line";
import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
import Copy from "@lucide/svelte/icons/copy";
import Flag from "@lucide/svelte/icons/flag";
import Layers from "@lucide/svelte/icons/layers";
import Layers2 from "@lucide/svelte/icons/layers-2";
import LayoutGrid from "@lucide/svelte/icons/layout-grid";
import MousePointer2 from "@lucide/svelte/icons/mouse-pointer-2";
import Mountain from "@lucide/svelte/icons/mountain";
import Sparkles from "@lucide/svelte/icons/sparkles";
import Trash2 from "@lucide/svelte/icons/trash-2";
import Waves from "@lucide/svelte/icons/waves";
import type { Component } from "svelte";

import type { HeightModeIconName } from "../../mapeditor/plugins/builtins/height-brush-settings.shared";
import type { EditorToolIconName } from "../../mapeditor/plugins/builtins/builtin-plugin-types";

type Icon = Component<any>;

/** Icon components for `EditorToolPlugin.icon` names. */
export const TOOL_ICONS: Record<EditorToolIconName, Icon> = {
    "layers-2": Layers2,
    "layout-grid": LayoutGrid,
    "arrow-up-down": ArrowUpDown,
    flag: Flag,
    "mouse-pointer-2": MousePointer2,
    "trash-2": Trash2,
    copy: Copy,
};

/** Icon components for `HEIGHT_MODES[].icon` names. */
export const HEIGHT_MODE_ICONS: Record<HeightModeIconName, Icon> = {
    "arrow-up-down": ArrowUpDown,
    mountain: Mountain,
    waves: Waves,
    sparkles: Sparkles,
    layers: Layers,
};

export { ArrowDownToLine };
