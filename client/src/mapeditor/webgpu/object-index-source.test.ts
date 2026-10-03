import { describe, expect, it } from "vitest";

import { shouldUsePriorityIndices } from "./object-index-source";

describe("shouldUsePriorityIndices", () => {
    it("keeps the original stream as the default/reference path", () => {
        expect(shouldUsePriorityIndices("original", 4)).toBe(false);
    });

    it("only uses the sorted stream when explicit priority groups exist", () => {
        expect(shouldUsePriorityIndices("priority", 0)).toBe(false);
        expect(shouldUsePriorityIndices("priority", 1)).toBe(true);
        expect(shouldUsePriorityIndices("priority", 12)).toBe(true);
    });
});
