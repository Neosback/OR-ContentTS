import type { Component } from "svelte";

import { sveltePanel, type PanelContext, type StudioPanel } from "../lib/panel";
import { editorContext, type EditorState } from "./editor-state.svelte";
import BrushWorkspaceDockPanel from "./panels/BrushWorkspaceDockPanel.svelte";
import HistoryPanel from "./panels/HistoryPanel.svelte";
import MinimapPanel from "./panels/MinimapPanel.svelte";
import PaintToolsPanel from "./panels/PaintToolsPanel.svelte";
import PaletteHost from "./panels/PaletteHost.svelte";
import PanelRoot from "./panels/PanelRoot.svelte";
import ScenePanel from "./panels/ScenePanel.svelte";
import HeightPalette from "./palettes/HeightPalette.svelte";
import ObjectDeletePalette from "./palettes/ObjectDeletePalette.svelte";
import ObjectSelectorPalette from "./palettes/ObjectSelectorPalette.svelte";
import OverlayPalette from "./palettes/OverlayPalette.svelte";
import RegionStampPalette from "./palettes/RegionStampPalette.svelte";
import TileFlagsPalette from "./palettes/TileFlagsPalette.svelte";
import UnderlayPalette from "./palettes/UnderlayPalette.svelte";

/** Palette component per dockview component name (the names `getMapEditorFloatableDockPanelDefaults` uses). */
const PALETTES: Record<string, { title: string; component: Component }> = {
    palette: { title: "Underlays", component: UnderlayPalette },
    overlayPalette: { title: "Overlays", component: OverlayPalette },
    heightPalette: { title: "Height", component: HeightPalette },
    objectSelectorPalette: { title: "Objects", component: ObjectSelectorPalette },
    objectDeletePalette: { title: "Delete objects", component: ObjectDeletePalette },
    regionStampPalette: { title: "Region stamp", component: RegionStampPalette },
    tileFlagsPalette: { title: "Tile flags", component: TileFlagsPalette },
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
        panel("historyWorkspace", "History", HistoryPanel),
        panel("minimapWorkspace", "Minimap", MinimapPanel),
    ];
    for (const [id, { title, component }] of Object.entries(PALETTES)) {
        panels.push(panel(id, title, PaletteHost, { props: () => ({ palette: component }) }));
    }
    return panels;
}

