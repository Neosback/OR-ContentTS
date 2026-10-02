import { describe, expect, it } from "vitest";

import { buildGameValDatIndex } from "./gameval-dat-index";
import { buildGameValTomlIndex } from "./gameval-toml-index";
import { buildGameValRegistry } from "./gameval-registry";
import { InMemoryProjectFileSystem } from "./in-memory-project-filesystem";
import {
    formatOpenRuneCoordGrid,
    indexProjectOpenRuneMapSources,
    OpenRuneMapSourceWriteError,
    parseOpenRuneAreaToml,
    parseOpenRuneCoordGrid,
    parseOpenRuneNpcSpawnToml,
    parseOpenRuneObjSpawnToml,
    replaceOpenRuneMapSourceFile,
    serializeOpenRuneAreaToml,
    serializeOpenRuneNpcSpawnToml,
    serializeOpenRuneObjSpawnToml,
} from "./openrune-map-source-toml";
import { buildRscmIndex, parseRscmFile } from "./rscm-index";

function gameVals() {
    return buildGameValRegistry({
        dat: buildGameValDatIndex([]),
        toml: buildGameValTomlIndex([]),
        rscm: buildRscmIndex([
            parseRscmFile(
                ".data/gamevals/npc.rscm",
                "imp=100\nqip_digsite_digworkman_03=101",
            ),
            parseRscmFile(
                ".data/gamevals/obj.rscm",
                "bones=200\nairrune=201",
            ),
            parseRscmFile(
                ".data/gamevals/area.rscm",
                [
                    "wilderness=300",
                    "wilderness_dungeons=301",
                    "demonic_ruins=302",
                    "chaos_temple=303",
                    "ferox_enclave=304",
                    "keldagrim=305",
                ].join("\n"),
            ),
        ]),
    });
}

describe("OpenRune CoordGrid", () => {
    it("parses and formats level_mapX_mapZ_localX_localZ coordinates", () => {
        const coords = parseOpenRuneCoordGrid("2_38_69_40_37");

        expect(coords).toEqual({
            raw: "2_38_69_40_37",
            level: 2,
            mapX: 38,
            mapZ: 69,
            localX: 40,
            localZ: 37,
            worldX: 2472,
            worldZ: 4453,
            mapSquareId: (38 << 8) | 69,
        });
        expect(formatOpenRuneCoordGrid(coords!)).toBe("2_38_69_40_37");
    });

    it("rejects malformed or out-of-range coordinates", () => {
        expect(parseOpenRuneCoordGrid("0_50_50_64_0")).toBeUndefined();
        expect(parseOpenRuneCoordGrid("4_50_50_0_0")).toBeUndefined();
        expect(parseOpenRuneCoordGrid("0_50_50_0")).toBeUndefined();
        expect(parseOpenRuneCoordGrid("0_50_x_0_0")).toBeUndefined();
    });
});

describe("NPC and ground-Obj map TOML", () => {
    it("parses real OpenRune NPC spawn shape with GameVal provenance", () => {
        const parsed = parseOpenRuneNpcSpawnToml(
            ".data/raw-cache/map/npcs/soil.toml",
            [
                "[[spawn]]",
                'npc = "npc.qip_digsite_digworkman_03"',
                'coords = "0_52_53_26_16"',
                "",
                "[[spawn]]",
                'npc = "npc.imp"',
                'coords = "0_48_50_1_50"',
            ].join("\n"),
            gameVals(),
        );

        expect(parsed.issues).toEqual([]);
        expect(parsed.spawns).toMatchObject([
            {
                npc: "npc.qip_digsite_digworkman_03",
                npcId: 101,
                coords: {
                    level: 0,
                    mapX: 52,
                    mapZ: 53,
                    localX: 26,
                    localZ: 16,
                },
                ordinal: 0,
            },
            {
                npc: "npc.imp",
                npcId: 100,
                ordinal: 1,
            },
        ]);
    });

    it("parses ground Obj count with OpenRune's default of one", () => {
        const parsed = parseOpenRuneObjSpawnToml(
            ".data/raw-cache/map/objs/soil.toml",
            [
                "[[spawn]]",
                'obj = "obj.bones"',
                'coords = "0_52_53_33_19"',
                "",
                "[[spawn]]",
                'obj = "obj.airrune"',
                "count = 25",
                'coords = "0_45_49_58_22"',
            ].join("\n"),
            gameVals(),
        );

        expect(parsed.issues).toEqual([]);
        expect(parsed.spawns.map((spawn) => [spawn.obj, spawn.objId, spawn.count])).toEqual([
            ["obj.bones", 200, 1],
            ["obj.airrune", 201, 25],
        ]);
    });

    it("reports unresolved symbols, invalid coords, and invalid counts without inventing ids", () => {
        const npc = parseOpenRuneNpcSpawnToml(
            "npcs/bad.toml",
            '[[spawn]]\nnpc = "npc.missing"\ncoords = "0_1_1_64_0"',
            gameVals(),
        );
        expect(npc.spawns).toEqual([]);
        expect(npc.issues.map((issue) => issue.code)).toContain("INVALID_COORDS");

        const obj = parseOpenRuneObjSpawnToml(
            "objs/bad.toml",
            [
                "[[spawn]]",
                'obj = "obj.missing"',
                "count = -1",
                'coords = "0_1_1_1_1"',
            ].join("\n"),
            gameVals(),
        );
        expect(obj.spawns).toEqual([]);
        expect(obj.issues.map((issue) => issue.code)).toEqual(
            expect.arrayContaining(["UNRESOLVED_SYMBOL", "INVALID_COUNT"]),
        );
    });
});

