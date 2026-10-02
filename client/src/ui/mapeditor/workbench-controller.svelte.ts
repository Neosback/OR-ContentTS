import type { AddPanelOptions, DockviewApi } from "dockview-core";

import { addMapEditorDockPanelRestoredOrDefault, extractDockPanelRestoreOptions } from "../../mapeditor/map-editor-dock-panel-restore";
import { getMapEditorFloatableDockPanelDefaults } from "../../mapeditor/map-editor-floatable-dock-defaults";
import { EDITOR_TOOL_DOCK_PANEL, MAP_EDITOR_FLOATABLE_DOCK_PANELS } from "../../mapeditor/map-editor-panel-config";
import type { MapEditorDockPanelId } from "../../mapeditor/plugins/builtins/builtin-plugin-types";
import { activateEditorToolWorkspaces } from "../../mapeditor/plugins/builtins/editor-tool-workspaces";
import { getPaintToolsStripModel } from "../../mapeditor/plugins/builtins/paint-tools-strip-model";
import type { IEditorPluginHost } from "../../mapeditor/plugins/editor-plugin-host";
import { isTauriRuntime } from "../../lib/tauri/is-tauri";
import type { ContextMenuItem } from "../components/context-menu/context-menu.svelte";
import { createStudioDock, floatPanel, pinGroup, popoutPanel, type StudioDock } from "../lib/dock";
import type { StudioPanel } from "../lib/panel";
import { applyTilePainterDrawer, TILE_PAINTER_PANEL_ID } from "./tile-painter-drawer";

export const SCENE_PANEL_ID = "editor-scene-editor";
export const PAINT_TOOLS_PANEL_ID = "editor-paint-tools";
export const BRUSH_PANEL_ID = "editor-brush-workspace";

/** The tool strip is a narrow docked column; the brush bar a short docked row. */
export const PAINT_TOOLS_STRIP_WIDTH = 44;
export const BRUSH_BAR_HEIGHT = 44;

/** How many palette tabs fit in the right-hand column before the rest collapse into the overflow menu. */
const VISIBLE_PALETTE_TABS = 3;

/** Bump when panel ids or their meaning change; an old saved layout is then discarded. */
const LAYOUT_STORAGE_KEY = "map-editor-workbench-layout-v5";

export type PanelLocation = "grid" | "floating" | "popout";

interface FloatRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Default floating rectangles (workbench-relative) for the two panels that start as overlays. */
const PAINT_TOOLS_FLOAT: FloatRect = { x: 12, y: 44, width: PAINT_TOOLS_STRIP_WIDTH, height: 212 };
const BRUSH_FLOAT: FloatRect = { x: 12, y: 120, width: 300, height: 420 };

function panelTitle(panelId: string): string {
    if (panelId === PAINT_TOOLS_PANEL_ID) return "Tools";
    if (panelId === BRUSH_PANEL_ID) return "Brush workspace";
    return MAP_EDITOR_FLOATABLE_DOCK_PANELS.find((row) => row.panelId === panelId)?.title ?? panelId;
}

/**
 * The map editor's dockview workbench: builds the default layout, keeps panels in step with the
 * plugin enable flags, and offers Dock / Float / External placement over dockview's native floating
 * and popout groups. A panel's placement is simply where its group lives.
 */
export class Workbench {
    /** Set as soon as the dock exists (the layout callbacks run before `createStudioDock` returns). */
    dock!: StudioDock;
    /** Where each open panel currently lives. Absent = closed. */
    locations = $state<Record<string, PanelLocation>>({});

    private enabledSignature = "";
    private disposers: Array<() => void> = [];

