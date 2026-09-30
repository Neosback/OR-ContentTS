import { describe, expect, it } from "vitest";

import type { EditBatchV1 } from "./edit-format-v1";
import {
    collectEditReplayMapRefs,
    tileSnapshotMatchesExpected,
} from "./edit-format-v1-replay";

const batch: EditBatchV1 = {
    format: "openrune.edit-batch",
    version: 1,
    id: "batch",
    createdAt: 1,
    transactions: [
        {
            id: "a",
            label: "A",
            source: "height",
            timestamp: 1,
            mutations: [
                {
                    kind: "map.tile",
                    mapX: 50,
                    mapY: 51,
                    level: 0,
                    localX: 1,
                    localY: 2,
                    before: { h: 10 },
                    after: { h: 20 },
                },
                {
                    kind: "map.objects",
                    mapX: 51,
                    mapY: 51,
                    level: 0,
                    before: [],
                    after: [{ id: 100, flags: 10, worldX: 3264, worldY: 3264 }],
                },
            ],
            affectedMaps: [
                { x: 50, y: 51 },
                { x: 51, y: 51 },
            ],
            tileCount: 1,
        },
        {
            id: "b",
            label: "B",
            source: "overlay",
            timestamp: 2,
            mutations: [
                {
                    kind: "map.tile",
                    mapX: 50,
                    mapY: 51,
                    level: 0,
                    localX: 3,
                    localY: 4,
                    before: { o: 0 },
                    after: { o: 5 },
                },
            ],
            affectedMaps: [{ x: 50, y: 51 }],
            tileCount: 1,
        },
    ],
};

describe("Edit Format v1 replay helpers", () => {
    it("collects affected map squares once in mutation order", () => {
        expect(collectEditReplayMapRefs(batch)).toEqual([
            { mapX: 50, mapY: 51, mapId: (50 << 8) | 51 },
            { mapX: 51, mapY: 51, mapId: (51 << 8) | 51 },
        ]);
    });

    it("matches only fields persisted in a sparse tile snapshot", () => {
        const current = {
            h: 100,
            hl: [100, 0, -240, -480],
            u: 3,
            o: 5,
            s: 2,
            r: 1,
            f: 4,
        };

        expect(tileSnapshotMatchesExpected(current, { h: 100, o: 5 })).toBe(true);
        expect(tileSnapshotMatchesExpected(current, { h: 101 })).toBe(false);
        expect(tileSnapshotMatchesExpected(current, { hl: [100, 0, -240, -480] })).toBe(true);
        expect(tileSnapshotMatchesExpected(current, { hl: [100, 0] })).toBe(false);
    });
});
