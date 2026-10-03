import { describe, expect, it } from "vitest";

import { buildGameValDatIndex } from "./gameval-dat-index";
import { buildGameValTomlIndex } from "./gameval-toml-index";
import { buildGameValRegistry } from "./gameval-registry";
import { InMemoryProjectFileSystem } from "./in-memory-project-filesystem";
import {
    findOpenRuneServerById,
    findOpenRuneServerBySymbol,
    findOpenRuneServerByTable,
    indexProjectOpenRuneServerToml,
    OpenRuneServerWriteError,
    parseOpenRuneServerToml,
    replaceOpenRuneServerSourceFile,
    serializeOpenRuneInventoryToml,
    updateOpenRuneServerField,
} from "./openrune-server-toml";
import { buildRscmIndex, parseRscmFile } from "./rscm-index";

function gameVals() {
    return buildGameValRegistry({
        dat: buildGameValDatIndex([]),
        toml: buildGameValTomlIndex([]),
        rscm: buildRscmIndex([
            parseRscmFile(
                ".data/gamevals/npc.rscm",
                "imp=100\nhans=101",
            ),
            parseRscmFile(
                ".data/gamevals/loc.rscm",
                "crate3_old=200",
            ),
            parseRscmFile(
                ".data/gamevals/obj.rscm",
                "bronze_2h_sword=300\niron_2h_sword=301",
            ),
            parseRscmFile(
                ".data/gamevals/inv.rscm",
                "2handedshop=400\ncustom_pack_inv=401",
            ),
            parseRscmFile(
                ".data/gamevals/bas.rscm",
                "human_default=500",
            ),
        ]),
    });
}

describe("parseOpenRuneServerToml", () => {
    it("indexes generic PackServerConfig blocks and preserves nested sections", () => {
        const parsed = parseOpenRuneServerToml(
            ".data/raw-cache/server/npcs.toml",
            [
                "[[npc]]",
                'id = "npc.imp"',
                'inherit = "npc.imp"',
                "giveChase = false",
                "",
                "[npc.params]",
                '"param.attack_sound" = 534',
                "",
                "[[npc]]",
                'id = "npc.hans"',
                'inherit = "npc.hans"',
                'defaultMode = "Patrol"',
                "",
                "[[npc.waypoints]]",
                "destination = { x = 3207, z = 3233, level = 0 }",
            ].join("\n"),
            { gameVals: gameVals() },
        );

        expect(parsed.issues).toEqual([]);
        expect(parsed.blocks).toHaveLength(2);
        expect(parsed.blocks[0]).toMatchObject({
            table: "npc",
            id: "npc.imp",
            resolvedId: 100,
            inherit: "npc.imp",
            resolvedInheritId: 100,
            isServerOnly: false,
        });
        expect(parsed.blocks[0]?.fields.map((field) => field.name)).toEqual([
            "id",
            "inherit",
            "giveChase",
        ]);
        expect(parsed.blocks[0]?.nestedSections).toMatchObject([
            { name: "npc.params" },
        ]);
        expect(parsed.blocks[0]?.rawText).toContain(
            '"param.attack_sound" = 534',
        );

        expect(parsed.blocks[1]?.nestedSections).toMatchObject([
            { name: "npc.waypoints" },
        ]);
        expect(parsed.blocks[1]?.rawText).toContain(
            "destination = { x = 3207, z = 3233, level = 0 }",
        );
    });

    it("supports numeric ids and reports unresolved symbolic identities", () => {
        const parsed = parseOpenRuneServerToml(
            ".data/raw-cache/server/mixed.toml",
            [
                "[[object]]",
                "id = 123",
                "",
                "[[npc]]",
                'id = "npc.missing"',
                'inherit = "npc.also_missing"',
            ].join("\n"),
            { gameVals: gameVals() },
        );

        expect(parsed.blocks[0]).toMatchObject({
            table: "object",
            id: 123,
            resolvedId: 123,
        });
        expect(parsed.issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "UNRESOLVED_ID",
                    id: "npc.missing",
                }),
                expect.objectContaining({
                    code: "UNRESOLVED_INHERIT",
                    id: "npc.also_missing",
                }),
            ]),
        );
    });

    it("ignores unsupported top-level server/slayer tables rather than misclassifying them", () => {
        const parsed = parseOpenRuneServerToml(
            ".data/raw-cache/server/slayer/tasks.toml",
            [
                "[[slayer_task]]",
                'id = "content.something"',
                "",
                "[[npc]]",
                'id = "npc.imp"',
            ].join("\n"),
            { gameVals: gameVals() },
        );

        expect(parsed.blocks).toHaveLength(1);
        expect(parsed.blocks[0]).toMatchObject({
            table: "npc",
            id: "npc.imp",
        });
    });
});

