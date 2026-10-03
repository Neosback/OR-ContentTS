import {
    createDockview,
    DefaultTab,
    themeDark,
    type AddPanelOptions,
    type DockviewApi,
    type DockviewGroupPanel,
    type DockviewTheme,
    type GroupPanelPartInitParameters,
    type IContentRenderer,
    type ITabRenderer,
    type SerializedDockview,
} from "dockview-core";

import "../styles/dockview.css";
import "../styles/studio-dock.css";

import { readJson, writeStorage } from "./persisted";
import type { PanelContext, StudioPanel } from "./panel";

const SAVE_DELAY_MS = 300;
const FIXED_TAB = "studio-fixed-tab";
const DEFAULT_TAB = "studio-tab";

function isolateInput(element: HTMLElement): void {
    for (const type of ["keydown", "keyup", "mousedown", "wheel", "contextmenu"] as const) {
        element.addEventListener(type, (event) => event.stopPropagation());
    }
}

class PanelContent implements IContentRenderer {
    readonly element = document.createElement("div");
    private teardown?: () => void;

    constructor(private readonly panel: StudioPanel) {
        this.element.className = "studio-panel";
        this.element.dataset.studioPanel = panel.id;
        if (panel.isolateInput) isolateInput(this.element);
    }

    init(params: GroupPanelPartInitParameters): void {
        const context: PanelContext = {
            params: (params.params ?? {}) as Record<string, unknown>,
            api: params.api,
            containerApi: params.containerApi,
        };
        this.teardown = this.panel.mount(this.element, context);
    }

    dispose(): void {
        this.teardown?.();
        this.teardown = undefined;
    }
}

/** dockview's default tab plus a right-click hook (panel placement menus). */
class StudioTab extends DefaultTab {
    constructor(private readonly onContextMenu?: (panelId: string, event: MouseEvent) => void) {
        super();
    }

    override init(params: GroupPanelPartInitParameters): void {
        super.init(params);
        const panelId = params.api.id;
        this.element.addEventListener("contextmenu", (event) => this.onContextMenu?.(panelId, event));
    }
}

/** A tab without a close button, for panels that must stay open. */
class FixedTab implements ITabRenderer {
    readonly element = document.createElement("div");

    init(params: GroupPanelPartInitParameters): void {
        this.element.className = "studio-fixed-tab dv-default-tab";
        this.element.textContent = params.title;
    }
}

export interface StudioDockOptions {
    panels: readonly StudioPanel[];
    /** localStorage key for the saved layout; omit to never persist. Bump its version when panel ids change. */
    storageKey?: string;
    /** Builds the layout on first run, after a reset, or when the saved one fails to load. */
    defaultLayout(dock: StudioDock): void;
    /**
     * Runs after the layout exists, whether restored or built by `defaultLayout`. Use it for state
     * dockview does not serialize (pinned sizes, hidden headers, locks).
     */
    afterLayout?(dock: StudioDock): void;
    /** A restored layout is discarded (and the default built) unless this returns true. */
    isRestoredLayoutValid?(api: DockviewApi): boolean;
    /** Right-click on a tab. */
    onTabContextMenu?(panelId: string, event: MouseEvent): void;
    /**
     * Content for the right end of a group's tab row (a toolbar). Called once for every group dockview creates; return
     * undefined for groups that get nothing. The returned element is mounted by dockview and `dispose` runs when the
     * group goes away.
     */
    headerActions?(group: DockviewGroupPanel): { element: HTMLElement; dispose(): void } | undefined;
    theme?: DockviewTheme;
    defaultRenderer?: "always" | "onlyWhenVisible";
}

export interface AddOptions extends Omit<AddPanelOptions, "component" | "title" | "id"> {
    /** Panel instance id; defaults to the component id. Several panels may share one component. */
    panelId?: string;
    title?: string;
}

export interface StudioDock {
    readonly api: DockviewApi;
    /** Adds a panel for a registered component, or activates it if that panel id is already open. */
    open(componentId: string, options?: AddOptions): void;
    isOpen(panelId: string): boolean;
    /** Forgets the saved layout; the caller rebuilds (or reloads, if the scene cannot be re-created in place). */
    forgetLayout(): void;
    /** Clears the dock and rebuilds the default layout. */
    resetLayout(): void;
    dispose(): void;
}

