import { mount, unmount, type Component } from "svelte";

/**
 * A Studio dock panel. The contract is framework-neutral: a panel mounts into
 * an element and returns its teardown, so panels can be Svelte, React (the
 * legacy client) or plain DOM (the existing editor chrome).
 */
export interface StudioPanel {
    /** Stable id; also the dockview component name and the saved-layout key. */
    readonly id: string;
    readonly title: string;
    mount(element: HTMLElement): () => void;
    /**
     * Keep the content mounted while its tab is hidden and never move it in
     * the DOM. Required for the WebGL scene, which must not lose its context.
     */
    readonly keepAlive?: boolean;
    /** Tab has no close button (the scene hosts the whole client). */
    readonly fixed?: boolean;
    /**
     * Stop pointer and key events from bubbling to the game client's window
     * listeners, so typing in a panel does not drive the camera. Default true.
     */
    readonly isolateInput?: boolean;
}

export function sveltePanel(options: {
    id: string;
    title: string;
    component: Component<Record<string, never>>;
}): StudioPanel {
    return {
        id: options.id,
        title: options.title,
        mount(element) {
            const instance = mount(options.component, { target: element });
            return () => {
                void unmount(instance);
            };
        },
    };
}
