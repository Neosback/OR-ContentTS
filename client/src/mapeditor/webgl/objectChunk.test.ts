import { describe, expect, it } from "vitest";

import { getObjectChunkIdsAffectedByEdit, getObjectChunkIdsForTileRect } from "./objectChunk";

describe("object chunks affected by an edit", () => {
    it("rebuilds only the edited chunk when the edit is well inside it", () => {
        expect(getObjectChunkIdsAffectedByEdit(10, 10, 11, 11)).toEqual(getObjectChunkIdsForTileRect(10, 10, 11, 11));
    });

    it("also rebuilds the neighbour a wall blends into when the edit sits on a chunk edge", () => {
        // tile 7 is the last column of chunk 0; a wall placed there shares normals with tile 8 in chunk 1
        const ids = getObjectChunkIdsAffectedByEdit(7, 3, 7, 3);
        expect(ids).toContain(0);
        expect(ids).toContain(1);
    });

    it("stays inside the map square", () => {
        const ids = getObjectChunkIdsAffectedByEdit(0, 0, 0, 0);
        expect(ids).toEqual([0]);
        expect(Math.max(...getObjectChunkIdsAffectedByEdit(63, 63, 63, 63))).toBe(63);
    });
});
