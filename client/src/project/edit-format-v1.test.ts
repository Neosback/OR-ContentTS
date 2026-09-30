import { describe, expect, it } from "vitest";

import goldenFixture from "./fixtures/edit-format-v1.golden.json";

import type { EditorTransaction } from "../mapeditor/editor-transaction";
import {
    EDIT_FORMAT_V1_SCHEMA,
    EditFormatV1Error,
    createEditBatchV1,
    decodeEditBatchV1,
    encodeEditBatchV1,
    transactionToEditFormatV1,
    validateEditBatchV1,
} from "./edit-format-v1";

function sampleTransaction(): EditorTransaction {
    return {
        id: "tx-1",
        label: "Paste region",
        source: "region-stamp",
        timestamp: 1_700_000_000_000,
        mapIds: [0x3233],
        tileCount: 1,
        mutations: [
            {
                kind: "map.tile",
                mapId: 0x3233,
                level: 0,
                localTileId: (2 << 8) | 3,
                before: { h: 100, u: 1 },
                after: { h: 120, u: 2 },
            },
            {
                kind: "map.objects",
                mapId: 0x3233,
                level: 0,
                sceneBorderSize: 6,
                before: [
                    {
                        level: 0,
                        tileX: 8,
                        tileY: 9,
                        wall: {
                            tag: "1",
                            flags: 2,
                            x: 0,
                            y: 0,
                            height: 0,
                            entity0: {
                                id: 100,
                                type: 2,
                                rotation: 0,
                                level: 0,
                                tileX: 8,
                                tileY: 9,
                                seqId: -1,
                                seqRandomStart: false,
                            },
                        },
                    },
                ],
                after: [
                    {
                        level: 0,
                        tileX: 10,
                        tileY: 11,
                        loc: {
                            tag: "2",
                            flags: 66,
                            level: 0,
                            x: 0,
                            y: 0,
                            height: 0,
                            rotation: 1,
                            startX: 10,
                            startY: 11,
                            endX: 10,
                            endY: 11,
                            entity: {
                                id: 200,
                                type: 2,
                                rotation: 1,
                                level: 0,
                                tileX: 10,
                                tileY: 11,
                                seqId: -1,
                                seqRandomStart: false,
                            },
                        },
                    },
                ],
            },
        ],
    };
}

describe("Edit Format v1", () => {
    it("normalizes internal transaction coordinates into a backend-friendly document", () => {
        const transaction = transactionToEditFormatV1(sampleTransaction());

        expect(transaction.affectedMaps).toEqual([{ x: 50, y: 51 }]);
        expect(transaction.tileCount).toBe(1);
        expect(transaction.mutations[0]).toEqual({
            kind: "map.tile",
            mapX: 50,
            mapY: 51,
            level: 0,
            localX: 2,
            localY: 3,
            before: { h: 100, u: 1 },
            after: { h: 120, u: 2 },
        });
        expect(transaction.mutations[1]).toEqual({
            kind: "map.objects",
            mapX: 50,
            mapY: 51,
            level: 0,
            before: [{ id: 100, flags: 2, worldX: 3202, worldY: 3267 }],
            after: [{ id: 200, flags: 66, worldX: 3204, worldY: 3269 }],
        });
    });

    it("round-trips canonical JSON", () => {
        const batch = createEditBatchV1([sampleTransaction()], {
            id: "batch-1",
            createdAt: 1_700_000_000_100,
        });

        const encoded = encodeEditBatchV1(batch);
        const decoded = decodeEditBatchV1(encoded);

        expect(decoded).toEqual(batch);
        expect(decoded.format).toBe("openrune.edit-batch");
        expect(decoded.version).toBe(1);
    });

    it("rejects unknown fields and inconsistent derived metadata", () => {
        const batch = createEditBatchV1([sampleTransaction()], {
            id: "batch-1",
            createdAt: 1,
        });
        const invalid = structuredClone(batch) as any;
        invalid.extra = true;
        invalid.transactions[0].tileCount = 9;
        invalid.transactions[0].affectedMaps = [{ x: 1, y: 2 }];

        const result = validateEditBatchV1(invalid);

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.issues.map((issue) => issue.path)).toContain("$.extra");
            expect(result.issues.map((issue) => issue.path)).toContain("$.transactions[0].tileCount");
            expect(result.issues.map((issue) => issue.path)).toContain("$.transactions[0].affectedMaps");
        }
    });

    it("rejects unsupported versions and malformed JSON", () => {
        const batch = createEditBatchV1([sampleTransaction()], { id: "batch-1", createdAt: 1 });
        expect(() => decodeEditBatchV1({ ...batch, version: 2 })).toThrow(EditFormatV1Error);
        expect(() => decodeEditBatchV1("{")).toThrow(EditFormatV1Error);
    });

    it("rejects invalid packed tile coordinates during conversion", () => {
        const transaction = sampleTransaction();
        transaction.mutations[0] = {
            kind: "map.tile",
            mapId: 1,
            level: 0,
            localTileId: 64,
            before: { h: 1 },
            after: { h: 2 },
        };

        expect(() => transactionToEditFormatV1(transaction)).toThrow(EditFormatV1Error);
    });

    it("requires serializable loc ids for object snapshots", () => {
        const transaction = sampleTransaction();
        const objectMutation = transaction.mutations[1];
        if (objectMutation.kind !== "map.objects") throw new Error("expected object mutation");
        objectMutation.before[0] = {
            level: 0,
            tileX: 8,
            tileY: 9,
            wall: {
                tag: "1",
                flags: 2,
                x: 0,
                y: 0,
                height: 0,
            },
        };

        expect(() => transactionToEditFormatV1(transaction)).toThrow(EditFormatV1Error);
    });

    it("decodes the canonical backend parity fixture", () => {
        const decoded = decodeEditBatchV1(goldenFixture);

        expect(decoded.id).toBe("golden-map-edit-v1");
        expect(decoded.transactions[0]).toEqual(transactionToEditFormatV1(sampleTransaction()));
    });

    it("exports a machine-readable JSON Schema for backend parity tests", () => {
        expect(EDIT_FORMAT_V1_SCHEMA.$id).toBe("urn:openrune:edit-batch:v1");
        expect(EDIT_FORMAT_V1_SCHEMA.properties.version.const).toBe(1);
        expect(EDIT_FORMAT_V1_SCHEMA.$defs.mutation.oneOf).toHaveLength(2);
    });
});
