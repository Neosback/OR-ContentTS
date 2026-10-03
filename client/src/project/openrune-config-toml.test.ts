import { describe, expect, it } from "vitest";

import { buildGameValDatIndex } from "./gameval-dat-index";
import { buildGameValTomlIndex } from "./gameval-toml-index";
import { buildGameValRegistry } from "./gameval-registry";
import { InMemoryProjectFileSystem } from "./in-memory-project-filesystem";
import {
    findOpenRuneConfigById,
    findOpenRuneConfigByType,
    indexProjectOpenRuneConfigToml,
    OpenRuneConfigWriteError,
    parseOpenRuneConfigToml,
    updateOpenRuneConfigField,
} from "./openrune-config-toml";
import { buildRscmIndex, parseRscmFile } from "./rscm-index";

function gameVals() {
    return buildGameValRegistry({
        dat: buildGameValDatIndex([]),
        toml: buildGameValTomlIndex([]),
        rscm: buildRscmIndex([
            parseRscmFile(
                ".data/gamevals/obj.rscm",
                [
                    "poh_tablet_shootingstar=50000",
                    "poh_tablet_varrockteleport=8007",
                ].join("\n"),
            ),
            parseRscmFile(
                ".data/gamevals/loc.rscm",
                "farming_shed_poordoor=60000",
            ),
            parseRscmFile(
                ".data/gamevals/spotanim.rscm",
                "custom_graphic=70000",
            ),
        ]),
    });
}

describe("parseOpenRuneConfigToml", () => {
    it("indexes PackConfig definition blocks and resolves GameVal-backed ids", () => {
        const parsed = parseOpenRuneConfigToml(
            "content/example/pack/src/main/resources/pack/configs/example.toml",
            [
                "[[tokenizedReplacement]]",
                'token = "%example%"',
                'value = "replacement"',
                "",
                "[[item]]",
                'id = "obj.poh_tablet_shootingstar"',
                'inherit = "obj.poh_tablet_varrockteleport"',
                'name = "Shooting Star teleport"',
                "tradeable = false",
                "",
                "[item.params]",
                '"param.attack_range" = 9',
                "",
                "[[object]]",
                "id = 61000",
                'name = "Direct numeric loc"',
            ].join("\n"),
            {
                modulePath: "content/example/pack",
                packRootPath:
                    "content/example/pack/src/main/resources/pack",
                gameVals: gameVals(),
            },
        );

        expect(parsed.issues).toEqual([]);
        expect(parsed.blocks).toHaveLength(2);

        expect(parsed.blocks[0]).toMatchObject({
            type: "item",
            ordinal: 0,
            id: "obj.poh_tablet_shootingstar",
            resolvedId: 50000,
            inherit: "obj.poh_tablet_varrockteleport",
            resolvedInheritId: 8007,
            isServerOnly: false,
            modulePath: "content/example/pack",
        });
        expect(parsed.blocks[0]?.fields.map((field) => field.name)).toEqual([
            "id",
            "inherit",
            "name",
            "tradeable",
        ]);
        expect(parsed.blocks[0]?.rawText).toContain("[item.params]");
        expect(parsed.blocks[0]?.rawText).toContain(
            '"param.attack_range" = 9',
        );

        expect(parsed.blocks[1]).toMatchObject({
            type: "object",
            ordinal: 0,
            id: 61000,
            resolvedId: 61000,
        });
    });

    it("diagnoses invalid and unresolved identity fields without dropping valid blocks", () => {
        const parsed = parseOpenRuneConfigToml(
            "configs/bad.toml",
            [
                "[[npc]]",
                "id = true",
                "",
                "[[object]]",
                'id = "loc.not_in_registry"',
                'inherit = "loc.also_missing"',
            ].join("\n"),
            { gameVals: gameVals() },
        );

        expect(parsed.blocks).toHaveLength(2);
        expect(parsed.issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "INVALID_ID",
                    type: "npc",
                }),
                expect.objectContaining({
                    code: "UNRESOLVED_ID",
                    type: "object",
                    id: "loc.not_in_registry",
                }),
                expect.objectContaining({
                    code: "UNRESOLVED_INHERIT",
                    type: "object",
                    id: "loc.also_missing",
                }),
            ]),
        );
    });

    it("preserves server-only metadata and PackConfig aliases", () => {
        const parsed = parseOpenRuneConfigToml(
            "configs/graphics.toml",
            [
                "[[graphic]]",
                "isServerOnly = true",
                "id = 70000",
                "",
                "[[graphics]]",
                "id = 70001",
            ].join("\n"),
        );

        expect(parsed.blocks).toMatchObject([
            {
                type: "graphic",
                isServerOnly: true,
                resolvedId: 70000,
            },
            {
                type: "graphics",
                isServerOnly: false,
                resolvedId: 70001,
            },
        ]);
    });
});

