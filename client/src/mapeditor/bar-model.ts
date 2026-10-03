import { moveBarItem, resolveBar, toBarConfig, type BarResolved } from "./bar-config";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";

/**
 * A customizable bar (the viewport bar, the tool rail): a catalog of items, which of them are shown, and in what order.
 * The choice is saved in the browser and shared by everything that draws the bar.
 */
export type BarItemInfo = { id: string; label: string; description: string };

export type BarKind = {
    storageKey: string;
    title: string;
    /** Every item the bar can show right now (read each time: plugins and controls can add more). */
    catalog: () => readonly BarItemInfo[];
    defaultVisible: (catalog: readonly BarItemInfo[]) => readonly string[];
};

export type BarModel = {
    /** All items in bar order, with whether each is shown. */
    items: readonly (BarItemInfo & { visible: boolean })[];
    visibleIds: readonly string[];
    setVisible: (id: string, visible: boolean) => void;
    move: (id: string, delta: -1 | 1) => void;
    reset: () => void;
};

const savedByStorageKey = new Map<string, unknown>();

function readSaved(key: string): unknown {
    if (savedByStorageKey.has(key)) return savedByStorageKey.get(key);
    let value: unknown;
    try {
        value = typeof localStorage === "undefined" ? undefined : JSON.parse(localStorage.getItem(key) ?? "null") ?? undefined;
    } catch {
        value = undefined;
    }
    savedByStorageKey.set(key, value);
    return value;
}

function resolve(kind: BarKind): BarResolved {
    const catalog = kind.catalog();
    return resolveBar(readSaved(kind.storageKey), catalog.map((item) => item.id), kind.defaultVisible(catalog));
}

export function getBarModel(host: IEditorPluginHost, kind: BarKind): BarModel {
    const bar = resolve(kind);
    const catalog = kind.catalog();
    const info = new Map(catalog.map((item) => [item.id, item]));

    const commit = (next: BarResolved | undefined): void => {
        const value = next ? toBarConfig(next) : undefined;
        savedByStorageKey.set(kind.storageKey, value);
        try {
            if (value) localStorage.setItem(kind.storageKey, JSON.stringify(value));
            else localStorage.removeItem(kind.storageKey);
        } catch {
            /* not remembered */
        }
        host.notifyWorkbenchStateChanged();
    };

    return {
        items: bar.order.map((id) => ({ ...(info.get(id) as BarItemInfo), visible: !bar.hidden.has(id) })),
        visibleIds: bar.order.filter((id) => !bar.hidden.has(id)),
        setVisible(id, visible) {
            const hidden = new Set(bar.hidden);
            if (visible) hidden.delete(id);
            else hidden.add(id);
            commit({ order: [...bar.order], hidden });
        },
        move(id, delta) {
            commit({ order: moveBarItem(bar.order, id, delta), hidden: new Set(bar.hidden) });
        },
        reset: () => commit(undefined),
    };
}

/** Compact string of a bar's current choice, for the workbench snapshot (so panels redraw when it changes). */
export function barSnapshot(kind: BarKind): string {
    const bar = resolve(kind);
    return bar.order.map((id) => (bar.hidden.has(id) ? `~${id}` : id)).join(",");
}

/** Test hook: forget what was read from storage. */
export function resetBarModelCache(): void {
    savedByStorageKey.clear();
}
