import { DEFAULT_QUICK_CONTROLS, getViewControl } from "./view-controls";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";

/** Which rendering controls are pinned to Quick controls, in order. Saved in the browser. */
const STORAGE_KEY = "map-editor-quick-controls-v1";

export type QuickControlsModel = {
    /** Pinned control ids in display order (only ids that still exist). */
    pinned: readonly string[];
    isPinned: (id: string) => boolean;
    pin: (id: string) => void;
    unpin: (id: string) => void;
    toggle: (id: string) => void;
    reset: () => void;
    /** Replaces the pins (unknown ids are dropped); used when a saved layout is applied. */
    setPinned: (ids: readonly string[]) => void;
};

const stateByHost = new WeakMap<IEditorPluginHost, { pinned: string[] }>();

/** Keeps known ids, drops duplicates; an unreadable or missing value falls back to the default pins. */
export function parseQuickControls(value: unknown): string[] {
    if (!Array.isArray(value)) return [...DEFAULT_QUICK_CONTROLS];
    const seen = new Set<string>();
    for (const entry of value) {
        if (typeof entry === "string" && getViewControl(entry)) seen.add(entry);
    }
    return [...seen];
}

function load(): string[] {
    if (typeof localStorage === "undefined") return [...DEFAULT_QUICK_CONTROLS];
    try {
        return parseQuickControls(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
    } catch {
        return [...DEFAULT_QUICK_CONTROLS];
    }
}

function stateFor(host: IEditorPluginHost): { pinned: string[] } {
    let state = stateByHost.get(host);
    if (!state) {
        state = { pinned: load() };
        stateByHost.set(host, state);
    }
    return state;
}

export function getQuickControlsModel(host: IEditorPluginHost): QuickControlsModel {
    const state = stateFor(host);
    const change = (): void => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.pinned));
        } catch {
            /* ignore */
        }
        host.notifyWorkbenchStateChanged();
    };
    return {
        pinned: [...state.pinned],
        isPinned: (id) => state.pinned.includes(id),
        pin(id) {
            if (!getViewControl(id) || state.pinned.includes(id)) return;
            state.pinned.push(id);
            change();
        },
        unpin(id) {
            const index = state.pinned.indexOf(id);
            if (index < 0) return;
            state.pinned.splice(index, 1);
            change();
        },
        toggle(id) {
            if (state.pinned.includes(id)) this.unpin(id);
            else this.pin(id);
        },
        setPinned(ids) {
            state.pinned = parseQuickControls([...ids]);
            change();
        },
        reset() {
            state.pinned = [...DEFAULT_QUICK_CONTROLS];
            change();
        },
    };
}

export function getQuickControlsWorkbenchSnapshot(host: IEditorPluginHost): string {
    return stateFor(host).pinned.join(",");
}
