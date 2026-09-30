import type {
    EditorMutation,
    EditorObjectMutation,
    EditorTileFieldSnapshot,
    EditorTileMutation,
    EditorTransaction,
    EditorTransactionSource,
} from "./editor-transaction";
import { overlayWorldKey } from "./overlay-flood-fill";
import type { SceneTileLocData } from "./webgl/sceneLocData";

/** Sparse per-tile terrain fields (only changed keys are stored). */
export type TileFieldSnapshot = EditorTileFieldSnapshot;

export type MapSquareTileDelta = {
    mapId: number;
    level: number;
    tiles: [localTileId: number, before: TileFieldSnapshot, after: TileFieldSnapshot][];
};

export type MapSquareObjectDelta = {
    mapId: number;
    level: number;
    before: SceneTileLocData[];
    after: SceneTileLocData[];
};

export type MapEditorHistoryTool = EditorTransactionSource;

/**
 * History entries are editor transactions with compatibility projections for the
 * existing map-history UI/replay code. New persistence code should prefer `mutations`.
 */
export type MapEditorHistoryEntry = EditorTransaction & {
    /** @deprecated Use `source`. */
    tool: MapEditorHistoryTool;
    /** @deprecated Use `mutations`. */
    deltas: MapSquareTileDelta[];
    /** @deprecated Use `mutations`. */
    objectDeltas: MapSquareObjectDelta[];
};

export type MapEditorHistorySnapshot = {
    entries: readonly MapEditorHistoryEntry[];
    currentIndex: number;
    canUndo: boolean;
    canRedo: boolean;
    editedMapIds: readonly number[];
};

export const EMPTY_MAP_EDITOR_HISTORY_SNAPSHOT: MapEditorHistorySnapshot = {
    entries: [],
    currentIndex: -1,
    canUndo: false,
    canRedo: false,
    editedMapIds: [],
};

export function buildHistoryEntryWorldKeys(entry: MapEditorHistoryEntry): {
    level: number;
    worldKeys: Set<string>;
} {
    const worldKeys = new Set<string>();
    let level = 0;
    for (const delta of entry.deltas) {
        level = delta.level;
        const mapX = delta.mapId >> 8;
        const mapY = delta.mapId & 0xff;
        for (const [localTileId] of delta.tiles) {
            const lx = localTileId >> 8;
            const ly = localTileId & 0xff;
            worldKeys.add(overlayWorldKey(mapX * 64 + lx, mapY * 64 + ly));
        }
    }
    return { level, worldKeys };
}

type PendingTileKey = string;
type ScalarTileFieldKey = "h" | "u" | "o" | "s" | "r" | "f";

function pendingTileKey(mapId: number, level: number, localTileId: number): PendingTileKey {
    return `${mapId}:${level}:${localTileId}`;
}

function heightsEqual(a?: number[], b?: number[]): boolean {
    if (a === b) {
        return true;
    }
    if (!a || !b || a.length !== b.length) {
        return false;
    }
    return a.every((value, index) => value === b[index]);
}

function diffSnapshots(
    before: TileFieldSnapshot,
    after: TileFieldSnapshot,
): { before: TileFieldSnapshot; after: TileFieldSnapshot } | null {
    const b: TileFieldSnapshot = {};
    const a: TileFieldSnapshot = {};
    let changed = false;
    const keys: ScalarTileFieldKey[] = ["h", "u", "o", "s", "r", "f"];
    for (const key of keys) {
        if (before[key] !== after[key]) {
            b[key] = before[key];
            a[key] = after[key];
            changed = true;
        }
    }
    if (!heightsEqual(before.hl, after.hl)) {
        b.hl = before.hl ? [...before.hl] : before.hl;
        a.hl = after.hl ? [...after.hl] : after.hl;
        changed = true;
    }
    return changed ? { before: b, after: a } : null;
}

function mergePendingTile(
    pending: Map<PendingTileKey, { mapId: number; level: number; localTileId: number; before: TileFieldSnapshot; after: TileFieldSnapshot }>,
    mapId: number,
    level: number,
    localTileId: number,
    before: TileFieldSnapshot,
    after: TileFieldSnapshot,
): void {
    const delta = diffSnapshots(before, after);
    if (!delta) {
        return;
    }
    const key = pendingTileKey(mapId, level, localTileId);
    const existing = pending.get(key);
    if (!existing) {
        pending.set(key, {
            mapId,
            level,
            localTileId,
            before: delta.before,
            after: delta.after,
        });
        return;
    }
    existing.after = { ...existing.after, ...delta.after };
    if (delta.after.hl) {
        existing.after.hl = [...delta.after.hl];
    }
    const keys: ScalarTileFieldKey[] = ["h", "u", "o", "s", "r", "f"];
    for (const key of keys) {
        if (existing.before[key] === undefined && delta.before[key] !== undefined) {
            existing.before[key] = delta.before[key];
        }
    }
    if (existing.before.hl === undefined && delta.before.hl) {
        existing.before.hl = [...delta.before.hl];
    }
}

