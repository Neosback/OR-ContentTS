/**
 * Overlay shape and rotation painting. A tile's overlay shape (0-11) and rotation (0-3) only mean something when the
 * tile has an overlay, and a full-tile overlay (shape 0) has no rotation. Kept pure so the rules are testable.
 */
export const TILE_SHAPE_COUNT = 12;
export const TILE_ROTATION_COUNT = 4;

/** RSPSi's names for the 12 overlay shapes, in stored order (0-11). */
export const TILE_SHAPE_NAMES: readonly string[] = [
    "Full",
    "Diagonal",
    "Left 1/2",
    "Right 1/2",
    "Corner TL",
    "Corner TR",
    "Corner BR",
    "Corner BL",
    "Inverse TL",
    "Inverse TR",
    "Inverse BR",
    "Inverse BL",
];

export const TILE_ROTATION_NAMES: readonly string[] = ["0° North", "90° East", "180° South", "270° West"];

export function clampShape(shape: number): number {
    return Math.max(0, Math.min(TILE_SHAPE_COUNT - 1, Math.round(shape) || 0));
}

export function clampRotation(rotation: number): number {
    return ((Math.round(rotation) || 0) % TILE_ROTATION_COUNT + TILE_ROTATION_COUNT) % TILE_ROTATION_COUNT;
}

/**
 * The shape and rotation a tile ends up with after painting. `shape` / `rotation` are undefined when that part of the
 * brush is switched off (the tile keeps its own value). Tiles without an overlay are left alone.
 */
export function resolveTileShape(
    current: { overlay: number; shape: number; rotation: number },
    paint: { shape?: number; rotation?: number },
): { shape: number; rotation: number } {
    if (current.overlay <= 0) return { shape: current.shape, rotation: current.rotation };
    const shape = paint.shape === undefined ? current.shape : clampShape(paint.shape);
    if (shape === 0) return { shape: 0, rotation: 0 };
    const rotation = paint.rotation === undefined ? current.rotation : clampRotation(paint.rotation);
    return { shape, rotation };
}

/** Writes the resolved shape and rotation into the tile; returns whether anything changed. */
export function paintTileShape(
    layers: { overlays: number; shape: number; rotation: number } & { set: (shape: number, rotation: number) => void },
    paint: { shape?: number; rotation?: number },
): boolean {
    const next = resolveTileShape({ overlay: layers.overlays, shape: layers.shape, rotation: layers.rotation }, paint);
    if (next.shape === layers.shape && next.rotation === layers.rotation) return false;
    layers.set(next.shape, next.rotation);
    return true;
}