describe("inventory/shop server TOML", () => {
    it("parses current OpenRune shop inventory and stock records", () => {
        const parsed = parseOpenRuneServerToml(
            ".data/raw-cache/server/shops/2handedshop.toml",
            [
                "[[inventory]]",
                "isServerOnly = true",
                'id = "inv.2handedshop"',
                'name = "Gaius\' Two Handed Shop."',
                'scope = "Shared"',
                'stack = "Always"',
                "sellMultiplier = 1000",
                "buyMultiplier = 600",
                "delta = 20",
                "size = 6",
                "protect = false",
                "runWeight = false",
                "restock = true",
                "allStock = false",
                "placeholders = false",
                "",
                "[[inventory.stock]]",
                'obj = "obj.bronze_2h_sword"',
                "count = 4",
                "restockCycles = 200",
                "",
                "[[inventory.stock]]",
                'obj = "obj.iron_2h_sword"',
                "count = 3",
                "restockCycles = 300",
            ].join("\n"),
            { gameVals: gameVals() },
        );

        expect(parsed.issues).toEqual([]);
        expect(parsed.inventories).toHaveLength(1);
        expect(parsed.inventories[0]).toMatchObject({
            name: "Gaius' Two Handed Shop.",
            scope: "Shared",
            stack: "Always",
            size: 6,
            block: {
                id: "inv.2handedshop",
                resolvedId: 400,
                isServerOnly: true,
            },
        });
        expect(parsed.inventories[0]?.stock).toMatchObject([
            {
                obj: "obj.bronze_2h_sword",
                resolvedObjId: 300,
                count: 4,
                restockCycles: 200,
            },
            {
                obj: "obj.iron_2h_sword",
                resolvedObjId: 301,
                count: 3,
                restockCycles: 300,
            },
        ]);
    });

    it("diagnoses malformed and unresolved stock entries", () => {
        const parsed = parseOpenRuneServerToml(
            ".data/raw-cache/server/shops/bad.toml",
            [
                "[[inventory]]",
                'id = "inv.2handedshop"',
                "",
                "[[inventory.stock]]",
                'obj = "obj.missing"',
                "count = 1",
                "restockCycles = 20",
                "",
                "[[inventory.stock]]",
                'obj = "obj.bronze_2h_sword"',
                "count = 70000",
                "restockCycles = 20",
            ].join("\n"),
            { gameVals: gameVals() },
        );

        expect(parsed.inventories[0]?.stock).toHaveLength(1);
        expect(parsed.issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "UNRESOLVED_STOCK_OBJ",
                    id: "obj.missing",
                }),
                expect.objectContaining({
                    code: "INVALID_STOCK",
                }),
            ]),
        );
    });

    it("accepts restockCycles = -1 (never restocks) like the server codec", () => {
        const parsed = parseOpenRuneServerToml(
            ".data/raw-cache/server/shops/never.toml",
            '[[inventory]]\nid = "inv.2handedshop"\n\n[[inventory.stock]]\nobj = "obj.bronze_2h_sword"\ncount = 20\nrestockCycles = -1',
            { gameVals: gameVals() },
        );
        expect(parsed.issues).toEqual([]);
        expect(parsed.inventories[0]?.stock[0]?.restockCycles).toBe(-1);
    });

    it("serializes canonical shop inventory TOML that round-trips", () => {
        const text = serializeOpenRuneInventoryToml([
            {
                id: "inv.2handedshop",
                name: "Gaius' Two Handed Shop.",
                scope: "Shared",
                stack: "Always",
                sellMultiplier: 1000,
                buyMultiplier: 600,
                delta: 20,
                size: 2,
                protect: false,
                restock: true,
                stock: [
                    {
                        obj: "obj.bronze_2h_sword",
                        count: 4,
                        restockCycles: 200,
                    },
                    {
                        obj: "obj.iron_2h_sword",
                        count: 3,
                        restockCycles: 300,
                    },
                ],
            },
        ]);

        const parsed = parseOpenRuneServerToml(
            "shops/generated.toml",
            text,
            { gameVals: gameVals() },
        );

        expect(parsed.issues).toEqual([]);
        expect(parsed.inventories[0]?.block.isServerOnly).toBe(true);
        expect(parsed.inventories[0]?.stock).toHaveLength(2);
        expect(text).toContain("[[inventory.stock]]");
        expect(text).toContain('obj = "obj.bronze_2h_sword"');
    });
});