describe("Area map TOML", () => {
    it("parses levels, include/exclude references, and polygon vertices", () => {
        const parsed = parseOpenRuneAreaToml(
            ".data/raw-cache/map/area/wilderness.toml",
            [
                "[[area]]",
                'name = "Wilderness"',
                'area_id = "area.wilderness"',
                "levels = [0, 1, 2, 3]",
                "includes = [",
                '    "area.wilderness_dungeons",',
                '    "area.demonic_ruins",',
                '    "area.chaos_temple",',
                "]",
                "excludes = [",
                '    "area.ferox_enclave",',
                "]",
                "",
                "[[area.polygons]]",
                "vertices = [",
                "    [2947, 3681],",
                "    [2944, 3525],",
                "    [3395, 3984],",
                "]",
            ].join("\n"),
            gameVals(),
        );

        expect(parsed.issues).toEqual([]);
        expect(parsed.areas).toHaveLength(1);
        expect(parsed.areas[0]).toMatchObject({
            name: "Wilderness",
            areaId: "area.wilderness",
            resolvedAreaId: 300,
            levels: [0, 1, 2, 3],
            includes: [
                "area.wilderness_dungeons",
                "area.demonic_ruins",
                "area.chaos_temple",
            ],
            resolvedIncludes: [301, 302, 303],
            excludes: ["area.ferox_enclave"],
            resolvedExcludes: [304],
        });
        expect(parsed.areas[0]?.polygons[0]?.vertices).toEqual([
            [2947, 3681],
            [2944, 3525],
            [3395, 3984],
        ]);
    });

    it("retains multiple polygons under one area", () => {
        const parsed = parseOpenRuneAreaToml(
            ".data/raw-cache/map/area/keldagrim.toml",
            [
                "[[area]]",
                'name = "Keldagrim"',
                'area_id = "area.keldagrim"',
                "levels = [0, 1, 2, 3]",
                "",
                "[[area.polygons]]",
                "vertices = [[2816, 10112], [2943, 10112], [2943, 10239]]",
                "",
                "[[area.polygons]]",
                "vertices = [[2752, 10112], [2815, 10112], [2815, 10175]]",
            ].join("\n"),
            gameVals(),
        );

        expect(parsed.issues).toEqual([]);
        expect(parsed.areas[0]?.polygons).toHaveLength(2);
        expect(parsed.areas[0]?.resolvedAreaId).toBe(305);
    });

    it("diagnoses unresolved references and malformed polygons", () => {
        const parsed = parseOpenRuneAreaToml(
            "area/bad.toml",
            [
                "[[area]]",
                'name = "Bad"',
                'area_id = "area.missing"',
                "levels = [0, 4]",
                'includes = ["area.also_missing"]',
                "",
                "[[area.polygons]]",
                "vertices = [[1, 2], [3, 4]]",
            ].join("\n"),
            gameVals(),
        );

        expect(parsed.areas).toEqual([]);
        expect(parsed.issues.map((issue) => issue.code)).toEqual(
            expect.arrayContaining(["INVALID_LEVELS"]),
        );
    });
});

