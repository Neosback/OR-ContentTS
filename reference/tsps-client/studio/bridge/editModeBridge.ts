import type { EditModePlugin } from "../../game/plugins/editmode/EditModePlugin";

/**
 * Hands the running map editor plugin to Studio panels. The plugin is created
 * by the game client once its cache loads, long after the workspace mounts,
 * so panels subscribe instead of importing it. Framework-free on purpose.
 */

type Listener = (plugin: EditModePlugin | undefined) => void;

let current: EditModePlugin | undefined;
const listeners = new Set<Listener>();

export function publishEditModePlugin(plugin: EditModePlugin | undefined): void {
    current = plugin;
    for (const listener of listeners) listener(plugin);
}

/** Calls `listener` now with the current plugin (possibly undefined), then on every change. */
export function subscribeEditModePlugin(listener: Listener): () => void {
    listeners.add(listener);
    listener(current);
    return () => {
        listeners.delete(listener);
    };
}
