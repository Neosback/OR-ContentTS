import { describe, expect, it } from "vitest";

import { InMemoryProjectFileSystem } from "./in-memory-project-filesystem";
import {
    buildGameValDatIndex,
    findGameValDatId,
    findGameValDatSymbol,
    indexProjectGameValDat,
    parseGameValDat,
    validateCustomGameVals,
} from "./gameval-dat-index";

function int32(value: number): number[] {
    return [
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff,
    ];
}

function uint16(value: number): number[] {
    return [(value >>> 8) & 0xff, value & 0xff];
}

function utf8(value: string): number[] {
    return Array.from(new TextEncoder().encode(value));
}

function encodeDat(tables: Record<string, string[]>): Uint8Array {
    const bytes: number[] = [...int32(Object.keys(tables).length)];
    for (const [table, entries] of Object.entries(tables)) {
        const tableBytes = utf8(table);
        bytes.push(...uint16(tableBytes.length), ...tableBytes, ...int32(entries.length));
        for (const entry of entries) {
            const entryBytes = utf8(entry);
            bytes.push(...uint16(entryBytes.length), ...entryBytes);
        }
    }
    return Uint8Array.from(bytes);
}

describe("parseGameValDat", () => {
    it("decodes OpenRune GameValDat big-endian tables and mappings", () => {
        const parsed = parseGameValDat(
            ".data/gamevals-binary/gamevals.dat",
            "base",
            encodeDat({
                obj: ["coins=995", "abyssal_whip=4151"],
                component: ["chatbox:input=10616833"],
            }),
        );

        expect(parsed.issues).toEqual([]);
        expect(parsed.tables.map((table) => table.name)).toEqual(["obj", "component"]);
        expect(parsed.entries).toEqual([
            {
                table: "obj",
                key: "coins",
                symbol: "obj.coins",
                id: 995,
                sourcePath: ".data/gamevals-binary/gamevals.dat",
                sourceKind: "base",
                tableIndex: 0,
                entryIndex: 0,
            },
            {
                table: "obj",
                key: "abyssal_whip",
                symbol: "obj.abyssal_whip",
                id: 4151,
                sourcePath: ".data/gamevals-binary/gamevals.dat",
                sourceKind: "base",
                tableIndex: 0,
                entryIndex: 1,
            },
            {
                table: "component",
                key: "chatbox:input",
                symbol: "component.chatbox:input",
                id: 10616833,
                sourcePath: ".data/gamevals-binary/gamevals.dat",
                sourceKind: "base",
                tableIndex: 1,
                entryIndex: 0,
            },
        ]);
        expect(parsed.bytesConsumed).toBeGreaterThan(0);
    });

    it("reports malformed mapping strings while retaining valid entries", () => {
        const parsed = parseGameValDat(
            "gamevals.dat",
            "base",
            encodeDat({
                loc: ["tree=1276", "missing_equals", "bad=abc", "willow=10819"],
            }),
        );

        expect(parsed.entries.map((entry) => entry.symbol)).toEqual([
            "loc.tree",
            "loc.willow",
        ]);
        expect(parsed.issues.map((issue) => issue.code)).toEqual([
            "MALFORMED_ENTRY",
            "INVALID_ID",
        ]);
    });

    it("detects impossible counts without iterating attacker-controlled values", () => {
        const parsed = parseGameValDat(
            "gamevals.dat",
            "base",
            Uint8Array.from([...int32(2_000_000_000)]),
        );

        expect(parsed.issues).toMatchObject([{ code: "INVALID_TABLE_COUNT" }]);
    });

    it("reports truncation and trailing bytes", () => {
        const complete = encodeDat({ npc: ["king_black_dragon=239"] });
        const truncated = parseGameValDat(
            "gamevals.dat",
            "base",
            complete.slice(0, complete.length - 1),
        );
        expect(truncated.issues.some((issue) => issue.code === "TRUNCATED_DATA")).toBe(true);

        const withTrailing = new Uint8Array(complete.length + 2);
        withTrailing.set(complete);
        withTrailing.set([1, 2], complete.length);
        const trailing = parseGameValDat("gamevals.dat", "base", withTrailing);
        expect(trailing.issues).toMatchObject([{ code: "TRAILING_DATA" }]);
    });

    it("reports invalid UTF-8", () => {
        const bytes = Uint8Array.from([
            ...int32(1),
            ...uint16(1),
            0xff,
            ...int32(0),
        ]);

        const parsed = parseGameValDat("gamevals.dat", "base", bytes);
        expect(parsed.issues.some((issue) => issue.code === "INVALID_UTF8")).toBe(true);
    });
});

