import { describe, expect, it } from "vitest";

import { moveBarItem, resolveBar, visibleBarItems } from "./bar-config";

const available = ["plane", "quick", "undo", "view:roofs"];

describe("resolveBar", () => {
    it("shows the defaults first and hides the rest when nothing is saved", () => {
        const bar = resolveBar(undefined, available, ["plane", "quick"]);
        expect(visibleBarItems(bar)).toEqual(["plane", "quick"]);
        expect(bar.order).toEqual(["plane", "quick", "undo", "view:roofs"]);
    });

    it("keeps the saved order and hidden items, drops unknown ids and appends new items hidden", () => {
        const bar = resolveBar({ order: ["quick", "gone", "plane", "undo"], hidden: ["undo", "gone"] }, available, ["plane", "quick"]);
        expect(bar.order).toEqual(["quick", "plane", "undo", "view:roofs"]);
        expect(visibleBarItems(bar)).toEqual(["quick", "plane"]);
        expect(resolveBar({ order: ["plane"], hidden: [] }, available, ["plane", "quick"]).hidden.has("quick")).toBe(false);
        expect(resolveBar({ order: ["plane"], hidden: [] }, available, ["plane", "quick"]).hidden.has("undo")).toBe(true);
    });

    it("ignores garbage", () => {
        expect(visibleBarItems(resolveBar("nope", available, ["plane"]))).toEqual(["plane"]);
        expect(visibleBarItems(resolveBar({ order: [4], hidden: "x" }, available, ["quick"]))).toEqual(["quick"]);
    });
});

describe("moveBarItem", () => {
    it("swaps with the neighbour and stays put at the ends", () => {
        expect(moveBarItem(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
        expect(moveBarItem(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
        expect(moveBarItem(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
        expect(moveBarItem(["a", "b", "c"], "zzz", 1)).toEqual(["a", "b", "c"]);
    });
});
