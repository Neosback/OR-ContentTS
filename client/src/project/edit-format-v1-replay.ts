import { getMapSquareId } from "../rs/map/MapFileIndex";
import { LocLoadType } from "../rs/scene/SceneBuilder";
import { LocModelType } from "../rs/config/loctype/LocModelType";
import type { EditorMutation, EditorObjectMutation, EditorTransaction } from "../mapeditor/editor-transaction";
import { readTileFieldSnapshot } from "../mapeditor/map-editor-history-snapshot";
import { applyObjectSnapshotEntries } from "../mapeditor/map-editor-object-history";
import { syncMapObjectPickIndex } from "../mapeditor/plugins/builtins/object-transform-runtime";
import { markMapObjectChunks } from "../mapeditor/plugins/builtins/region-stamp-apply";
import type { IEditorPluginHost } from "../mapeditor/plugins/editor-plugin-host";
import type { EditorMapSquare } from "../mapeditor/webgl/EditorMapSquare";
import type { SceneTileLocData } from "../mapeditor/webgl/sceneLocData";
import { serializeSceneLocData } from "../mapeditor/webgl/sceneLocData";
import { WebGLMapEditorRenderer } from "../mapeditor/webgl/WebGLMapEditorRenderer";
import {
    decodeEditBatchV1,
    type EditBatchV1,
    type EditLocV1,
    type EditMutationV1,
    type EditObjectMutationV1,
    type EditTileMutationV1,
    type EditTransactionV1,
} from "./edit-format-v1";

export type EditReplayErrorCode =
    | "UNSUPPORTED_RENDERER"
    | "HISTORY_NOT_EMPTY"
    | "MISSING_MAPS"
    | "BASE_MISMATCH"
    | "OBJECT_APPLY_FAILED";

export class EditReplayError extends Error {
    constructor(
        readonly code: EditReplayErrorCode,
        message: string,
        readonly details: readonly string[] = [],
    ) {
        super(message);
        this.name = "EditReplayError";
    }
}

export type EditReplayMapRef = {
    mapX: number;
    mapY: number;
    mapId: number;
};

function mapRefKey(mapX: number, mapY: number): string {
    return `${mapX},${mapY}`;
}

export function collectEditReplayMapRefs(batch: EditBatchV1): EditReplayMapRef[] {
    const refs: EditReplayMapRef[] = [];
    const seen = new Set<string>();
    for (const transaction of batch.transactions) {
        for (const mutation of transaction.mutations) {
            const key = mapRefKey(mutation.mapX, mutation.mapY);
            if (seen.has(key)) continue;
            seen.add(key);
            refs.push({
                mapX: mutation.mapX,
                mapY: mutation.mapY,
                mapId: getMapSquareId(mutation.mapX, mutation.mapY),
            });
        }
    }
    return refs;
}

function arraysEqual(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
}

export function tileSnapshotMatchesExpected(
    current: ReturnType<typeof readTileFieldSnapshot>,
    expected: EditTileMutationV1["before"] | EditTileMutationV1["after"],
): boolean {
    for (const key of ["h", "u", "o", "s", "r", "f"] as const) {
        if (expected[key] !== undefined && current[key] !== expected[key]) {
            return false;
        }
    }
    if (expected.hl !== undefined && !arraysEqual(current.hl, expected.hl)) {
        return false;
    }
    return true;
}

function requireRenderer(host: IEditorPluginHost): WebGLMapEditorRenderer {
    if (!(host.renderer instanceof WebGLMapEditorRenderer)) {
        throw new EditReplayError(
            "UNSUPPORTED_RENDERER",
            "Project replay requires the WebGL map editor renderer.",
        );
    }
    return host.renderer;
}

function requireMap(
    renderer: WebGLMapEditorRenderer,
    mapX: number,
    mapY: number,
): EditorMapSquare {
    const map = renderer.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
    if (!map) {
        throw new EditReplayError(
            "MISSING_MAPS",
            `Map square ${mapX},${mapY} is not loaded.`,
            [mapRefKey(mapX, mapY)],
        );
    }
    return map;
}

function sceneCoords(map: EditorMapSquare, localX: number, localY: number): { sceneX: number; sceneY: number } {
    return {
        sceneX: map.borderSize + localX,
        sceneY: map.borderSize + localY,
    };
}