describe("indexProjectOpenRuneMapSources", () => {
    it("builds map-square lookups and flags duplicate area declarations", async () => {
        const fs = new InMemoryProjectFileSystem({
            ".data/raw-cache/map/npcs/test.toml":
                '[[spawn]]\nnpc = "npc.imp"\ncoords = "0_48_50_1_50"',
            ".data/raw-cache/map/objs/test.toml":
                '[[spawn]]\nobj = "obj.bones"\ncoords = "0_48_50_2_50"',
            ".data/raw-cache/map/area/a.toml":
                '[[area]]\nname = "Wilderness"\narea_id = "area.wilderness"\nlevels = [0]\n[[area.polygons]]\nvertices = [[3072, 3200], [3073, 3200], [3073, 3201]]',
            ".data/raw-cache/map/area/b.toml":
                '[[area]]\nname = "Duplicate"\narea_id = "area.wilderness"\nlevels = [0]\n[[area.polygons]]\nvertices = [[3074, 3200], [3075, 3200], [3075, 3201]]',
        });

        const index = await indexProjectOpenRuneMapSources(
            fs,
            {
                rawMapSources: {
                    root: ".data/raw-cache/map",
                    npcRoot: ".data/raw-cache/map/npcs",
                    objRoot: ".data/raw-cache/map/objs",
                    areaRoot: ".data/raw-cache/map/area",
                    npcTomlFiles: [".data/raw-cache/map/npcs/test.toml"],
                    objTomlFiles: [".data/raw-cache/map/objs/test.toml"],
                    areaTomlFiles: [
                        ".data/raw-cache/map/area/a.toml",
                        ".data/raw-cache/map/area/b.toml",
                    ],
                },
            },
            gameVals(),
        );

        const square = (48 << 8) | 50;
        expect(index.npcsByMapSquare.get(square)).toHaveLength(1);
        expect(index.objsByMapSquare.get(square)).toHaveLength(1);
        expect(index.areasBySymbol.get("area.wilderness")).toHaveLength(2);
        expect(index.issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "DUPLICATE_AREA_ID",
                    symbol: "area.wilderness",
                }),
            ]),
        );
    });
});

describe("OpenRune map TOML generation", () => {
    it("serializes NPC and Obj sources that round-trip through the parsers", () => {
        const npcText = serializeOpenRuneNpcSpawnToml([
            { npc: "npc.imp", coords: "0_48_50_1_50" },
        ]);
        const objText = serializeOpenRuneObjSpawnToml([
            { obj: "obj.bones", coords: "0_48_50_2_50" },
            { obj: "obj.airrune", count: 25, coords: "0_45_49_58_22" },
        ]);

        expect(parseOpenRuneNpcSpawnToml("npcs/generated.toml", npcText).spawns).toHaveLength(1);
        expect(
            parseOpenRuneObjSpawnToml("objs/generated.toml", objText).spawns.map(
                (spawn) => spawn.count,
            ),
        ).toEqual([1, 25]);
        expect(objText).not.toContain("count = 1");
        expect(objText).toContain("count = 25");
    });

    it("serializes multi-polygon areas with includes and excludes", () => {
        const text = serializeOpenRuneAreaToml([
            {
                name: "Wilderness",
                areaId: "area.wilderness",
                levels: [0, 1, 2, 3],
                includes: ["area.wilderness_dungeons"],
                excludes: ["area.ferox_enclave"],
                polygons: [
                    [
                        [2947, 3681],
                        [2944, 3525],
                        [3395, 3984],
                    ],
                    [
                        [3000, 3600],
                        [3001, 3600],
                        [3001, 3601],
                    ],
                ],
            },
        ]);

        const parsed = parseOpenRuneAreaToml(
            "area/generated.toml",
            text,
            gameVals(),
        );
        expect(parsed.issues).toEqual([]);
        expect(parsed.areas[0]?.polygons).toHaveLength(2);
        expect(parsed.areas[0]?.includes).toEqual([
            "area.wilderness_dungeons",
        ]);
        expect(parsed.areas[0]?.excludes).toEqual(["area.ferox_enclave"]);
    });

    it("uses optimistic concurrency for whole-file source replacement", async () => {
        const sourcePath = ".data/raw-cache/map/npcs/test.toml";
        const original =
            '[[spawn]]\nnpc = "npc.imp"\ncoords = "0_48_50_1_50"\n';
        const fs = new InMemoryProjectFileSystem({ [sourcePath]: original });

        const next = serializeOpenRuneNpcSpawnToml([
            { npc: "npc.imp", coords: "0_48_50_2_50" },
        ]);
        await replaceOpenRuneMapSourceFile(fs, sourcePath, next, original);
        expect(await fs.readText(sourcePath)).toBe(next);

        await expect(
            replaceOpenRuneMapSourceFile(fs, sourcePath, original, original),
        ).rejects.toMatchObject<Partial<OpenRuneMapSourceWriteError>>({
            code: "STALE_SOURCE",
        });
    });
});
