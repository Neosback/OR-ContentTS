import { describe, expect, it } from "vitest";

import {
    buildGameValDatIndex,
    parseGameValDat,
} from "./gameval-dat-index";
import {
    buildGameValTomlIndex,
    parseGameValToml,
} from "./gameval-toml-index";
import {
    buildGameValRegistry,
    findGameValId,
    findGameValSymbol,
    indexProjectGameValRegistry,
} from "./gameval-registry";
import { InMemoryProjectFileSystem } from "./in-memory-project-filesystem";
import {
    buildRscmIndex,
    parseRscmFile,
} from "./rscm-index";

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

function fixtureRegistry() {
    const dat = buildGameValDatIndex([
        parseGameValDat(
            ".data/gamevals-binary/gamevals.dat",
            "base",
            encodeDat({
                loc: ["oak=100"],
                obj: ["coins=995"],
            }),
        ),
        parseGameValDat(
            ".data/gamevals-binary/gamevals_generated.dat",
            "generated",
            encodeDat({
                component: ["panel:button=2000000"],
                loc: ["generated=50000"],
            }),
        ),
    ]);

    const toml = buildGameValTomlIndex([
        parseGameValToml(
            "content/example/gamevals.toml",
            [
                "[gamevals.loc]",
                "custom = 50001",
                "shared = 50002",
                "pending = -1",
            ].join("\n"),
            "content/example",
        ),
        parseGameValToml(
            "api/example/gamevals.toml",
            [
                "[gamevals.loc]",
                "shared = 50002",
            ].join("\n"),
            "api/example",
        ),
    ]);

    const rscm = buildRscmIndex([
        parseRscmFile(
            ".data/gamevals/loc.rscm",
            [
                "shared=50002",
                "pending=50003",
            ].join("\n"),
        ),
    ]);

    return buildGameValRegistry({ dat, toml, rscm });
}