function semanticLocForEntry(map: EditorMapSquare, entry: SceneTileLocData): EditLocV1 | undefined {
    const worldBaseX = map.mapX * 64 - map.borderSize;
    const worldBaseY = map.mapY * 64 - map.borderSize;

    if (entry.floorDecoration) {
        return {
            id: entry.floorDecoration.entity.id,
            flags: entry.floorDecoration.flags,
            worldX: worldBaseX + entry.tileX,
            worldY: worldBaseY + entry.tileY,
        };
    }
    if (entry.wall) {
        const id = entry.wall.entity0?.id ?? entry.wall.entity1?.id;
        if (id === undefined) return undefined;
        return {
            id,
            flags: entry.wall.flags,
            worldX: worldBaseX + entry.tileX,
            worldY: worldBaseY + entry.tileY,
        };
    }
    if (entry.wallDecoration) {
        return {
            id: entry.wallDecoration.entity0.id,
            flags: entry.wallDecoration.flags,
            worldX: worldBaseX + entry.tileX,
            worldY: worldBaseY + entry.tileY,
        };
    }
    if (entry.loc) {
        return {
            id: entry.loc.entity.id,
            flags: entry.loc.flags,
            worldX: worldBaseX + entry.loc.startX,
            worldY: worldBaseY + entry.loc.startY,
        };
    }
    return undefined;
}

function semanticLocEqual(a: EditLocV1 | undefined, b: EditLocV1): boolean {
    return (
        !!a &&
        a.id === b.id &&
        a.flags === b.flags &&
        a.worldX === b.worldX &&
        a.worldY === b.worldY
    );
}

function matchRuntimeEntries(
    map: EditorMapSquare,
    level: number,
    locs: readonly EditLocV1[],
): { matches: SceneTileLocData[]; missing: EditLocV1[] } {
    const available = serializeSceneLocData(map.scene, map.borderSize).tiles
        .filter((entry) => entry.level === level)
        .map((entry) => structuredClone(entry));
    const matches: SceneTileLocData[] = [];
    const missing: EditLocV1[] = [];

    for (const loc of locs) {
        const index = available.findIndex((entry) => semanticLocEqual(semanticLocForEntry(map, entry), loc));
        if (index === -1) {
            missing.push(loc);
            continue;
        }
        matches.push(available[index]!);
        available.splice(index, 1);
    }

    return { matches, missing };
}

function findRuntimeEntries(
    map: EditorMapSquare,
    level: number,
    locs: readonly EditLocV1[],
    errorCode: "BASE_MISMATCH" | "OBJECT_APPLY_FAILED",
    side: "before" | "after",
): SceneTileLocData[] {
    const result = matchRuntimeEntries(map, level, locs);
    if (result.missing.length > 0) {
        const loc = result.missing[0]!;
        throw new EditReplayError(
            errorCode,
            `Could not match ${side} object ${loc.id} at ${loc.worldX},${loc.worldY} on level ${level}.`,
            result.missing.map(
                (item) => `${map.mapX},${map.mapY},${level},${item.id},${item.worldX},${item.worldY}`,
            ),
        );
    }
    return result.matches;
}

function entryBounds(entries: readonly SceneTileLocData[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
} | undefined {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const entry of entries) {
        if (entry.loc) {
            minX = Math.min(minX, entry.loc.startX);
            minY = Math.min(minY, entry.loc.startY);
            maxX = Math.max(maxX, entry.loc.endX);
            maxY = Math.max(maxY, entry.loc.endY);
        } else {
            minX = Math.min(minX, entry.tileX);
            minY = Math.min(minY, entry.tileY);
            maxX = Math.max(maxX, entry.tileX);
            maxY = Math.max(maxY, entry.tileY);
        }
    }

    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : undefined;
}

function markTileMutation(
    renderer: WebGLMapEditorRenderer,
    map: EditorMapSquare,
    mutation: EditTileMutationV1,
): void {
    const worldX = mutation.mapX * 64 + mutation.localX;
    const worldY = mutation.mapY * 64 + mutation.localY;
    const heightChanged = mutation.after.h !== undefined || mutation.after.hl !== undefined;
    const underlayChanged = mutation.after.u !== undefined;
    const overlayChanged =
        mutation.after.o !== undefined ||
        mutation.after.s !== undefined ||
        mutation.after.r !== undefined;
    const flagsChanged = mutation.after.f !== undefined;

    if (heightChanged) {
        map.heightUpdated = true;
        map.heightRebuildMinLevel =
            map.heightRebuildMinLevel === undefined
                ? mutation.level
                : Math.min(map.heightRebuildMinLevel, mutation.level);
        renderer.addHeightChangedTile(worldX, worldY);
    }
    if (underlayChanged) map.underlayUpdated = true;
    if (overlayChanged) map.overlayUpdated = true;
    if (flagsChanged) map.tileRenderFlagsUpdated = true;

    const expand = heightChanged ? 2 : underlayChanged || overlayChanged ? 4 : 0;
    for (let x = worldX - expand; x <= worldX + expand; x++) {
        for (let y = worldY - expand; y <= worldY + expand; y++) {
            renderer.addAffectedTile(x, y);
        }
    }
}

