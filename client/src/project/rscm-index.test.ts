import { describe, expect, it } from "vitest";

import { InMemoryProjectFileSystem } from "./in-memory-project-filesystem";
import {
    buildRscmIndex,
    findRscmId,
    findRscmSymbol,
    indexProjectRscm,
    parseRscmFile,
} from "./rscm-index";

describe("parseRscmFile", () => {
    it("uses the filename as namespace and parses line-oriented mappings", () => {
        const parsed = parseRscmFile(
            ".data/gamevals/item.rscm",
            [
                "\uFEFF# items",
                "abyssal_whip=4151",
                " abyssal_whip_note = 4152 ",
                "",
                "; another comment",
                "// final comment",
            ].join("\n"),
        );

        expect(parsed.namespace).toBe("item");
        expect(parsed.entries).toEqual([
            {
                namespace: "item",
                key: "abyssal_whip",
                symbol: "item.abyssal_whip",
                id: 4151,
                sourcePath: ".data/gamevals/item.rscm",
                line: 2,
            },
            {
                namespace: "item",
                key: "abyssal_whip_note",
                symbol: "item.abyssal_whip_note",
                id: 4152,
                sourcePath: ".data/gamevals/item.rscm",
                line: 3,
            },
        ]);
        expect(parsed.issues).toEqual([]);
    });

    it("preserves grouped keys containing colons", () => {
        const parsed = parseRscmFile(
            ".data/gamevals/components.rscm",
            "toplevel_move_events:some_component=76023455",
        );

        expect(parsed.entries[0]).toMatchObject({
            namespace: "components",
            key: "toplevel_move_events:some_component",
            symbol: "components.toplevel_move_events:some_component",
            id: 76023455,
        });
    });

    it("allows -1 as an unassigned mapping", () => {
        const parsed = parseRscmFile(".data/gamevals/npc.rscm", "new_boss=-1");
        expect(parsed.entries[0]?.id).toBe(-1);
        expect(parsed.issues).toEqual([]);
    });

    it("reports malformed lines and invalid ids without dropping valid mappings", () => {
        const parsed = parseRscmFile(
            ".data/gamevals/loc.rscm",
            [
                "good=100",
                "missing_equals",
                "=200",
                "bad=abc",
                "too_negative=-2",
                "fraction=1.5",
                "also_good=101",
            ].join("\n"),
        );

        expect(parsed.entries.map((entry) => [entry.key, entry.id])).toEqual([
            ["good", 100],
            ["also_good", 101],
        ]);
        expect(parsed.issues.map((issue) => issue.code)).toEqual([
            "MALFORMED_LINE",
            "MALFORMED_LINE",
            "INVALID_ID",
            "INVALID_ID",
            "INVALID_ID",
        ]);
    });

    it("rejects a non-rscm source path", () => {
        const parsed = parseRscmFile(".data/gamevals/item.txt", "coins=995");
        expect(parsed.entries).toEqual([]);
        expect(parsed.issues).toMatchObject([{ code: "INVALID_SOURCE" }]);
    });
});

describe("buildRscmIndex", () => {
    it("detects duplicate symbols, conflicting symbols, and namespace-local id conflicts", () => {
        const index = buildRscmIndex([
            parseRscmFile(".data/gamevals/item.rscm", "a=100\na=100\nb=101\nc=101"),
            parseRscmFile(".data/other/item.rscm", "b=102"),
            parseRscmFile(".data/gamevals/npc.rscm", "boss=101"),
        ]);

        expect(index.issues.map((issue) => issue.code)).toEqual([
            "DUPLICATE_SYMBOL",
            "ID_CONFLICT",
            "SYMBOL_CONFLICT",
        ]);
        expect(findRscmSymbol(index, "item.a")).toHaveLength(2);
        expect(findRscmSymbol(index, "item.b").map((entry) => entry.id)).toEqual([101, 102]);
        expect(findRscmId(index, "item", 101).map((entry) => entry.symbol)).toEqual([
            "item.b",
            "item.c",
        ]);
        expect(findRscmId(index, "npc", 101).map((entry) => entry.symbol)).toEqual([
            "npc.boss",
        ]);
    });

    it("does not treat repeated -1 values as id conflicts", () => {
        const index = buildRscmIndex([
            parseRscmFile(".data/gamevals/item.rscm", "first=-1\nsecond=-1"),
        ]);

        expect(index.issues).toEqual([]);
        expect(findRscmId(index, "item", -1)).toEqual([]);
    });
});

describe("indexProjectRscm", () => {
    it("loads discovered project RSCM sources in deterministic path order", async () => {
        const fs = new InMemoryProjectFileSystem({
            ".data/gamevals/npc.rscm": "king_dragon=239",
            ".data/gamevals/item.rscm": "coins=995",
        });

        const index = await indexProjectRscm(fs, {
            rscmFiles: [".data/gamevals/npc.rscm", ".data/gamevals/item.rscm"],
        });

        expect(index.files.map((file) => file.sourcePath)).toEqual([
            ".data/gamevals/item.rscm",
            ".data/gamevals/npc.rscm",
        ]);
        expect(index.entries.map((entry) => entry.symbol)).toEqual([
            "item.coins",
            "npc.king_dragon",
        ]);
        expect(index.issues).toEqual([]);
    });

    it("retains source provenance for lookups", async () => {
        const fs = new InMemoryProjectFileSystem({
            ".data/gamevals/loc.rscm": "tree=1276\nwillow=10819",
        });

        const index = await indexProjectRscm(fs, {
            rscmFiles: [".data/gamevals/loc.rscm"],
        });

        expect(findRscmSymbol(index, "loc.willow")).toEqual([
            {
                namespace: "loc",
                key: "willow",
                symbol: "loc.willow",
                id: 10819,
                sourcePath: ".data/gamevals/loc.rscm",
                line: 2,
            },
        ]);
    });
});
