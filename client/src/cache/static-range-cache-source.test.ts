import { describe, expect, it, vi } from "vitest";

import { CacheFiles } from "../rs/cache/CacheFiles";
import type { CacheInfo } from "../rs/cache/CacheInfo";
import {
    fetchXteasOptional,
    StaticRangeCacheSource,
} from "./static-range-cache-source";

const modernCache: CacheInfo = {
    name: "openrune-240",
    game: "oldschool",
    environment: "local",
    revision: 240,
    timestamp: "2026-09-30T00:00:00.000Z",
    size: 123,
};

const xteaCache: CacheInfo = {
    ...modernCache,
    name: "openrune-236",
    revision: 236,
};

describe("StaticRangeCacheSource", () => {
    it("lists caches from the configured static source", async () => {
        const fetchImpl = vi.fn(async () =>
            new Response(JSON.stringify([modernCache]), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
        const source = new StaticRangeCacheSource({
            basePath: "/fixtures/caches",
            fetchImpl,
        });

        await expect(source.listCaches()).resolves.toEqual([modernCache]);
        expect(fetchImpl).toHaveBeenCalledWith("/fixtures/caches/caches.json");
    });

    it("rejects an invalid cache-list response instead of leaking it to callers", async () => {
        const source = new StaticRangeCacheSource({
            fetchImpl: async () =>
                new Response(JSON.stringify({ caches: [modernCache] }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        });

        await expect(source.listCaches()).rejects.toThrow("invalid cache list");
    });

    it("loads cache bytes through the source while preserving load options", async () => {
        const files = new CacheFiles(new Map());
        const loadFiles = vi.fn(async () => files);
        const progressListener = vi.fn();
        const controller = new AbortController();
        const source = new StaticRangeCacheSource({
            loadFiles,
            fetchImpl: async () => new Response("{}", { status: 200 }),
        });

        const loaded = await source.loadCache(modernCache, {
            signal: controller.signal,
            progressListener,
            browserCache: false,
        });

        expect(loaded).toEqual({
            info: modernCache,
            type: "dat2",
            files,
            xteas: new Map(),
        });
        expect(loadFiles).toHaveBeenCalledWith(
            "dat2",
            "/caches/openrune-240/",
            "openrune-240",
            true,
            controller.signal,
            progressListener,
            false,
        );
    });

    it("loads legacy OSRS map keys from keys.json before xteas.json", async () => {
        const files = new CacheFiles(new Map());
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("keys.json")) {
                return new Response(JSON.stringify({ "12850": [1, 2, 3, 4] }), {
                    status: 200,
                });
            }
            return new Response("not found", { status: 404 });
        });
        const source = new StaticRangeCacheSource({
            fetchImpl,
            loadFiles: async () => files,
        });

        const loaded = await source.loadCache(xteaCache);

        expect(loaded.xteas.get(12850)).toEqual([1, 2, 3, 4]);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledWith(
            "/caches/openrune-236/keys.json",
            { signal: undefined },
        );
    });

    it("falls back to xteas.json when keys.json is unavailable", async () => {
        const files = new CacheFiles(new Map());
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("keys.json")) {
                return new Response("not found", { status: 404 });
            }
            return new Response(
                JSON.stringify([{ mapsquare: 12850, key: [4, 3, 2, 1] }]),
                { status: 200 },
            );
        });
        const source = new StaticRangeCacheSource({
            fetchImpl,
            loadFiles: async () => files,
        });

        const loaded = await source.loadCache(xteaCache);

        expect(loaded.xteas.get(12850)).toEqual([4, 3, 2, 1]);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("does not swallow an aborted optional XTEA request", async () => {
        const abort = new DOMException("Aborted", "AbortError");

        await expect(
            fetchXteasOptional(
                "/caches/openrune-236/keys.json",
                undefined,
                async () => {
                    throw abort;
                },
            ),
        ).rejects.toBe(abort);
    });
});