function applyTileSnapshot(
    map: EditorMapSquare,
    mutation: EditTileMutationV1,
): void {
    const { sceneX, sceneY } = sceneCoords(map, mutation.localX, mutation.localY);
    const scene = map.scene;
    const snap = mutation.after;

    if (snap.hl !== undefined && snap.hl.length > 0) {
        for (let i = 0; i < snap.hl.length; i++) {
            scene.tileHeights[mutation.level + i][sceneX][sceneY] = snap.hl[i]!;
        }
    } else if (snap.h !== undefined) {
        scene.setHeight(mutation.level, sceneX, sceneY, snap.h);
    }
    if (snap.u !== undefined) scene.tileUnderlays[mutation.level][sceneX][sceneY] = snap.u;
    if (snap.o !== undefined) scene.tileOverlays[mutation.level][sceneX][sceneY] = snap.o;
    if (snap.s !== undefined) scene.tileShapes[mutation.level][sceneX][sceneY] = snap.s;
    if (snap.r !== undefined) scene.tileRotations[mutation.level][sceneX][sceneY] = snap.r;
    if (snap.f !== undefined) scene.tileRenderFlags[mutation.level][sceneX][sceneY] = snap.f;
}

function runtimeTileMutation(mutation: EditTileMutationV1): EditorMutation {
    return {
        kind: "map.tile",
        mapId: getMapSquareId(mutation.mapX, mutation.mapY),
        level: mutation.level,
        localTileId: (mutation.localX << 8) | mutation.localY,
        before: structuredClone(mutation.before),
        after: structuredClone(mutation.after),
    };
}

function preflightTileMutation(
    renderer: WebGLMapEditorRenderer,
    mutation: EditTileMutationV1,
): void {
    const map = requireMap(renderer, mutation.mapX, mutation.mapY);
    const { sceneX, sceneY } = sceneCoords(map, mutation.localX, mutation.localY);
    const current = readTileFieldSnapshot(map.scene, mutation.level, sceneX, sceneY);
    if (!tileSnapshotMatchesExpected(current, mutation.before)) {
        throw new EditReplayError(
            "BASE_MISMATCH",
            `Terrain base mismatch at ${mutation.mapX},${mutation.mapY} local ${mutation.localX},${mutation.localY} level ${mutation.level}.`,
            [`${mutation.mapX},${mutation.mapY},${mutation.level},${mutation.localX},${mutation.localY}`],
        );
    }
}

function preflightObjectMutation(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    mutation: EditObjectMutationV1,
): void {
    const map = requireMap(renderer, mutation.mapX, mutation.mapY);
    findRuntimeEntries(map, mutation.level, mutation.before, "BASE_MISMATCH", "before");
    for (const loc of mutation.after) {
        host.locTypeLoader.load(loc.id);
    }
}

