import { createSubscriber } from "svelte/reactivity";

/**
 * Turns an external store (a `subscribe(listener) → unsubscribe` plus a snapshot getter, the shape
 * `IEditorPluginHost` already exposes) into a reactive value. Reading `.current` inside an effect or
 * template re-runs it whenever the store notifies. This replaces `useSyncExternalStore`.
 */
export function fromExternal<T>(
    subscribe: (listener: () => void) => () => void,
    getSnapshot: () => T,
): { readonly current: T } {
    const track = createSubscriber((update) => subscribe(update));
    return {
        get current(): T {
            track();
            return getSnapshot();
        },
    };
}
