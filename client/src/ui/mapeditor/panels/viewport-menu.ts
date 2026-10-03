import type { ContextMenuItem } from "../../components/context-menu/context-menu.svelte";
import { executeEditorCommand, type EditorCommandId } from "../../../mapeditor/commands/editor-command-registry";
import { getObjectActionModel } from "../../../mapeditor/plugins/builtins/object-action-model";
import { getTileBrushModel } from "../../../mapeditor/plugins/builtins/tile-brush-model";
import type { IEditorPluginHost } from "../../../mapeditor/plugins/editor-plugin-host";
import type { ObjectInspectInfo, ViewportHoverInspectInfo } from "../../../mapeditor/viewportInspect";

function copyJson(value: unknown): void {
    void navigator.clipboard.writeText(JSON.stringify(value, null, 2)).catch((error) => {
        console.warn("[map-editor] clipboard write failed", error);
    });
}

function objectLabel(o: ObjectInspectInfo, level: number): string {
    return `Copy ${o.name || "object"} (${o.id}) · ${o.shapeName.toLowerCase()} · plane ${level}`;
}

/** Actions on what was under the cursor when the menu opened (the object, the tile), ahead of the copy items. */
function buildActionItems(host: IEditorPluginHost, info: ViewportHoverInspectInfo): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    const hovered = info.hoveredObject;
    if (hovered) {
        const pick = (): void => {
            host.setEditorTool("object-selector");
            host.setSelectedObject({ ...hovered });
        };
        const command = (id: EditorCommandId) => (): void => {
            pick();
            executeEditorCommand(id, { host });
        };
        items.push(
            { id: "act-select", label: "Select object", onSelect: pick },
            { id: "act-move", label: "Move object (G)", onSelect: command("object-selector.move-object") },
            { id: "act-rotate", label: "Rotate object (R)", onSelect: command("object-selector.rotate-selected") },
            { id: "act-copy", label: "Copy object placement (C)", onSelect: command("object-selector.copy-object") },
            { id: "act-delete", label: "Delete object (Del)", onSelect: command("object-selector.delete-selected") },
        );
    }
    items.push({
        id: "act-eyedropper",
        label: "Pick this tile into the Tile painter (I)",
        onSelect: () => {
            const tile = host.getTileInfo(host.selectedLevel, info.world.x, info.world.y);
            if (tile) getTileBrushModel(host).sendTile(tile);
        },
    });
    const candidate = getObjectActionModel(host).candidate;
    if (candidate !== undefined) {
        items.push({
            id: "act-place",
            label: `Place object #${candidate} here`,
            onSelect: () => getObjectActionModel(host).request({ type: "place-at", locTypeId: candidate, rotation: getObjectActionModel(host).placeRotation, worldX: info.world.x, worldY: info.world.y, level: host.getTilePickLevel() }),
        });
    }
    return items;
}

/** Items for the right-click menu over the 3D view, built from the tile captured when the menu opened. */
export function buildViewportMenuItems(info: ViewportHoverInspectInfo | undefined, host?: IEditorPluginHost): ContextMenuItem[] {
    if (!info) return [{ id: "none", label: "No tile under cursor", disabled: true, onSelect: () => {} }];

    const { world, region } = info;
    const visiblePlanes = info.planes.filter((plane) => plane.visible);
    const items: ContextMenuItem[] = host ? buildActionItems(host, info) : [];

    const hovered = info.hoveredObject;
    if (hovered) {
        const match = info.planes[hovered.level]?.objects.find((o) => o.id === hovered.locTypeId && o.kind === hovered.kind);
        items.push({
            id: "hovered",
            label: `Copy hovered: ${match?.name || "object"} (${hovered.locTypeId}) · plane ${hovered.level}`,
            onSelect: () => copyJson({ world, region, ref: hovered, object: match }),
        });
    }
    items.push(
        { id: "all", label: "Copy tile + objects (all planes)", onSelect: () => copyJson(info) },
        { id: "visible", label: "Copy tile + objects (drawn planes)", onSelect: () => copyJson({ ...info, planes: visiblePlanes }) },
    );
    for (const plane of visiblePlanes) {
        plane.objects.forEach((o, i) => {
            items.push({ id: `obj-${plane.level}-${i}`, label: objectLabel(o, plane.level), onSelect: () => copyJson({ world, region, level: plane.level, object: o }) });
        });
    }
    items.push({
        id: "coords",
        label: `Copy coords ${world.x}, ${world.y} (region ${region.id})`,
        onSelect: () => void navigator.clipboard.writeText(`${world.x}, ${world.y}, region ${region.id}`),
    });
    return items;
}