    constructor(
        container: HTMLElement,
        readonly host: IEditorPluginHost,
        panels: readonly StudioPanel[],
        onTabMenu: (panelId: string, event: MouseEvent) => void,
    ) {
        const dock = createStudioDock(container, {
            panels,
            storageKey: LAYOUT_STORAGE_KEY,
            isRestoredLayoutValid: (api) => api.getPanel(SCENE_PANEL_ID) !== undefined,
            onTabContextMenu: onTabMenu,
            defaultLayout: (d) => {
                this.dock = d;
                this.buildDefaultLayout();
            },
            afterLayout: (d) => {
                this.dock = d;
                this.afterLayout();
            },
        });
        this.dock = dock;

        const api = this.api;
        const refresh = (): void => this.refreshLocations();
        for (const subscription of [api.onDidLayoutChange(refresh), api.onDidAddPanel(refresh), api.onDidRemovePanel(refresh)]) {
            this.disposers.push(() => subscription.dispose());
        }
        refresh();
    }

    get api(): DockviewApi {
        return this.dock.api;
    }

    dispose(): void {
        for (const dispose of this.disposers) dispose();
        this.dock.dispose();
    }

    // ── layout ───────────────────────────────────────────────
    private buildDefaultLayout(): void {
        const host = this.host;
        this.dock.open("sceneEditor", { panelId: SCENE_PANEL_ID, title: "Editor" });

        for (const config of MAP_EDITOR_FLOATABLE_DOCK_PANELS) {
            if (!this.isPanelEnabled(config.panelId)) continue;
            const defaults = getMapEditorFloatableDockPanelDefaults(config.panelId);
            if (defaults) this.api.addPanel(defaults);
        }

        if (host.isWorkbenchUiPluginEnabled("brush_workspace")) this.addBrushBar();
        if (host.isWorkbenchUiPluginEnabled("paint_tools_strip")) this.addPaintToolsStrip("floating");
    }

    private afterLayout(): void {
        this.pinDockedChrome();
        this.enabledSignature = this.computeEnabledSignature();
        this.refreshLocations();
    }

    /** Sizes and hidden headers are not serialized by dockview, so they are re-applied after every restore/dock. */
    private pinDockedChrome(): void {
        const strip = this.api.getPanel(PAINT_TOOLS_PANEL_ID);
        if (strip) {
            // Docked: a fixed-width column. Floating: the group's own drag bar is the handle, so the tab header goes.
            if (strip.api.location.type === "grid") pinGroup(strip.group, { width: PAINT_TOOLS_STRIP_WIDTH, hideHeader: true });
            else {
                strip.group.model.header.hidden = true;
                // Dockview gives every group a 100px minimum width unless it has explicit constraints.
                strip.group.api.setConstraints({ minimumWidth: PAINT_TOOLS_STRIP_WIDTH, maximumWidth: PAINT_TOOLS_STRIP_WIDTH });
                strip.group.api.setSize({ width: PAINT_TOOLS_STRIP_WIDTH, height: PAINT_TOOLS_FLOAT.height });
            }
        }
        const painter = this.api.getPanel(TILE_PAINTER_PANEL_ID);
        if (painter?.api.location.type === "grid") applyTilePainterDrawer(painter.group);
        const brush = this.api.getPanel(BRUSH_PANEL_ID);
        if (brush) {
            if (brush.api.location.type === "grid") pinGroup(brush.group, { height: BRUSH_BAR_HEIGHT, hideHeader: true });
            brush.api.setTitle(brush.api.location.type === "grid" ? "Brush" : "Brush workspace");
        }
    }

    private addBrushBar(): void {
        // The brush bar is the very bottom row: under the Tile painter drawer when that is docked, else under the viewport.
        const painter = this.api.getPanel(TILE_PAINTER_PANEL_ID);
        this.api.addPanel({
            id: BRUSH_PANEL_ID,
            component: "brushWorkspace",
            title: "Brush",
            position: { referencePanel: painter?.api.location.type === "grid" ? TILE_PAINTER_PANEL_ID : SCENE_PANEL_ID, direction: "below" },
            initialHeight: BRUSH_BAR_HEIGHT,
            minimumHeight: BRUSH_BAR_HEIGHT,
            maximumHeight: BRUSH_BAR_HEIGHT,
        });
        this.pinDockedChrome();
    }

