import { describe, expect, it } from "vitest";

import { parseGoTo } from "./go-to-parser";

describe("parseGoTo", () => {
    it("reads a map square id", () => {
        expect(parseGoTo("12342")).toMatchObject({ worldX: 48 * 64 + 32, worldY: 54 * 64 + 32, label: "Region 12342 (48, 54)" });
        expect(parseGoTo("region 12853")).toMatchObject({ label: "Region 12853 (50, 53)" });
    });

    it("reads map square coordinates and world tiles", () => {
        expect(parseGoTo("48,54")).toMatchObject({ label: "Region 12342 (48, 54)" });
        expect(parseGoTo("3100, 3512")).toEqual({ worldX: 3100, worldY: 3512, label: "Tile 3100, 3512" });
        expect(parseGoTo("x: 3200 y: 3200")).toMatchObject({ worldX: 3200, worldY: 3200 });
        expect(parseGoTo("3100,3512,1")).toEqual({ worldX: 3100, worldY: 3512, plane: 1, label: "Tile 3100, 3512, plane 1" });
        expect(parseGoTo("tile 50, 60")).toMatchObject({ worldX: 50, worldY: 60 });
    });

    it("leaves searches and nonsense alone", () => {
        for (const text of ["", "oak tree", "bank booth 2", "7", "99999", "1,2,3,4", "3100,3512,9", "20000, 20000"]) {
            expect(parseGoTo(text), text).toBeUndefined();
        }
    });
});
