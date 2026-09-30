import type { DockviewApi, DockviewPanelApi } from "dockview-core";
import { mount, unmount, type Component } from "svelte";

/** What a panel receives when it is mounted into a dock. */
export interface PanelContext {
    /** Params given to `addPanel({ params })`. */
    readonly params: Record<string, unknown>;
    /** The panel's own dockview API (title, close, floating state, active/visible events). */
    readonly api: DockviewPanelApi;
    /** The owning dock's API. */
    readonly containerApi: DockviewApi;
}

/**
 * A dock panel. The contract is framework-neutral: a panel mounts into an element and returns its
 * teardown, so panels can be Svelte components or plain DOM (the WebGL scene host).
 */
export interface StudioPanel {
    /** Stable id; also the dockview component name. */
    readonly id: string;
    readonly title: string;
    mount(element: HTMLElement, context: PanelContext): () => void;
    /**
     * Keep the content mounted while its tab is hidden and never move it in the DOM
     * (`renderer: "always"`). Required for the WebGL scene, which must not lose its context.
     */
    readonly keepAlive?: boolean;
    /** Tab has no close button. */
    readonly fixed?: boolean;
    /** Stop keyboard/pointer events at the panel boundary so they do not reach window listeners. */
    readonly isolateInput?: boolean;
}

/** A Svelte component as a panel. `props` may depend on the panel context (params, api). */
export function sveltePanel<Props extends Record<string, any> = Record<string, never>>(options: {
    id: string;
    title: string;
    component: Component<Props>;
    props?: Props | ((context: PanelContext) => Props);
    /** Svelte context for the mounted component (panels are mounted outside the app's component tree). */
    context?: Map<unknown, unknown> | ((context: PanelContext) => Map<unknown, unknown>);
    keepAlive?: boolean;
    fixed?: boolean;
    isolateInput?: boolean;
}): StudioPanel {
    return {
        id: options.id,
        title: options.title,
        keepAlive: options.keepAlive,
        fixed: options.fixed,
        isolateInput: options.isolateInput,
        mount(element, panelContext) {
            const props =
                typeof options.props === "function" ? options.props(panelContext) : (options.props ?? ({} as Props));
            const context =
                typeof options.context === "function" ? options.context(panelContext) : options.context;
            const instance = mount(options.component, { target: element, props, context });
            return () => {
                void unmount(instance);
            };
        },
    };
}

/** A panel that builds its own DOM (no framework), e.g. the renderer canvas host. */
export function domPanel(options: {
    id: string;
    title: string;
    mount(element: HTMLElement, context: PanelContext): () => void;
    keepAlive?: boolean;
    fixed?: boolean;
    isolateInput?: boolean;
}): StudioPanel {
    return { ...options };
}
