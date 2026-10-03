import { describe, expect, it } from "vitest";

import type { CacheInfo } from "../../cache/CacheInfo";
import { ByteBuffer } from "../../io/ByteBuffer";
import { ObjStackability } from "./ObjStackability";
import { ObjType } from "./ObjType";

const REV_240: CacheInfo = {
    name: "rev-240-test",
    game: "oldschool",
    environment: "live",
    revision: 240,
    timestamp: "",
    size: 0,
};

function ascii(value: string): number[] {
    return [...value].map((char) => char.charCodeAt(0)).concat(0);
}

function u16(value: number): number[] {
    return [(value >>> 8) & 0xff, value & 0xff];
}

function i32(value: number): number[] {
    return [
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff,
    ];
}

function decode(values: number[]): { type: ObjType; buffer: ByteBuffer } {
    const buffer = new ByteBuffer(Int8Array.from(values.map((value) => value & 0xff)));
    const type = new ObjType(321, REV_240);
    type.decode(buffer);
    return { type, buffer };
}

describe("ObjType rev-240 decoding", () => {
    it("decodes opcode 43 sub-options through their zero terminator", () => {
        const { type, buffer } = decode([
            43,
            2,
            1, ...ascii("First"),
            3, ...ascii("Third"),
            0,
            12, ...i32(50),
            0,
        ]);

        expect(type.subops?.[2]?.[0]).toBe("First");
        expect(type.subops?.[2]?.[2]).toBe("Third");
        expect(type.price).toBe(50);
        expect(buffer.offset).toBe(buffer.length);
    });

    it("decodes modern stackability, sequence restrictions and unlockable state", () => {
        const { type, buffer } = decode([
            160,
            161, ...u16(2), ...u16(100), ...u16(200),
            251,
            12, ...i32(75),
            0,
        ]);

        expect(type.stackability).toBe(ObjStackability.NEVER);
        expect(type.keepOnlyDuringSeqs).toEqual([100, 200]);
        expect(type.unlockable).toBe(true);
        expect(type.price).toBe(75);
        expect(buffer.offset).toBe(buffer.length);
    });

    it("decodes all extended entity-op payloads and preserves alignment", () => {
        const { type, buffer } = decode([
            200,
            1,
            1, ...ascii("First"),
            2, ...ascii("Second"),
            0,
            201,
            2, ...u16(10), ...u16(11), ...i32(1), ...i32(20), ...ascii("Conditional"),
            202,
            3, ...u16(4), ...u16(12), ...u16(13), ...i32(5), ...i32(30), ...ascii("Conditional sub"),
            12, ...i32(123),
            0,
        ]);

        expect(type.entitySubops).toEqual([
            { index: 1, subId: 0, text: "First" },
            { index: 1, subId: 1, text: "Second" },
        ]);
        expect(type.conditionalActions[0]).toEqual({
            index: 2,
            varpId: 10,
            varbitId: 11,
            minValue: 1,
            maxValue: 20,
            text: "Conditional",
        });
        expect(type.conditionalSubActions[0]).toEqual({
            index: 3,
            subId: 4,
            varpId: 12,
            varbitId: 13,
            minValue: 5,
            maxValue: 30,
            text: "Conditional sub",
        });
        expect(type.price).toBe(123);
        expect(buffer.offset).toBe(buffer.length);
    });
});
