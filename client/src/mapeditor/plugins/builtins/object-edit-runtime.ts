import { getMapSquareId } from "../../../rs/map/MapFileIndex";
import type { LocType } from "../../../rs/config/loctype/LocType";
import { LocModelType } from "../../../rs/config/loctype/LocModelType";
import { Scene } from "../../../rs/scene/Scene";
import type { EditorMapSquare } from "../../webgl/EditorMapSquare";
import { applySceneTileLocEntry, removeLocFromScene, type SceneTileLocData } from "../../webgl/sceneLocData";
import type { EditorObjectRef } from "../../webgl/sceneLocPicker";
import type { WebGLMapEditorRenderer } from "../../webgl/WebGLMapEditorRenderer";
import { recordEditObjectMutation, snapshotObjectEntriesForBounds } from "../../map-editor-object-history";
import type { IEditorPluginHost } from "../editor-plugin-host";
import { markChunks, newTagForTile } from "./object-copy-placement";
import { findLocForRef, syncMapObjectPickIndex, worldTileToSceneTile } from "./object-transform-runtime";

/**
 * Putting objects on the map from an object type id: used by Place (a new object where you click) and Replace (swap
 * the selected object for another type, keeping its tile and rotation). Both use the same footprint maths, so the ghost
 * the renderer draws is exactly what gets placed.
 */
export type LocFootprint = { minX: number; minY: number; maxX: number; maxY: number };

export type LocPlacementPreview = {
    ref: EditorObjectRef;
    /** Scene-space tiles the object covers. */
    bounds: LocFootprint;
    /** False when part of the footprint is outside the map square being edited. */
    valid: boolean;
    map: EditorMapSquare;
};

/** Whether an object type can be stood on the ground as a normal object (not a wall or roof piece, not model-less). */
export function canPlaceAsNormalObject(locType: LocType): boolean {
    if (!locType.models || locType.models.length === 0) return false;
    return !locType.types || locType.types.length === 0 || locType.types.includes(LocModelType.NORMAL);
}

/** Why a type cannot be placed (shown in the catalog), or undefined when it can. */
export function placementProblem(locType: LocType): string | undefined {
    if (!locType.models || locType.models.length === 0) return "No model (it morphs into another object)";
    if (locType.types && locType.types.length > 0 && !locType.types.includes(LocModelType.NORMAL)) return "Wall or roof piece (not placeable yet)";
    return undefined;
}

/** Where an object of `locTypeId` would stand with its start tile at the world tile, and whether that fits. */
export function previewLocPlacement(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    locTypeId: number,
    rotation: number,
    level: number,
    worldX: number,
    worldY: number,
): LocPlacementPreview | undefined {
    const mapX = Math.floor(worldX / 64);
    const mapY = Math.floor(worldY / 64);
    const map = renderer.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
    if (!map) return undefined;
    let locType: LocType;
    try {
        locType = host.locTypeLoader.load(locTypeId);
    } catch {
        return undefined;
    }
    const rot = rotation & 3;
    const sizeX = (rot & 1) === 1 ? locType.sizeY : locType.sizeX;
    const sizeY = (rot & 1) === 1 ? locType.sizeX : locType.sizeY;
    const { sceneX, sceneY } = worldTileToSceneTile(worldX, worldY, map);
    const bounds: LocFootprint = { minX: sceneX, minY: sceneY, maxX: sceneX + sizeX - 1, maxY: sceneY + sizeY - 1 };
    const min = map.borderSize;
    const max = map.borderSize + Scene.MAP_SQUARE_SIZE - 1;
    const valid = bounds.minX >= min && bounds.minY >= min && bounds.maxX <= max && bounds.maxY <= max;
    const heights = map.scene.tileHeights[level];
    if (!heights?.[bounds.minX] || !heights[bounds.maxX]) return undefined;
    const height = (heights[bounds.maxX][bounds.maxY] + heights[bounds.minX][bounds.maxY] + heights[bounds.minX][bounds.minY] + heights[bounds.maxX][bounds.minY]) >> 2;
    const ref: EditorObjectRef = {
        mapId: getMapSquareId(mapX, mapY),
        mapX,
        mapY,
        level,
        anchorTileX: sceneX,
        anchorTileY: sceneY,
        locTag: newTagForTile(sceneX, sceneY, locTypeId, locType),
        locTypeId,
        locModelType: LocModelType.NORMAL,
        rotation: rot,
        kind: "loc",
        sceneX: bounds.minX * 128 + (sizeX << 6),
        sceneY: height,
        sceneZ: bounds.minY * 128 + (sizeY << 6),
    };
    return { ref, bounds, valid, map };
}

