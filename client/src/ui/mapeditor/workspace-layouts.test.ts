import { describe, expect, it } from "vitest";

import { collectSettings, applySettings, parseSettingsFile, serializeSettings } from "./workspace-settings";
import { deleteLayout, listLayouts, parseLayoutFile, renameLayout, saveLayout, serializeLayoutFile, uniqueLayoutName, type SavedLayout } from "./workspace-layouts";

class MemoryStorage {
    private data = new Map<string, string>();
    get length(): number {
        return this.data.size;
    }
    key(index: number): string | null {
        return [...this.data.keys()][index] ?? null;
    }
    getItem(key: string): string | null {
        return this.data.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
        this.data.set(key, value);
    }
    removeItem(key: string): void {
        this.data.delete(key);
    }
}

const layout = (name: string, id = `id-${name}`): SavedLayout => ({ id, name, savedAt: 1, dock: { grid: {}, panels: {} }, painter: { position: "left", collapsed: false, height: 300 } });

describe("saved layouts", () => {
    it("saves, lists, renames and deletes, keeping names unique", () => {
        const storage = new MemoryStorage();
        saveLayout(layout("Painting"), storage);
        saveLayout(layout("Painting", "other"), storage);
        expect(listLayouts(storage).map((entry) => entry.name)).toEqual(["Painting", "Painting 2"]);
        renameLayout("other", "Sculpting", storage);
        expect(listLayouts(storage).map((entry) => entry.name)).toEqual(["Painting", "Sculpting"]);
        saveLayout({ ...layout("Painting"), savedAt: 9 }, storage);
        expect(listLayouts(storage)).toHaveLength(2);
        expect(listLayouts(storage)[0].savedAt).toBe(9);
        deleteLayout("id-Painting", storage);
        expect(listLayouts(storage).map((entry) => entry.id)).toEqual(["other"]);
    });

    it("ignores damaged storage and entries", () => {
        const storage = new MemoryStorage();
        storage.setItem("map-editor-layouts-v1", "not json");
        expect(listLayouts(storage)).toEqual([]);
        storage.setItem("map-editor-layouts-v1", JSON.stringify([{ name: "", dock: {} }, { name: "ok", dock: {} }, 4]));
        expect(listLayouts(storage).map((entry) => entry.name)).toEqual(["ok"]);
    });

    it("round-trips through a file with a fresh id, and refuses other files", () => {
        const text = serializeLayoutFile(layout("Wide"));
        const parsed = parseLayoutFile(text);
        expect("layout" in parsed && parsed.layout.name).toBe("Wide");
        expect("layout" in parsed && parsed.layout.id).not.toBe("id-Wide");
        expect("layout" in parsed && parsed.layout.painter?.position).toBe("left");
        expect(parseLayoutFile("{}")).toHaveProperty("error");
        expect(parseLayoutFile("nope")).toHaveProperty("error");
    });

    it("makes unique names without touching the layout being renamed", () => {
        const all = [layout("A"), layout("A 2")];
        expect(uniqueLayoutName(all, "A")).toBe("A 3");
        expect(uniqueLayoutName(all, "A", "id-A")).toBe("A");
        expect(uniqueLayoutName(all, "  ")).toBe("Layout");
    });
});

describe("settings bundle", () => {
    it("collects only map editor keys, and applying replaces them", () => {
        const storage = new MemoryStorage();
        storage.setItem("map-editor-keybinds-v1", "{}");
        storage.setItem("map-editor-dock-panel-restore-v1", "{}");
        storage.setItem("openrune-local-cache-profiles-v1", "secret");
        expect(collectSettings(storage)).toEqual({ "map-editor-keybinds-v1": "{}" });

        const parsed = parseSettingsFile(serializeSettings({ "map-editor-a": "1", "other-b": "2", "map-editor-dock-panel-restore-v1": "x" }));
        expect(parsed).toEqual({ settings: { "map-editor-a": "1" } });
        expect(applySettings({ "map-editor-a": "1" }, storage)).toBe(1);
        expect(storage.getItem("map-editor-keybinds-v1")).toBeNull();
        expect(storage.getItem("map-editor-a")).toBe("1");
        expect(storage.getItem("openrune-local-cache-profiles-v1")).toBe("secret");
        expect(parseSettingsFile("{\"kind\":\"x\"}")).toHaveProperty("error");
    });
});