    private addPaintToolsStrip(placement: "docked" | "floating"): void {
        if (placement === "docked") {
            this.api.addPanel({
                id: PAINT_TOOLS_PANEL_ID,
                component: "paintTools",
                title: "Tools",
                position: { referencePanel: SCENE_PANEL_ID, direction: "left" },
                initialWidth: PAINT_TOOLS_STRIP_WIDTH,
                minimumWidth: PAINT_TOOLS_STRIP_WIDTH,
                maximumWidth: PAINT_TOOLS_STRIP_WIDTH,
            });
            this.pinDockedChrome();
            return;
        }
        this.api.addPanel({
            id: PAINT_TOOLS_PANEL_ID,
            component: "paintTools",
            title: "Tools",
            floating: { ...PAINT_TOOLS_FLOAT },
        });
        this.pinDockedChrome();
    }

    // ── enable flags ─────────────────────────────────────────
    /** Whether a floatable panel's owning plugin is switched on. */
    private isPanelEnabled(panelId: string): boolean {
        const host = this.host;
        for (const [tool, id] of Object.entries(EDITOR_TOOL_DOCK_PANEL)) {
            if (id === panelId) return host.isEditorToolPluginEnabled(tool as Parameters<typeof host.isEditorToolPluginEnabled>[0]);
        }
        if (panelId === "editor-history") return host.isWorkbenchUiPluginEnabled("history");
        if (panelId === "editor-minimap") return host.isWorkbenchUiPluginEnabled("minimap");
        return true;
    }

    private computeEnabledSignature(): string {
        const ids = [...MAP_EDITOR_FLOATABLE_DOCK_PANELS.map((row) => row.panelId), PAINT_TOOLS_PANEL_ID, BRUSH_PANEL_ID];
        return ids.map((id) => `${id}:${this.isPanelEnabledIncludingChrome(id) ? 1 : 0}`).join("|");
    }

    private isPanelEnabledIncludingChrome(panelId: string): boolean {
        if (panelId === PAINT_TOOLS_PANEL_ID) return this.host.isWorkbenchUiPluginEnabled("paint_tools_strip");
        if (panelId === BRUSH_PANEL_ID) return this.host.isWorkbenchUiPluginEnabled("brush_workspace");
        return this.isPanelEnabled(panelId);
    }

    /**
     * Call when workbench state changes. Closes panels whose plugin was turned off and reopens panels whose
     * plugin was turned on. Panels the user closed by hand stay closed (the React version re-added them).
     */
    syncWithPluginState(): void {
        const signature = this.computeEnabledSignature();
        if (signature === this.enabledSignature) return;
        const before = new Map(this.enabledSignature.split("|").map((part) => part.split(":") as [string, string]));
        this.enabledSignature = signature;

        const ids = [...MAP_EDITOR_FLOATABLE_DOCK_PANELS.map((row) => row.panelId), PAINT_TOOLS_PANEL_ID, BRUSH_PANEL_ID];
        for (const id of ids) {
            const wasOn = before.get(id) === "1";
            const isOn = this.isPanelEnabledIncludingChrome(id);
            if (isOn && !wasOn && !this.api.getPanel(id)) this.openPanel(id);
            if (!isOn && this.api.getPanel(id)) this.closeRemembering(id);
        }
        this.refreshLocations();
    }

    /** Selecting a tool brings its palette tabs forward. */
    activateTool(tool: Parameters<typeof activateEditorToolWorkspaces>[2]): void {
        activateEditorToolWorkspaces(this.api, this.host, tool);
        this.orderPaletteTabs(tool);
    }

