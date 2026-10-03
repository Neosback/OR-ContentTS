import { ALL_TILE_RENDER_FLAGS } from "../../../rs/map/TileRenderFlags";
import type { TileFieldSnapshot } from "../../map-editor-history";
import { clampRotation, clampShape } from "../../tile-shape-paint";
import type { IEditorPluginHost } from "../editor-plugin-host";
import { getTileFlagsToolModel } from "./tile-flags-tool-model";

/**
 * The Tile painter brush: one stroke can apply a floor underlay, a floor overlay, the overlay's shape and rotation, a
 * tile height and tile render flags together. Each part has its own tab in the Tile painter drawer and an "apply"
 * switch; only the switched-on parts are painted. Picking a value in a tab switches that part on. Height here is just
 * a value to stamp (like the other parts); raising, lowering and smoothing terrain is the separate Height tool.
 */
export type TileBrushComponent = "underlay" | "overlay" | "shape" | "rotation" | "height" | "flags";

export const TILE_BRUSH_COMPONENTS: readonly TileBrushComponent[] = ["underlay", "overlay", "shape", "rotation", "height", "flags"];

type TileBrushState = {
    enabled: Record<TileBrushComponent, boolean>;
    /** The drawer tab in front (also decides which part tool shortcuts and previews follow). */
    tab: TileBrushComponent;
    /** Overlay shape 0-11 painted when the shape part is on (see `tileShapeFaces`). */
    shape: number;
    /** Overlay rotation 0-3 (quarter turns) painted when the rotation part is on. */
    rotation: number;
    /** Tile height stamped when the height part is on (scene units, more negative = higher). */
    heightValue: number;
    /** Draw a translucent preview of the brush's result under the cursor. */
    ghost: boolean;
};

/** Range of a tile height (`Scene.getMinHeight` allows 0 down to -0xff * 8). */
export const TILE_HEIGHT_MIN = -2040;
export const TILE_HEIGHT_MAX = 0;

export function clampTileHeight(value: number): number {
    return Math.max(TILE_HEIGHT_MIN, Math.min(TILE_HEIGHT_MAX, Math.round(value) || 0));
}

export type TileBrushModel = TileBrushState & {
    isEnabled: (component: TileBrushComponent) => boolean;
    setEnabled: (component: TileBrushComponent, enabled: boolean) => void;
    setTab: (component: TileBrushComponent) => void;
    /** Chooses the overlay shape and switches the shape part on. */
    setShape: (shape: number) => void;
    /** Chooses the overlay rotation and switches the rotation part on. */
    setRotation: (rotation: number) => void;
    /** Chooses the tile height to stamp and switches the height part on. */
    setHeight: (height: number) => void;
    /** Loads a tile's underlay, overlay, shape, rotation, height and flags into the brush and switches the parts on. */
    sendTile: (tile: TileFieldSnapshot) => void;
    /** Shows or hides the brush ghost (the preview of what a stroke would paint). */
    setGhost: (ghost: boolean) => void;
};

const STORAGE_KEY = "map-editor-tile-brush-v2";
const LEGACY_STORAGE_KEY = "map-editor-tile-brush-v1";

function defaultState(): TileBrushState {
    return {
        enabled: { underlay: true, overlay: false, shape: false, rotation: false, height: false, flags: false },
        tab: "underlay",
        shape: 0,
        rotation: 0,
        heightValue: 0,
        ghost: true,
    };
}

const stateByHost = new WeakMap<IEditorPluginHost, TileBrushState>();

function isComponent(value: unknown): value is TileBrushComponent {
    return TILE_BRUSH_COMPONENTS.includes(value as TileBrushComponent);
}

type Stored = Partial<{ enabled: Record<string, unknown>; tab: unknown; shape: unknown; rotation: unknown; heightValue: unknown; ghost: unknown }> | null;

function read(key: string): Stored {
    try {
        return JSON.parse(localStorage.getItem(key) ?? "null") as Stored;
    } catch {
        return null;
    }
}

/** Reads the saved brush. The v1 save (no shape/rotation) is still understood, so upgrading keeps your ticks. */
export function parseStoredBrush(parsed: Stored): TileBrushState {
    const state = defaultState();
    if (parsed?.enabled) {
        for (const component of TILE_BRUSH_COMPONENTS) {
            if (typeof parsed.enabled[component] === "boolean") state.enabled[component] = parsed.enabled[component] as boolean;
        }
    }
    if (isComponent(parsed?.tab)) state.tab = parsed.tab;
    if (typeof parsed?.shape === "number") state.shape = clampShape(parsed.shape);
    if (typeof parsed?.rotation === "number") state.rotation = clampRotation(parsed.rotation);
    if (typeof parsed?.heightValue === "number") state.heightValue = clampTileHeight(parsed.heightValue);
    if (typeof parsed?.ghost === "boolean") state.ghost = parsed.ghost;
    return state;
}

function load(): TileBrushState {
    if (typeof localStorage === "undefined") return defaultState();
    return parseStoredBrush(read(STORAGE_KEY) ?? read(LEGACY_STORAGE_KEY));
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
        shape: state.shape,
        rotation: state.rotation,
        heightValue: state.heightValue,
        ghost: state.ghost,
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
        setShape(shape) {
            state.shape = clampShape(shape);
            state.enabled.shape = true;
            change();
        },
        setRotation(rotation) {
            state.rotation = clampRotation(rotation);
            state.enabled.rotation = true;
            change();
        },
        setHeight(height) {
            state.heightValue = clampTileHeight(height);
            state.enabled.height = true;
            change();
        },
        setGhost(ghost) {
            if (state.ghost === ghost) return;
            state.ghost = ghost;
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

            // Shape and rotation only exist on a tile with an overlay.
            state.shape = clampShape(tile.s ?? 0);
            state.rotation = clampRotation(tile.r ?? 0);
            state.enabled.shape = overlay > 0;
            state.enabled.rotation = overlay > 0 && state.shape !== 0;

            state.heightValue = clampTileHeight(tile.h ?? 0);
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
