import { describe, expect, it } from "vitest";

import {
    blockKey,
    editableFields,
    listServerBlocks,
    parseFieldInput,
    readOnlyFields,
    relocateBlock,
    tableCounts,
} from "./openrune-server-content";
import { parseOpenRuneServerToml, type OpenRuneServerTomlIndex } from "./openrune-server-toml";

function indexOf(files: Record<string, string>): OpenRuneServerTomlIndex {
    const blocks = Object.entries(files).flatMap(([path, text]) => parseOpenRuneServerToml(path, text).blocks);
    const byTable = new Map<string, typeof blocks>();
    for (const block of blocks) byTable.set(block.table, [...(byTable.get(block.table) ?? []), block]);
    return { files: [], blocks, inventories: [], issues: [], byTable, bySymbol: new Map(), byTarget: new Map() } as unknown as OpenRuneServerTomlIndex;
}

const npcs = [
    "[[npc]]",
    'id = "npc.imp"',
    'name = "Imp"',
    "giveChase = false",
    "wanderRange = 5",
    "tags = [1, 2]",
    "",
    "[[npc]]",
    'id = "npc.hans"',
    'name = "Hans"',
    "",
].join("\n");

describe("server content helpers", () => {
    const index = indexOf({ "a/npcs.toml": npcs, "b/more.toml": '[[npc]]\nid = 7\nname = "Seven"\n', "a/items.toml": '[[item]]\nid = "obj.bones"\n' });

    it("counts blocks per table", () => {
        const counts = Object.fromEntries(tableCounts(index).map((row) => [row.table, row.count]));
        expect(counts).toMatchObject({ npc: 3, item: 1, object: 0 });
    });

    it("searches by symbol, name, file and exact id", () => {
        const symbols = (query: string) => listServerBlocks(index, "npc", query).map((block) => String(block.id));
        expect(symbols("")).toHaveLength(3);
        expect(symbols("IMP")).toEqual(["npc.imp"]);
        expect(symbols("hans")).toEqual(["npc.hans"]);
        expect(symbols("seven")).toEqual(["7"]);
        expect(symbols("more.toml")).toEqual(["7"]);
    });

    it("splits fields into editable scalars and read-only ones, never offering the identity", () => {
        const imp = listServerBlocks(index, "npc", "imp")[0]!;
        expect(editableFields(imp).map((field) => [field.name, field.kind])).toEqual([
            ["name", "string"],
            ["giveChase", "boolean"],
            ["wanderRange", "number"],
        ]);
        expect(readOnlyFields(imp).map((field) => field.name)).toEqual(["id", "tags"]);
    });

    it("finds the same block again in a re-indexed project", () => {
        const imp = listServerBlocks(index, "npc", "imp")[0]!;
        const edited = indexOf({ "a/npcs.toml": npcs.replace("wanderRange = 5", "wanderRange = 9"), "a/items.toml": "" });
        expect(relocateBlock(edited, imp)?.fields.find((field) => field.name === "wanderRange")?.value).toBe(9);
        expect(blockKey(imp)).toContain("a/npcs.toml");
        expect(relocateBlock(indexOf({}), imp)).toBeUndefined();
    });

    it("keeps typed values the same kind as the field", () => {
        expect(parseFieldInput("number", " 12 ")).toEqual({ ok: true, value: 12 });
        expect(parseFieldInput("number", "abc")).toMatchObject({ ok: false });
        expect(parseFieldInput("number", "")).toMatchObject({ ok: false });
        expect(parseFieldInput("boolean", "True")).toEqual({ ok: true, value: true });
        expect(parseFieldInput("boolean", "yes")).toMatchObject({ ok: false });
        expect(parseFieldInput("string", " keep spaces ")).toEqual({ ok: true, value: " keep spaces " });
    });
});
