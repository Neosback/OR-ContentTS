import { describe, expect, it } from "vitest";

import type { CacheInfo } from "../../cache/CacheInfo";
import { ByteBuffer } from "../../io/ByteBuffer";
import { DbRowType } from "./DbRowType";
import { DbTableType } from "./DbTableType";

const REV_240: CacheInfo = {
    name: "rev-240-test",
    game: "oldschool",
    environment: "live",
    revision: 240,
    timestamp: "",
    size: 0,
};

function bytes(...values: number[]): ByteBuffer {
    return new ByteBuffer(Int8Array.from(values.map((value) => value & 0xff)));
}

describe("DBTable rev-240 decoding", () => {
    it("decodes typed default tuples and remains byte-aligned", () => {
        const buffer = bytes(
            1,
            2,
            0x80,
            3,
            0,
            110,
            36,
            1,
            0, 0, 0, 42,
            0, 0, 0, 1, 0, 0, 0, 2,
            "o".charCodeAt(0), "k".charCodeAt(0), 0,
            1,
            1,
            33,
            0xff,
            0,
        );
        const table = new DbTableType(7, REV_240);

        table.decode(buffer);

        expect(table.declaredColumnCount).toBe(2);

        const defaults = table.columns.get(0);
        expect(defaults?.types.map((type) => type.name)).toEqual(["INT", "LONG", "STRING"]);
        expect(defaults?.values).toEqual([42, 0x0000000100000002n, "ok"]);

        const second = table.columns.get(1);
        expect(second?.types.map((type) => type.name)).toEqual(["OBJ"]);
        expect(second?.values).toBeUndefined();

        expect(buffer.offset).toBe(buffer.length);
    });

    it("rejects array literals instead of guessing their DB cell encoding", () => {
        const buffer = bytes(
            1,
            1,
            0,
            1,
            0x80, 0xc8,
            0xff,
            0,
        );
        const table = new DbTableType(8, REV_240);

        expect(() => table.decode(buffer)).toThrow(/DB array cell type COMPONENTARRAY/);
    });
});

describe("DBRow rev-240 decoding", () => {
    it("decodes typed row tuples, then opcode 4 without losing alignment", () => {
        const buffer = bytes(
            3,
            3,
            2,
            3,
            0,
            110,
            36,
            1,
            0xff, 0xff, 0xff, 0xf9,
            0, 0, 0, 0, 0, 0, 0, 3,
            "r".charCodeAt(0), "o".charCodeAt(0), "w".charCodeAt(0), 0,
            0xff,
            4,
            0xac, 0x02,
            0,
        );
        const row = new DbRowType(11, REV_240);

        row.decode(buffer);

        expect(row.declaredColumnCount).toBe(3);
        expect(row.tableId).toBe(300);

        const column = row.columns.get(2);
        expect(column?.types.map((type) => type.name)).toEqual(["INT", "LONG", "STRING"]);
        expect(column?.values).toEqual([-7, 3n, "row"]);

        expect(buffer.offset).toBe(buffer.length);
    });
});
