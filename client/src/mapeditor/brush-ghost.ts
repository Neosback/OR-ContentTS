import { getTileShapeTriangles, type TileShapeTriangle } from "../rs/scene/SceneTileModel";
import { resolveTileShape } from "./tile-shape-paint";

/**
 * The "ghost" of the Tile painter brush: what one tile would look like after a stroke, drawn translucent under the
 * cursor before anything is painted. Pure so the rules (which are the same ones painting uses) can be tested; the
 * renderer only turns the plan into triangles.
 */
export type GhostTileInput = {
    /** The tile as stored: underlay/overlay are id + 1 (0 = none), shape 0-11, rotation 0-3. */
    current: { u: number; o: number; s: number; r: number };
    /** The parts of the brush that are switched on; undefined = leave that part of the tile alone. */
    paint: {
        underlayId?: number;
        /** -1 clears the overlay. */
        overlayId?: number;
        shape?: number;
        rotation?: number;
        /** A tile height to stamp (scene units, more negative = higher). */
        height?: number;
    };
};

export type GhostTilePlan = {
    /** Stored underlay value (id + 1) and the triangles it fills (0..1 tile units). */
    underlay?: { value: number; triangles: readonly TileShapeTriangle[] };
    overlay?: { value: number; triangles: readonly TileShapeTriangle[] };
    height?: number;
};

/** Returns undefined when the stroke would leave this tile exactly as it is. */
export function planGhostTile({ current, paint }: GhostTileInput): GhostTilePlan | undefined {
    const underlayValue = paint.underlayId === undefined ? current.u : paint.underlayId + 1;
    const overlayValue = paint.overlayId === undefined ? current.o : paint.overlayId + 1;

    let shape = current.s;
    let rotation = current.r;
    if (overlayValue <= 0) {
        shape = 0;
        rotation = 0;
    } else {
        ({ shape, rotation } = resolveTileShape({ overlay: overlayValue, shape: current.s, rotation: current.r }, { shape: paint.shape, rotation: paint.rotation }));
    }

    const changesFloor = underlayValue !== current.u || overlayValue !== current.o || shape !== current.s || rotation !== current.r;
    if (!changesFloor && paint.height === undefined) return undefined;

    const triangles = getTileShapeTriangles(overlayValue > 0 ? shape : undefined, rotation);
    const plan: GhostTilePlan = {};
    if (changesFloor) {
        if (underlayValue > 0 && triangles.underlay.length > 0) plan.underlay = { value: underlayValue, triangles: triangles.underlay };
        if (overlayValue > 0 && triangles.overlay.length > 0) plan.overlay = { value: overlayValue, triangles: triangles.overlay };
    }
    if (paint.height !== undefined) plan.height = paint.height;
    return plan;
}
