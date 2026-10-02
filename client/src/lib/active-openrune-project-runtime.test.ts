import { describe, expect, it } from "vitest";

import { InMemoryProjectFileSystem } from "../project/in-memory-project-filesystem";
import type { ProjectFileSystem } from "../project/project-filesystem";
import type { LocalCacheProfile } from "./local-cache-profiles";
import {
    clearActiveOpenRuneProjectRuntime,
    getActiveOpenRuneProjectRuntime,
    getActiveOpenRuneProjectSession,
    getActiveOpenRuneProjectSnapshot,
    refreshActiveOpenRuneProjectRuntime,
    subscribeActiveOpenRuneProjectRuntime,
    syncActiveOpenRuneProjectRuntime,
} from "./active-openrune-project-runtime";

function seed(name: string): Record<string, string | Uint8Array> {
    return {
        "settings.gradle.kts": `rootProject.name = "${name}"`,
        "or-cache/build.gradle.kts": "",
        "game.yml": `name: ${name}\nrevision: 240`,
        ".data/gamevals/npc.rscm": "imp=100",
        ".data/cache/LIVE/main_file_cache.dat2": new Uint8Array([0]),
    };
}

function profile(
    id: string,
    root: string,
    setupKind: "basic" | "openrune" = "openrune",
): LocalCacheProfile {
    return {
        id,
        name: id,
        revision: "240",
        locationNotes: root,
        setupKind,
        openRuneRootPath: setupKind === "openrune" ? root : undefined,
    };
}

describe("active OpenRune project runtime", () => {
    it("retains one session for repeated activation of the same profile/root", async () => {
        clearActiveOpenRuneProjectRuntime();
        const fs = new InMemoryProjectFileSystem(seed("One"));
        let creates = 0;
        const candidate = profile("one", "/projects/one");

        const first = await syncActiveOpenRuneProjectRuntime(candidate, {
            createFileSystem: () => {
                creates++;
                return fs;
            },
        });
        const second = await syncActiveOpenRuneProjectRuntime(candidate, {
            createFileSystem: () => {
                creates++;
                return fs;
            },
        });

        expect(first).toBe(second);
        expect(first?.snapshot.generation).toBe(1);
        expect(creates).toBe(1);
        expect(getActiveOpenRuneProjectSession("one")).toBe(first?.session);
        expect(getActiveOpenRuneProjectSnapshot("one")).toBe(first?.snapshot);
    });

    it("clears the old project before activating a different OpenRune root", async () => {
        clearActiveOpenRuneProjectRuntime();
        const one = profile("one", "/projects/one");
        const two = profile("two", "/projects/two");
        const fsOne = new InMemoryProjectFileSystem(seed("One"));
        const fsTwo = new InMemoryProjectFileSystem(seed("Two"));

        await syncActiveOpenRuneProjectRuntime(one, {
            createFileSystem: () => fsOne,
        });

        let resolveTwo!: (value: ProjectFileSystem) => void;
        const pendingTwo = new Promise<ProjectFileSystem>((resolve) => {
            resolveTwo = resolve;
        });
        const switching = syncActiveOpenRuneProjectRuntime(two, {
            createFileSystem: () => pendingTwo,
        });

        expect(getActiveOpenRuneProjectRuntime()).toBeNull();

        resolveTwo(fsTwo);
        const active = await switching;

        expect(active?.profileId).toBe("two");
        expect(active?.snapshot.project.gameConfig?.name).toBe("Two");
        expect(getActiveOpenRuneProjectRuntime()?.profileId).toBe("two");
    });

    it("clears the retained OpenRune session when a Basic cache becomes active", async () => {
        clearActiveOpenRuneProjectRuntime();
        await syncActiveOpenRuneProjectRuntime(
            profile("one", "/projects/one"),
            {
                createFileSystem: () =>
                    new InMemoryProjectFileSystem(seed("One")),
            },
        );

        await expect(
            syncActiveOpenRuneProjectRuntime(
                profile("basic", "", "basic"),
            ),
        ).resolves.toBeNull();
        expect(getActiveOpenRuneProjectRuntime()).toBeNull();
    });

    it("refreshes the retained session instead of replacing it", async () => {
        clearActiveOpenRuneProjectRuntime();
        const fs = new InMemoryProjectFileSystem(seed("One"));
        const candidate = profile("one", "/projects/one");
        const first = await syncActiveOpenRuneProjectRuntime(candidate, {
            createFileSystem: () => fs,
        });

        await fs.writeText(
            "game.yml",
            "name: Updated\nrevision: 241",
        );
        const refreshed = await refreshActiveOpenRuneProjectRuntime(candidate);

        expect(refreshed.session).toBe(first?.session);
        expect(refreshed.snapshot.generation).toBe(2);
        expect(refreshed.snapshot.project.gameConfig).toMatchObject({
            name: "Updated",
            revision: 241,
        });
    });

    it("keeps the prior published runtime when refresh fails", async () => {
        clearActiveOpenRuneProjectRuntime();
        const fs = new InMemoryProjectFileSystem(seed("One"));
        const candidate = profile("one", "/projects/one");
        const first = await syncActiveOpenRuneProjectRuntime(candidate, {
            createFileSystem: () => fs,
        });

        // Replacing the OpenRune marker file with a directory is impossible in
        // the in-memory filesystem, so make a source index fail by deleting its
        // semantic content through an invalid RSCM mapping.
        await fs.writeText(".data/gamevals/npc.rscm", "imp=not-an-id");

        const before = getActiveOpenRuneProjectRuntime();
        await refreshActiveOpenRuneProjectRuntime(candidate);
        const after = getActiveOpenRuneProjectRuntime();

        // Parser diagnostics do not make refresh fail; they publish atomically
        // as a complete new generation.
        expect(after?.snapshot.generation).toBe(2);
        expect(after?.snapshot.diagnostics.gameVals).toBeGreaterThan(0);
        expect(before?.session).toBe(first?.session);
        expect(after?.session).toBe(first?.session);
    });

    it("notifies framework-neutral subscribers on activate, refresh, and clear", async () => {
        clearActiveOpenRuneProjectRuntime();
        const fs = new InMemoryProjectFileSystem(seed("One"));
        const candidate = profile("one", "/projects/one");
        const seen: Array<string | null> = [];
        const unsubscribe = subscribeActiveOpenRuneProjectRuntime((state) => {
            seen.push(
                state
                    ? `${state.profileId}:${state.snapshot.generation}`
                    : null,
            );
        });

        await syncActiveOpenRuneProjectRuntime(candidate, {
            createFileSystem: () => fs,
        });
        await refreshActiveOpenRuneProjectRuntime(candidate);
        clearActiveOpenRuneProjectRuntime();
        unsubscribe();

        expect(seen).toEqual([null, "one:1", "one:2", null]);
    });
});
