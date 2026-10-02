import { describe, expect, it } from "vitest";

import { PerfGovernor } from "./perf-governor";

const active = (frameMs: number) => ({ frameMs, idle: false });

describe("PerfGovernor", () => {
    it("ignores healthy and idle windows", () => {
        const governor = new PerfGovernor();
        expect(governor.sample(active(16), "balanced")).toEqual({ type: "ok" });
        for (let i = 0; i < 10; i++) expect(governor.sample({ frameMs: 800, idle: true }, "safe")).toEqual({ type: "ok" });
    });

    it("drops one level after sustained slow frames, not on a single spike", () => {
        const governor = new PerfGovernor();
        // balanced budget is ~16.7 ms; 2.5x = ~42 ms.
        expect(governor.sample(active(120), "balanced")).toEqual({ type: "ok" });
        expect(governor.sample(active(16), "balanced")).toEqual({ type: "ok" });
        for (let i = 0; i < 3; i++) expect(governor.sample(active(120), "balanced")).toEqual({ type: "ok" });
        const action = governor.sample(active(120), "balanced");
        expect(action).toMatchObject({ type: "downgrade", to: "safe" });
    });

    it("pauses after repeated dangerous frames", () => {
        const governor = new PerfGovernor();
        expect(governor.sample(active(700), "safe").type).toBe("ok");
        expect(governor.sample(active(700), "safe").type).toBe("ok");
        expect(governor.sample(active(700), "safe")).toMatchObject({ type: "pause" });
    });

    it("lowers on high heap use, and pauses when already at the lowest level", () => {
        const governor = new PerfGovernor();
        const heap = { frameMs: 16, idle: false, heapBytes: 900, heapLimitBytes: 1000 };
        expect(governor.sample(heap, "high")).toMatchObject({ type: "downgrade", to: "balanced" });
        expect(governor.sample(heap, "safe")).toMatchObject({ type: "pause" });
    });

    it("pauses when estimated GPU memory exceeds the budget", () => {
        const governor = new PerfGovernor();
        const sample = { frameMs: 16, idle: false, gpuBytes: 900 * 1048576, gpuBudgetBytes: 768 * 1048576 };
        expect(governor.sample(sample, "balanced")).toMatchObject({ type: "pause" });
        expect(governor.sample({ ...sample, gpuBytes: 100 * 1048576 }, "balanced")).toEqual({ type: "ok" });
    });
});
