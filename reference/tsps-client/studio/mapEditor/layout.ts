import type { StudioDock } from "../workspace/dock";
import { sveltePanel, type StudioPanel } from "../workspace/panel";
import InspectorPanel from "./InspectorPanel.svelte";
import LayersPanel from "./LayersPanel.svelte";
import PaintPanel from "./PaintPanel.svelte";
import { scenePanel } from "./scenePanel";
import SearchPanel from "./SearchPanel.svelte";

/** Bump when panel ids or the default arrangement change so old saved layouts are discarded. */
export const MAP_EDITOR_LAYOUT_KEY = "studio.layout.map-editor.v2";

export const inspectorPanel = sveltePanel({ id: "inspector", title: "Inspector", component: InspectorPanel });
export const searchPanel = sveltePanel({ id: "search", title: "Search", component: SearchPanel });
export const paintPanel = sveltePanel({ id: "paint", title: "Paint", component: PaintPanel });
export const layersPanel = sveltePanel({ id: "layers", title: "Layers", component: LayersPanel });

export const mapEditorPanels: readonly StudioPanel[] = [scenePanel, inspectorPanel, searchPanel, paintPanel, layersPanel];

/** Side panels, in header order. Each belongs to the upper or lower group of the side column. */
const SIDE_PANELS: readonly { panel: StudioPanel; group: "upper" | "lower" }[] = [
    { panel: inspectorPanel, group: "upper" },
    { panel: searchPanel, group: "lower" },
    { panel: paintPanel, group: "lower" },
    { panel: layersPanel, group: "lower" },
];

export const sidePanels: readonly StudioPanel[] = SIDE_PANELS.map((entry) => entry.panel);

const SIDE_WIDTH = 320;
/** On narrow windows the scene keeps most of the room. */
const SIDE_MAX_FRACTION = 0.35;

function openIn(dock: StudioDock, group: "upper" | "lower"): string | undefined {
    return SIDE_PANELS.find((entry) => entry.group === group && dock.isOpen(entry.panel.id))?.panel.id;
}

/**
 * Opens (or focuses) a side panel where it belongs: as a tab next to its
 * group siblings, above/below the other group, or as a new column right of the scene.
 */
export function openSidePanel(dock: StudioDock, id: string): boolean {
    const entry = SIDE_PANELS.find((candidate) => candidate.panel.id === id);
    if (!entry) return false;
    if (dock.isOpen(id)) {
        dock.open(id);
        return true;
    }
    const sibling = openIn(dock, entry.group);
    const other = openIn(dock, entry.group === "upper" ? "lower" : "upper");
    if (sibling) {
        dock.open(id, { referencePanel: sibling, direction: "within" });
    } else if (other) {
        dock.open(id, { referencePanel: other, direction: entry.group === "upper" ? "above" : "below" });
    } else {
        const width = Math.min(SIDE_WIDTH, Math.round(dock.api.width * SIDE_MAX_FRACTION));
        dock.open(id, { referencePanel: scenePanel.id, direction: "right" }, { width });
    }
    return true;
}

export function buildDefaultMapEditorLayout(dock: StudioDock): void {
    dock.open(scenePanel.id);
    for (const panel of [inspectorPanel, layersPanel, paintPanel, searchPanel]) openSidePanel(dock, panel.id);
}