function applyObjectMutation(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    mutation: EditObjectMutationV1,
): EditorObjectMutation {
    const map = requireMap(renderer, mutation.mapX, mutation.mapY);
    const mapId = getMapSquareId(mutation.mapX, mutation.mapY);
    const beforeEntries = findRuntimeEntries(
        map,
        mutation.level,
        mutation.before,
        "BASE_MISMATCH",
        "before",
    );

    applyObjectSnapshotEntries(map, mapId, renderer, beforeEntries, []);

    try {
        for (const loc of mutation.after) {
            const sceneX = loc.worldX - mutation.mapX * 64 + map.borderSize;
            const sceneY = loc.worldY - mutation.mapY * 64 + map.borderSize;
            host.sceneBuilder.addLoc(
                map.scene,
                mutation.level,
                sceneX,
                sceneY,
                loc.id,
                (loc.flags & 0x3f) as LocModelType,
                (loc.flags >> 6) & 3,
                undefined,
                LocLoadType.MODELS,
            );
        }

        const afterEntries = findRuntimeEntries(
            map,
            mutation.level,
            mutation.after,
            "OBJECT_APPLY_FAILED",
            "after",
        );
        syncMapObjectPickIndex(map, mapId);

        const bounds = entryBounds([...beforeEntries, ...afterEntries]);
        if (bounds) {
            markMapObjectChunks(map, mapId, renderer, bounds);
        }

        return {
            kind: "map.objects",
            mapId,
            level: mutation.level,
            sceneBorderSize: map.borderSize,
            before: beforeEntries,
            after: afterEntries,
        };
    } catch (error) {
        const currentlyApplied = matchRuntimeEntries(
            map,
            mutation.level,
            mutation.after,
        ).matches;
        applyObjectSnapshotEntries(map, mapId, renderer, currentlyApplied, beforeEntries);
        throw error;
    }
}

function runtimeTransaction(
    transaction: EditTransactionV1,
    mutations: EditorMutation[],
): EditorTransaction {
    return {
        id: transaction.id,
        label: transaction.label,
        source: transaction.source,
        timestamp: transaction.timestamp,
        mutations,
        mapIds: [...new Set(mutations.map((mutation) => mutation.mapId))],
        tileCount: mutations.filter((mutation) => mutation.kind === "map.tile").length,
    };
}

function rollbackCurrentTransaction(
    host: IEditorPluginHost,
    transaction: EditTransactionV1,
    mutations: EditorMutation[],
): void {
    if (mutations.length === 0) return;
    host.appendAppliedHistoryTransaction(
        runtimeTransaction(
            { ...transaction, id: `${transaction.id}:rollback` },
            mutations,
        ),
    );
    host.undoHistory();
}

function applyTransaction(
    host: IEditorPluginHost,
    renderer: WebGLMapEditorRenderer,
    transaction: EditTransactionV1,
): void {
    const runtimeMutations: EditorMutation[] = [];

    try {
        for (const mutation of transaction.mutations) {
            if (mutation.kind === "map.tile") {
                preflightTileMutation(renderer, mutation);
                const map = requireMap(renderer, mutation.mapX, mutation.mapY);
                applyTileSnapshot(map, mutation);
                markTileMutation(renderer, map, mutation);
                runtimeMutations.push(runtimeTileMutation(mutation));
            } else {
                preflightObjectMutation(host, renderer, mutation);
                runtimeMutations.push(applyObjectMutation(host, renderer, mutation));
            }
        }
        renderer.updateAffectedTiles();
        host.scheduleMinimapRefreshAfterEdit();
        host.appendAppliedHistoryTransaction(runtimeTransaction(transaction, runtimeMutations));
    } catch (error) {
        rollbackCurrentTransaction(host, transaction, runtimeMutations);
        throw error;
    }
}

/**
 * Replays a complete Edit Format v1 batch into a clean editor history.
 *
 * All referenced map squares are checked before any scene mutation. Each transaction is
 * preflighted against its persisted "before" state before being applied. If a later
 * transaction fails, earlier replayed transactions are undone before the error escapes.
 */
export function replayEditBatchV1(
    host: IEditorPluginHost,
    input: EditBatchV1,
): void {
    const batch = decodeEditBatchV1(structuredClone(input));
    const renderer = requireRenderer(host);
    const history = host.getHistorySnapshot();
    if (history.entries.length !== 0 || history.currentIndex !== -1) {
        throw new EditReplayError(
            "HISTORY_NOT_EMPTY",
            "Project replay requires an empty editor history.",
        );
    }

    const missing = collectEditReplayMapRefs(batch)
        .filter((ref) => !renderer.mapManager.getMapById(ref.mapId))
        .map((ref) => mapRefKey(ref.mapX, ref.mapY));
    if (missing.length > 0) {
        throw new EditReplayError(
            "MISSING_MAPS",
            `Project replay requires ${missing.length} unloaded map square(s).`,
            missing,
        );
    }

    let appliedTransactions = 0;
    try {
        for (const transaction of batch.transactions) {
            applyTransaction(host, renderer, transaction);
            appliedTransactions++;
        }
    } catch (error) {
        for (let i = 0; i < appliedTransactions; i++) {
            host.undoHistory();
        }
        host.clearHistory();
        throw error;
    }
}