describe("indexProjectOpenRuneConfigToml", () => {
    it("recursively indexes pack config roots with module/source provenance", async () => {
        const fs = new InMemoryProjectFileSystem({
            "content/example/pack/src/main/resources/pack/configs/items.toml":
                '[[item]]\nid = "obj.poh_tablet_shootingstar"\nname = "Tablet"',
            "content/example/pack/src/main/resources/pack/configs/nested/objects.toml":
                '[[object]]\nid = "loc.farming_shed_poordoor"\nname = "Door"',
            "content/example/pack/src/main/resources/pack/models/ignore.toml":
                "[[item]]\nid = 1",
        });

        const index = await indexProjectOpenRuneConfigToml(
            fs,
            {
                packRoots: [
                    {
                        modulePath: "content/example/pack",
                        path: "content/example/pack/src/main/resources/pack",
                        configsPath:
                            "content/example/pack/src/main/resources/pack/configs",
                        modelsPath:
                            "content/example/pack/src/main/resources/pack/models",
                    },
                ],
            },
            gameVals(),
        );

        expect(index.files.map((file) => file.sourcePath)).toEqual([
            "content/example/pack/src/main/resources/pack/configs/items.toml",
            "content/example/pack/src/main/resources/pack/configs/nested/objects.toml",
        ]);
        expect(index.blocks).toHaveLength(2);
        expect(findOpenRuneConfigByType(index, "item")).toHaveLength(1);
        expect(findOpenRuneConfigById(index, "item", 50000)[0]).toMatchObject({
            modulePath: "content/example/pack",
            packRootPath:
                "content/example/pack/src/main/resources/pack",
        });
        expect(findOpenRuneConfigById(index, "object", 60000)).toHaveLength(1);
        expect(index.issues).toEqual([]);
    });

    it("reports duplicate cache targets including graphic/graphics aliases", async () => {
        const fs = new InMemoryProjectFileSystem({
            "content/example/pack/src/main/resources/pack/configs/a.toml":
                "[[graphic]]\nid = 70000",
            "content/example/pack/src/main/resources/pack/configs/b.toml":
                "[[graphics]]\nid = 70000",
        });

        const index = await indexProjectOpenRuneConfigToml(fs, {
            packRoots: [
                {
                    modulePath: "content/example/pack",
                    path: "content/example/pack/src/main/resources/pack",
                    configsPath:
                        "content/example/pack/src/main/resources/pack/configs",
                },
            ],
        });

        expect(index.issues).toMatchObject([
            {
                code: "DUPLICATE_TARGET",
                resolvedId: 70000,
            },
        ]);
        expect(findOpenRuneConfigById(index, "graphic", 70000)).toHaveLength(2);
        expect(findOpenRuneConfigById(index, "graphics", 70000)).toHaveLength(2);
    });
});

