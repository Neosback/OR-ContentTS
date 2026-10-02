import { ALL_TILE_RENDER_FLAGS } from "../../../rs/map/TileRenderFlags";
import type { TileFieldSnapshot } from "../../map-editor-history";
import type { IEditorPluginHost } from "../editor-plugin-host";
import { getHeightToolModel } from "./height-tool-model";
import { getTileFlagsToolModel } from "./tile-flags-tool-model";

/**
 * The Tile painter brush: one stroke can apply a floor underlay, a floor overlay, a height edit and tile render
 * flags together. Each part has its own tab in the Tile painter drawer and an "apply" switch; only the switched-on
 * parts are painted.
 */
export type TileBrushComponent = "underlay" | "overlay" | "height" | "flags";

export const TILE_BRUSH_COMPONENTS: readonly TileBrushComponent[] = ["underlay", "overlay", "height", "flags"];

type TileBrushState = {
    enabled: Record<TileBrushComponent, boolean>;
    /** The drawer tab in front (also decides which part tool shortcuts and previews follow). */
    tab: TileBrushComponent;
};

export type TileBrushModel = TileBrushState & {
    isEnabled: (component: TileBrushComponent) => boolean;
    setEnabled: (component: TileBrushComponent, enabled: boolean) => void;
    setTab: (component: TileBrushComponent) => void;
    /** Loads a tile's underlay, overlay, height and flags into the brush and switches every part on. */
    sendTile: (tile: TileFieldSnapshot) => void;
};

const STORAGE_KEY = "map-editor-tile-brush-v1";

const DEFAULT_STATE: TileBrushState = {
    enabled: { underlay: true, overlay: false, height: false, flags: false },
    tab: "underlay",
};

const stateByHost = new WeakMap<IEditorPluginHost, TileBrushState>();

function isComponent(value: unknown): value is TileBrushComponent {
    return TILE_BRUSH_COMPONENTS.includes(value as TileBrushComponent);
}

function load(): TileBrushState {
    const state: TileBrushState = { enabled: { ...DEFAULT_STATE.enabled }, tab: DEFAULT_STATE.tab };
    if (typeof localStorage === "undefined") return state;
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<{ enabled: Record<string, unknown>; tab: unknown }> | null;
        if (parsed?.enabled) {
            for (const component of TILE_BRUSH_COMPONENTS) {
                if (typeof parsed.enabled[component] === "boolean") state.enabled[component] = parsed.enabled[component] as boolean;
            }
        }
        if (isComponent(parsed?.tab)) state.tab = parsed.tab;
    } catch {
        /* ignore */
    }
    return state;
}

function persist(state: TileBrushState): void {
    if (typeof localStorage === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        /* ignore */
    }
}

function getOrCreateState(host: IEditorPluginHost): TileBrushState {
    let state = stateByHost.get(host);
    if (!state) {
        state = load();
        stateByHost.set(host, state);
    }
    return state;
}

export function getTileBrushModel(host: IEditorPluginHost): TileBrushModel {
    const state = getOrCreateState(host);
    const change = (): void => {
        persist(state);
        host.notifyWorkbenchStateChanged();
    };
    return {
        enabled: state.enabled,
        tab: state.tab,
        isEnabled: (component) => state.enabled[component],
        setEnabled(component, enabled) {
            if (state.enabled[component] === enabled) return;
            state.enabled[component] = enabled;
            change();
        },
        setTab(component) {
            if (state.tab === component) return;
            state.tab = component;
            change();
        },
        sendTile(tile) {
            // Underlay: a tile always has one (stored as id + 1); without one the part is left off.
            const underlay = tile.u ?? 0;
            if (underlay > 0) {
                host.selectedUnderlayId = underlay - 1;
            }
            state.enabled.underlay = underlay > 0;

            // Overlay: no overlay on the tile means "paint no overlay" (-1), which clears one on the tiles painted.
            const overlay = tile.o ?? 0;
            host.selectedOverlayId = overlay > 0 ? overlay - 1 : -1;
            state.enabled.overlay = true;

            const height = getHeightToolModel(host);
            height.setMode("set");
            height.setSetHeight(tile.h ?? 0);
            state.enabled.height = true;

            const flags = getTileFlagsToolModel(host);
            for (const flag of ALL_TILE_RENDER_FLAGS) {
                flags.setPaintFlag(flag, ((tile.f ?? 0) & flag) !== 0);
            }
            state.enabled.flags = true;

            host.setEditorTool("tile-brush");
            change();
        },
    };
}

/**
 * Which painting part the user is working on: the front drawer tab while the Tile painter is the active tool, or
 * undefined for any other tool. Shortcuts that used to belong to the separate Height/Overlay/... tools follow this.
 */
export function getTileBrushFocus(host: IEditorPluginHost): TileBrushComponent | undefined {
    return host.getEditorTool() === "tile-brush" ? getOrCreateState(host).tab : undefined;
}

export function bootstrapTileBrushModel(host: IEditorPluginHost): void {
    getOrCreateState(host);
}

export function getTileBrushWorkbenchSnapshot(host: IEditorPluginHost): string {
    return JSON.stringify(getOrCreateState(host));
}
