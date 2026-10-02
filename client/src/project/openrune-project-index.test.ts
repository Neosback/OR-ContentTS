import { describe, expect, it } from "vitest";

import { InMemoryProjectFileSystem } from "./in-memory-project-filesystem";
import { indexOpenRuneProject } from "./openrune-project-index";

function fixture() {
    return new InMemoryProjectFileSystem({
        "settings.gradle.kts": "include(\"api\", \"content\", \"engine\", \"server\", \"or-cache\")",
        "build.gradle.kts": "plugins {}",
        "game.yml": [
            'name: "OpenRune Dev"',
            "revision: 240",
            'environment: "LIVE"',
            "world: 255",
            "",
            "gameplay:",
            "  drop-rates:",
            "    multiplier: 1.0",
        ].join("\n"),
        "or-cache/build.gradle.kts": "plugins {}",
        "api/gamevals.toml": "[gamevals.iftype]\nchatbox = 162",
        "api/account/build.gradle.kts": "plugins {}",
        "api/account/gamevals.toml": "[gamevals.varp]\naccount_state = 70000",
        "content/skills/woodcutting/build.gradle.kts": "plugins {}",
        "content/skills/woodcutting/gamevals.toml": "[gamevals.loc]\ntree = 50000",
        "content/skills/woodcutting/pack/build.gradle.kts": "plugins {}",
        "content/skills/woodcutting/pack/src/main/resources/pack/configs/trees.toml":
            "[[object]]\nid = \"loc.tree\"",
        "content/skills/woodcutting/pack/src/main/resources/pack/models/readme.txt": "model",
        "content/skills/woodcutting/pack/src/main/resources/pack/interfaces/readme.txt": "interface",
        "engine/map/build.gradle.kts": "plugins {}",
        "server/app/build.gradle.kts": "plugins {}",
        "tools/wiki-dumping/build.gradle.kts": "plugins {}",
        ".data/gamevals/loc.rscm": "tree=50000",
        ".data/gamevals/obj.rscm": "logs=60000",
        ".data/gamevals/ignore.txt": "ignore",
        ".data/gamevals-binary/gamevals.dat": new Uint8Array([1, 2]),
        ".data/gamevals-binary/gamevals_generated.dat": new Uint8Array([3, 4]),
        ".data/raw-cache/map/npcs/lumbridge.toml": "[[spawn]]",
        ".data/raw-cache/map/objs/lumbridge.toml": "[[spawn]]",
        ".data/raw-cache/map/area/lumbridge.toml": "[[area]]",
        ".data/raw-cache/server/inventories/shops.toml": "[[inventory]]",
        ".data/cache/LIVE/main_file_cache.dat2": new Uint8Array([1]),
        ".data/cache/SERVER/main_file_cache.dat2": new Uint8Array([2]),
        ".git/objects/ignored": "ignored",
        "content/skills/woodcutting/build/generated.txt": "ignored",
        "content/skills/woodcutting/out/gamevals.toml": "[gamevals.loc]\ngenerated = 1",
        "node_modules/fake/build.gradle.kts": "ignored",
    });
}

