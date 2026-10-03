import { describe, expect, it } from "vitest";

import type { IEditorPluginHost } from "../editor-plugin-host";
import { TILE_BRUSH_COMPONENTS, TILE_HEIGHT_MAX, TILE_HEIGHT_MIN, clampTileHeight, getTileBrushModel, parseStoredBrush } from "./tile-brush-model";

function host(): IEditorPluginHost & { notified: number } {
    const fake = { notified: 0, notifyWorkbenchStateChanged() { fake.notified++; } };
    return fake as unknown as IEditorPluginHost & { notified: number };
}

describe("tile brush parts", () => {
    it("has a Shape and a Rotation part between Overlay and Height", () => {
        expect(TILE_BRUSH_COMPONENTS).toEqual(["underlay", "overlay", "shape", "rotation", "height", "flags"]);
    });

    it("reads a v1 save (no shape/rotation) and keeps its ticks", () => {
        const state = parseStoredBrush({ enabled: { underlay: false, overlay: true, height: true, flags: false }, tab: "height" });
        expect(state.enabled).toEqual({ underlay: false, overlay: true, shape: false, rotation: false, height: true, flags: false });
        expect(state.tab).toBe("height");
        expect(state.shape).toBe(0);
        expect(state.rotation).toBe(0);
    });

    it("clamps stored shape and rotation and ignores junk", () => {
        const state = parseStoredBrush({ enabled: { shape: "yes" }, tab: "nope", shape: 99, rotation: -1 });
        expect(state.shape).toBe(11);
        expect(state.rotation).toBe(3);
        expect(state.tab).toBe("underlay");
        expect(state.enabled.shape).toBe(false);
        expect(parseStoredBrush(null).enabled.underlay).toBe(true);
    });

    it("picking a shape or rotation switches that part on and notifies", () => {
        const h = host();
        const model = getTileBrushModel(h);
        expect(model.isEnabled("shape")).toBe(false);
        model.setShape(5);
        expect(getTileBrushModel(h)).toMatchObject({ shape: 5 });
        expect(getTileBrushModel(h).isEnabled("shape")).toBe(true);
        model.setRotation(7);
        expect(getTileBrushModel(h).rotation).toBe(3);
        expect(getTileBrushModel(h).isEnabled("rotation")).toBe(true);
        expect(h.notified).toBe(2);
    });

    it("height is a plain value to stamp: clamped, saved, and picking it switches the part on", () => {
        expect(clampTileHeight(500)).toBe(TILE_HEIGHT_MAX);
        expect(clampTileHeight(-99999)).toBe(TILE_HEIGHT_MIN);
        expect(parseStoredBrush({ heightValue: -400 }).heightValue).toBe(-400);
        expect(parseStoredBrush({ heightValue: "high" }).heightValue).toBe(0);
        const h = host();
        getTileBrushModel(h).setHeight(-512);
        expect(getTileBrushModel(h)).toMatchObject({ heightValue: -512 });
        expect(getTileBrushModel(h).isEnabled("height")).toBe(true);
    });
});
