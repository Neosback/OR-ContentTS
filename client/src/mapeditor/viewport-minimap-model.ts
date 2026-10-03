import type { IEditorPluginHost } from "./plugins/editor-plugin-host";

/** Whether the round minimap sits inside the 3D view (the Minimap dock panel is separate). Saved in the browser. */
const STORAGE_KEY = "map-editor-viewport-minimap-v1";
const stateByHost = new WeakMap<IEditorPluginHost, { visible: boolean }>();

function stateFor(host: IEditorPluginHost): { visible: boolean } {
    let state = stateByHost.get(host);
    if (!state) {
        let visible = true;
        try {
            visible = typeof localStorage === "undefined" ? true : localStorage.getItem(STORAGE_KEY) !== "0";
        } catch {
            /* default */
        }
        stateByHost.set(host, (state = { visible }));
    }
    return state;
}

export function isViewportMinimapVisible(host: IEditorPluginHost): boolean {
    return stateFor(host).visible;
}

export function setViewportMinimapVisible(host: IEditorPluginHost, visible: boolean): void {
    const state = stateFor(host);
    if (state.visible === visible) return;
    state.visible = visible;
    try {
        localStorage.setItem(STORAGE_KEY, visible ? "1" : "0");
    } catch {
        /* not remembered */
    }
    host.notifyWorkbenchStateChanged();
}

export function getViewportMinimapWorkbenchSnapshot(host: IEditorPluginHost): string {
    return stateFor(host).visible ? "1" : "0";
}
