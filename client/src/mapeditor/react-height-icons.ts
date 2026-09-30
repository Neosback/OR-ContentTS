import { ArrowUpDown, Layers, Mountain, Sparkles, Waves, type LucideIcon } from "lucide-react";

import type { HeightModeIconName } from "./plugins/builtins/height-brush-settings.shared";

/** React-only: icon components for `HEIGHT_MODES[].icon` names. */
export const HEIGHT_MODE_ICONS: Record<HeightModeIconName, LucideIcon> = {
    "arrow-up-down": ArrowUpDown,
    mountain: Mountain,
    waves: Waves,
    sparkles: Sparkles,
    layers: Layers,
};
