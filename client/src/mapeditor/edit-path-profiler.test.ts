import { describe, expect, it, vi } from "vitest";

import {
    beginEditPathProfile,
    consumeEditPathQueueDelay,
    markEditPathQueue,
} from "./edit-path-profiler";

describe("edit path profiler", () => {
    it("is a no-op when disabled", async () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        const profile = beginEditPathProfile("disabled", {}, false);

        expect(profile.measure("sync", () => 7)).toBe(7);
        await expect(profile.measureAsync("async", async () => 9)).resolves.toBe(9);
        profile.annotate({ changed: true });
        profile.end();

        expect(info).not.toHaveBeenCalled();
        info.mockRestore();
    });

    it("reports phase timings and annotations when enabled", async () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        const profile = beginEditPathProfile("object.edit.sync", { mapId: 123 }, true);

        profile.measure("snapshot.before", () => 1);
        await profile.measureAsync("worker.roundtrip", async () => 2);
        profile.annotate({ changed: true, afterEntries: 3 });
        profile.end();
        profile.end();

        expect(info).toHaveBeenCalledTimes(1);
        const [label, payload] = info.mock.calls[0] as [string, Record<string, unknown>];
        expect(label).toBe("[edit-profile] object.edit.sync");
        expect(payload).toMatchObject({
            mapId: 123,
            changed: true,
            afterEntries: 3,
            phaseCalls: {
                "snapshot.before": 1,
                "worker.roundtrip": 1,
            },
        });
        expect(payload.totalMs).toEqual(expect.any(Number));
        expect(payload.phaseMs).toMatchObject({
            "snapshot.before": expect.any(Number),
            "worker.roundtrip": expect.any(Number),
        });
        info.mockRestore();
    });

    it("measures deferred queue delay separately from work", () => {
        markEditPathQueue("object-chunks", 42, true);
        const delay = consumeEditPathQueueDelay("object-chunks", 42, true);

        expect(delay).toEqual(expect.any(Number));
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(consumeEditPathQueueDelay("object-chunks", 42, true)).toBeUndefined();
    });
});
