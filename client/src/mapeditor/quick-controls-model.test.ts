import { beforeEach, describe, expect, it } from "vitest";

import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { getQuickControlsModel, getQuickControlsWorkbenchSnapshot, parseQuickControls } from "./quick-controls-model";
import { DEFAULT_QUICK_CONTROLS, VIEW_CONTROLS, getViewControl, registerViewControl } from "./view-controls";

const host = (): IEditorPluginHost & { notified: number } => {
    const fake = { notified: 0, notifyWorkbenchStateChanged() { fake.notified++; } };
    return fake as unknown as IEditorPluginHost & { notified: number };
};

describe("view controls", () => {
    it("has the plane, scene and flag controls with unique ids", () => {
        const ids = VIEW_CONTROLS.map((control) => control.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ["hide-below", "roofs", "bridges", "objects", "smoothing", "flag-1", "flag-2", "flag-4", "flag-8", "flag-16"]) {
            expect(getViewControl(id), id).toBeDefined();
        }
        for (const id of DEFAULT_QUICK_CONTROLS) expect(getViewControl(id), id).toBeDefined();
    });

    it("flag controls carry their colour and a meaning", () => {
        const flag = getViewControl("flag-1");
        expect(flag?.swatch).toHaveLength(4);
        expect(flag?.description.length).toBeGreaterThan(5);
    });
});

describe("quick controls pins", () => {
    // Pins are saved in localStorage, which the tests in this file share.
    beforeEach(() => globalThis.localStorage?.clear());

    it("starts with the default pins, and pinning, unpinning and resetting notify", () => {
        const h = host();
        const model = getQuickControlsModel(h);
        expect(model.pinned).toEqual([...DEFAULT_QUICK_CONTROLS]);
        model.unpin("objects");
        expect(getQuickControlsModel(h).pinned).not.toContain("objects");
        getQuickControlsModel(h).pin("flag-1");
        expect(getQuickControlsModel(h).pinned.at(-1)).toBe("flag-1");
        expect(getQuickControlsWorkbenchSnapshot(h)).toContain("flag-1");
        getQuickControlsModel(h).reset();
        expect(getQuickControlsModel(h).pinned).toEqual([...DEFAULT_QUICK_CONTROLS]);
        expect(h.notified).toBe(3);
    });

    it("replaces the pins from a saved layout, dropping unknown ids", () => {
        const h = host();
        getQuickControlsModel(h).setPinned(["objects", "nope", "flag-1"]);
        expect(getQuickControlsModel(h).pinned).toEqual(["objects", "flag-1"]);
    });

    it("ignores unknown ids and duplicates, and does not notify for a no-op", () => {
        const h = host();
        getQuickControlsModel(h).pin("nope");
        getQuickControlsModel(h).pin("roofs");
        getQuickControlsModel(h).unpin("flag-16");
        expect(h.notified).toBe(0);
        expect(parseQuickControls(["roofs", "roofs", "nope", 4, "objects"])).toEqual(["roofs", "objects"]);
        expect(parseQuickControls("garbage")).toEqual([...DEFAULT_QUICK_CONTROLS]);
    });
});

describe("plugin view controls", () => {
    it("registers, can be pinned, and unregisters", () => {
        const dispose = registerViewControl({ id: "test.grid", group: "plugins", label: "Grid", description: "x", get: () => true, set: () => undefined });
        expect(getViewControl("test.grid")).toBeDefined();
        expect(VIEW_CONTROLS.some((control) => control.id === "test.grid")).toBe(true);
        const h = host();
        getQuickControlsModel(h).pin("test.grid");
        expect(getQuickControlsModel(h).pinned).toContain("test.grid");
        expect(() => registerViewControl({ id: "test.grid", group: "plugins", label: "Again", description: "x", get: () => true, set: () => undefined })).toThrow();
        dispose();
        expect(getViewControl("test.grid")).toBeUndefined();
        expect(VIEW_CONTROLS.some((control) => control.id === "test.grid")).toBe(false);
    });
});