describe("indexProjectOpenRuneServerToml", () => {
    it("indexes raw server sources and pack config overlays with provenance", async () => {
        const fs = new InMemoryProjectFileSystem({
            ".data/raw-cache/server/npcs.toml":
                '[[npc]]\nid = "npc.imp"\ninherit = "npc.imp"',
            ".data/raw-cache/server/shops/test.toml":
                '[[inventory]]\nid = "inv.2handedshop"\n[[inventory.stock]]\nobj = "obj.bronze_2h_sword"\ncount = 1\nrestockCycles = 100',
            "content/test/pack/src/main/resources/pack/configs/server.toml":
                '[[inventory]]\nid = "inv.custom_pack_inv"\nisServerOnly = true',
        });

        const index = await indexProjectOpenRuneServerToml(
            fs,
            {
                rawServerSources: {
                    root: ".data/raw-cache/server",
                    tomlFiles: [
                        ".data/raw-cache/server/npcs.toml",
                        ".data/raw-cache/server/shops/test.toml",
                    ],
                },
                packRoots: [
                    {
                        modulePath: "content/test/pack",
                        path: "content/test/pack/src/main/resources/pack",
                        configsPath:
                            "content/test/pack/src/main/resources/pack/configs",
                    },
                ],
            },
            gameVals(),
        );

        expect(findOpenRuneServerByTable(index, "inventory")).toHaveLength(2);
        expect(
            findOpenRuneServerBySymbol(index, "inv.custom_pack_inv")[0],
        ).toMatchObject({
            sourceKind: "pack-config",
            modulePath: "content/test/pack",
            packRootPath: "content/test/pack/src/main/resources/pack",
            resolvedId: 401,
        });
        expect(findOpenRuneServerById(index, "npc", 100)).toHaveLength(1);
        expect(index.inventories).toHaveLength(2);
        expect(index.issues).toEqual([]);
    });

    async function indexNpcDuplicates(rawText: string, packText: string) {
        const fs = new InMemoryProjectFileSystem({
            ".data/raw-cache/server/npcs.toml": rawText,
            "content/test/pack/src/main/resources/pack/configs/npc.toml": packText,
        });
        return indexProjectOpenRuneServerToml(
            fs,
            {
                rawServerSources: { root: ".data/raw-cache/server", tomlFiles: [".data/raw-cache/server/npcs.toml"] },
                packRoots: [{ modulePath: "content/test/pack", path: "content/test/pack/src/main/resources/pack", configsPath: "content/test/pack/src/main/resources/pack/configs" }],
            },
            gameVals(),
        );
    }

    it("calls exact copies of a block harmless, whatever the line endings", async () => {
        const index = await indexNpcDuplicates('[[npc]]\r\nid = "npc.imp"\r\nname = "Imp"  ', '[[npc]]\nid = "npc.imp"\nname = "Imp"');
        expect(index.issues.map((issue) => issue.code)).toEqual(["IDENTICAL_DUPLICATE"]);
        expect(index.issues[0]).toMatchObject({ table: "npc", resolvedId: 100 });
    });

    it("diagnoses duplicate resolved server targets across raw and pack-owned TOML", async () => {
        const fs = new InMemoryProjectFileSystem({
            ".data/raw-cache/server/npcs.toml":
                '[[npc]]\nid = "npc.imp"\nname = "Imp"',
            "content/test/pack/src/main/resources/pack/configs/npc.toml":
                '[[npc]]\nid = "npc.imp"\nname = "Different"',
        });

        const index = await indexProjectOpenRuneServerToml(
            fs,
            {
                rawServerSources: {
                    root: ".data/raw-cache/server",
                    tomlFiles: [".data/raw-cache/server/npcs.toml"],
                },
                packRoots: [
                    {
                        modulePath: "content/test/pack",
                        path: "content/test/pack/src/main/resources/pack",
                        configsPath:
                            "content/test/pack/src/main/resources/pack/configs",
                    },
                ],
            },
            gameVals(),
        );

        expect(index.issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "DUPLICATE_TARGET",
                    table: "npc",
                    resolvedId: 100,
                }),
            ]),
        );
    });
});