describe("updateOpenRuneConfigField", () => {
    const sourcePath =
        "content/example/pack/src/main/resources/pack/configs/item.toml";
    const original = [
        "[[item]]",
        'id = "obj.poh_tablet_shootingstar"',
        'name = "Old name" # keep this note',
        "tradeable = true",
        "",
        "[item.params]",
        '"param.attack_range" = 9',
        "",
        "[[object]]",
        "id = 61000",
    ].join("\r\n");

    async function currentBlock(fs: InMemoryProjectFileSystem) {
        const parsed = parseOpenRuneConfigToml(
            sourcePath,
            await fs.readText(sourcePath),
            { gameVals: gameVals() },
        );
        return parsed.blocks[0]!;
    }

    it("updates one top-level field without rewriting nested TOML or adjacent blocks", async () => {
        const fs = new InMemoryProjectFileSystem({ [sourcePath]: original });
        const block = await currentBlock(fs);

        await updateOpenRuneConfigField(fs, block, "name", "New name");

        const written = await fs.readText(sourcePath);
        expect(written).toContain(
            'name = "New name" # keep this note',
        );
        expect(written).toContain("[item.params]\r\n");
        expect(written).toContain('"param.attack_range" = 9');
        expect(written).toContain("[[object]]\r\nid = 61000");
        expect(written).not.toContain('name = "Old name"');
    });

    it("inserts new fields before nested subtables and removes existing fields", async () => {
        const fs = new InMemoryProjectFileSystem({ [sourcePath]: original });

        await updateOpenRuneConfigField(
            fs,
            await currentBlock(fs),
            "cost",
            50,
        );
        let written = await fs.readText(sourcePath);
        expect(written.indexOf("cost = 50")).toBeLessThan(
            written.indexOf("[item.params]"),
        );

        await updateOpenRuneConfigField(
            fs,
            await currentBlock(fs),
            "tradeable",
            undefined,
        );
        written = await fs.readText(sourcePath);
        expect(written).not.toContain("tradeable =");
        expect(written).toContain('"param.attack_range" = 9');
    });

    it("rejects stale block writes instead of overwriting a changed source", async () => {
        const fs = new InMemoryProjectFileSystem({ [sourcePath]: original });
        const stale = await currentBlock(fs);

        await updateOpenRuneConfigField(fs, stale, "name", "First write");

        await expect(
            updateOpenRuneConfigField(fs, stale, "cost", 100),
        ).rejects.toMatchObject<Partial<OpenRuneConfigWriteError>>({
            name: "OpenRuneConfigWriteError",
            code: "STALE_SOURCE",
        });
    });

    it("rejects non-simple field paths so nested tables require an explicit adapter", async () => {
        const fs = new InMemoryProjectFileSystem({ [sourcePath]: original });

        await expect(
            updateOpenRuneConfigField(
                fs,
                await currentBlock(fs),
                "item.params",
                1,
            ),
        ).rejects.toMatchObject<Partial<OpenRuneConfigWriteError>>({
            code: "INVALID_FIELD",
        });
    });
});


describe("updateOpenRuneConfigField write races", () => {
    const sourcePath = "content/example/pack/src/main/resources/pack/configs/item.toml";
    const original = '[[item]]\nid = "obj.poh_tablet_shootingstar"\nname = "Old"\n';

    class TouchAfterReadFileSystem extends InMemoryProjectFileSystem {
        override async readText(path: string): Promise<string> {
            const text = await super.readText(path);
            this.simulateExternalWrite(path, text);
            return text;
        }
    }

    it("raises STALE_SOURCE when the file is touched between read and write", async () => {
        const fs = new TouchAfterReadFileSystem({ [sourcePath]: original });
        const block = parseOpenRuneConfigToml(sourcePath, original, { gameVals: gameVals() }).blocks[0]!;
        await expect(updateOpenRuneConfigField(fs, block, "name", "New")).rejects.toMatchObject({ code: "STALE_SOURCE" });
        expect(await fs.readText(sourcePath)).toBe(original);
    });
});
