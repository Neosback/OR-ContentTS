import type { TileFieldSnapshot } from "./map-editor-history";

/**
 * Text for the status bar: where the cursor is and what the tile under it holds. Pure so it can be tested; the bar
 * only lays the segments out.
 */
export type StatusSegment = { label: string; value: string; title?: string };

/** The map square id the cache uses for a world tile: (x / 64) << 8 | (y / 64). */
export function regionIdFor(worldX: number, worldY: number): number {
    return ((worldX >> 6) << 8) | (worldY >> 6);
}

export function formatCount(value: number): string {
    if (value < 1000) return String(Math.round(value));
    if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
    return `${(value / 1_000_000).toFixed(1)}M`;
}

export function formatMegabytes(bytes: number): string {
    return `${Math.round(bytes / 1048576)} MB`;
}

const FLAG_NAMES: readonly [number, string][] = [
    [1, "blocked"],
    [2, "bridge"],
    [4, "no roof"],
    [8, "lower"],
    [16, "no map"],
];

export function describeFlags(flags: number): string {
    if (!flags) return "none";
    const names = FLAG_NAMES.filter(([bit]) => (flags & bit) !== 0).map(([, name]) => name);
    return names.length > 0 ? names.join(", ") : String(flags);
}

/** Cursor segments for a hovered tile; `info` is the stored tile (underlay/overlay are id + 1, 0 = none). */
export function tileTelemetry(world: { worldX: number; worldY: number }, plane: number, info: TileFieldSnapshot | undefined): StatusSegment[] {
    const mapX = world.worldX >> 6;
    const mapY = world.worldY >> 6;
    const segments: StatusSegment[] = [
        { label: "Region", value: `${regionIdFor(world.worldX, world.worldY)} (${mapX}, ${mapY})`, title: "Map square id and coordinates" },
        { label: "Local", value: `${world.worldX & 63}, ${world.worldY & 63}` },
        { label: "World", value: `${world.worldX}, ${world.worldY}` },
        { label: "Plane", value: String(plane) },
    ];
    if (!info) return segments;
    segments.push({ label: "Height", value: String(info.h ?? 0), title: "Stored tile height (more negative is higher)" });
    segments.push({ label: "Underlay", value: info.u && info.u > 0 ? `#${info.u - 1}` : "none" });
    const overlay = info.o && info.o > 0 ? `#${info.o - 1}${info.s ? ` (shape ${info.s}${info.r ? `, rot ${info.r}` : ""})` : ""}` : "none";
    segments.push({ label: "Overlay", value: overlay });
    segments.push({ label: "Flags", value: describeFlags(info.f ?? 0) });
    return segments;
}