    /**
     * Keeps the selected tool's palette tab on screen. With seven tabs in a 380px column the later ones fall into the
     * overflow menu, so a tool whose tab is past the first few is moved to the front of its group.
     */
    private orderPaletteTabs(tool: Parameters<typeof activateEditorToolWorkspaces>[2]): void {
        const activeId = EDITOR_TOOL_DOCK_PANEL[tool];
        const active = activeId ? this.api.getPanel(activeId) : undefined;
        if (!active || active.api.location.type !== "grid") return;
        const group = active.group;
        if (group.panels.indexOf(active) >= VISIBLE_PALETTE_TABS) {
            active.api.moveTo({ group, index: 0 });
            active.api.setActive();
        }
    }

    // ── placement ────────────────────────────────────────────
    private refreshLocations(): void {
        const next: Record<string, PanelLocation> = {};
        for (const panel of this.api.panels) next[panel.id] = panel.api.location.type as PanelLocation;
        const same =
            Object.keys(next).length === Object.keys(this.locations).length &&
            Object.entries(next).every(([id, location]) => this.locations[id] === location);
        if (!same) {
            this.locations = next;
            // A panel that just moved between the grid and a floating/popout group needs its chrome re-applied.
            this.pinDockedChrome();
        }
    }

    locationOf(panelId: string): PanelLocation | undefined {
        return this.locations[panelId];
    }

    /** Opens (or activates) a panel at its default docked/floating position. */
    openPanel(panelId: string): void {
        const existing = this.api.getPanel(panelId);
        if (existing) {
            existing.api.setActive();
            return;
        }
        if (panelId === PAINT_TOOLS_PANEL_ID) {
            this.addPaintToolsStrip("floating");
        } else if (panelId === BRUSH_PANEL_ID) {
            this.addBrushBar();
        } else {
            this.restoreDocked(panelId);
        }
        this.refreshLocations();
    }

    /** Re-adds a palette panel where it last sat in the grid, or at its default position. */
    private restoreDocked(panelId: string): void {
        const defaults = getMapEditorFloatableDockPanelDefaults(panelId as MapEditorDockPanelId);
        if (!defaults) return;
        addMapEditorDockPanelRestoredOrDefault(this.api, panelId, defaults, this.host);
    }

    dockPanel(panelId: string): void {
        const panel = this.api.getPanel(panelId);
        if (!panel || panel.api.location.type === "grid") return;
        panel.api.close();
        if (panelId === PAINT_TOOLS_PANEL_ID) this.addPaintToolsStrip("docked");
        else if (panelId === BRUSH_PANEL_ID) this.addBrushBar();
        else this.restoreDocked(panelId);
        this.refreshLocations();
    }

    floatFromDock(panelId: string): void {
        const panel = this.api.getPanel(panelId);
        if (!panel || panel.api.location.type === "floating") return;
        if (panel.api.location.type === "grid") {
            // Remember the grid position so "Dock" can put it back.
            const stash = extractDockPanelRestoreOptions(this.api.toJSON(), panelId);
            if (stash) this.host.saveDockPanelRestore(panelId, stash as AddPanelOptions);
        } else {
            // Popouts cannot move straight to a floating group; recreate it.
            panel.api.close();
            this.openPanelFloating(panelId);
            return;
        }
        const size = MAP_EDITOR_FLOATABLE_DOCK_PANELS.find((row) => row.panelId === panelId);
        const rect =
            panelId === PAINT_TOOLS_PANEL_ID
                ? PAINT_TOOLS_FLOAT
                : panelId === BRUSH_PANEL_ID
                  ? BRUSH_FLOAT
                  : { x: 16, y: 48, width: size?.defaultWidth ?? 380, height: size?.defaultHeight ?? 480 };
        floatPanel(this.api, panelId, rect);
        this.refreshLocations();
    }

    private openPanelFloating(panelId: string): void {
        if (panelId === PAINT_TOOLS_PANEL_ID) {
            this.addPaintToolsStrip("floating");
            return;
        }
        this.restoreDocked(panelId);
        this.floatFromDock(panelId);
    }

