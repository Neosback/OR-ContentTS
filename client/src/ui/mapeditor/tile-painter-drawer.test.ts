import { describe, expect, it } from "vitest";

import { isStripPosition, positionFromRects } from "./tile-painter-drawer";

const scene = { left: 100, top: 100, width: 800, height: 500 };

describe("tile painter position", () => {
    it("reads the side of the viewport from where the panels sit", () => {
        expect(positionFromRects({ left: 100, top: 600, width: 800, height: 280 }, scene)).toBe("bottom");
        expect(positionFromRects({ left: 100, top: 0, width: 800, height: 100 }, scene)).toBe("top");
        expect(positionFromRects({ left: 900, top: 100, width: 440, height: 600 }, scene)).toBe("right");
        expect(positionFromRects({ left: 0, top: 100, width: 100, height: 600 }, scene)).toBe("left");
    });

    it("only top and bottom are strips that fold", () => {
        expect(isStripPosition("bottom")).toBe(true);
        expect(isStripPosition("top")).toBe(true);
        expect(isStripPosition("left")).toBe(false);
        expect(isStripPosition("right")).toBe(false);
    });
});
