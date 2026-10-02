import { describe, expect, it } from "vitest";

import type { InterfaceType as DecodedInterfaceType } from "../rs/config/components/InterfaceType";
import { interfaceEntryFromDecodedCache } from "./interface-entry-from-cache";

function decodedFixture(): DecodedInterfaceType {
    const child = {
        id: 1,
        internalId: (548 << 16) | 1,
        type: 4,
        children: null,
    };

    const root = {
        id: 0,
        internalId: 548 << 16,
        type: 0,
        children: [child],
    };

    return {
        id: 548,
        components: {
            0: root,
            1: child,
        } as DecodedInterfaceType["components"],
        interfaceParents: {
            [String(548 << 16)]: {
                group: 162,
                type: 1,
                field1047: false,
            },
        } as DecodedInterfaceType["interfaceParents"],
    };
}

describe("interfaceEntryFromDecodedCache", () => {
    it("normalizes locally decoded packed ids without mutating the cache decoder output", () => {
        const decoded = decodedFixture();
        const sourceRoot = decoded.components[0] as unknown as {
            internalId: number;
            packedId?: number;
            children: Array<{ internalId: number; packedId?: number }>;
        };

        const entry = interfaceEntryFromDecodedCache(decoded, "chatbox");

        expect(entry.name).toBe("chatbox");
        expect(entry.componentCount).toBe(2);
        expect(entry.hash).toBe(548);

        const adaptedRoot = entry.components["0"]!;
        expect(adaptedRoot.packedId).toBe(548 << 16);
        expect("internalId" in adaptedRoot).toBe(false);
        expect(adaptedRoot.children?.[0]?.packedId).toBe((548 << 16) | 1);
        expect("internalId" in adaptedRoot.children![0]!).toBe(false);

        expect(sourceRoot.internalId).toBe(548 << 16);
        expect(sourceRoot.packedId).toBeUndefined();
        expect(sourceRoot.children[0]?.internalId).toBe((548 << 16) | 1);
        expect(sourceRoot.children[0]?.packedId).toBeUndefined();
    });

    it("normalizes embedded interface-parent payloads for the local renderer", () => {
        const entry = interfaceEntryFromDecodedCache(decodedFixture());

        const parent = entry.interfaceParents?.[String(548 << 16)];
        expect(parent).toMatchObject({
            group: 162,
            type: 1,
            field1047: false,
        });
    });
});