describe("buildGameValRegistry", () => {
    it("merges OpenRune sources in loader order while retaining full provenance", () => {
        const registry = fixtureRegistry();

        expect(findGameValSymbol(registry, "loc.oak")).toMatchObject({
            id: 100,
            source: { sourceKind: "base-dat" },
        });
        expect(findGameValSymbol(registry, "loc.generated")).toMatchObject({
            id: 50000,
            source: { sourceKind: "generated-dat" },
        });
        expect(findGameValSymbol(registry, "loc.custom")).toMatchObject({
            id: 50001,
            source: {
                sourceKind: "module-toml",
                sourcePath: "content/example/gamevals.toml",
            },
        });

        const shared = findGameValSymbol(registry, "loc.shared");
        expect(shared).toMatchObject({
            id: 50002,
            source: {
                sourceKind: "rscm",
                sourcePath: ".data/gamevals/loc.rscm",
            },
        });
        expect(shared?.declarations.map((entry) => entry.sourcePath)).toEqual([
            "content/example/gamevals.toml",
            "api/example/gamevals.toml",
            ".data/gamevals/loc.rscm",
        ]);

        expect(findGameValSymbol(registry, "loc.pending")).toMatchObject({
            id: 50003,
            source: { sourceKind: "rscm" },
        });
        expect(findGameValId(registry, "loc", 50002)?.symbol).toBe("loc.shared");
        expect(registry.issues).toEqual([]);
    });

    it("uses only base DAT values for the reserved-id ceiling", () => {
        const dat = buildGameValDatIndex([
            parseGameValDat(
                ".data/gamevals-binary/gamevals.dat",
                "base",
                encodeDat({ loc: ["base=100"] }),
            ),
            parseGameValDat(
                ".data/gamevals-binary/gamevals_generated.dat",
                "generated",
                encodeDat({ loc: ["generated=50000"] }),
            ),
        ]);
        const toml = buildGameValTomlIndex([
            parseGameValToml(
                "content/example/gamevals.toml",
                "[gamevals.loc]\ncustom = 101",
            ),
        ]);
        const registry = buildGameValRegistry({
            dat,
            toml,
            rscm: buildRscmIndex([]),
        });

        expect(dat.maxBaseId.get("loc")).toBe(100);
        expect(findGameValSymbol(registry, "loc.custom")?.id).toBe(101);
        expect(registry.issues).toEqual([]);
    });

    it("rejects reserved ids and reports cross-source symbol and id conflicts", () => {
        const dat = buildGameValDatIndex([
            parseGameValDat(
                ".data/gamevals-binary/gamevals.dat",
                "base",
                encodeDat({ loc: ["base=100"] }),
            ),
        ]);
        const toml = buildGameValTomlIndex([
            parseGameValToml(
                "content/example/gamevals.toml",
                [
                    "[gamevals.loc]",
                    "too_low = 100",
                    "custom = 500",
                    "other = 501",
                ].join("\n"),
            ),
        ]);
        const rscm = buildRscmIndex([
            parseRscmFile(
                ".data/gamevals/loc.rscm",
                [
                    "custom=600",
                    "reuse=501",
                ].join("\n"),
            ),
        ]);

        const registry = buildGameValRegistry({ dat, toml, rscm });

        expect(registry.issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "BASE_ID_RESERVED",
                    symbol: "loc.too_low",
                    maxBaseId: 100,
                }),
                expect.objectContaining({
                    code: "SYMBOL_CONFLICT",
                    symbol: "loc.custom",
                    id: 600,
                }),
                expect.objectContaining({
                    code: "ID_CONFLICT",
                    symbol: "loc.reuse",
                    id: 501,
                }),
            ]),
        );
        expect(findGameValSymbol(registry, "loc.too_low")).toBeUndefined();
        expect(findGameValSymbol(registry, "loc.custom")?.id).toBe(500);
        expect(findGameValSymbol(registry, "loc.other")?.id).toBe(501);
        expect(findGameValSymbol(registry, "loc.reuse")).toBeUndefined();
    });

    it("does not let an unassigned custom declaration mask an assigned DAT mapping", () => {
        const dat = buildGameValDatIndex([
            parseGameValDat(
                ".data/gamevals-binary/gamevals.dat",
                "base",
                encodeDat({ loc: ["oak=100"] }),
            ),
        ]);
        const toml = buildGameValTomlIndex([
            parseGameValToml(
                "content/example/gamevals.toml",
                "[gamevals.loc]\noak = -1",
            ),
        ]);

        const registry = buildGameValRegistry({
            dat,
            toml,
            rscm: buildRscmIndex([]),
        });
        const oak = findGameValSymbol(registry, "loc.oak");

        expect(oak).toMatchObject({
            id: 100,
            source: { sourceKind: "base-dat" },
        });
        expect(oak?.declarations).toHaveLength(2);
    });

    it("exposes parser diagnostics without conflating them with cross-source conflicts", () => {
        const dat = buildGameValDatIndex([]);
        const toml = buildGameValTomlIndex([
            parseGameValToml(
                "content/example/gamevals.toml",
                "[gamevals.not_real]\nfoo = 1",
            ),
        ]);
        const rscm = buildRscmIndex([
            parseRscmFile(".data/gamevals/loc.rscm", "bad=abc"),
        ]);

        const registry = buildGameValRegistry({ dat, toml, rscm });

        expect(registry.issues).toEqual([]);
        expect(registry.sourceIssues.toml).toMatchObject([
            { code: "UNSUPPORTED_TABLE" },
        ]);
        expect(registry.sourceIssues.rscm).toMatchObject([
            { code: "INVALID_ID" },
        ]);
    });
});

describe("indexProjectGameValRegistry", () => {
    it("loads DAT, module TOML, and RSCM through one project-level API", async () => {
        const fs = new InMemoryProjectFileSystem({
            ".data/gamevals-binary/gamevals.dat": encodeDat({
                loc: ["oak=100"],
            }),
            ".data/gamevals-binary/gamevals_generated.dat": encodeDat({
                component: ["panel:button=2000000"],
            }),
            "content/example/gamevals.toml": "[gamevals.loc]\ncustom = 500",
            ".data/gamevals/loc.rscm": "legacy=501",
        });

        const registry = await indexProjectGameValRegistry(fs, {
            gameValBinaryFiles: [
                ".data/gamevals-binary/gamevals_generated.dat",
                ".data/gamevals-binary/gamevals.dat",
            ],
            gameValTomlFiles: ["content/example/gamevals.toml"],
            modules: [
                {
                    path: "content/example",
                    name: "example",
                    buildFile: "content/example/build.gradle.kts",
                    family: "content",
                    isPackModule: false,
                    packRoots: [],
                    gameValTomlFiles: ["content/example/gamevals.toml"],
                },
            ],
            rscmFiles: [".data/gamevals/loc.rscm"],
        });

        expect(findGameValSymbol(registry, "loc.oak")?.id).toBe(100);
        expect(findGameValSymbol(registry, "loc.custom")).toMatchObject({
            id: 500,
            source: {
                sourceKind: "module-toml",
                modulePath: "content/example",
            },
        });
        expect(findGameValSymbol(registry, "loc.legacy")).toMatchObject({
            id: 501,
            source: { sourceKind: "rscm" },
        });
        expect(findGameValSymbol(registry, "component.panel:button")?.id).toBe(
            2000000,
        );
    });
});
