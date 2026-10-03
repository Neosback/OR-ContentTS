import { describe, expect, it } from "vitest";

import type { CacheInfo } from "../../cache/CacheInfo";
import { ByteBuffer } from "../../io/ByteBuffer";
import { ParamType } from "./ParamType";

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

describe("ParamType rev-240 decoding", () => {
    it("decodes opcode 8 CacheVarLiteral ids and remains byte-aligned", () => {
        const buffer = bytes(
            8, 36, // STRING literal
            2, 0, 0, 0, 42,
            0,
        );
        const type = new ParamType(1, REV_240);

        type.decode(buffer);

        expect(type.type).toBe("s");
        expect(type.varType).toMatchObject({
            id: 36,
            name: "STRING",
            baseType: "string",
        });
        expect(type.defaultInt).toBe(42);
        expect(buffer.offset).toBe(buffer.length);
    });

    it("decodes opcode 7 long defaults without consuming the next opcode", () => {
        const buffer = bytes(
            7,
            0, 0, 0, 1,
            0, 0, 0, 2,
            2, 0, 0, 0, 9,
            0,
        );
        const type = new ParamType(2, REV_240);

        type.decode(buffer);

        expect(type.defaultLong).toBe(0x0000000100000002n);
        expect(type.defaultInt).toBe(9);
        expect(buffer.offset).toBe(buffer.length);
    });

    it("keeps pre-237 character literal decoding compatible", () => {
        const buffer = bytes(1, "i".charCodeAt(0), 0);
        const type = new ParamType(3, { ...REV_240, revision: 236 });

        type.decode(buffer);

        expect(type.type).toBe("i");
        expect(type.varType).toMatchObject({ id: 0, name: "INT" });
        expect(buffer.offset).toBe(buffer.length);
    });
});
