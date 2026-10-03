import { describe, expect, it } from "vitest";

import { InMemoryProjectFileSystem } from "./in-memory-project-filesystem";
import { describeOpenRuneProject } from "./openrune-project-overview";
import { openOpenRuneProjectSession } from "./openrune-project-session";

const seed = {
    "settings.gradle.kts": 'rootProject.name = "OpenRune"',
    "or-cache/build.gradle.kts": "",
    "game.yml": ["name: Test OpenRune", "revision: 240", "environment: live"].join("\n"),
    "content/test/pack/build.gradle.kts": "",
    "content/test/pack/src/main/resources/pack/configs/object.toml": '[[object]]\nid = "loc.crate"',
    ".data/gamevals/npc.rscm": "imp=100",
    ".data/gamevals/obj.rscm": "bones=200",
    ".data/gamevals/loc.rscm": "crate=500",
    ".data/gamevals/area.rscm": "test=300",
    ".data/gamevals/inv.rscm": "shop=400",
    ".data/raw-cache/map/npcs/test.toml": '[[spawn]]\nnpc = "npc.imp"\ncoords = "0_50_50_1_1"',
    ".data/raw-cache/map/objs/test.toml": '[[spawn]]\nobj = "obj.bones"\ncoords = "0_50_50_2_2"',
    ".data/raw-cache/server/shop.toml": [
        "[[inventory]]",
        'id = "inv.shop"',
        "isServerOnly = true",
        "[[inventory.stock]]",
        'obj = "obj.bones"',
        "count = 1",
        "restockCycles = 100",
    ].join("\n"),
    ".data/cache/LIVE/main_file_cache.dat2": new Uint8Array([0]),
    ".data/cache/SERVER/main_file_cache.dat2": new Uint8Array([0]),
};

const row = (overview: ReturnType<typeof describeOpenRuneProject>, section: string, label: string) =>
    overview.sections.find((s) => s.id === section)?.rows.find((r) => r.label === label)?.value;
const feature = (overview: ReturnType<typeof describeOpenRuneProject>, id: string) => overview.features.find((f) => f.id === id);

describe("describeOpenRuneProject", () => {
    it("summarizes what a full project provides", async () => {
        const session = await openOpenRuneProjectSession(new InMemoryProjectFileSystem(seed));
        const overview = describeOpenRuneProject(session.snapshot!);

        expect(overview.name).toBe("Test OpenRune");
        expect(row(overview, "project", "Revision")).toBe("240");
        expect(row(overview, "project", "Environment")).toBe("live");
        expect(row(overview, "project", "Access")).toBe("read and write");
        expect(row(overview, "caches", "LIVE cache")).toContain("LIVE");
        expect(row(overview, "maps", "NPC spawns")).toContain("1 spawn");
        expect(row(overview, "gamevals", "Files")).toContain("5 RSCM");
        expect(row(overview, "server", "Inventories")).toBe("1 inventory");

        expect(feature(overview, "map-editor")).toMatchObject({ status: "ready", usage: "active" });
        expect(feature(overview, "interface-editor")).toMatchObject({ status: "ready", usage: "active" });
        expect(feature(overview, "gamevals")?.status).toBe("ready");
        expect(feature(overview, "rscm")?.status).toBe("ready");
        expect(feature(overview, "server-cache")?.status).toBe("ready");
        expect(overview.summary).toMatch(/^\d+ of \d+ capabilities ready/);
    });

    it("says what is missing and what to do when LIVE has not been generated", async () => {
        const { ".data/cache/LIVE/main_file_cache.dat2": _live, ".data/cache/SERVER/main_file_cache.dat2": _server, ...withoutCaches } = seed;
        const session = await openOpenRuneProjectSession(new InMemoryProjectFileSystem(withoutCaches));
        const overview = describeOpenRuneProject(session.snapshot!);

        expect(row(overview, "caches", "LIVE cache")).toBe("not generated yet");
        const mapEditor = feature(overview, "map-editor");
        expect(mapEditor?.status).toBe("missing");
        expect(mapEditor?.detail).toContain("bootstrap");
        expect(feature(overview, "interface-editor")?.status).toBe("missing");
        // everything that does not depend on the cache is still reported as available
        expect(feature(overview, "gamevals")?.status).toBe("ready");
    });

    it("reports read-only access and project issues", async () => {
        const session = await openOpenRuneProjectSession(new InMemoryProjectFileSystem(seed, { writable: false }));
        const overview = describeOpenRuneProject(session.snapshot!, "My setup");
        expect(row(overview, "project", "Access")).toBe("read only");
        expect(feature(overview, "source-editing")?.status).toBe("missing");
        expect(Array.isArray(overview.issues)).toBe(true);
        expect(overview.issueTotal).toBe(session.snapshot!.diagnostics.total);
    });
});
