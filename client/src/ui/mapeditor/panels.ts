import type { Component } from "svelte";

import { sveltePanel, type PanelContext, type StudioPanel } from "../lib/panel";
import { editorContext, type EditorState } from "./editor-state.svelte";
import BrushWorkspaceDockPanel from "./panels/BrushWorkspaceDockPanel.svelte";
import HistoryPanel from "./panels/HistoryPanel.svelte";
import InspectorPanel from "./panels/InspectorPanel.svelte";
import MinimapPanel from "./panels/MinimapPanel.svelte";
import PaintToolsPanel from "./panels/PaintToolsPanel.svelte";
import PaletteHost from "./panels/PaletteHost.svelte";
import PanelRoot from "./panels/PanelRoot.svelte";
import ScenePanel from "./panels/ScenePanel.svelte";
import TilePainterPanel from "./panels/TilePainterPanel.svelte";
import ObjectDeletePalette from "./palettes/ObjectDeletePalette.svelte";
import RegionStampPalette from "./palettes/RegionStampPalette.svelte";

/** Palette component per dockview component name (the names `getMapEditorFloatableDockPanelDefaults` uses). */
const PALETTES: Record<string, { title: string; component: Component }> = {
    objectSelectorPalette: { title: "Inspector", component: InspectorPanel },
    objectDeletePalette: { title: "Delete objects", component: ObjectDeletePalette },
    regionStampPalette: { title: "Region stamp", component: RegionStampPalette },
};

/** Every dockview component the editor workbench can host. Panels mount outside the app tree, so each gets the editor state as context. */
export function createEditorPanels(state: EditorState): StudioPanel[] {
    const context = () => editorContext(state);

    /** A dock panel whose component is wrapped in the shared provider root. */
    const panel = (
        id: string,
        title: string,
        component: Component<any>,
        options: { props?: (ctx: PanelContext) => Record<string, unknown>; keepAlive?: boolean; fixed?: boolean } = {},
    ): StudioPanel =>
        sveltePanel({
            id,
            title,
            component: PanelRoot,
            props: (ctx) => ({ component, props: options.props?.(ctx) ?? {} }),
            keepAlive: options.keepAlive,
            fixed: options.fixed,
            context,
        });

    const panels: StudioPanel[] = [
        panel("sceneEditor", "Editor", ScenePanel, { keepAlive: true, fixed: true }),
        panel("paintTools", "Tools", PaintToolsPanel, { props: (ctx) => ({ api: ctx.api }) }),
        panel("brushWorkspace", "Brush", BrushWorkspaceDockPanel),
        panel("tilePainter", "Tile painter", TilePainterPanel, { props: (ctx) => ({ api: ctx.api }) }),
        panel("historyWorkspace", "History", HistoryPanel),
        panel("minimapWorkspace", "Minimap", MinimapPanel),
    ];
    for (const [id, { title, component }] of Object.entries(PALETTES)) {
        panels.push(panel(id, title, PaletteHost, { props: () => ({ palette: component }) }));
    }
    return panels;
}

