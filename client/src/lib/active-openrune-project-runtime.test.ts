import { afterEach, describe, expect, it, vi } from "vitest";

import { InMemoryProjectFileSystem } from "../project/in-memory-project-filesystem";
import type {
    ProjectFileEntry,
    ProjectFileSystem,
    ProjectFileSystemCapabilities,
} from "../project/project-filesystem";
import type { LocalCacheProfile } from "./local-cache-profiles";
import {
    clearActiveOpenRuneProjectRuntime,
    getActiveOpenRuneProjectRuntime,
    getActiveOpenRuneProjectSession,
    getActiveOpenRuneProjectSnapshot,
    refreshActiveOpenRuneProjectRuntime,
    subscribeActiveOpenRuneProjectRuntime,
    subscribeOpenRuneProjectExternalChanges,
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

class ToggleReadFailureFileSystem implements ProjectFileSystem {
    failPath: string | null = null;

    constructor(private readonly inner: ProjectFileSystem) {}

    get capabilities(): ProjectFileSystemCapabilities {
        return this.inner.capabilities;
    }

    list(path?: string): Promise<ProjectFileEntry[]> {
        return this.inner.list(path);
    }

    stat(path: string): Promise<ProjectFileEntry | undefined> {
        return this.inner.stat(path);
    }

    exists(path: string): Promise<boolean> {
        return this.inner.exists(path);
    }

    readText(path: string): Promise<string> {
        if (path === this.failPath) {
            return Promise.reject(new Error("simulated project read failure"));
        }
        return this.inner.readText(path);
    }

    readBytes(path: string): Promise<Uint8Array> {
        if (path === this.failPath) {
            return Promise.reject(new Error("simulated project read failure"));
        }
        return this.inner.readBytes(path);
    }

    writeText(path: string, text: string): Promise<void> {
        return this.inner.writeText(path, text);
    }

    writeBytes(path: string, data: Uint8Array): Promise<void> {
        return this.inner.writeBytes(path, data);
    }
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

        let resolveTwo:
            | ((value: ProjectFileSystem) => void)
            | undefined;
        const pendingTwo = new Promise<ProjectFileSystem>((resolve) => {
            resolveTwo = resolve;
        });
        const switching = syncActiveOpenRuneProjectRuntime(two, {
            createFileSystem: () => pendingTwo,
        });

        expect(getActiveOpenRuneProjectRuntime()).toBeNull();

        expect(resolveTwo).toBeDefined();
        resolveTwo!(fsTwo);
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
        const inner = new InMemoryProjectFileSystem(seed("One"));
        const fs = new ToggleReadFailureFileSystem(inner);
        const candidate = profile("one", "/projects/one");
        const first = await syncActiveOpenRuneProjectRuntime(candidate, {
            createFileSystem: () => fs,
        });

        fs.failPath = ".data/gamevals/npc.rscm";

        await expect(
            refreshActiveOpenRuneProjectRuntime(candidate),
        ).rejects.toThrow("simulated project read failure");

        const after = getActiveOpenRuneProjectRuntime();
        expect(after).toBe(first);
        expect(after?.snapshot.generation).toBe(1);
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

describe("active OpenRune project runtime watching", () => {
    afterEach(() => {
        clearActiveOpenRuneProjectRuntime();
        vi.useRealTimers();
    });

    it("publishes a fresh snapshot after the project changes on disk, and stops when cleared", async () => {
        vi.useFakeTimers();
        const fileSystem = new InMemoryProjectFileSystem(seed("one"));
        const candidate = profile("one", "/projects/one");
        await syncActiveOpenRuneProjectRuntime(candidate, { createFileSystem: () => fileSystem });

        const generations: number[] = [];
        subscribeActiveOpenRuneProjectRuntime((state) => {
            if (state) generations.push(state.snapshot.generation);
        });
        const external: string[][] = [];
        subscribeOpenRuneProjectExternalChanges((change) => external.push(change.paths));

        fileSystem.simulateExternalWrite(".data/gamevals/npc.rscm", "imp=100\nrat=102");
        await vi.advanceTimersByTimeAsync(1000);

        expect(getActiveOpenRuneProjectSnapshot()?.generation).toBe(2);
        expect(getActiveOpenRuneProjectSnapshot()?.gameVals.bySymbol.get("npc.rat")?.id).toBe(102);
        expect(generations.at(-1)).toBe(2);
        expect(external).toEqual([[".data/gamevals/npc.rscm"]]);

        clearActiveOpenRuneProjectRuntime();
        fileSystem.simulateExternalWrite(".data/gamevals/npc.rscm", "imp=100");
        await vi.advanceTimersByTimeAsync(1000);
        expect(external).toHaveLength(1);
    });
});
