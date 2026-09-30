import type { ComponentType } from "react";
import { ArrowUpDown, Copy, Flag, Layers2, LayoutGrid, MousePointer2, Trash2, type LucideIcon } from "lucide-react";

import type { MapEditorTool } from "./map-editor-kinds";
import type { EditorToolIconName, MapEditorPalettePanelProps } from "./plugins/builtins/builtin-plugin-types";
import { HeightEditorToolPanel } from "./plugins/builtins/height.palette";
import { ObjectDeleteToolPanel } from "./plugins/builtins/object-delete.palette";
import { ObjectSelectorToolPanel } from "./plugins/builtins/object-selector.palette";
import { OverlayEditorToolPanel } from "./plugins/builtins/overlay.palette";
import { RegionStampToolPanel } from "./plugins/builtins/region-stamp.palette";
import { TileFlagsEditorToolPanel } from "./plugins/builtins/tile-flags.palette";
import { UnderlayEditorToolPanel } from "./plugins/builtins/underlay.palette";

/** React-only: icon components for `EditorToolPlugin.icon` names. Removed at the Svelte cut-over. */
export const TOOL_ICONS: Record<EditorToolIconName, LucideIcon> = {
    "layers-2": Layers2,
    "layout-grid": LayoutGrid,
    "arrow-up-down": ArrowUpDown,
    flag: Flag,
    "mouse-pointer-2": MousePointer2,
    "trash-2": Trash2,
    copy: Copy,
};

/** React-only: palette panel per tool (the Svelte UI has its own registry). */
export const TOOL_PALETTES: Partial<Record<MapEditorTool, ComponentType<MapEditorPalettePanelProps>>> = {
    underlay: UnderlayEditorToolPanel,
    overlay: OverlayEditorToolPanel,
    height: HeightEditorToolPanel,
    "tile-flags": TileFlagsEditorToolPanel,
    "object-selector": ObjectSelectorToolPanel,
    "object-delete": ObjectDeleteToolPanel,
    "region-stamp": RegionStampToolPanel,
};
