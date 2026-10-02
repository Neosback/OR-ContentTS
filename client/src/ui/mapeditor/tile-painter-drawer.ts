import type { DockviewGroupPanel } from "dockview-core";

/** The Tile painter drawer sits between the viewport and the brush bar; a chevron folds it down to its tab bar. */
export const TILE_PAINTER_PANEL_ID = "editor-tile-painter";
export const TILE_PAINTER_COLLAPSED_HEIGHT = 34;
const MIN_EXPANDED_HEIGHT = 120;
const DEFAULT_EXPANDED_HEIGHT = 230;
const STORAGE_KEY = "map-editor-tile-painter-drawer-v1";

type DrawerState = { collapsed: boolean; height: number };

function load(): DrawerState {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<DrawerState> | null;
        return {
            collapsed: parsed?.collapsed === true,
            height: typeof parsed?.height === "number" && parsed.height >= MIN_EXPANDED_HEIGHT ? parsed.height : DEFAULT_EXPANDED_HEIGHT,
        };
    } catch {
        return { collapsed: false, height: DEFAULT_EXPANDED_HEIGHT };
    }
}

let state: DrawerState | undefined;

function current(): DrawerState {
    return (state ??= load());
}

function save(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current()));
    } catch {
        /* ignore */
    }
}

export function isTilePainterCollapsed(): boolean {
    return current().collapsed;
}

/**
 * Applies the remembered open/closed state to the drawer's group: no tab header (the drawer has its own tab bar) and
 * a fixed 34px height when folded. Dockview does not serialize constraints, so this runs after every layout restore.
 */
export function applyTilePainterDrawer(group: DockviewGroupPanel): void {
    group.model.header.hidden = true;
    const { collapsed, height } = current();
    if (collapsed) {
        group.api.setConstraints({ minimumHeight: TILE_PAINTER_COLLAPSED_HEIGHT, maximumHeight: TILE_PAINTER_COLLAPSED_HEIGHT });
        group.api.setSize({ height: TILE_PAINTER_COLLAPSED_HEIGHT });
    } else {
        group.api.setConstraints({ minimumHeight: MIN_EXPANDED_HEIGHT, maximumHeight: Number.MAX_SAFE_INTEGER });
        group.api.setSize({ height });
    }
}

export function setTilePainterCollapsed(group: DockviewGroupPanel, collapsed: boolean): void {
    const drawer = current();
    if (drawer.collapsed === collapsed) return;
    // Remember how tall the open drawer was, so it comes back at the same size.
    if (collapsed) drawer.height = Math.max(MIN_EXPANDED_HEIGHT, group.api.height || drawer.height);
    drawer.collapsed = collapsed;
    save();
    applyTilePainterDrawer(group);
}
