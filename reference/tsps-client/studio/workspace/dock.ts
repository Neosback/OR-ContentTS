import {
    createDockview,
    type AddPanelOptions,
    type DockviewApi,
    type GroupPanelPartInitParameters,
    type IContentRenderer,
    type ITabRenderer,
    type TabPartInitParameters,
} from "dockview-core";
// dockview-core ships no stylesheet; the `dockview` package carries it. Only the CSS is used.
import "dockview/dist/styles/dockview.css";

import type { StudioPanel } from "./panel";

const FIXED_TAB = "studio-fixed-tab";
const SAVE_DELAY_MS = 300;

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
        if (panel.isolateInput !== false) isolateInput(this.element);
    }

    init(_params: GroupPanelPartInitParameters): void {
        this.teardown = this.panel.mount(this.element);
    }

    dispose(): void {
        this.teardown?.();
        this.teardown = undefined;
    }
}

/** A tab without a close button, for panels that must stay open. */
class FixedTab implements ITabRenderer {
    readonly element = document.createElement("div");

    init(params: TabPartInitParameters): void {
        this.element.className = "studio-fixed-tab";
        this.element.textContent = params.title;
    }
}

export interface StudioDockOptions {
    panels: readonly StudioPanel[];
    /** localStorage key for the saved layout. Bump its version when panel ids change. */
    storageKey: string;
    /** Builds the layout used on first run, after a reset, or when the saved one fails to load. */
    defaultLayout(dock: StudioDock): void;
}

export interface StudioDock {
    readonly api: DockviewApi;
    /** Adds a registered panel, or focuses it if it is already open. */
    open(id: string, position?: AddPanelOptions["position"], size?: { width?: number; height?: number }): void;
    isOpen(id: string): boolean;
    /** Forgets the saved layout. The caller reloads, since the scene cannot be re-created in place. */
    forgetLayout(): void;
    dispose(): void;
}

function readSaved(key: string): unknown {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : undefined;
    } catch {
        return undefined;
    }
}

function writeSaved(key: string, value: unknown): void {
    try {
        if (value === undefined) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage can be unavailable (private windows); the layout just is not remembered.
    }
}

export function createStudioDock(container: HTMLElement, options: StudioDockOptions): StudioDock {
    const panels = new Map(options.panels.map((panel) => [panel.id, panel]));

    const api = createDockview(container, {
        theme: { name: "studio", className: "dockview-theme-studio" },
        createComponent: ({ name }) => {
            const panel = panels.get(name);
            if (!panel) throw new Error(`Unknown studio panel "${name}"`);
            return new PanelContent(panel);
        },
        createTabComponent: ({ name }) => (name === FIXED_TAB ? new FixedTab() : undefined),
    });

    // Measure now so default sizes are applied against the real container, not 0×0.
    api.layout(container.clientWidth, container.clientHeight);

    const dock: StudioDock = {
        api,
        open(id, position, size) {
            const existing = api.getPanel(id);
            if (existing) {
                existing.api.setActive();
                return;
            }
            const panel = panels.get(id);
            if (!panel) throw new Error(`Unknown studio panel "${id}"`);
            api.addPanel({
                id,
                component: id,
                title: panel.title,
                tabComponent: panel.fixed ? FIXED_TAB : undefined,
                renderer: panel.keepAlive ? "always" : undefined,
                position,
            });
            // Initial sizes on addPanel are not applied to a new grid column; size the group instead.
            if (size) api.getPanel(id)?.group.api.setSize(size);
        },
        isOpen: (id) => api.getPanel(id) !== undefined,
        forgetLayout: () => writeSaved(options.storageKey, undefined),
        dispose: () => api.dispose(),
    };

    const saved = readSaved(options.storageKey);
    let restored = false;
    if (saved) {
        try {
            api.fromJSON(saved as Parameters<DockviewApi["fromJSON"]>[0]);
            // A layout saved without a fixed panel (older versions) is not usable.
            restored = options.panels.every((panel) => !panel.fixed || api.getPanel(panel.id));
        } catch (error) {
            console.warn("[studio] saved layout could not be restored", error);
        }
        if (!restored) api.clear();
    }
    if (!restored) options.defaultLayout(dock);

    let saveTimer: number | undefined;
    api.onDidLayoutChange(() => {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => writeSaved(options.storageKey, api.toJSON()), SAVE_DELAY_MS);
    });

    return dock;
}
