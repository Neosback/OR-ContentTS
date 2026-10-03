import { getMapSquareId } from "../../../rs/map/MapFileIndex";
import type { IEditorPluginHost } from "../editor-plugin-host";
import type { EditorMapSquare } from "../../webgl/EditorMapSquare";
import { getObjectChunkIdsForTileRect } from "../../webgl/objectChunk";
import {
    removeLocFromScene,
    type SceneTileLocData,
} from "../../webgl/sceneLocData";
import { markObjectChunksForHeightEdit } from "../../webgl/scene-loc-height-sync";
import {
    recordEditObjectMutation,
    snapshotObjectEntriesForRef,
} from "../../map-editor-object-history";
import type { EditorObjectRef } from "../../webgl/sceneLocPicker";
import type { WebGLMapEditorRenderer } from "../../webgl/WebGLMapEditorRenderer";
import {
    editorObjectRefKey,
} from "../../webgl/sceneLocPicker";
import {
    findLocForRef,
    syncMapObjectPickIndex,
} from "./object-transform-runtime";

function markObjectChunksForRef(map: EditorMapSquare, ref: EditorObjectRef): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
} {
    if (ref.kind === "loc") {
        const loc = findLocForRef(map, ref);
        if (loc) {
            return {
                minX: loc.startX,
                minY: loc.startY,
                maxX: loc.endX,
                maxY: loc.endY,
            };
        }
    }
    return {
        minX: ref.anchorTileX,
        minY: ref.anchorTileY,
        maxX: ref.anchorTileX,
        maxY: ref.anchorTileY,
    };
}

function tileEntryForRef(map: EditorMapSquare, ref: EditorObjectRef): SceneTileLocData | undefined {
    const entries = snapshotObjectEntriesForRef(map, ref);
    return entries[0];
}

function deleteObjectRefCore(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    map: EditorMapSquare,
    ref: EditorObjectRef,
): boolean {
    if (ref.kind === "loc") {
        const loc = findLocForRef(map, ref);
        if (!loc) {
            return false;
        }
        removeLocFromScene(map.scene, loc);
    } else {
        const entry = tileEntryForRef(map, ref);
        if (!entry) {
            return false;
        }
        const tile = map.scene.tiles[entry.level]?.[entry.tileX]?.[entry.tileY];
        if (!tile) {
            return false;
        }
        if (entry.wall) {
            tile.wall = undefined;
        } else if (entry.floorDecoration) {
            tile.floorDecoration = undefined;
        } else if (entry.wallDecoration) {
            tile.wallDecoration = undefined;
        } else {
            return false;
        }
    }

    const mapId = getMapSquareId(map.mapX, map.mapY);
    syncMapObjectPickIndex(map, mapId);

    const bounds = markObjectChunksForRef(map, ref);
    const localMinX = Math.max(0, bounds.minX - map.borderSize);
    const localMinY = Math.max(0, bounds.minY - map.borderSize);
    const localMaxX = Math.min(63, bounds.maxX - map.borderSize);
    const localMaxY = Math.min(63, bounds.maxY - map.borderSize);
    map.markObjectChunksDirty(localMinX, localMinY, localMaxX, localMaxY);
    markObjectChunksForHeightEdit(map, getObjectChunkIdsForTileRect(localMinX, localMinY, localMaxX, localMaxY));
    renderer.scheduleObjectChunkReload(mapId, map.dirtyObjectChunks);

    if (editorObjectRefKey(host.selectedObject, ref)) {
        host.clearSelectedObject();
    }
    if (editorObjectRefKey(host.getObjectCopyTemplate(), ref)) {
        host.cancelObjectCopyPlacement();
    }
    if (editorObjectRefKey(host.hoveredObject, ref)) {
        host.setHoveredObject(undefined);
    }

    return true;
}

export function deleteObjectRef(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    ref: EditorObjectRef,
): boolean {
    const map =
        (renderer.mapManager.getMap(ref.mapX, ref.mapY) as EditorMapSquare | undefined) ??
        (renderer.mapManager.getMapById(ref.mapId) as EditorMapSquare | undefined);
    if (!map) {
        return false;
    }

    return recordEditObjectMutation(
        host,
        map,
        ref.level,
        "Delete object",
        () => snapshotObjectEntriesForRef(map, ref),
        () => deleteObjectRefCore(host, renderer, map, ref),
        () => [],
        "object-delete",
    );
}

/**
 * Deletes several objects as one undo step per map square and plane (an area delete is a single "Ctrl+Z").
 * Returns how many were removed.
 */
export function deleteObjectRefs(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    refs: readonly EditorObjectRef[],
): number {
    const groups = new Map<string, { map: EditorMapSquare; level: number; refs: EditorObjectRef[] }>();
    for (const ref of refs) {
        const map =
            (renderer.mapManager.getMap(ref.mapX, ref.mapY) as EditorMapSquare | undefined) ??
            (renderer.mapManager.getMapById(ref.mapId) as EditorMapSquare | undefined);
        if (!map) continue;
        const key = `${ref.mapId}:${ref.level}`;
        const group = groups.get(key) ?? { map, level: ref.level, refs: [] };
        group.refs.push(ref);
        groups.set(key, group);
    }
    let removed = 0;
    for (const { map, level, refs: group } of groups.values()) {
        let count = 0;
        recordEditObjectMutation(
            host,
            map,
            level,
            group.length === 1 ? "Delete object" : `Delete ${group.length} objects`,
            () => {
                // Two refs on one tile can return the same stored entry: keep each once so undo restores it once.
                const unique = new Map<string, ReturnType<typeof snapshotObjectEntriesForRef>[number]>();
                for (const ref of group) for (const entry of snapshotObjectEntriesForRef(map, ref)) unique.set(JSON.stringify(entry), entry);
                return [...unique.values()];
            },
            () => {
                count = 0;
                for (const ref of group) if (deleteObjectRefCore(host, renderer, map, ref)) count++;
                return count > 0;
            },
            () => [],
            "object-delete",
        );
        removed += count;
    }
    return removed;
}