describe("indexOpenRuneProject", () => {
    it("recognizes an OpenRune checkout and reads top-level game metadata", async () => {
        const index = await indexOpenRuneProject(fixture());

        expect(index.isOpenRuneProject).toBe(true);
        expect(index.markers).toEqual([
            "settings.gradle.kts",
            "build.gradle.kts",
            "game.yml",
            "or-cache/build.gradle.kts",
        ]);
        expect(index.gameConfig).toEqual({
            path: "game.yml",
            name: "OpenRune Dev",
            revision: 240,
            environment: "LIVE",
            world: 255,
        });
    });

    it("discovers Gradle modules structurally and classifies pack modules", async () => {
        const index = await indexOpenRuneProject(fixture());

        expect(index.modules.map((module) => [module.path, module.family, module.isPackModule])).toEqual([
            ["or-cache", "cache", false],
            ["api/account", "api", false],
            ["engine/map", "engine", false],
            ["server/app", "server", false],
            ["tools/wiki-dumping", "tools", false],
            ["content/skills/woodcutting", "content", false],
            ["content/skills/woodcutting/pack", "content", true],
        ]);

        const packModule = index.modules.find(
            (module) => module.path === "content/skills/woodcutting/pack",
        );
        expect(packModule?.packRoots).toEqual([
            "content/skills/woodcutting/pack/src/main/resources/pack",
        ]);
    });

    it("indexes pack roots and preserves source provenance", async () => {
        const index = await indexOpenRuneProject(fixture());

        expect(index.packRoots).toEqual([
            {
                modulePath: "content/skills/woodcutting/pack",
                path: "content/skills/woodcutting/pack/src/main/resources/pack",
                configsPath: "content/skills/woodcutting/pack/src/main/resources/pack/configs",
                modelsPath: "content/skills/woodcutting/pack/src/main/resources/pack/models",
                spritesPath: undefined,
                cs2Path: undefined,
                interfacesPath: "content/skills/woodcutting/pack/src/main/resources/pack/interfaces",
            },
        ]);

        expect(index.gameValTomlFiles).toEqual([
            "api/account/gamevals.toml",
            "api/gamevals.toml",
            "content/skills/woodcutting/gamevals.toml",
        ]);
        expect(
            index.modules.find((module) => module.path === "api/account")?.gameValTomlFiles,
        ).toEqual(["api/account/gamevals.toml"]);
        expect(
            index.modules.find((module) => module.path === "content/skills/woodcutting")
                ?.gameValTomlFiles,
        ).toEqual(["content/skills/woodcutting/gamevals.toml"]);
    });

    it("indexes GameVal, raw map/server, and generated cache locations without traversing caches", async () => {
        const index = await indexOpenRuneProject(fixture());

        expect(index.rscmFiles).toEqual([
            ".data/gamevals/loc.rscm",
            ".data/gamevals/obj.rscm",
        ]);
        expect(index.gameValBinaryFiles).toEqual([
            ".data/gamevals-binary/gamevals.dat",
            ".data/gamevals-binary/gamevals_generated.dat",
        ]);
        expect(index.rawMapSources).toEqual({
            root: ".data/raw-cache/map",
            npcRoot: ".data/raw-cache/map/npcs",
            objRoot: ".data/raw-cache/map/objs",
            areaRoot: ".data/raw-cache/map/area",
            npcTomlFiles: [".data/raw-cache/map/npcs/lumbridge.toml"],
            objTomlFiles: [".data/raw-cache/map/objs/lumbridge.toml"],
            areaTomlFiles: [".data/raw-cache/map/area/lumbridge.toml"],
        });
        expect(index.rawServerSources).toEqual({
            root: ".data/raw-cache/server",
            tomlFiles: [".data/raw-cache/server/inventories/shops.toml"],
        });
        expect(index.liveCachePath).toBe(".data/cache/LIVE");
        expect(index.serverCachePath).toBe(".data/cache/SERVER");
    });

    it("does not treat unrelated Gradle/build-output trees as OpenRune source modules", async () => {
        const index = await indexOpenRuneProject(fixture());

        expect(index.modules.some((module) => module.path.startsWith(".git"))).toBe(false);
        expect(index.modules.some((module) => module.path.startsWith("node_modules"))).toBe(false);
        expect(index.modules.some((module) => module.path.includes("/build/"))).toBe(false);
        expect(index.gameValTomlFiles.some((path) => path.includes("/out/"))).toBe(false);
    });

    it("returns a useful empty index for a non-OpenRune directory", async () => {
        const fs = new InMemoryProjectFileSystem({
            "README.md": "hello",
            "src/index.ts": "export {}",
        });

        const index = await indexOpenRuneProject(fs);

        expect(index.isOpenRuneProject).toBe(false);
        expect(index.markers).toEqual([]);
        expect(index.modules).toEqual([]);
        expect(index.packRoots).toEqual([]);
        expect(index.gameValTomlFiles).toEqual([]);
        expect(index.rscmFiles).toEqual([]);
        expect(index.rawServerSources.tomlFiles).toEqual([]);
        expect(index.liveCachePath).toBeUndefined();
        expect(index.serverCachePath).toBeUndefined();
    });

    it("falls back to game.example.yml for an uninstalled checkout", async () => {
        const fs = new InMemoryProjectFileSystem({
            "settings.gradle.kts": "rootProject.name = \"OpenRune-Server\"",
            "or-cache/build.gradle.kts": "plugins {}",
            "game.example.yml": 'name: "OpenRune"\nrevision: 241\nenvironment: "LIVE"\nworld: 1',
        });

        const index = await indexOpenRuneProject(fs);

        expect(index.isOpenRuneProject).toBe(true);
        expect(index.gameConfig).toEqual({
            path: "game.example.yml",
            name: "OpenRune",
            revision: 241,
            environment: "LIVE",
            world: 1,
        });
    });
});
