import type { TilePainterDrawerState } from "./tile-painter-drawer";

/**
 * Named workspace layouts: the dock arrangement plus the few things the dock does not serialize (the Tile painter's
 * side and folded state, which controls are pinned to Quick controls). Kept as plain
 * data in localStorage so a layout can also be exported to a file and shared.
 */
export const LAYOUTS_STORAGE_KEY = "map-editor-layouts-v1";
export const LAYOUT_FILE_KIND = "openrune-map-editor-layout";
export const LAYOUT_FILE_VERSION = 1;

export type SavedLayout = {
    id: string;
    name: string;
    savedAt: number;
    /** `DockviewApi.toJSON()` output. */
    dock: unknown;
    painter?: TilePainterDrawerState;
    quickControls?: string[];
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const defaultStorage = (): StorageLike | undefined => {
    try {
        return typeof localStorage === "undefined" ? undefined : localStorage;
    } catch {
        return undefined;
    }
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === "string");

/** Validates one layout read from storage or a file; returns undefined for anything that is not usable. */
export function normalizeLayout(value: unknown): SavedLayout | undefined {
    if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim() || !isRecord(value.dock)) return undefined;
    const painter = isRecord(value.painter) ? (value.painter as Partial<TilePainterDrawerState>) : undefined;
    return {
        id: typeof value.id === "string" && value.id ? value.id : newLayoutId(),
        name: value.name.trim().slice(0, 60),
        savedAt: typeof value.savedAt === "number" ? value.savedAt : Date.now(),
        dock: value.dock,
        painter:
            painter && typeof painter.position === "string"
                ? { position: painter.position, collapsed: painter.collapsed === true, height: typeof painter.height === "number" ? painter.height : 276 }
                : undefined,
        quickControls: isStringArray(value.quickControls) ? value.quickControls : undefined,
    };
}

export function newLayoutId(): string {
    return `layout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listLayouts(storage: StorageLike | undefined = defaultStorage()): SavedLayout[] {
    if (!storage) return [];
    try {
        const parsed: unknown = JSON.parse(storage.getItem(LAYOUTS_STORAGE_KEY) ?? "[]");
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeLayout).filter((layout): layout is SavedLayout => layout !== undefined);
    } catch {
        return [];
    }
}

function write(layouts: readonly SavedLayout[], storage: StorageLike | undefined): boolean {
    if (!storage) return false;
    try {
        storage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
        return true;
    } catch {
        return false;
    }
}

/** "Name", then "Name 2", "Name 3"... so two layouts never share a name. */
export function uniqueLayoutName(existing: readonly SavedLayout[], wanted: string, ignoreId?: string): string {
    const base = wanted.trim().slice(0, 60) || "Layout";
    const taken = new Set(existing.filter((layout) => layout.id !== ignoreId).map((layout) => layout.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) {
        const candidate = `${base} ${n}`;
        if (!taken.has(candidate.toLowerCase())) return candidate;
    }
}

/** Adds a layout (or replaces the one with the same id); returns the list as stored. */
export function saveLayout(layout: SavedLayout, storage: StorageLike | undefined = defaultStorage()): SavedLayout[] {
    const all = listLayouts(storage);
    const index = all.findIndex((entry) => entry.id === layout.id);
    const next: SavedLayout = { ...layout, name: uniqueLayoutName(all, layout.name, layout.id) };
    if (index >= 0) all[index] = next;
    else all.push(next);
    write(all, storage);
    return all;
}

export function deleteLayout(id: string, storage: StorageLike | undefined = defaultStorage()): SavedLayout[] {
    const all = listLayouts(storage).filter((layout) => layout.id !== id);
    write(all, storage);
    return all;
}

export function renameLayout(id: string, name: string, storage: StorageLike | undefined = defaultStorage()): SavedLayout[] {
    const all = listLayouts(storage);
    const layout = all.find((entry) => entry.id === id);
    if (layout && name.trim()) layout.name = uniqueLayoutName(all, name, id);
    write(all, storage);
    return all;
}

export function serializeLayoutFile(layout: SavedLayout): string {
    return JSON.stringify({ kind: LAYOUT_FILE_KIND, version: LAYOUT_FILE_VERSION, layout }, null, 2);
}

/** Reads an exported layout file; `error` explains why it was refused. */
export function parseLayoutFile(text: string): { layout: SavedLayout } | { error: string } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { error: "That file is not valid JSON." };
    }
    if (!isRecord(parsed) || parsed.kind !== LAYOUT_FILE_KIND) return { error: "That is not a map editor layout file." };
    if (typeof parsed.version === "number" && parsed.version > LAYOUT_FILE_VERSION) return { error: "That layout was saved by a newer version." };
    const layout = normalizeLayout(parsed.layout);
    if (!layout) return { error: "The layout in that file is incomplete." };
    // A new id so importing never overwrites a layout that happens to share the old one.
    return { layout: { ...layout, id: newLayoutId() } };
}
