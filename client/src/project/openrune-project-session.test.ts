import { afterEach, describe, expect, it, vi } from "vitest";

import { InMemoryProjectFileSystem } from "./in-memory-project-filesystem";
import {
    OpenRuneProjectSession,
    OpenRuneProjectSessionError,
    openOpenRuneProjectSession,
} from "./openrune-project-session";
import type {
    ProjectFileEntry,
    ProjectFileSystem,
    ProjectFileSystemCapabilities,
} from "./project-filesystem";

function openRuneSeed(): Record<string, string | Uint8Array> {
    return {
        "settings.gradle.kts": 'rootProject.name = "OpenRune"',
        "or-cache/build.gradle.kts": "",
        "game.yml": [
            "name: Test OpenRune",
            "revision: 240",
            "environment: live",
        ].join("\n"),
        "content/test/pack/build.gradle.kts": "",
        "content/test/pack/src/main/resources/pack/configs/object.toml":
            '[[object]]\nid = "loc.crate"',
        ".data/gamevals/npc.rscm": "imp=100",
        ".data/gamevals/obj.rscm": "bones=200",
        ".data/gamevals/loc.rscm": "crate=500",
        ".data/gamevals/area.rscm": "test=300",
        ".data/gamevals/inv.rscm": "shop=400",
        ".data/raw-cache/map/npcs/test.toml":
            '[[spawn]]\nnpc = "npc.imp"\ncoords = "0_50_50_1_1"',
        ".data/raw-cache/map/objs/test.toml":
            '[[spawn]]\nobj = "obj.bones"\ncoords = "0_50_50_2_2"',
        ".data/raw-cache/map/area/test.toml": [
            "[[area]]",
            'name = "Test"',
            'area_id = "area.test"',
            "levels = [0]",
            "[[area.polygons]]",
            "vertices = [[3200, 3200], [3201, 3200], [3201, 3201]]",
        ].join("\n"),
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
}

class ToggleReadFailureFileSystem implements ProjectFileSystem {
    failRscmRead = false;

    constructor(private readonly inner: ProjectFileSystem) {}

    watch?: ProjectFileSystem["watch"] = (listener) => this.inner.watch!(listener);

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
        if (this.failRscmRead && path === ".data/gamevals/npc.rscm") {
            return Promise.reject(new Error("simulated external read failure"));
        }
        return this.inner.readText(path);
    }

    readBytes(path: string): Promise<Uint8Array> {
        return this.inner.readBytes(path);
    }

    writeText(path: string, text: string): Promise<void> {
        return this.inner.writeText(path, text);
    }

    writeBytes(path: string, data: Uint8Array): Promise<void> {
        return this.inner.writeBytes(path, data);
    }
}