    async popOut(panelId: string): Promise<void> {
        const panel = this.api.getPanel(panelId);
        if (!panel || panel.api.location.type === "popout") return;
        if (panel.api.location.type === "grid") {
            const stash = extractDockPanelRestoreOptions(this.api.toJSON(), panelId);
            if (stash) this.host.saveDockPanelRestore(panelId, stash as AddPanelOptions);
        }
        const config = MAP_EDITOR_FLOATABLE_DOCK_PANELS.find((row) => row.panelId === panelId);
        const width = config?.defaultWidth ?? (panelId === BRUSH_PANEL_ID ? 300 : 380);
        const height = config?.defaultHeight ?? (panelId === BRUSH_PANEL_ID ? 420 : 520);
        await popoutPanel(this.api, panelId, { left: 120, top: 120, width, height });
        this.refreshLocations();
    }

    closePanel(panelId: string): void {
        this.api.getPanel(panelId)?.api.close();
    }

    /** Closes a panel, remembering its grid position so re-enabling the plugin puts it back. */
    private closeRemembering(panelId: string): void {
        const panel = this.api.getPanel(panelId);
        if (!panel) return;
        const stash = extractDockPanelRestoreOptions(this.api.toJSON(), panelId);
        if (stash) this.host.saveDockPanelRestore(panelId, stash as AddPanelOptions);
        panel.api.close();
    }

    // ── menus ────────────────────────────────────────────────
    /** Right-click menu for a panel's tab or body. Empty for panels without placement options (the scene). */
    menuFor(panelId: string): ContextMenuItem[] {
        const isChrome = panelId === PAINT_TOOLS_PANEL_ID || panelId === BRUSH_PANEL_ID;
        const isFloatable = MAP_EDITOR_FLOATABLE_DOCK_PANELS.some((row) => row.panelId === panelId);
        if (!isChrome && !isFloatable) return [];

        const location = this.locationOf(panelId) ?? "grid";
        const canExternal = !isTauriRuntime() && (isChrome ? panelId === BRUSH_PANEL_ID : MAP_EDITOR_FLOATABLE_DOCK_PANELS.find((row) => row.panelId === panelId)?.canExternal !== false);
        const dockLabel = panelId === PAINT_TOOLS_PANEL_ID ? "Dock to left" : panelId === BRUSH_PANEL_ID ? "Dock to bottom" : "Dock to panel";

        const items: ContextMenuItem[] = [
            { id: "dock", label: dockLabel, disabled: location === "grid", onSelect: () => this.dockPanel(panelId) },
            { id: "float", label: "Float over workbench", disabled: location === "floating", onSelect: () => this.floatFromDock(panelId) },
        ];
        if (canExternal) {
            items.push({ id: "external", label: "Open external window", disabled: location === "popout", onSelect: () => void this.popOut(panelId) });
        }
        if (panelId === PAINT_TOOLS_PANEL_ID && location !== "grid") {
            const model = getPaintToolsStripModel(this.host);
            items.push({
                id: "orientation",
                label: model.orientation === "vertical" ? "Horizontal layout" : "Vertical layout",
                onSelect: () => model.toggleOrientation(),
            });
        }
        return items;
    }

    /** Panels the "View → Reopen panel" menu offers. */
    reopenablePanels(): { id: string; title: string; open: boolean }[] {
        const ids = [SCENE_PANEL_ID, ...MAP_EDITOR_FLOATABLE_DOCK_PANELS.map((row) => row.panelId), BRUSH_PANEL_ID, PAINT_TOOLS_PANEL_ID];
        return ids
            .filter((id) => id === SCENE_PANEL_ID || this.isPanelEnabledIncludingChrome(id))
            .map((id) => ({ id, title: id === SCENE_PANEL_ID ? "Editor (3D)" : panelTitle(id), open: this.api.getPanel(id) !== undefined }));
    }

    restoreAllPanels(): void {
        for (const { id, open } of this.reopenablePanels()) {
            if (!open) this.openPanel(id);
        }
        this.pinDockedChrome();
    }

    resetLayout(): void {
        this.host.clearDockPanelRestore();
        this.dock.resetLayout();
    }
}
