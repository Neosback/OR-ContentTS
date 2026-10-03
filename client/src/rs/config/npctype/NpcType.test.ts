import { describe, expect, it } from "vitest";

import type { CacheInfo } from "../../cache/CacheInfo";
import { ByteBuffer } from "../../io/ByteBuffer";
import { NpcType } from "./NpcType";

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

function decode(values: number[]): { type: NpcType; buffer: ByteBuffer } {
    const buffer = new ByteBuffer(Int8Array.from(values.map((value) => value & 0xff)));
    const type = new NpcType(123, REV_240);
    type.decode(buffer);
    return { type, buffer };
}

describe("NpcType rev-240 decoding", () => {
    it("decodes modern NPC state and remains aligned through opcode 150", () => {
        const { type, buffer } = decode([
            74, ...u16(80),
            75, ...u16(70),
            76, ...u16(60),
            77, ...u16(90),
            78, ...u16(50),
            79, ...u16(40),
            111,
            122,
            123,
            124, ...u16(180),
            126, ...u16(2),
            130,
            145,
            146, ...u16(12345),
            147,
            148, ...u16(400), 5, 7,
            149, 3,
            150, 4, ...u16(25), 5, ...u16(30),
            151, 1,
            152,
            ...u16(10), ...u16(20),
            2, 8,
            2,
            ...u16(500), ...u16(501),
            95, ...u16(99),
            0,
        ]);

        expect(type.attack).toBe(80);
        expect(type.defence).toBe(70);
        expect(type.strength).toBe(60);
        expect(type.hitpoints).toBe(90);
        expect(type.ranged).toBe(50);
        expect(type.magic).toBe(40);
        expect(type.renderPriority).toBe(2);
        expect(type.lowPriorityFollowerOps).toBe(true);
        expect(type.isFollower).toBe(true);
        expect(type.height).toBe(180);
        expect(type.footprintSize).toBe(2);
        expect(type.readyAnimDuringAnim).toBe(true);
        expect(type.canHideForOverlap).toBe(true);
        expect(type.overlapTintHSL).toBe(12345);
        expect(type.zbuf).toBe(false);
        expect(type.bgSound).toEqual({ id: 400, range: 5, volume: 7 });
        expect(type.bgSoundFade).toEqual({
            dropoffEasing: 3,
            easeInType: 4,
            easeInDuration: 25,
            easeOutType: 5,
            easeOutDuration: 30,
        });
        expect(type.crossWorldSound).toBe(1);
        expect(type.randomSound).toEqual({
            minDelay: 10,
            maxDelay: 20,
            minVolume: 2,
            maxVolume: 8,
            soundIds: [500, 501],
        });
        expect(type.combatLevel).toBe(99);
        expect(buffer.offset).toBe(buffer.length);
    });

    it("decodes rev-237 extended conditional entity ops without losing the next opcode", () => {
        const { type, buffer } = decode([
            252,
            2,
            ...u16(10),
            ...u16(11),
            ...i32(1),
            ...i32(100),
            ...ascii("Talk-to"),
            95, ...u16(88),
            0,
        ]);

        expect(type.conditionalActions).toEqual([
            {
                index: 2,
                varpId: 10,
                varbitId: 11,
                minValue: 1,
                maxValue: 100,
                text: "Talk-to",
            },
        ]);
        expect(type.combatLevel).toBe(88);
        expect(buffer.offset).toBe(buffer.length);
    });
});