describe("buildGameValDatIndex", () => {
    it("computes base max IDs without allowing generated mappings to raise the ceiling", () => {
        const base = parseGameValDat(
            ".data/gamevals-binary/gamevals.dat",
            "base",
            encodeDat({ obj: ["coins=995", "whip=4151"], component: ["base=100"] }),
        );
        const generated = parseGameValDat(
            ".data/gamevals-binary/gamevals_generated.dat",
            "generated",
            encodeDat({ obj: ["generated_obj=70000"], component: ["generated=999999"] }),
        );

        const index = buildGameValDatIndex([generated, base]);

        expect(index.maxBaseId.get("obj")).toBe(4151);
        expect(index.maxBaseId.get("component")).toBe(100);
        expect(findGameValDatSymbol(index, "obj.generated_obj")).toMatchObject([
            { sourceKind: "generated", id: 70000 },
        ]);
        expect(findGameValDatId(index, "obj", 995)).toMatchObject([
            { symbol: "obj.coins", sourceKind: "base" },
        ]);
    });

    it("reports DAT symbol and table-local id conflicts with provenance", () => {
        const base = parseGameValDat(
            "gamevals.dat",
            "base",
            encodeDat({ obj: ["a=10", "b=11"] }),
        );
        const generated = parseGameValDat(
            "gamevals_generated.dat",
            "generated",
            encodeDat({ obj: ["a=12", "c=11"] }),
        );

        const index = buildGameValDatIndex([base, generated]);

        expect(index.issues.map((issue) => issue.code)).toEqual([
            "ID_CONFLICT",
            "SYMBOL_CONFLICT",
        ]);
        expect(findGameValDatSymbol(index, "obj.a").map((entry) => entry.id)).toEqual([
            10,
            12,
        ]);
        expect(findGameValDatId(index, "obj", 11).map((entry) => entry.symbol)).toEqual([
            "obj.b",
            "obj.c",
        ]);
    });
});

describe("indexProjectGameValDat", () => {
    it("loads only the base and generated DAT files discovered by the project index", async () => {
        const fs = new InMemoryProjectFileSystem({
            ".data/gamevals-binary/gamevals.dat": encodeDat({ loc: ["tree=1276"] }),
            ".data/gamevals-binary/gamevals_generated.dat": encodeDat({
                component: ["chatbox:input=10616833"],
            }),
            ".data/gamevals-binary/max-ids.toml": "[max_ids]\nloc = 1276",
        });

        const index = await indexProjectGameValDat(fs, {
            gameValBinaryFiles: [
                ".data/gamevals-binary/max-ids.toml",
                ".data/gamevals-binary/gamevals_generated.dat",
                ".data/gamevals-binary/gamevals.dat",
            ],
        });

        expect(index.files.map((file) => [file.sourceKind, file.sourcePath])).toEqual([
            ["base", ".data/gamevals-binary/gamevals.dat"],
            ["generated", ".data/gamevals-binary/gamevals_generated.dat"],
        ]);
        expect(index.maxBaseId.get("loc")).toBe(1276);
    });
});

describe("validateCustomGameVals", () => {
    const index = buildGameValDatIndex([
        parseGameValDat(
            "gamevals.dat",
            "base",
            encodeDat({ loc: ["tree=100", "rock=200"], obj: ["coins=995"] }),
        ),
        parseGameValDat(
            "gamevals_generated.dat",
            "generated",
            encodeDat({ loc: ["generated_loc=500"] }),
        ),
    ]);

    it("enforces OpenRune base-id reservation while allowing ids above the base max", () => {
        const issues = validateCustomGameVals(index, [
            {
                table: "loc",
                key: "custom_low",
                id: 150,
                sourcePath: ".data/gamevals/loc.rscm",
                line: 1,
            },
            {
                table: "loc",
                key: "custom_high",
                id: 1000,
                sourcePath: ".data/gamevals/loc.rscm",
                line: 2,
            },
        ]);

        expect(issues).toMatchObject([
            {
                code: "BASE_ID_RESERVED",
                symbol: "loc.custom_low",
                id: 150,
                maxBaseId: 200,
            },
        ]);
    });

    it("checks generated mappings for symbol and id collisions without raising maxBaseId", () => {
        const issues = validateCustomGameVals(index, [
            {
                table: "loc",
                key: "generated_loc",
                id: 600,
                sourcePath: ".data/gamevals/loc.rscm",
            },
            {
                table: "loc",
                key: "other",
                id: 500,
                sourcePath: ".data/gamevals/loc.rscm",
            },
        ]);

        expect(issues.map((issue) => issue.code)).toEqual([
            "ID_CONFLICT",
            "SYMBOL_CONFLICT",
        ]);
    });

    it("detects conflicts between custom project mappings", () => {
        const issues = validateCustomGameVals(index, [
            {
                table: "loc",
                key: "first",
                id: 1000,
                sourcePath: "content/a/gamevals.toml",
                line: 1,
            },
            {
                table: "loc",
                key: "first",
                id: 1001,
                sourcePath: "content/b/gamevals.toml",
                line: 1,
            },
            {
                table: "loc",
                key: "second",
                id: 1000,
                sourcePath: "content/c/gamevals.toml",
                line: 1,
            },
        ]);

        expect(issues.map((issue) => [issue.code, issue.symbol])).toEqual([
            ["SYMBOL_CONFLICT", "loc.first"],
            ["ID_CONFLICT", "loc.second"],
        ]);
    });

    it("allows -1 as an unassigned custom value", () => {
        expect(
            validateCustomGameVals(index, [
                {
                    table: "loc",
                    key: "future_custom",
                    id: -1,
                    sourcePath: ".data/gamevals/loc.rscm",
                },
            ]),
        ).toEqual([]);
    });
});
