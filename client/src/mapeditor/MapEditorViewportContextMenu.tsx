import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react";

import { useMapEditorPanelContextMenu, type MapEditorPanelContextMenuItem } from "./MapEditorPanelContextMenu";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";
import type { ObjectInspectInfo, ViewportHoverInspectInfo } from "./viewportInspect";

function copyJson(value: unknown): void {
    void navigator.clipboard.writeText(JSON.stringify(value, null, 2)).catch((err) => {
        console.warn("[map-editor] clipboard write failed", err);
    });
}

function objectLabel(o: ObjectInspectInfo, level: number): string {
    return `Copy ${o.name || "object"} (${o.id}) · ${o.shapeName.toLowerCase()} · plane ${level}`;
}

function buildItems(info: ViewportHoverInspectInfo | undefined): MapEditorPanelContextMenuItem[] {
    if (!info) {
        return [{ id: "none", label: "No tile under cursor", disabled: true, onSelect: () => {} }];
    }
    const { world, region } = info;
    const visiblePlanes = info.planes.filter((p) => p.visible);
    const items: MapEditorPanelContextMenuItem[] = [];
    const hovered = info.hoveredObject;
    if (hovered) {
        const plane = info.planes[hovered.level];
        const match = plane?.objects.find((o) => o.id === hovered.locTypeId && o.kind === hovered.kind);
        items.push({
            id: "hovered",
            label: `Copy hovered: ${match?.name || "object"} (${hovered.locTypeId}) · plane ${hovered.level}`,
            onSelect: () => copyJson({ world, region, ref: hovered, object: match }),
        });
    }
    items.push(
        {
            id: "all",
            label: "Copy tile + objects (all planes)",
            onSelect: () => copyJson(info),
        },
        {
            id: "visible",
            label: "Copy tile + objects (drawn planes)",
            onSelect: () => copyJson({ ...info, planes: visiblePlanes }),
        },
    );
    for (const plane of visiblePlanes) {
        plane.objects.forEach((o, i) => {
            items.push({
                id: `obj-${plane.level}-${i}`,
                label: objectLabel(o, plane.level),
                onSelect: () => copyJson({ world, region, level: plane.level, object: o }),
            });
        });
    }
    items.push({
        id: "coords",
        label: `Copy coords ${world.x}, ${world.y} (region ${region.id})`,
        onSelect: () => void navigator.clipboard.writeText(`${world.x}, ${world.y}, region ${region.id}`),
    });
    return items;
}

/**
 * Right-click "Copy …" menu over the 3D view. The hovered tile is captured when the menu opens so
 * the copied data matches what was under the cursor, not wherever the mouse moves afterwards.
 */
export function useMapEditorViewportContextMenu(pluginHost: IEditorPluginHost): {
    onContextMenu: (event: ReactMouseEvent) => void;
    menuPortal: JSX.Element | null;
} {
    const snapshot = useRef<ViewportHoverInspectInfo | undefined>(undefined);
    const getItems = useCallback(() => buildItems(snapshot.current), []);
    const onClosed = useCallback(() => {
        pluginHost.contextMenuObject = undefined;
    }, [pluginHost]);
    const menu = useMapEditorPanelContextMenu("map-editor-viewport-menu", "Inspect", getItems, onClosed);

    const onContextMenu = useCallback(
        (event: ReactMouseEvent) => {
            event.preventDefault();
            if (!pluginHost.viewportContextMenuAllowed(event.altKey)) {
                return;
            }
            snapshot.current = pluginHost.inspectHoveredTile();
            pluginHost.contextMenuObject = snapshot.current?.hoveredObject;
            menu.onContextMenu(event);
        },
        [menu, pluginHost],
    );

    return { onContextMenu, menuPortal: menu.menuPortal };
}
