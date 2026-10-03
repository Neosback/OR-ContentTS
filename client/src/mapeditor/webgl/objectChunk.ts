import { Scene } from "../../rs/scene/Scene";

/** Tiles per side of an object mesh chunk (8×8 = 64 tiles, 64 chunks per map square). */
export const OBJECT_CHUNK_TILES = 8;

export const OBJECT_CHUNKS_PER_AXIS = Scene.MAP_SQUARE_SIZE / OBJECT_CHUNK_TILES;

export const OBJECT_CHUNK_COUNT = OBJECT_CHUNKS_PER_AXIS * OBJECT_CHUNKS_PER_AXIS;

export type ObjectChunkTileBounds = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

export function getObjectChunkId(localTileX: number, localTileY: number): number {
    const cx = localTileX >> 3;
    const cy = localTileY >> 3;
    return cy * OBJECT_CHUNKS_PER_AXIS + cx;
}

export function getObjectChunkBounds(chunkId: number): ObjectChunkTileBounds {
    const cx = chunkId % OBJECT_CHUNKS_PER_AXIS;
    const cy = (chunkId / OBJECT_CHUNKS_PER_AXIS) | 0;
    const minX = cx * OBJECT_CHUNK_TILES;
    const minY = cy * OBJECT_CHUNK_TILES;
    return {
        minX,
        minY,
        maxX: minX + OBJECT_CHUNK_TILES - 1,
        maxY: minY + OBJECT_CHUNK_TILES - 1,
    };
}

export function getObjectChunkIdsForTileRect(
    localMinX: number,
    localMinY: number,
    localMaxX: number,
    localMaxY: number,
): number[] {
    const chunkMinX = Math.max(0, localMinX >> 3);
    const chunkMinY = Math.max(0, localMinY >> 3);
    const chunkMaxX = Math.min(OBJECT_CHUNKS_PER_AXIS - 1, localMaxX >> 3);
    const chunkMaxY = Math.min(OBJECT_CHUNKS_PER_AXIS - 1, localMaxY >> 3);
    const ids: number[] = [];
    for (let cy = chunkMinY; cy <= chunkMaxY; cy++) {
        for (let cx = chunkMinX; cx <= chunkMaxX; cx++) {
            ids.push(cy * OBJECT_CHUNKS_PER_AXIS + cx);
        }
    }
    return ids;
}

/**
 * How far an object edit reaches into neighbouring tiles: walls and large objects share normals with what stands next to
 * them (so joins shade smoothly and embedded end caps hide), which means a neighbour's mesh changes when this one does.
 */
export const OBJECT_NORMAL_MERGE_MARGIN_TILES = 2;

/** The chunks to rebuild after editing objects inside a tile rectangle: the rectangle's chunks plus those it blends into. */
export function getObjectChunkIdsAffectedByEdit(
    localMinX: number,
    localMinY: number,
    localMaxX: number,
    localMaxY: number,
): number[] {
    const margin = OBJECT_NORMAL_MERGE_MARGIN_TILES;
    return getObjectChunkIdsForTileRect(localMinX - margin, localMinY - margin, localMaxX + margin, localMaxY + margin);
}

export function sceneTileIntersectsChunk(
    sceneTileX: number,
    sceneTileY: number,
    borderSize: number,
    chunkId: number,
): boolean {
    const localX = sceneTileX - borderSize;
    const localY = sceneTileY - borderSize;
    const bounds = getObjectChunkBounds(chunkId);
    return (
        localX >= bounds.minX &&
        localX <= bounds.maxX &&
        localY >= bounds.minY &&
        localY <= bounds.maxY
    );
}

export function locFootprintIntersectsChunk(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    borderSize: number,
    chunkId: number,
): boolean {
    const bounds = getObjectChunkBounds(chunkId);
    const chunkMinX = borderSize + bounds.minX;
    const chunkMinY = borderSize + bounds.minY;
    const chunkMaxX = borderSize + bounds.maxX;
    const chunkMaxY = borderSize + bounds.maxY;
    return startX <= chunkMaxX && endX >= chunkMinX && startY <= chunkMaxY && endY >= chunkMinY;
}
