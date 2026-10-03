import { describe, expect, it } from "vitest";

import { ByteBuffer } from "./ByteBuffer";

function bytes(...values: number[]): ByteBuffer {
    return new ByteBuffer(Int8Array.from(values.map((value) => value & 0xff)));
}

describe("ByteBuffer DB encodings", () => {
    it("reads OpenRune unsigned-short-smart values without losing alignment", () => {
        const buffer = bytes(
            0x00,
            0x7f,
            0x80, 0x80,
            0xff, 0xff,
        );

        expect(buffer.readUnsignedShortSmart()).toBe(0);
        expect(buffer.readUnsignedShortSmart()).toBe(127);
        expect(buffer.readUnsignedShortSmart()).toBe(128);
        expect(buffer.readUnsignedShortSmart()).toBe(32767);
        expect(buffer.offset).toBe(buffer.length);
    });

    it("reads OpenRune signed 64-bit long values", () => {
        const buffer = bytes(
            0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
            0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
            0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        );

        expect(buffer.readLong()).toBe(0x7fffffffffffffffn);
        expect(buffer.readLong()).toBe(-1n);
        expect(buffer.readLong()).toBe(-0x8000000000000000n);
        expect(buffer.offset).toBe(buffer.length);
    });

    it("reads OpenRune little-endian 7-bit continuation varints", () => {
        const buffer = bytes(
            0x00,
            0x7f,
            0x80, 0x01,
            0xac, 0x02,
            0x80, 0x80, 0x01,
        );

        expect(buffer.readVarInt()).toBe(0);
        expect(buffer.readVarInt()).toBe(127);
        expect(buffer.readVarInt()).toBe(128);
        expect(buffer.readVarInt()).toBe(300);
        expect(buffer.readVarInt()).toBe(16384);
        expect(buffer.offset).toBe(buffer.length);
    });
});
