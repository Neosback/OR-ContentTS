import { describe, expect, it } from "vitest";

import type { LocType } from "../rs/config/loctype/LocType";
import { describeLocType, locModelTypeName, propertiesToText } from "./object-properties";

const loc = (overrides: Partial<LocType> = {}): LocType =>
    ({
        id: 1276, name: "Oak tree", sizeX: 2, sizeY: 3, clipType: 1, blocksProjectile: true, isInteractive: -1, obstructsGround: false,
        isHollow: false, isRotated: false, clipped: true, lowDetail: false, supportItems: -1, mapFunctionId: -1, mapSceneId: 5, flipMapSceneSprite: false,
        models: [[100, 101]], types: [10], modelSizeX: 128, modelSizeHeight: 128, modelSizeY: 128, offsetX: 0, offsetHeight: 0, offsetY: 0,
        ambient: 0, contrast: 0, mergeNormals: false, modelClipped: false, contouredGround: -1, contourGroundType: 0, contourGroundParam: -1,
        decorDisplacement: 16, recolorFrom: [10], recolorTo: [20], retextureFrom: [], retextureTo: [], seqId: -1, seqRandomStart: true,
        actions: ["Chop down", "", "Examine"], transformVarbit: -1, transformVarp: -1, ambientSoundId: -1, ambientSoundIds: [], params: new Map([[5, "x"]]),
        ...overrides,
    }) as unknown as LocType;

describe("describeLocType", () => {
    it("groups the properties and formats them", () => {
        const sections = describeLocType(loc());
        const byTitle = Object.fromEntries(sections.map((section) => [section.title, section.rows]));
        expect(byTitle["General"].find((row) => row.label === "Size")?.value).toBe("2 × 3 tiles");
        expect(byTitle["General"].find((row) => row.label === "Clipping")?.value).toBe("solid");
        expect(byTitle["Models"][0]).toEqual({ label: "normal (10)", value: "100, 101" });
        expect(byTitle["Colours and textures"][0].value).toBe("10 → 20");
        expect(byTitle["Actions"][0].value).toBe("1: Chop down · 3: Examine");
        expect(byTitle["Params"]).toEqual([{ label: "5", value: "x" }]);
        expect(byTitle["Sound"]).toBeUndefined();
        expect(byTitle["Transforms"]).toBeUndefined();
    });

    it("lists fields it does not know about, and the copy text has every section", () => {
        const sections = describeLocType(loc({ ...({ somethingNew: 7 } as object) }));
        expect(sections.at(-1)).toEqual({ title: "Other fields", rows: [{ label: "somethingNew", value: "7" }] });
        const text = propertiesToText(sections);
        expect(text).toContain("General\n  Id: 1276");
        expect(text).toContain("Other fields\n  somethingNew: 7");
    });

    it("names model types", () => {
        expect(locModelTypeName(0)).toBe("wall (0)");
        expect(locModelTypeName(99)).toBe("type 99");
    });
});