describe("OpenRune server source writes", () => {
    const sourcePath = ".data/raw-cache/server/npcs.toml";
    const original = [
        "[[npc]]",
        'id = "npc.imp"',
        "giveChase = false # preserve",
        "",
        "[npc.params]",
        '"param.attack_sound" = 534',
    ].join("\r\n");

    it("updates top-level fields while preserving nested server source", async () => {
        const fs = new InMemoryProjectFileSystem({ [sourcePath]: original });
        const block = parseOpenRuneServerToml(sourcePath, original).blocks[0]!;

        await updateOpenRuneServerField(fs, block, "giveChase", true);

        const written = await fs.readText(sourcePath);
        expect(written).toContain("giveChase = true # preserve");
        expect(written).toContain("[npc.params]\r\n");
        expect(written).toContain('"param.attack_sound" = 534');
    });

    it("refuses stale block and whole-file writes", async () => {
        const fs = new InMemoryProjectFileSystem({ [sourcePath]: original });
        const stale = parseOpenRuneServerToml(sourcePath, original).blocks[0]!;

        await updateOpenRuneServerField(fs, stale, "giveChase", true);

        await expect(
            updateOpenRuneServerField(fs, stale, "wanderRange", 0),
        ).rejects.toMatchObject<Partial<OpenRuneServerWriteError>>({
            code: "STALE_SOURCE",
        });

        await expect(
            replaceOpenRuneServerSourceFile(
                fs,
                sourcePath,
                original,
                original,
            ),
        ).rejects.toMatchObject<Partial<OpenRuneServerWriteError>>({
            code: "STALE_SOURCE",
        });
    });
});


describe("OpenRune server source write races", () => {
    const sourcePath = ".data/raw-cache/server/npcs.toml";
    const original = '[[npc]]\nid = "npc.imp"\ngiveChase = false\n';

    /** Touches the file right after it is read, as an editor or Gradle task running at the same moment would. */
    class TouchAfterReadFileSystem extends InMemoryProjectFileSystem {
        override async readText(path: string): Promise<string> {
            const text = await super.readText(path);
            if (path === sourcePath) this.simulateExternalWrite(path, text);
            return text;
        }
    }

    it("turns a write that raced with another change into STALE_SOURCE and leaves the file alone", async () => {
        const fs = new TouchAfterReadFileSystem({ [sourcePath]: original });
        const block = parseOpenRuneServerToml(sourcePath, original).blocks[0]!;

        await expect(updateOpenRuneServerField(fs, block, "giveChase", true)).rejects.toMatchObject({ code: "STALE_SOURCE" });
        expect(await fs.readText(sourcePath)).toBe(original);
    });

    it("guards whole-file replacement the same way", async () => {
        const fs = new TouchAfterReadFileSystem({ [sourcePath]: original });
        await expect(replaceOpenRuneServerSourceFile(fs, sourcePath, "", original)).rejects.toMatchObject({ code: "STALE_SOURCE" });
    });

    it("reports SOURCE_EXISTS when a new source file appears before it is written", async () => {
        class AppearsFileSystem extends InMemoryProjectFileSystem {
            override async exists(path: string): Promise<boolean> {
                const result = await super.exists(path);
                if (!result) this.simulateExternalWrite(path, "# someone else\n");
                return result;
            }
        }
        const fs = new AppearsFileSystem();
        await expect(replaceOpenRuneServerSourceFile(fs, sourcePath, original)).rejects.toMatchObject({ code: "SOURCE_EXISTS" });
        expect(await fs.readText(sourcePath)).toBe("# someone else\n");
    });
});
