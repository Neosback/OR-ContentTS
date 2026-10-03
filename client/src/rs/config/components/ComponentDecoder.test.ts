import { describe, expect, it } from "vitest";

import { resolveComponentLayer } from "./ComponentDecoder";

describe("resolveComponentLayer", () => {
    it("packs the parent file id with the group id", () => {
        expect(resolveComponentLayer(12, 3)).toBe((12 << 16) | 3);
        expect(resolveComponentLayer(12, 0)).toBe(12 << 16);
    });

    it("keeps roots at -1 (no parent) instead of pointing them at component 0", () => {
        expect(resolveComponentLayer(12, null)).toBe(-1);
        expect(resolveComponentLayer(0, undefined)).toBe(-1);
    });
});
