import { readable } from "svelte/store";

import type { EditModePlugin } from "../../game/plugins/editmode/EditModePlugin";
import type { EditModePluginState } from "../../game/plugins/editmode/types";
import { subscribeEditModePlugin } from "../bridge/editModeBridge";

/** The running editor plugin, or undefined until the client has loaded it. */
export const editModePlugin = readable<EditModePlugin | undefined>(undefined, (set) =>
    subscribeEditModePlugin(set),
);

/** The plugin's state, re-published on every plugin commit. */
export const editModeState = readable<EditModePluginState | undefined>(undefined, (set) => {
    let unsubscribeState: (() => void) | undefined;
    const unsubscribePlugin = subscribeEditModePlugin((plugin) => {
        unsubscribeState?.();
        unsubscribeState = undefined;
        if (!plugin) {
            set(undefined);
            return;
        }
        set(plugin.getState());
        unsubscribeState = plugin.subscribe(() => set(plugin.getState()));
    });
    return () => {
        unsubscribeState?.();
        unsubscribePlugin();
    };
});