function entryForPreview(host: IEditorPluginHost, preview: LocPlacementPreview): SceneTileLocData {
    const { ref, bounds } = preview;
    const locType = host.locTypeLoader.load(ref.locTypeId);
    const flags = LocModelType.NORMAL | (ref.rotation << 6);
    return {
        level: ref.level,
        tileX: bounds.minX,
        tileY: bounds.minY,
        loc: {
            tag: ref.locTag,
            flags,
            level: ref.level,
            x: ref.sceneX,
            y: ref.sceneZ,
            height: ref.sceneY,
            rotation: ref.rotation,
            startX: bounds.minX,
            startY: bounds.minY,
            endX: bounds.maxX,
            endY: bounds.maxY,
            entity: {
                id: ref.locTypeId,
                type: LocModelType.NORMAL,
                rotation: ref.rotation,
                level: ref.level,
                tileX: bounds.minX,
                tileY: bounds.minY,
                seqId: locType.seqId,
                seqRandomStart: locType.seqRandomStart,
            },
        },
    };
}

function afterPlace(map: EditorMapSquare, renderer: WebGLMapEditorRenderer, bounds: LocFootprint): void {
    const mapId = getMapSquareId(map.mapX, map.mapY);
    syncMapObjectPickIndex(map, mapId);
    markChunks(map, mapId, renderer, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
}

/** Places a new object; returns its ref (picked back from the scene), or undefined when it did not fit. */
export function placeLocType(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    preview: LocPlacementPreview,
): EditorObjectRef | undefined {
    if (!preview.valid) return undefined;
    const { map, bounds, ref } = preview;
    const ok = recordEditObjectMutation(
        host,
        map,
        ref.level,
        "Place object",
        () => snapshotObjectEntriesForBounds(map, ref.level, bounds),
        () => {
            if (!applySceneTileLocEntry(map.scene, entryForPreview(host, preview))) return false;
            afterPlace(map, renderer, bounds);
            return true;
        },
        () => snapshotObjectEntriesForBounds(map, ref.level, bounds),
    );
    return ok ? ref : undefined;
}

/**
 * Swaps the selected object for another type on the same start tile with the same rotation, as one undo step.
 * Only placed objects ("loc" kind) can be replaced; walls and decorations keep their own kind.
 */
export function replaceObject(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    target: EditorObjectRef,
    newLocTypeId: number,
): EditorObjectRef | undefined {
    if (target.kind !== "loc") return undefined;
    const map =
        (renderer.mapManager.getMap(target.mapX, target.mapY) as EditorMapSquare | undefined) ??
        (renderer.mapManager.getMapById(target.mapId) as EditorMapSquare | undefined);
    if (!map) return undefined;
    const old = findLocForRef(map, target);
    if (!old) return undefined;
    const worldX = map.mapX * 64 + (old.startX - map.borderSize);
    const worldY = map.mapY * 64 + (old.startY - map.borderSize);
    const preview = previewLocPlacement(host, renderer, newLocTypeId, target.rotation, target.level, worldX, worldY);
    if (!preview?.valid) return undefined;
    const covered: LocFootprint = {
        minX: Math.min(old.startX, preview.bounds.minX),
        minY: Math.min(old.startY, preview.bounds.minY),
        maxX: Math.max(old.endX, preview.bounds.maxX),
        maxY: Math.max(old.endY, preview.bounds.maxY),
    };
    const ok = recordEditObjectMutation(
        host,
        map,
        target.level,
        "Replace object",
        () => snapshotObjectEntriesForBounds(map, target.level, covered),
        () => {
            removeLocFromScene(map.scene, old);
            if (!applySceneTileLocEntry(map.scene, entryForPreview(host, preview))) return false;
            afterPlace(map, renderer, covered);
            return true;
        },
        () => snapshotObjectEntriesForBounds(map, target.level, covered),
    );
    return ok ? preview.ref : undefined;
}