function buildDeltasFromPending(
    pending: Map<PendingTileKey, { mapId: number; level: number; localTileId: number; before: TileFieldSnapshot; after: TileFieldSnapshot }>,
): MapSquareTileDelta[] {
    const bySquareLevel = new Map<string, MapSquareTileDelta>();
    for (const tile of pending.values()) {
        const groupKey = `${tile.mapId}:${tile.level}`;
        let group = bySquareLevel.get(groupKey);
        if (!group) {
            group = { mapId: tile.mapId, level: tile.level, tiles: [] };
            bySquareLevel.set(groupKey, group);
        }
        group.tiles.push([tile.localTileId, tile.before, tile.after]);
    }
    return [...bySquareLevel.values()];
}

export function toolHistoryLabel(tool: MapEditorHistoryTool, custom?: string): string {
    if (custom) {
        return custom;
    }
    switch (tool) {
        case "underlay":
            return "Paint underlay";
        case "overlay":
            return "Paint overlay";
        case "height":
            return "Adjust height";
        case "smooth":
            return "Smooth terrain";
        case "tile-flags":
            return "Edit tile flags";
        case "object-selector":
            return "Object edit";
        case "object-delete":
            return "Delete object";
        case "region-stamp":
            return "Region stamp";
        case "sandbox":
            return "Sandbox terrain";
        case "bulk":
            return "Bulk terrain edit";
        default:
            return "Map edit";
    }
}

export class MapEditHistory {
    private entries: MapEditorHistoryEntry[] = [];
    private currentIndex = -1;
    private nextId = 1;
    private listeners = new Set<() => void>();

    private transactionActive = false;
    private transactionSource: MapEditorHistoryTool = "underlay";
    private transactionLabel?: string;
    private pendingTiles = new Map<
        PendingTileKey,
        { mapId: number; level: number; localTileId: number; before: TileFieldSnapshot; after: TileFieldSnapshot }
    >();
    private pendingObjectChanges: MapSquareObjectDelta[] = [];

    /** When true, tile mutations from history replay are not recorded. */
    applying = false;

    private cachedSnapshot: MapEditorHistorySnapshot | null = null;

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notify(): void {
        this.cachedSnapshot = null;
        for (const listener of this.listeners) {
            listener();
        }
    }

    private buildSnapshot(): MapEditorHistorySnapshot {
        const editedMapIds = new Set<number>();
        for (const entry of this.entries.slice(0, this.currentIndex + 1)) {
            for (const mapId of entry.mapIds) {
                editedMapIds.add(mapId);
            }
        }
        return {
            entries: this.entries,
            currentIndex: this.currentIndex,
            canUndo: this.currentIndex >= 0,
            canRedo: this.currentIndex < this.entries.length - 1,
            editedMapIds: [...editedMapIds],
        };
    }

    getSnapshot(): MapEditorHistorySnapshot {
        if (!this.cachedSnapshot) {
            this.cachedSnapshot = this.buildSnapshot();
        }
        return this.cachedSnapshot;
    }

    beginTransaction(source: MapEditorHistoryTool, label?: string): void {
        if (this.applying) {
            return;
        }
        this.transactionActive = true;
        this.transactionSource = source;
        this.transactionLabel = label;
        this.pendingTiles.clear();
        this.pendingObjectChanges = [];
    }

    /** Compatibility wrapper for paint-stroke call sites during transaction migration. */
    beginStroke(tool: MapEditorHistoryTool, label?: string): void {
        this.beginTransaction(tool, label);
    }

    recordTileChange(
        mapId: number,
        level: number,
        localTileId: number,
        before: TileFieldSnapshot,
        after: TileFieldSnapshot,
    ): void {
        if (this.applying) {
            return;
        }
        if (!this.transactionActive) {
            this.beginTransaction(this.transactionSource);
        }
        mergePendingTile(this.pendingTiles, mapId, level, localTileId, before, after);
    }

