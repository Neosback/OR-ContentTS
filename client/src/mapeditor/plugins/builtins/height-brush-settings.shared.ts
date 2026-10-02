import type { HeightPaintMode } from "./height-tool-model";

/** Lucide icon names; each UI maps them to its own components. */
export type HeightModeIconName = "arrow-up-down" | "mountain" | "waves" | "sparkles" | "layers";

export const HEIGHT_MODES: readonly {
    id: HeightPaintMode;
    name: string;
    description: string;
    icon: HeightModeIconName;
}[] = [
    {
        id: "raise-lower",
        name: "Raise / Lower",
        description: "Default tile height editing. Paint raises terrain; hold Alt to lower.",
        icon: "arrow-up-down",
    },
    {
        id: "slope",
        name: "Slope",
        description: "Creates a directional ramp across the brushed area.",
        icon: "mountain",
    },
    {
        id: "blend",
        name: "Blend",
        description: "Blends tiles into nearby terrain for softer transitions.",
        icon: "waves",
    },
    {
        id: "smooth",
        name: "Smooth",
        description: "Averages neighboring heights for classic smoothing.",
        icon: "sparkles",
    },
    {
        id: "flatten",
        name: "Flatten",
        description: "Pulls tiles toward the hovered anchor height for plateaus.",
        icon: "layers",
    },
    {
        id: "set",
        name: "Set height",
        description: "Stamps an exact height onto every brushed tile (\"Send tile to tile brush\" fills it in).",
        icon: "layers",
    },
    {
        id: "terrace",
        name: "Terrace",
        description: "Snaps terrain into stepped levels for layered landforms.",
        icon: "layers",
    },
];
