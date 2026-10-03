import { describe, expect, it } from "vitest";

import { conflictingLayerKeys, layerEntries } from "./openrune-definition-layers";

const block = (...lines: string[]) => ({ rawText: lines.join("\n") });

describe("definition layers", () => {
    it("flattens top-level, nested and array tables, ignoring comments", () => {
        const { entries, arrayCounts } = layerEntries(
            ['[[npc]]', 'id = "npc.imp" # who', "wanderRange = 5", "[npc.params]", '"param.attack_sound" = 534', "[[npc.stock]]", "count = 1", "[[npc.stock]]", "count = 2"].join("\n"),
        );
        expect(Object.fromEntries(entries)).toEqual({
            id: '"npc.imp"',
            wanderRange: "5",
            "npc.params.param.attack_sound": "534",
            "npc.stock[0].count": "1",
            "npc.stock[1].count": "2",
        });
        expect(arrayCounts.get("npc.stock")).toBe(2);
    });

    it("treats blocks that add different fields as harmless layers", () => {
        expect(
            conflictingLayerKeys([
                block("[[npc]]", 'id = "npc.a"', "category = 7"),
                block("[[npc]]", 'id = "npc.a"', "[npc.params]", '"param.x" = 1'),
                block("[[npc]]", 'id = "npc.a"', "category = 7"),
            ]),
        ).toEqual([]);
    });

    it("reports a field two blocks set differently", () => {
        expect(
            conflictingLayerKeys([
                block("[[npc]]", 'id = "npc.a"', "[npc.params]", '"param.killcount_varp" = "varp.a"'),
                block("[[npc]]", 'id = "npc.a"', "[npc.params]", '"param.killcount_varp" = "varp.b"', '"param.other" = 1'),
            ]),
        ).toEqual(["npc.params.param.killcount_varp"]);
    });

    it("reports array tables that do not line up", () => {
        expect(
            conflictingLayerKeys([
                block("[[inventory]]", 'id = "inv.x"', "[[inventory.stock]]", "count = 1"),
                block("[[inventory]]", 'id = "inv.x"', "[[inventory.stock]]", "count = 1", "[[inventory.stock]]", "count = 2"),
            ]),
        ).toContain("inventory.stock[]");
    });
});