describe("OpenRuneProjectSession", () => {
    it("builds one cohesive snapshot from a single OpenRune project filesystem", async () => {
        const fileSystem = new InMemoryProjectFileSystem(openRuneSeed());
        const session = await openOpenRuneProjectSession(fileSystem);
        const snapshot = session.snapshot!;

        expect(snapshot.generation).toBe(1);
        expect(snapshot.fileSystem).toBe(fileSystem);
        expect(snapshot.project).toMatchObject({
            isOpenRuneProject: true,
            liveCachePath: ".data/cache/LIVE",
            serverCachePath: ".data/cache/SERVER",
            gameConfig: {
                name: "Test OpenRune",
                revision: 240,
            },
        });

        expect(snapshot.gameVals.bySymbol.get("npc.imp")?.id).toBe(100);
        expect(snapshot.gameVals.bySymbol.get("obj.bones")?.id).toBe(200);
        expect(snapshot.configToml.blocks).toMatchObject([
            {
                type: "object",
                id: "loc.crate",
                resolvedId: 500,
            },
        ]);
        expect(snapshot.mapSources.npcs[0]).toMatchObject({
            npc: "npc.imp",
            npcId: 100,
        });
        expect(snapshot.mapSources.objs[0]).toMatchObject({
            obj: "obj.bones",
            objId: 200,
        });
        expect(snapshot.mapSources.areas[0]).toMatchObject({
            areaId: "area.test",
            resolvedAreaId: 300,
        });
        expect(snapshot.serverToml.inventories[0]).toMatchObject({
            block: {
                id: "inv.shop",
                resolvedId: 400,
            },
            stock: [
                {
                    obj: "obj.bones",
                    resolvedObjId: 200,
                },
            ],
        });

        expect(snapshot.capabilities).toEqual({
            openRune: true,
            projectRead: true,
            projectWrite: true,
            liveCache: true,
            serverCache: true,
            gameVals: true,
            rscm: true,
            packConfigs: true,
            mapSourceToml: true,
            serverSourceToml: true,
            sourceEditing: true,
        });
        expect(snapshot.diagnostics).toEqual({
            gameVals: 0,
            configToml: 0,
            mapSources: 0,
            serverToml: 0,
            total: 0,
        });
    });

    it("refreshes all derived indexes together and advances the generation", async () => {
        const fileSystem = new InMemoryProjectFileSystem(openRuneSeed());
        const session = await openOpenRuneProjectSession(fileSystem);
        const first = session.snapshot!;

        await fileSystem.writeText(
            ".data/raw-cache/server/shop.toml",
            [
                "[[inventory]]",
                'id = "inv.shop"',
                "isServerOnly = true",
                'name = "Updated shop"',
                "[[inventory.stock]]",
                'obj = "obj.bones"',
                "count = 1",
                "restockCycles = 100",
            ].join("\n"),
        );

        const second = await session.refresh();

        expect(second).not.toBe(first);
        expect(second.generation).toBe(2);
        expect(second.serverToml.inventories[0]?.name).toBe("Updated shop");
        expect(session.snapshot).toBe(second);
    });

    it("keeps the previous complete snapshot when a refresh fails", async () => {
        const inner = new InMemoryProjectFileSystem(openRuneSeed());
        const fileSystem = new ToggleReadFailureFileSystem(inner);
        const session = await openOpenRuneProjectSession(fileSystem);
        const first = session.snapshot!;

        fileSystem.failRscmRead = true;

        await expect(session.refresh()).rejects.toThrow(
            "simulated external read failure",
        );
        expect(session.snapshot).toBe(first);
        expect(session.snapshot?.generation).toBe(1);
    });

    it("rejects a directory that is not an OpenRune project without publishing a snapshot", async () => {
        const session = new OpenRuneProjectSession(
            new InMemoryProjectFileSystem({
                "README.md": "not an OpenRune project",
            }),
        );

        await expect(session.refresh()).rejects.toMatchObject<
            Partial<OpenRuneProjectSessionError>
        >({
            name: "OpenRuneProjectSessionError",
            code: "NOT_OPENRUNE_PROJECT",
        });
        expect(session.snapshot).toBeUndefined();
    });

    it("reflects read-only project filesystems in source-editing capabilities", async () => {
        const session = await openOpenRuneProjectSession(
            new InMemoryProjectFileSystem(openRuneSeed(), {
                writable: false,
            }),
        );

        expect(session.snapshot?.capabilities.projectWrite).toBe(false);
        expect(session.snapshot?.capabilities.sourceEditing).toBe(false);
    });

    describe("watch", () => {
        afterEach(() => vi.useRealTimers());

        it("re-indexes once after a burst of source changes settles and reports the paths", async () => {
            vi.useFakeTimers();
            const fileSystem = new InMemoryProjectFileSystem(openRuneSeed());
            const session = await openOpenRuneProjectSession(fileSystem);
            const changes: Array<{ paths: string[]; cacheChanged: boolean; generation?: number }> = [];
            const stop = session.watch((change) => changes.push({ paths: change.paths, cacheChanged: change.cacheChanged, generation: change.snapshot?.generation }), { debounceMs: 100 });

            fileSystem.simulateExternalWrite(".data/gamevals/npc.rscm", "imp=100\ngoblin=101");
            fileSystem.simulateExternalWrite(".data/raw-cache/server/shop.toml", "[[inventory]]\nid = \"inv.shop\"");
            await vi.advanceTimersByTimeAsync(99);
            expect(changes).toHaveLength(0);
            await vi.advanceTimersByTimeAsync(2);

            expect(changes).toEqual([
                { paths: [".data/gamevals/npc.rscm", ".data/raw-cache/server/shop.toml"], cacheChanged: false, generation: 2 },
            ]);
            expect(session.snapshot?.gameVals.bySymbol.get("npc.goblin")?.id).toBe(101);
            stop();
        });

        it("flags generated cache output without treating it as a source change", async () => {
            vi.useFakeTimers();
            const fileSystem = new InMemoryProjectFileSystem(openRuneSeed());
            const session = await openOpenRuneProjectSession(fileSystem);
            const changes: Array<{ paths: string[]; cacheChanged: boolean }> = [];
            session.watch((change) => changes.push({ paths: change.paths, cacheChanged: change.cacheChanged }), { debounceMs: 50 });

            fileSystem.simulateExternalWrite(".data/cache/SERVER/main_file_cache.dat2", new Uint8Array([1]));
            await vi.advanceTimersByTimeAsync(60);

            expect(changes).toEqual([{ paths: [], cacheChanged: true }]);
        });

        it("ignores unrelated files and stops listening once stopped", async () => {
            vi.useFakeTimers();
            const fileSystem = new InMemoryProjectFileSystem(openRuneSeed());
            const session = await openOpenRuneProjectSession(fileSystem);
            const changes: unknown[] = [];
            const stop = session.watch((change) => changes.push(change), { debounceMs: 50 });

            fileSystem.simulateExternalWrite("notes.txt", "hello");
            await vi.advanceTimersByTimeAsync(100);
            expect(changes).toHaveLength(0);

            fileSystem.simulateExternalWrite(".data/gamevals/npc.rscm", "imp=100\nrat=102");
            stop();
            await vi.advanceTimersByTimeAsync(100);
            expect(changes).toHaveLength(0);
        });

        it("reports a failed refresh and keeps the previous snapshot", async () => {
            vi.useFakeTimers();
            const inner = new InMemoryProjectFileSystem(openRuneSeed());
            const fileSystem = new ToggleReadFailureFileSystem(inner);
            const session = await openOpenRuneProjectSession(fileSystem);
            const before = session.snapshot;
            const changes: Array<{ error?: unknown }> = [];
            session.watch((change) => changes.push({ error: change.error }), { debounceMs: 20 });

            fileSystem.failRscmRead = true;
            inner.simulateExternalWrite(".data/gamevals/npc.rscm", "imp=100\nrat=102");
            await vi.advanceTimersByTimeAsync(30);

            expect(changes).toHaveLength(1);
            expect(changes[0].error).toBeInstanceOf(Error);
            expect(session.snapshot).toBe(before);
        });

        it("does nothing when the file system cannot watch", async () => {
            const fileSystem = new ToggleReadFailureFileSystem(new InMemoryProjectFileSystem(openRuneSeed()));
            delete fileSystem.watch;
            const session = await openOpenRuneProjectSession(fileSystem);
            expect(() => session.watch(() => undefined)()).not.toThrow();
        });
    });
});
