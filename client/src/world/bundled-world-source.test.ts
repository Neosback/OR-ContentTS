import { describe, expect, it, vi } from "vitest";

import type { CacheInfo } from "../rs/cache/CacheInfo";
import type { NpcSpawn, ObjSpawn } from "./world-source";
import { BundledWorldSource } from "./bundled-world-source";

const cacheInfo: CacheInfo = {
    name: "openrune-240",
    game: "oldschool",
    environment: "local",
    revision: 240,
    timestamp: "2026-09-30T00:00:00.000Z",
    size: 100,
};

const npcSpawns: NpcSpawn[] = [
    { id: 1, name: "Man", x: 3200, y: 3200, level: 0 },
];

const objSpawns: ObjSpawn[] = [
    { id: 995, count: 100, x: 3201, y: 3201, plane: 0 },
];

describe("BundledWorldSource", () => {
    it("loads bundled NPC and object spawns through one world-data boundary", async () => {
        const resolveNpcSpawnsUrl = vi.fn(() => "/fixtures/npcs.json");
        const loadNpcSpawns = vi.fn(async () => npcSpawns);
        const loadObjSpawns = vi.fn(async () => objSpawns);
        const source = new BundledWorldSource({
            resolveNpcSpawnsUrl,
            loadNpcSpawns,
            loadObjSpawns,
        });

        await expect(
            source.loadWorld({ cacheInfo }),
        ).resolves.toEqual({
            npcSpawns,
            objSpawns,
        });

        expect(resolveNpcSpawnsUrl).toHaveBeenCalledWith(cacheInfo);
        expect(loadNpcSpawns).toHaveBeenCalledWith(
            "/fixtures/npcs.json",
            undefined,
        );
        expect(loadObjSpawns).toHaveBeenCalledWith(undefined);
    });

    it("forwards the same abort signal to both bundled loaders", async () => {
        const controller = new AbortController();
        const loadNpcSpawns = vi.fn(async () => npcSpawns);
        const loadObjSpawns = vi.fn(async () => objSpawns);
        const source = new BundledWorldSource({
            resolveNpcSpawnsUrl: () => "/fixtures/npcs.json",
            loadNpcSpawns,
            loadObjSpawns,
        });

        await source.loadWorld(
            { cacheInfo },
            { signal: controller.signal },
        );

        expect(loadNpcSpawns).toHaveBeenCalledWith(
            "/fixtures/npcs.json",
            controller.signal,
        );
        expect(loadObjSpawns).toHaveBeenCalledWith(controller.signal);
    });

    it("does not begin world loading when already aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        const loadNpcSpawns = vi.fn(async () => npcSpawns);
        const loadObjSpawns = vi.fn(async () => objSpawns);
        const source = new BundledWorldSource({
            resolveNpcSpawnsUrl: () => "/fixtures/npcs.json",
            loadNpcSpawns,
            loadObjSpawns,
        });

        await expect(
            source.loadWorld(
                { cacheInfo },
                { signal: controller.signal },
            ),
        ).rejects.toMatchObject({ name: "AbortError" });

        expect(loadNpcSpawns).not.toHaveBeenCalled();
        expect(loadObjSpawns).not.toHaveBeenCalled();
    });

    it("rejects a result if the operation is aborted while loaders are running", async () => {
        const controller = new AbortController();
        const source = new BundledWorldSource({
            resolveNpcSpawnsUrl: () => "/fixtures/npcs.json",
            loadNpcSpawns: async () => {
                controller.abort();
                return npcSpawns;
            },
            loadObjSpawns: async () => objSpawns,
        });

        await expect(
            source.loadWorld(
                { cacheInfo },
                { signal: controller.signal },
            ),
        ).rejects.toMatchObject({ name: "AbortError" });
    });
});
