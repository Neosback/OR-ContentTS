import type { MapEditorTool } from "./map-editor-kinds";
import type { SceneTileLocData } from "./webgl/sceneLocData";

export type EditorTransactionSource = MapEditorTool | "sandbox" | "bulk";

export type EditorTileFieldSnapshot = {
    h?: number;
    /** Heights from edit level through top level when height changed. */
    hl?: number[];
    u?: number;
    o?: number;
    s?: number;
    r?: number;
    f?: number;
};

export type EditorTileMutation = {
    kind: "map.tile";
    mapId: number;
    level: number;
    localTileId: number;
    before: EditorTileFieldSnapshot;
    after: EditorTileFieldSnapshot;
};

export type EditorObjectMutation = {
    kind: "map.objects";
    mapId: number;
    level: number;
    /** Renderer scene border used to normalize snapshot coordinates at persistence boundaries. */
    sceneBorderSize: number;
    before: SceneTileLocData[];
    after: SceneTileLocData[];
};

export type EditorMutation = EditorTileMutation | EditorObjectMutation;

export type EditorTransaction = {
    id: string;
    label: string;
    source: EditorTransactionSource;
    timestamp: number;
    mutations: EditorMutation[];
    mapIds: number[];
    tileCount: number;
};

export type EditorTransactionDescriptor = {
    source: EditorTransactionSource;
    label?: string;
};

export interface EditorTransactionHost {
    isHistoryApplying(): boolean;
    beginEditTransaction(source: EditorTransactionSource, label?: string): void;
    commitEditTransaction(): void;
    cancelEditTransaction(): void;
}

/**
 * Runs one editor operation as a named transaction.
 *
 * False is treated as an aborted operation and cancels the transaction.
 * Exceptions also cancel before being rethrown.
 */
export function runEditTransaction<T>(
    host: EditorTransactionHost,
    descriptor: EditorTransactionDescriptor,
    mutate: () => T,
): T {
    if (host.isHistoryApplying()) {
        return mutate();
    }

    host.beginEditTransaction(descriptor.source, descriptor.label);
    try {
        const result = mutate();
        if (result === false) {
            host.cancelEditTransaction();
        } else {
            host.commitEditTransaction();
        }
        return result;
    } catch (error) {
        host.cancelEditTransaction();
        throw error;
    }
}
