import type { DockviewGroupPanel } from "dockview-core";

/**
 * The Tile painter is a dock panel that can sit under the viewport (a drawer that folds to its bar), above it, or in a
 * column on either side. Its bar hides dockview's tab strip, so moving it is done from the bar's menu
 * (`Workbench.moveTilePainter`). This module holds its remembered position and open/closed state and applies them to
 * the dock group (dockview does not serialize group constraints, so this runs after every layout restore).
 */
export const TILE_PAINTER_PANEL_ID = "editor-tile-painter";
export const TILE_PAINTER_COLLAPSED_HEIGHT = 34;

export type TilePainterPosition = "bottom" | "top" | "left" | "right";

const MIN_EXPANDED_HEIGHT = 120;
const DEFAULT_EXPANDED_HEIGHT = 276;
const SIDE_MIN_WIDTH = 300;
const SIDE_DEFAULT_WIDTH = 440;
const STORAGE_KEY = "map-editor-tile-painter-drawer-v3";
const MAX = Number.MAX_SAFE_INTEGER;

type DrawerState = { collapsed: boolean; height: number; position: TilePainterPosition };

export type TilePainterDrawerState = { collapsed: boolean; height: number; position: TilePainterPosition };

/** A copy of the remembered position, folded state and open height (saved with a named layout). */
export function getTilePainterState(): TilePainterDrawerState {
    return { ...current() };
}

/** Restores a saved state (unknown or missing values keep the defaults) and tells listeners. */
export function setTilePainterState(next: Partial<TilePainterDrawerState> | undefined): void {
    const drawer = current();
    drawer.position = isPosition(next?.position) ? next.position : "bottom";
    drawer.collapsed = next?.collapsed === true;
    drawer.height = typeof next?.height === "number" && next.height >= MIN_EXPANDED_HEIGHT ? next.height : DEFAULT_EXPANDED_HEIGHT;
    save();
}

export const isStripPosition = (position: TilePainterPosition): boolean => position === "bottom" || position === "top";

function isPosition(value: unknown): value is TilePainterPosition {
    return value === "bottom" || value === "top" || value === "left" || value === "right";
}

function load(): DrawerState {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<DrawerState> | null;
        return {
            collapsed: parsed?.collapsed === true,
            height: typeof parsed?.height === "number" && parsed.height >= MIN_EXPANDED_HEIGHT ? parsed.height : DEFAULT_EXPANDED_HEIGHT,
            position: isPosition(parsed?.position) ? parsed.position : "bottom",
        };
    } catch {
        return { collapsed: false, height: DEFAULT_EXPANDED_HEIGHT, position: "bottom" };
    }
}

let state: DrawerState | undefined;
const listeners = new Set<() => void>();

function current(): DrawerState {
    return (state ??= load());
}

function save(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current()));
    } catch {
        /* ignore */
    }
    for (const listener of listeners) listener();
}

/** Calls `listener` whenever the position or folded state changes; returns the unsubscribe function. */
export function onTilePainterDrawerChange(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function isTilePainterCollapsed(): boolean {
    return current().collapsed && isStripPosition(current().position);
}

export function tilePainterPosition(): TilePainterPosition {
    return current().position;
}

export function setTilePainterPosition(position: TilePainterPosition): void {
    if (current().position === position) return;
    current().position = position;
    save();
}

type Rect = { left: number; top: number; width: number; height: number };

/** Which side of the viewport a panel is on, from where the two sit on screen (used to recover the position after a layout restore). */
export function positionFromRects(painter: Rect, scene: Rect): TilePainterPosition {
    const dx = painter.left + painter.width / 2 - (scene.left + scene.width / 2);
    const dy = painter.top + painter.height / 2 - (scene.top + scene.height / 2);
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
    return dy > 0 ? "bottom" : "top";
}

/**
 * Applies the remembered position and open/closed state to the drawer's group: no tab header (the drawer has its own
 * bar), a fixed 34px height when folded under or over the viewport, a minimum width when in a side column.
 */
export function applyTilePainterDrawer(group: DockviewGroupPanel): void {
    group.model.header.hidden = true;
    const { collapsed, height, position } = current();
    if (!isStripPosition(position)) {
        group.api.setConstraints({ minimumWidth: SIDE_MIN_WIDTH, maximumWidth: MAX, minimumHeight: MIN_EXPANDED_HEIGHT, maximumHeight: MAX });
        return;
    }
    if (collapsed) {
        group.api.setConstraints({ minimumWidth: 100, maximumWidth: MAX, minimumHeight: TILE_PAINTER_COLLAPSED_HEIGHT, maximumHeight: TILE_PAINTER_COLLAPSED_HEIGHT });
        group.api.setSize({ height: TILE_PAINTER_COLLAPSED_HEIGHT });
    } else {
        group.api.setConstraints({ minimumWidth: 100, maximumWidth: MAX, minimumHeight: MIN_EXPANDED_HEIGHT, maximumHeight: MAX });
        group.api.setSize({ height });
    }
}

/** Sizes the drawer for a position it has just been moved to. */
export function sizeTilePainterForPosition(group: DockviewGroupPanel): void {
    const { position, height } = current();
    applyTilePainterDrawer(group);
    if (isStripPosition(position)) group.api.setSize({ height: current().collapsed ? TILE_PAINTER_COLLAPSED_HEIGHT : height });
    else group.api.setSize({ width: SIDE_DEFAULT_WIDTH });
}

export function setTilePainterCollapsed(group: DockviewGroupPanel, collapsed: boolean): void {
    const drawer = current();
    if (!isStripPosition(drawer.position) || drawer.collapsed === collapsed) return;
    // Remember how tall the open drawer was, so it comes back at the same size.
    if (collapsed) drawer.height = Math.max(MIN_EXPANDED_HEIGHT, group.api.height || drawer.height);
    drawer.collapsed = collapsed;
    save();
    applyTilePainterDrawer(group);
}
