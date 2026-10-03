import type { EditorObjectKind, EditorObjectRef } from "../../webgl/sceneLocPicker";
import type { IEditorPluginHost } from "../editor-plugin-host";

/**
 * State of the Delete tool. `mode` decides what a click removes: the one object under the cursor, or everything
 * standing under the brush footprint. `kinds` limits which kinds of object count. The preview (what the next click
 * would remove) and the running total are kept here so the palette can show them.
 */
export type ObjectDeleteMode = "single" | "area";

export const OBJECT_DELETE_KINDS: readonly { kind: EditorObjectKind; label: string; hint: string }[] = [
    { kind: "loc", label: "Objects", hint: "Trees, furniture, buildings and other placed models" },
    { kind: "wall", label: "Walls", hint: "Walls and fences" },
    { kind: "wallDecoration", label: "Wall decor", hint: "Things hanging on walls" },
    { kind: "floorDecoration", label: "Floor decor", hint: "Flat details on the ground" },
];

type State = {
    mode: ObjectDeleteMode;
    kinds: Record<EditorObjectKind, boolean>;
    /** Objects the next click would remove (count and a short description of the first). */
    previewCount: number;
    previewLabel: string;
    /** Objects removed with this tool since the editor opened. */
    deleted: number;
};

const STORAGE_KEY = "map-editor-object-delete-v1";
const stateByHost = new WeakMap<IEditorPluginHost, State>();

function defaults(): State {
    return { mode: "single", kinds: { loc: true, wall: true, wallDecoration: true, floorDecoration: true }, previewCount: 0, previewLabel: "", deleted: 0 };
}

export function parseStoredDeleteSettings(parsed: unknown): Pick<State, "mode" | "kinds"> {
    const state = defaults();
    if (typeof parsed === "object" && parsed !== null) {
        const stored = parsed as { mode?: unknown; kinds?: Record<string, unknown> };
        if (stored.mode === "single" || stored.mode === "area") state.mode = stored.mode;
        for (const { kind } of OBJECT_DELETE_KINDS) {
            if (typeof stored.kinds?.[kind] === "boolean") state.kinds[kind] = stored.kinds[kind] as boolean;
        }
    }
    return { mode: state.mode, kinds: state.kinds };
}

function load(): State {
    const state = defaults();
    try {
        if (typeof localStorage !== "undefined") Object.assign(state, parseStoredDeleteSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")));
    } catch {
        /* defaults */
    }
    return state;
}

function stateFor(host: IEditorPluginHost): State {
    let state = stateByHost.get(host);
    if (!state) stateByHost.set(host, (state = load()));
    return state;
}

export type ObjectDeleteModel = Readonly<State> & {
    setMode: (mode: ObjectDeleteMode) => void;
    setKind: (kind: EditorObjectKind, enabled: boolean) => void;
    allows: (kind: EditorObjectKind) => boolean;
    /** Called every frame by the renderer; only notifies the UI when the preview actually changed. */
    setPreview: (targets: readonly EditorObjectRef[], describe: (ref: EditorObjectRef) => string) => void;
    addDeleted: (count: number) => void;
};

export function getObjectDeleteModel(host: IEditorPluginHost): ObjectDeleteModel {
    const state = stateFor(host);
    const save = (): void => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: state.mode, kinds: state.kinds }));
        } catch {
            /* not remembered */
        }
        host.notifyWorkbenchStateChanged();
    };
    return {
        ...state,
        setMode(mode) {
            if (state.mode === mode) return;
            state.mode = mode;
            save();
        },
        setKind(kind, enabled) {
            if (state.kinds[kind] === enabled) return;
            state.kinds[kind] = enabled;
            save();
        },
        allows: (kind) => state.kinds[kind],
        setPreview(targets, describe) {
            const label = targets.length > 0 ? describe(targets[0]) : "";
            if (state.previewCount === targets.length && state.previewLabel === label) return;
            state.previewCount = targets.length;
            state.previewLabel = label;
            host.notifyWorkbenchStateChanged();
        },
        addDeleted(count) {
            state.deleted += count;
            host.notifyWorkbenchStateChanged();
        },
    };
}

export function getObjectDeleteWorkbenchSnapshot(host: IEditorPluginHost): string {
    const s = stateFor(host);
    return `${s.mode}:${OBJECT_DELETE_KINDS.map(({ kind }) => (s.kinds[kind] ? 1 : 0)).join("")}:${s.previewCount}:${s.previewLabel}:${s.deleted}`;
}
