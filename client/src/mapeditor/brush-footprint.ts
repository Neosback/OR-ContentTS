import type { MapEditorBrushType } from "./map-editor-kinds";
import { isInBuiltinBrushShape } from "./plugins/builtins/brushes/brushes.registry";

/**
 * The single source of truth for which tiles a brush covers: the hover preview, painting and the Tile painter's
 * "N tiles" readout all use it, so what you see is what a stroke changes.
 */
export type BrushOffset = readonly [number, number];

export const MIN_BRUSH_RADIUS = 0;
export const MAX_BRUSH_RADIUS = 16;

const cache = new Map<string, ReadonlyArray<BrushOffset>>();

export function clampBrushRadius(radius: number): number {
    if (!Number.isFinite(radius)) return MIN_BRUSH_RADIUS;
    return Math.max(MIN_BRUSH_RADIUS, Math.min(MAX_BRUSH_RADIUS, Math.round(radius)));
}

/** Tile offsets (dx, dy) from the hovered tile that a brush of this shape and radius covers. */
export function brushFootprint(shape: MapEditorBrushType, radius: number): ReadonlyArray<BrushOffset> {
    const r = clampBrushRadius(radius);
    const key = `${shape}:${r}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const offsets: BrushOffset[] = [];
    const low = r === 0 ? 0 : -r; // avoids a -0 offset at radius 0
    for (let dx = low; dx <= r; dx++) {
        for (let dy = low; dy <= r; dy++) {
            if (isInBuiltinBrushShape(dx, dy, r, shape)) offsets.push([dx, dy]);
        }
    }
    cache.set(key, offsets);
    return offsets;
}
