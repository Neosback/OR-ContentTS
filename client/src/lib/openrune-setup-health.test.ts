import { describe, expect, it } from "vitest";

import { InMemoryProjectFileSystem } from "../project/in-memory-project-filesystem";
import type { LocalCacheProfile } from "./local-cache-profiles";
import { inspectOpenRuneSetupHealth } from "./openrune-setup-health";

const profile: LocalCacheProfile = {
    id: "openrune",
    name: "OpenRune",
    revision: "",
    locationNotes: "project",
    setupKind: "openrune",
    openRuneAccessMode: "browser-handle",
};

function projectSeed(withLive: boolean): Record<string, string | Uint8Array> {
    const seed: Record<string, string | Uint8Array> = {
        "settings.gradle.kts": 'rootProject.name = "OpenRune-Server"',
        "or-cache/build.gradle.kts": "",
        "game.example.yml": "name: OpenRune\nrevision: 241\nenvironment: LIVE",
    };
    if (withLive) {
        seed[".data/cache/LIVE/main_file_cache.dat2"] = new Uint8Array([0]);
    }
    return seed;
}

describe("inspectOpenRuneSetupHealth", () => {
    it("treats a fresh valid checkout without LIVE as needing bootstrap", async () => {
        const health = await inspectOpenRuneSetupHealth(profile, {
            fileSystem: new InMemoryProjectFileSystem(projectSeed(false)),
        });

        expect(health.status).toBe("needs-bootstrap");
        expect(health.project?.isOpenRuneProject).toBe(true);
        expect(health.liveCache).toBe(false);
        expect(health.sourceEditing).toBe(true);
        expect(health.message).toContain("LIVE has not been generated");
    });

    it("reports ready once LIVE exists", async () => {
        const health = await inspectOpenRuneSetupHealth(profile, {
            fileSystem: new InMemoryProjectFileSystem(projectSeed(true)),
        });

        expect(health.status).toBe("ready");
        expect(health.liveCache).toBe(true);
        expect(health.project?.liveCachePath).toBe(".data/cache/LIVE");
    });

    it("separates an invalid folder from a valid project awaiting bootstrap", async () => {
        const health = await inspectOpenRuneSetupHealth(profile, {
            fileSystem: new InMemoryProjectFileSystem({
                "README.md": "not OpenRune",
            }),
        });

        expect(health.status).toBe("invalid-project");
        expect(health.project?.isOpenRuneProject).toBe(false);
        expect(health.sourceEditing).toBe(false);
    });
});