    recordObjectChange(
        mapId: number,
        level: number,
        before: SceneTileLocData[],
        after: SceneTileLocData[],
    ): void {
        if (this.applying) {
            return;
        }
        if (!this.transactionActive) {
            this.beginTransaction(this.transactionSource);
        }
        if (JSON.stringify(before) === JSON.stringify(after)) {
            return;
        }
        this.pendingObjectChanges.push({
            mapId,
            level,
            before: before.map((entry) => structuredClone(entry)),
            after: after.map((entry) => structuredClone(entry)),
        });
    }

    commitTransaction(): MapEditorHistoryEntry | undefined {
        if (this.applying || !this.transactionActive) {
            this.transactionActive = false;
            this.pendingTiles.clear();
            this.pendingObjectChanges = [];
            return undefined;
        }
        this.transactionActive = false;

        const deltas = buildDeltasFromPending(this.pendingTiles);
        const objectDeltas = this.pendingObjectChanges;
        this.pendingTiles.clear();
        this.pendingObjectChanges = [];
        if (deltas.length === 0 && objectDeltas.length === 0) {
            return undefined;
        }

        const mapIds = [...new Set([...deltas.map((d) => d.mapId), ...objectDeltas.map((d) => d.mapId)])];
        const tileCount = deltas.reduce((count, delta) => count + delta.tiles.length, 0);
        const mutations: EditorMutation[] = [
            ...deltas.flatMap((delta): EditorTileMutation[] =>
                delta.tiles.map(([localTileId, before, after]) => ({
                    kind: "map.tile",
                    mapId: delta.mapId,
                    level: delta.level,
                    localTileId,
                    before,
                    after,
                })),
            ),
            ...objectDeltas.map(
                (delta): EditorObjectMutation => ({
                    kind: "map.objects",
                    mapId: delta.mapId,
                    level: delta.level,
                    before: delta.before,
                    after: delta.after,
                }),
            ),
        ];

        if (this.currentIndex < this.entries.length - 1) {
            this.entries.length = this.currentIndex + 1;
        }

        const entry: MapEditorHistoryEntry = {
            id: String(this.nextId++),
            label: toolHistoryLabel(this.transactionSource, this.transactionLabel),
            source: this.transactionSource,
            tool: this.transactionSource,
            timestamp: Date.now(),
            mutations,
            deltas,
            objectDeltas,
            mapIds,
            tileCount,
        };
        this.entries.push(entry);
        this.currentIndex = this.entries.length - 1;
        this.notify();
        return entry;
    }

    /** Compatibility wrapper for paint-stroke call sites during transaction migration. */
    commitStroke(): void {
        this.commitTransaction();
    }

    cancelTransaction(): void {
        this.transactionActive = false;
        this.pendingTiles.clear();
        this.pendingObjectChanges = [];
    }

    /** Compatibility wrapper for paint-stroke call sites during transaction migration. */
    cancelStroke(): void {
        this.cancelTransaction();
    }

    getUndoEntry(): MapEditorHistoryEntry | undefined {
        if (this.currentIndex < 0) {
            return undefined;
        }
        return this.entries[this.currentIndex];
    }

    getRedoEntry(): MapEditorHistoryEntry | undefined {
        if (this.currentIndex >= this.entries.length - 1) {
            return undefined;
        }
        return this.entries[this.currentIndex + 1];
    }

    markUndone(): void {
        if (this.currentIndex >= 0) {
            this.currentIndex--;
            this.notify();
        }
    }

    markRedone(): void {
        if (this.currentIndex < this.entries.length - 1) {
            this.currentIndex++;
            this.notify();
        }
    }

    jumpToIndex(targetIndex: number): MapEditorHistoryEntry[] {
        const clamped = Math.max(-1, Math.min(this.entries.length - 1, targetIndex));
        const toApply: MapEditorHistoryEntry[] = [];
        if (clamped < this.currentIndex) {
            for (let i = this.currentIndex; i > clamped; i--) {
                toApply.push(this.entries[i]);
            }
        } else if (clamped > this.currentIndex) {
            for (let i = this.currentIndex + 1; i <= clamped; i++) {
                toApply.push(this.entries[i]);
            }
        }
        this.currentIndex = clamped;
        this.notify();
        return toApply;
    }

    clear(): void {
        this.entries = [];
        this.currentIndex = -1;
        this.pendingTiles.clear();
        this.pendingObjectChanges = [];
        this.transactionActive = false;
        this.notify();
    }
}
