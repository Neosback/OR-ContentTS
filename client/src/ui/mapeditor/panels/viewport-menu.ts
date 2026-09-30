import type { ContextMenuItem } from "../../components/context-menu/context-menu.svelte";
import type { ObjectInspectInfo, ViewportHoverInspectInfo } from "../../../mapeditor/viewportInspect";

function copyJson(value: unknown): void {
    void navigator.clipboard.writeText(JSON.stringify(value, null, 2)).catch((error) => {
        console.warn("[map-editor] clipboard write failed", error);
    });
}

function objectLabel(o: ObjectInspectInfo, level: number): string {
    return `Copy ${o.name || "object"} (${o.id}) · ${o.shapeName.toLowerCase()} · plane ${level}`;
}

/** Items for the right-click "Copy …" menu over the 3D view, built from the tile captured when the menu opened. */
export function buildViewportMenuItems(info: ViewportHoverInspectInfo | undefined): ContextMenuItem[] {
    if (!info) return [{ id: "none", label: "No tile under cursor", disabled: true, onSelect: () => {} }];

    const { world, region } = info;
    const visiblePlanes = info.planes.filter((plane) => plane.visible);
    const items: ContextMenuItem[] = [];

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