export function createStudioDock(container: HTMLElement, options: StudioDockOptions): StudioDock {
    const panels = new Map(options.panels.map((panel) => [panel.id, panel]));

    const api = createDockview(container, {
        theme: options.theme ?? themeDark,
        defaultRenderer: options.defaultRenderer ?? "always",
        createComponent: ({ name }) => {
            const panel = panels.get(name);
            if (!panel) throw new Error(`Unknown studio panel "${name}"`);
            return new PanelContent(panel);
        },
        // dockview only consults createTabComponent for a named tab, so the default tab needs a name too.
        defaultTabComponent: DEFAULT_TAB,
        createTabComponent: ({ name }) => (name === FIXED_TAB ? new FixedTab() : new StudioTab(options.onTabContextMenu)),
        createRightHeaderActionComponent: (group) => {
            const made = options.headerActions?.(group);
            return {
                element: made?.element ?? document.createElement("div"),
                init: () => undefined,
                dispose: () => made?.dispose(),
            };
        },
    });

    // Measure now so default sizes are applied against the real container, not 0x0.
    api.layout(container.clientWidth, container.clientHeight);

    const dock: StudioDock = {
        api,
        open(componentId, add = {}) {
            const { panelId = componentId, title, ...rest } = add;
            const existing = api.getPanel(panelId);
            if (existing) {
                existing.api.setActive();
                return;
            }
            const panel = panels.get(componentId);
            if (!panel) throw new Error(`Unknown studio panel "${componentId}"`);
            api.addPanel({
                ...rest,
                id: panelId,
                component: componentId,
                title: title ?? panel.title,
                tabComponent: panel.fixed ? FIXED_TAB : rest.tabComponent,
                renderer: panel.keepAlive ? "always" : rest.renderer,
            } as AddPanelOptions);
        },
        isOpen: (panelId) => api.getPanel(panelId) !== undefined,
        forgetLayout: () => {
            if (options.storageKey) writeStorage(options.storageKey, null);
        },
        resetLayout() {
            dock.forgetLayout();
            api.clear();
            options.defaultLayout(dock);
            options.afterLayout?.(dock);
        },
        dispose: () => {
            window.clearTimeout(saveTimer);
            api.dispose();
        },
    };

    let saveTimer: number | undefined;
    const saved = options.storageKey ? readJson<SerializedDockview>(options.storageKey) : undefined;
    let restored = false;
    if (saved) {
        try {
            api.fromJSON(saved);
            restored = options.isRestoredLayoutValid ? options.isRestoredLayoutValid(api) : true;
        } catch (error) {
            console.warn("[studio] saved layout could not be restored", error);
        }
        if (!restored) api.clear();
    }
    if (!restored) options.defaultLayout(dock);
    options.afterLayout?.(dock);

    if (options.storageKey) {
        const key = options.storageKey;
        api.onDidLayoutChange(() => {
            window.clearTimeout(saveTimer);
            saveTimer = window.setTimeout(() => writeStorage(key, JSON.stringify(api.toJSON())), SAVE_DELAY_MS);
        });
    }

    return dock;
}

/** Fixed-size groups (paint strip, brush bar): hide the tab header and pin one dimension. */
export function pinGroup(
    group: DockviewGroupPanel,
    options: { width?: number; height?: number; hideHeader?: boolean; locked?: boolean },
): void {
    if (options.hideHeader) group.model.header.hidden = true;
    if (options.width !== undefined) {
        group.api.setConstraints({ minimumWidth: options.width, maximumWidth: options.width });
        group.api.setSize({ width: options.width });
    }
    if (options.height !== undefined) {
        group.api.setConstraints({ minimumHeight: options.height, maximumHeight: options.height });
        group.api.setSize({ height: options.height });
    }
    if (options.locked) group.locked = "no-drop-target";
}

/** Moves an open panel into a dockview floating group. */
export function floatPanel(
    api: DockviewApi,
    panelId: string,
    rect: { x?: number; y?: number; width?: number; height?: number } = {},
): boolean {
    const panel = api.getPanel(panelId);
    if (!panel) return false;
    api.addFloatingGroup(panel, rect);
    return true;
}

/** Opens a panel in a native popout window (same-origin `/popout.html` host page). */
export async function popoutPanel(
    api: DockviewApi,
    panelId: string,
    position?: { left: number; top: number; width: number; height: number },
    onClosed?: () => void,
): Promise<boolean> {
    const panel = api.getPanel(panelId);
    if (!panel) return false;
    return api.addPopoutGroup(panel, {
        popoutUrl: "/popout.html",
        position,
        onWillClose: onClosed ? () => onClosed() : undefined,
    });
}
