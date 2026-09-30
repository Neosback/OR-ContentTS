import { describe, expect, it } from "vitest";

import { MapEditHistory } from "./map-editor-history";

describe("MapEditHistory transactions", () => {
    it("commits mixed terrain and object mutations as one named transaction", () => {
        const history = new MapEditHistory();

        history.beginTransaction("region-stamp", "Paste region");
        history.recordMutation({
            kind: "map.tile",
            mapId: 0x3233,
            level: 0,
            localTileId: (2 << 8) | 3,
            before: { h: 100, u: 1 },
            after: { h: 120, u: 2 },
        });
        history.recordMutation({
            kind: "map.objects",
            mapId: 0x3333,
            level: 1,
            sceneBorderSize: 6,
            before: [{ level: 1, tileX: 4, tileY: 5 }],
            after: [{ level: 1, tileX: 6, tileY: 7 }],
        });
        const entry = history.commitTransaction();

        expect(entry).toBeDefined();
        expect(entry?.label).toBe("Paste region");
        expect(entry?.source).toBe("region-stamp");
        expect(entry?.tool).toBe("region-stamp");
        expect(entry?.mutations.map((mutation) => mutation.kind)).toEqual(["map.tile", "map.objects"]);
        expect(entry?.mapIds).toEqual([0x3233, 0x3333]);
        expect(entry?.tileCount).toBe(1);
        expect(history.getSnapshot().entries).toHaveLength(1);
    });

    it("does not create entries for empty or cancelled transactions", () => {
        const history = new MapEditHistory();

        history.beginTransaction("height", "No-op");
        expect(history.commitTransaction()).toBeUndefined();

        history.beginTransaction("height", "Cancelled");
        history.recordMutation({
            kind: "map.tile",
            mapId: 1,
            level: 0,
            localTileId: 0,
            before: { h: 10 },
            after: { h: 20 },
        });
        history.cancelTransaction();

        expect(history.getSnapshot().entries).toHaveLength(0);
    });

    it("merges repeated tile mutations while preserving the original before state", () => {
        const history = new MapEditHistory();

        history.beginTransaction("height", "Brush stroke");
        history.recordMutation({
            kind: "map.tile",
            mapId: 1,
            level: 0,
            localTileId: 0,
            before: { h: 10 },
            after: { h: 20 },
        });
        history.recordMutation({
            kind: "map.tile",
            mapId: 1,
            level: 0,
            localTileId: 0,
            before: { h: 20 },
            after: { h: 30 },
        });
        const entry = history.commitTransaction();

        expect(entry?.mutations).toHaveLength(1);
        expect(entry?.mutations[0]).toMatchObject({
            kind: "map.tile",
            before: { h: 10 },
            after: { h: 30 },
        });
    });

    it("imports an already-applied transaction with stable metadata and replay projections", () => {
        const history = new MapEditHistory();

        const entry = history.appendAppliedTransaction({
            id: "42",
            label: "Loaded project edit",
            source: "region-stamp",
            timestamp: 123456,
            mutations: [
                {
                    kind: "map.tile",
                    mapId: 0x3233,
                    level: 0,
                    localTileId: (2 << 8) | 3,
                    before: { h: 100 },
                    after: { h: 120 },
                },
                {
                    kind: "map.objects",
                    mapId: 0x3333,
                    level: 1,
                    sceneBorderSize: 6,
                    before: [{ level: 1, tileX: 4, tileY: 5 }],
                    after: [{ level: 1, tileX: 6, tileY: 7 }],
                },
            ],
            mapIds: [0x3233, 0x3333],
            tileCount: 1,
        });

        expect(entry.id).toBe("42");
        expect(entry.timestamp).toBe(123456);
        expect(entry.tool).toBe("region-stamp");
        expect(entry.deltas).toEqual([
            {
                mapId: 0x3233,
                level: 0,
                tiles: [[(2 << 8) | 3, { h: 100 }, { h: 120 }]],
            },
        ]);
        expect(entry.objectDeltas[0]).toMatchObject({
            mapId: 0x3333,
            level: 1,
            sceneBorderSize: 6,
        });
        expect(history.getSnapshot()).toMatchObject({
            currentIndex: 0,
            canUndo: true,
            canRedo: false,
            editedMapIds: [0x3233, 0x3333],
        });
    });

    it("truncates redo history when an applied project transaction is appended", () => {
        const history = new MapEditHistory();

        history.beginTransaction("height", "A");
        history.recordMutation({
            kind: "map.tile",
            mapId: 1,
            level: 0,
            localTileId: 0,
            before: { h: 0 },
            after: { h: 10 },
        });
        history.commitTransaction();

        history.beginTransaction("height", "B");
        history.recordMutation({
            kind: "map.tile",
            mapId: 1,
            level: 0,
            localTileId: 0,
            before: { h: 10 },
            after: { h: 20 },
        });
        history.commitTransaction();
        history.markUndone();

        history.appendAppliedTransaction({
            id: "project-c",
            label: "C",
            source: "bulk",
            timestamp: 200,
            mutations: [
                {
                    kind: "map.tile",
                    mapId: 1,
                    level: 0,
                    localTileId: 0,
                    before: { h: 10 },
                    after: { h: 30 },
                },
            ],
            mapIds: [1],
            tileCount: 1,
        });

        expect(history.getSnapshot().entries.map((item) => item.label)).toEqual(["A", "C"]);
        expect(history.getSnapshot().canRedo).toBe(false);
    });

    it("truncates the redo branch when a new transaction is committed after undo", () => {
        const history = new MapEditHistory();

        const commitHeight = (label: string, before: number, after: number) => {
            history.beginTransaction("height", label);
            history.recordMutation({
                kind: "map.tile",
                mapId: 1,
                level: 0,
                localTileId: 0,
                before: { h: before },
                after: { h: after },
            });
            history.commitTransaction();
        };

        commitHeight("A", 0, 10);
        commitHeight("B", 10, 20);
        history.markUndone();
        expect(history.getSnapshot().canRedo).toBe(true);

        commitHeight("C", 10, 30);

        const snapshot = history.getSnapshot();
        expect(snapshot.entries.map((entry) => entry.label)).toEqual(["A", "C"]);
        expect(snapshot.canRedo).toBe(false);
        expect(snapshot.currentIndex).toBe(1);
    });
});
