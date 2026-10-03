import { describe, expect, it, vi } from "vitest";

import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import { buildPaletteItems, groupPaletteItems, type PaletteDeps } from "./palette-sources";

const makeDeps = (): { deps: PaletteDeps; host: { goToWorldTile: ReturnType<typeof vi.fn>; setEditorTool: ReturnType<typeof vi.fn> } } => {
    const host = {
        renderer: {},
        goToWorldTile: vi.fn(),
        setEditorTool: vi.fn(),
        cancelObjectCopyPlacement: vi.fn(),
        notifyWorkbenchStateChanged: vi.fn(),
        getEditorTool: () => "object-selector",
        isObjectSelectorToolActive: () => false,
        isObjectPlaceToolActive: () => false,
        selectedObject: undefined,
        hideBelowViewPlane: false,
        showRoofs: true,
        bridgeLinkBelow: true,
        objectsVisible: true,
        terrainSmoothingEnabled: false,
    };
    const deps: PaletteDeps = {
        commandContext: { host: host as unknown as IEditorPluginHost },
        panels: [{ id: "editor-minimap", title: "Minimap", open: false }],
        openPanel: vi.fn(),
        layouts: [{ id: "l1", name: "Sculpting" }],
        applyLayout: vi.fn(),
        presets: [{ id: "default", name: "Default" }],
        applyPreset: vi.fn(),
        openSettings: vi.fn(),
        searchObjects: (query) => (query.startsWith("oak") ? [{ id: 4533, name: "Oak tree" }] : []),
    };
    return { deps, host };
};

describe("palette items", () => {
    it("lists panels, layouts and rendering toggles with no query, grouped in order", () => {
        const { deps } = makeDeps();
        const groups = groupPaletteItems(buildPaletteItems(deps, ""));
        const names = groups.map((entry) => entry.group);
        expect(names).toContain("Commands");
        expect(names.indexOf("Panels")).toBeGreaterThan(names.indexOf("Commands"));
        expect(groups.find((entry) => entry.group === "Layouts")?.items.map((item) => item.title)).toEqual(["Layout: Default", "Layout: Sculpting", "Manage layouts and settings…"]);
        expect(groups.find((entry) => entry.group === "Rendering")?.items.some((item) => item.title === "Toggle Roofs")).toBe(true);
    });

    it("turns a location into a Go to row that moves the camera", () => {
        const { deps, host } = makeDeps();
        const items = buildPaletteItems(deps, "3100,3512,1");
        expect(items[0]).toMatchObject({ group: "Go to", title: "Go to Tile 3100, 3512, plane 1" });
        items[0].run();
        expect(host.goToWorldTile).toHaveBeenCalledWith(3100, 3512, 1);
        expect(buildPaletteItems(deps, "12342")[0].title).toBe("Go to Region 12342 (48, 54)");
    });

    it("offers matching objects first and starts placement", () => {
        const { deps, host } = makeDeps();
        const items = buildPaletteItems(deps, "oak");
        expect(items[0]).toMatchObject({ group: "Objects", title: "Place Oak tree" });
        items[0].run();
        expect(host.setEditorTool).toHaveBeenCalledWith("object-place");
    });

    it("shows commands and toggles before object matches in the grouped list", () => {
        const { deps } = makeDeps();
        const groups = groupPaletteItems(buildPaletteItems({ ...deps, searchObjects: () => [{ id: 7, name: "Grid post" }] }, "grid"));
        const names = groups.map((entry) => entry.group);
        expect(names.at(-1)).toBe("Objects");
        expect(names.indexOf("Rendering")).toBeLessThan(names.indexOf("Objects"));
        const rendering = groups.find((entry) => entry.group === "Rendering")?.items.map((item) => item.title) ?? [];
        expect(rendering.slice(0, 3).sort()).toEqual(["Toggle Chunk grid", "Toggle Map square grid", "Toggle Tile grid"]);
        // Whole-word matches outrank scattered letters ("Toggle terrain smoothing" also contains g, r, i, d in order).
        const flat = buildPaletteItems({ ...deps, searchObjects: () => [] }, "grid");
        expect(flat[0].title).toMatch(/grid/);
    });

    it("filters the rest by fuzzy match", () => {
        const { deps } = makeDeps();
        const titles = buildPaletteItems(deps, "mini").map((item) => item.title);
        expect(titles[0]).toBe("Open Minimap panel");
        expect(titles).not.toContain("Layout: Default");
    });
});
