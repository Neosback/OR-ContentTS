import schema from "./edit-format-v1.schema.json";

import type {
    EditorMutation,
    EditorObjectMutation,
    EditorTileFieldSnapshot,
    EditorTileMutation,
    EditorTransaction,
    EditorTransactionSource,
} from "../mapeditor/editor-transaction";
import type { SceneTileLocData } from "../mapeditor/webgl/sceneLocData";

export const EDIT_FORMAT_V1_NAME = "openrune.edit-batch" as const;
export const EDIT_FORMAT_V1_VERSION = 1 as const;
export const EDIT_FORMAT_V1_SCHEMA = schema;

export type EditMapRefV1 = {
    x: number;
    y: number;
};

export type EditLocV1 = {
    id: number;
    flags: number;
    worldX: number;
    worldY: number;
};

export type EditTileMutationV1 = {
    kind: "map.tile";
    mapX: number;
    mapY: number;
    level: number;
    localX: number;
    localY: number;
    before: EditorTileFieldSnapshot;
    after: EditorTileFieldSnapshot;
};

export type EditObjectMutationV1 = {
    kind: "map.objects";
    mapX: number;
    mapY: number;
    level: number;
    before: EditLocV1[];
    after: EditLocV1[];
};

export type EditMutationV1 = EditTileMutationV1 | EditObjectMutationV1;

export type EditTransactionV1 = {
    id: string;
    label: string;
    source: EditorTransactionSource;
    timestamp: number;
    mutations: EditMutationV1[];
    affectedMaps: EditMapRefV1[];
    tileCount: number;
};

export type EditBatchV1 = {
    format: typeof EDIT_FORMAT_V1_NAME;
    version: typeof EDIT_FORMAT_V1_VERSION;
    id: string;
    createdAt: number;
    transactions: EditTransactionV1[];
};

export type EditFormatV1Issue = {
    path: string;
    message: string;
};

export type EditFormatV1ValidationResult =
    | { ok: true; value: EditBatchV1 }
    | { ok: false; issues: EditFormatV1Issue[] };

export class EditFormatV1Error extends Error {
    constructor(
        message: string,
        readonly issues: readonly EditFormatV1Issue[] = [],
    ) {
        super(message);
        this.name = "EditFormatV1Error";
    }
}

const SOURCE_VALUES = new Set<EditorTransactionSource>([
    "underlay",
    "overlay",
    "height",
    "smooth",
    "object-selector",
    "object-delete",
    "region-stamp",
    "tile-flags",
    "sandbox",
    "bulk",
]);

const TILE_SNAPSHOT_KEYS = new Set(["h", "hl", "u", "o", "s", "r", "f"]);
const BATCH_KEYS = new Set(["format", "version", "id", "createdAt", "transactions"]);
const TRANSACTION_KEYS = new Set(["id", "label", "source", "timestamp", "mutations", "affectedMaps", "tileCount"]);
const TILE_MUTATION_KEYS = new Set(["kind", "mapX", "mapY", "level", "localX", "localY", "before", "after"]);
const OBJECT_MUTATION_KEYS = new Set(["kind", "mapX", "mapY", "level", "before", "after"]);
const MAP_REF_KEYS = new Set(["x", "y"]);
const LOC_KEYS = new Set(["id", "flags", "worldX", "worldY"]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addIssue(issues: EditFormatV1Issue[], path: string, message: string): void {
    issues.push({ path, message });
}

function checkExactKeys(
    value: Record<string, unknown>,
    allowed: ReadonlySet<string>,
    path: string,
    issues: EditFormatV1Issue[],
): void {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
            addIssue(issues, `${path}.${key}`, "Unknown field.");
        }
    }
}

function requireString(
    value: unknown,
    path: string,
    issues: EditFormatV1Issue[],
    options: { nonEmpty?: boolean } = {},
): value is string {
    if (typeof value !== "string") {
        addIssue(issues, path, "Expected string.");
        return false;
    }
    if (options.nonEmpty && value.length === 0) {
        addIssue(issues, path, "Expected non-empty string.");
        return false;
    }
    return true;
}

function requireInteger(
    value: unknown,
    path: string,
    issues: EditFormatV1Issue[],
    options: { min?: number; max?: number } = {},
): value is number {
    if (!Number.isSafeInteger(value)) {
        addIssue(issues, path, "Expected safe integer.");
        return false;
    }
    if (options.min !== undefined && (value as number) < options.min) {
        addIssue(issues, path, `Expected value >= ${options.min}.`);
        return false;
    }
    if (options.max !== undefined && (value as number) > options.max) {
        addIssue(issues, path, `Expected value <= ${options.max}.`);
        return false;
    }
    return true;
}

function validateTileSnapshot(
    value: unknown,
    path: string,
    issues: EditFormatV1Issue[],
): value is EditorTileFieldSnapshot {
    if (!isRecord(value)) {
        addIssue(issues, path, "Expected tile snapshot object.");
        return false;
    }
    checkExactKeys(value, TILE_SNAPSHOT_KEYS, path, issues);
    for (const key of ["h", "u", "o", "s", "r", "f"] as const) {
        if (value[key] !== undefined) {
            requireInteger(value[key], `${path}.${key}`, issues);
        }
    }
    if (value.hl !== undefined) {
        if (!Array.isArray(value.hl)) {
            addIssue(issues, `${path}.hl`, "Expected integer array.");
        } else {
            value.hl.forEach((item, index) => requireInteger(item, `${path}.hl[${index}]`, issues));
        }
    }
    return true;
}

function validateMapRef(value: unknown, path: string, issues: EditFormatV1Issue[]): value is EditMapRefV1 {
    if (!isRecord(value)) {
        addIssue(issues, path, "Expected map coordinate object.");
        return false;
    }
    checkExactKeys(value, MAP_REF_KEYS, path, issues);
    requireInteger(value.x, `${path}.x`, issues, { min: 0, max: 255 });
    requireInteger(value.y, `${path}.y`, issues, { min: 0, max: 255 });
    return true;
}

function validateLoc(value: unknown, path: string, issues: EditFormatV1Issue[]): value is EditLocV1 {
    if (!isRecord(value)) {
        addIssue(issues, path, "Expected loc object.");
        return false;
    }
    checkExactKeys(value, LOC_KEYS, path, issues);
    requireInteger(value.id, `${path}.id`, issues, { min: 0 });
    requireInteger(value.flags, `${path}.flags`, issues);
    requireInteger(value.worldX, `${path}.worldX`, issues);
    requireInteger(value.worldY, `${path}.worldY`, issues);
    return true;
}

function validateMutation(value: unknown, path: string, issues: EditFormatV1Issue[]): value is EditMutationV1 {
    if (!isRecord(value)) {
        addIssue(issues, path, "Expected mutation object.");
        return false;
    }

    if (value.kind === "map.tile") {
        checkExactKeys(value, TILE_MUTATION_KEYS, path, issues);
        requireInteger(value.mapX, `${path}.mapX`, issues, { min: 0, max: 255 });
        requireInteger(value.mapY, `${path}.mapY`, issues, { min: 0, max: 255 });
        requireInteger(value.level, `${path}.level`, issues, { min: 0, max: 3 });
        requireInteger(value.localX, `${path}.localX`, issues, { min: 0, max: 63 });
        requireInteger(value.localY, `${path}.localY`, issues, { min: 0, max: 63 });
        validateTileSnapshot(value.before, `${path}.before`, issues);
        validateTileSnapshot(value.after, `${path}.after`, issues);
        return true;
    }

    if (value.kind === "map.objects") {
        checkExactKeys(value, OBJECT_MUTATION_KEYS, path, issues);
        requireInteger(value.mapX, `${path}.mapX`, issues, { min: 0, max: 255 });
        requireInteger(value.mapY, `${path}.mapY`, issues, { min: 0, max: 255 });
        requireInteger(value.level, `${path}.level`, issues, { min: 0, max: 3 });
        for (const side of ["before", "after"] as const) {
            const snapshot = value[side];
            if (!Array.isArray(snapshot)) {
                addIssue(issues, `${path}.${side}`, "Expected loc array.");
                continue;
            }
            snapshot.forEach((loc, index) => validateLoc(loc, `${path}.${side}[${index}]`, issues));
        }
        return true;
    }

    addIssue(issues, `${path}.kind`, 'Expected "map.tile" or "map.objects".');
    return false;
}

function mapRefKey(ref: EditMapRefV1): string {
    return `${ref.x},${ref.y}`;
}

function deriveAffectedMaps(mutations: readonly EditMutationV1[]): EditMapRefV1[] {
    const seen = new Set<string>();
    const maps: EditMapRefV1[] = [];
    for (const mutation of mutations) {
        const ref = { x: mutation.mapX, y: mutation.mapY };
        const key = mapRefKey(ref);
        if (!seen.has(key)) {
            seen.add(key);
            maps.push(ref);
        }
    }
    return maps;
}

function mapsEqual(a: readonly EditMapRefV1[], b: readonly EditMapRefV1[]): boolean {
    return a.length === b.length && a.every((ref, index) => ref.x === b[index]?.x && ref.y === b[index]?.y);
}

function validateTransaction(
    value: unknown,
    path: string,
    issues: EditFormatV1Issue[],
): value is EditTransactionV1 {
    if (!isRecord(value)) {
        addIssue(issues, path, "Expected transaction object.");
        return false;
    }
    checkExactKeys(value, TRANSACTION_KEYS, path, issues);
    requireString(value.id, `${path}.id`, issues, { nonEmpty: true });
    requireString(value.label, `${path}.label`, issues, { nonEmpty: true });

    if (typeof value.source !== "string" || !SOURCE_VALUES.has(value.source as EditorTransactionSource)) {
        addIssue(issues, `${path}.source`, "Unknown transaction source.");
    }
    requireInteger(value.timestamp, `${path}.timestamp`, issues, { min: 0 });
    requireInteger(value.tileCount, `${path}.tileCount`, issues, { min: 0 });

    const mutations: EditMutationV1[] = [];
    if (!Array.isArray(value.mutations) || value.mutations.length === 0) {
        addIssue(issues, `${path}.mutations`, "Expected at least one mutation.");
    } else {
        value.mutations.forEach((mutation, index) => {
            const localIssues: EditFormatV1Issue[] = [];
            if (validateMutation(mutation, `${path}.mutations[${index}]`, localIssues) && localIssues.length === 0) {
                mutations.push(mutation);
            }
            issues.push(...localIssues);
        });
    }

    const affectedMaps: EditMapRefV1[] = [];
    if (!Array.isArray(value.affectedMaps)) {
        addIssue(issues, `${path}.affectedMaps`, "Expected map coordinate array.");
    } else {
        const seen = new Set<string>();
        value.affectedMaps.forEach((map, index) => {
            const localIssues: EditFormatV1Issue[] = [];
            if (validateMapRef(map, `${path}.affectedMaps[${index}]`, localIssues)) {
                const ref = map as EditMapRefV1;
                const key = mapRefKey(ref);
                if (seen.has(key)) {
                    addIssue(issues, `${path}.affectedMaps[${index}]`, "Duplicate affected map.");
                }
                seen.add(key);
                affectedMaps.push(ref);
            }
            issues.push(...localIssues);
        });
    }

    if (mutations.length > 0) {
        const derivedMaps = deriveAffectedMaps(mutations);
        if (!mapsEqual(affectedMaps, derivedMaps)) {
            addIssue(issues, `${path}.affectedMaps`, "Must match mutation-derived maps in first-occurrence order.");
        }
        const derivedTileCount = mutations.filter((mutation) => mutation.kind === "map.tile").length;
        if (value.tileCount !== derivedTileCount) {
            addIssue(issues, `${path}.tileCount`, `Expected derived tile count ${derivedTileCount}.`);
        }
    }

    return true;
}

export function validateEditBatchV1(value: unknown): EditFormatV1ValidationResult {
    const issues: EditFormatV1Issue[] = [];
    if (!isRecord(value)) {
        return { ok: false, issues: [{ path: "$", message: "Expected edit batch object." }] };
    }

    checkExactKeys(value, BATCH_KEYS, "$", issues);
    if (value.format !== EDIT_FORMAT_V1_NAME) {
        addIssue(issues, "$.format", `Expected "${EDIT_FORMAT_V1_NAME}".`);
    }
    if (value.version !== EDIT_FORMAT_V1_VERSION) {
        addIssue(issues, "$.version", `Expected version ${EDIT_FORMAT_V1_VERSION}.`);
    }
    requireString(value.id, "$.id", issues, { nonEmpty: true });
    requireInteger(value.createdAt, "$.createdAt", issues, { min: 0 });

    if (!Array.isArray(value.transactions)) {
        addIssue(issues, "$.transactions", "Expected transaction array.");
    } else {
        value.transactions.forEach((transaction, index) =>
            validateTransaction(transaction, `$.transactions[${index}]`, issues),
        );
    }

    return issues.length === 0
        ? { ok: true, value: value as EditBatchV1 }
        : { ok: false, issues };
}

function mapIdToCoords(mapId: number): EditMapRefV1 {
    return { x: (mapId >> 8) & 0xff, y: mapId & 0xff };
}

function tileMutationToV1(mutation: EditorTileMutation): EditTileMutationV1 {
    const map = mapIdToCoords(mutation.mapId);
    const localX = mutation.localTileId >> 8;
    const localY = mutation.localTileId & 0xff;
    if (localX < 0 || localX > 63 || localY < 0 || localY > 63) {
        throw new EditFormatV1Error("Cannot serialize tile mutation with invalid local tile coordinates.", [
            { path: "$.mutation.localTileId", message: `Invalid packed local tile id ${mutation.localTileId}.` },
        ]);
    }
    return {
        kind: "map.tile",
        mapX: map.x,
        mapY: map.y,
        level: mutation.level,
        localX,
        localY,
        before: structuredClone(mutation.before),
        after: structuredClone(mutation.after),
    };
}

function pushLoc(
    target: EditLocV1[],
    id: number | undefined,
    flags: number,
    worldX: number,
    worldY: number,
    path: string,
): void {
    if (id === undefined) {
        throw new EditFormatV1Error("Cannot serialize object snapshot without a loc id.", [
            { path, message: "Object snapshot did not contain a serializable loc entity id." },
        ]);
    }
    target.push({ id, flags, worldX, worldY });
}

function sceneSnapshotToLocs(
    entries: readonly SceneTileLocData[],
    mutation: EditorObjectMutation,
    path: string,
): EditLocV1[] {
    const map = mapIdToCoords(mutation.mapId);
    const worldBaseX = map.x * 64 - mutation.sceneBorderSize;
    const worldBaseY = map.y * 64 - mutation.sceneBorderSize;
    const locs: EditLocV1[] = [];

    entries.forEach((entry, index) => {
        const entryPath = `${path}[${index}]`;
        if (entry.level !== mutation.level) {
            throw new EditFormatV1Error("Cannot serialize object snapshot with mixed levels.", [
                { path: `${entryPath}.level`, message: `Expected level ${mutation.level}, got ${entry.level}.` },
            ]);
        }

        const entryWorldX = worldBaseX + entry.tileX;
        const entryWorldY = worldBaseY + entry.tileY;

        if (entry.floorDecoration) {
            pushLoc(
                locs,
                entry.floorDecoration.entity.id,
                entry.floorDecoration.flags,
                entryWorldX,
                entryWorldY,
                `${entryPath}.floorDecoration`,
            );
        }
        if (entry.wall) {
            pushLoc(
                locs,
                entry.wall.entity0?.id ?? entry.wall.entity1?.id,
                entry.wall.flags,
                entryWorldX,
                entryWorldY,
                `${entryPath}.wall`,
            );
        }
        if (entry.wallDecoration) {
            pushLoc(
                locs,
                entry.wallDecoration.entity0.id,
                entry.wallDecoration.flags,
                entryWorldX,
                entryWorldY,
                `${entryPath}.wallDecoration`,
            );
        }
        if (entry.loc) {
            pushLoc(
                locs,
                entry.loc.entity.id,
                entry.loc.flags,
                worldBaseX + entry.loc.startX,
                worldBaseY + entry.loc.startY,
                `${entryPath}.loc`,
            );
        }
    });

    return locs;
}

function objectMutationToV1(mutation: EditorObjectMutation): EditObjectMutationV1 {
    const map = mapIdToCoords(mutation.mapId);
    if (!Number.isSafeInteger(mutation.sceneBorderSize) || mutation.sceneBorderSize < 0) {
        throw new EditFormatV1Error("Cannot serialize object mutation without a valid scene border size.", [
            { path: "$.mutation.sceneBorderSize", message: "Expected non-negative integer." },
        ]);
    }
    return {
        kind: "map.objects",
        mapX: map.x,
        mapY: map.y,
        level: mutation.level,
        before: sceneSnapshotToLocs(mutation.before, mutation, "$.mutation.before"),
        after: sceneSnapshotToLocs(mutation.after, mutation, "$.mutation.after"),
    };
}

function mutationToV1(mutation: EditorMutation): EditMutationV1 {
    return mutation.kind === "map.tile" ? tileMutationToV1(mutation) : objectMutationToV1(mutation);
}

export function transactionToEditFormatV1(transaction: EditorTransaction): EditTransactionV1 {
    const mutations = transaction.mutations.map(mutationToV1);
    if (mutations.length === 0) {
        throw new EditFormatV1Error("Edit Format v1 does not serialize empty transactions.");
    }
    return {
        id: transaction.id,
        label: transaction.label,
        source: transaction.source,
        timestamp: transaction.timestamp,
        mutations,
        affectedMaps: deriveAffectedMaps(mutations),
        tileCount: mutations.filter((mutation) => mutation.kind === "map.tile").length,
    };
}

function createBatchId(createdAt: number): string {
    if (typeof globalThis.crypto?.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
    }
    return `edit-${createdAt}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEditBatchV1(
    transactions: readonly EditorTransaction[],
    options: { id?: string; createdAt?: number } = {},
): EditBatchV1 {
    const createdAt = options.createdAt ?? Date.now();
    const batch: EditBatchV1 = {
        format: EDIT_FORMAT_V1_NAME,
        version: EDIT_FORMAT_V1_VERSION,
        id: options.id ?? createBatchId(createdAt),
        createdAt,
        transactions: transactions.map(transactionToEditFormatV1),
    };
    const validation = validateEditBatchV1(batch);
    if (!validation.ok) {
        throw new EditFormatV1Error("Generated Edit Format v1 batch failed validation.", validation.issues);
    }
    return batch;
}

export function encodeEditBatchV1(batch: EditBatchV1, pretty = true): string {
    const validation = validateEditBatchV1(batch);
    if (!validation.ok) {
        throw new EditFormatV1Error("Cannot encode invalid Edit Format v1 batch.", validation.issues);
    }
    return JSON.stringify(batch, null, pretty ? 2 : undefined);
}

export function decodeEditBatchV1(input: string | unknown): EditBatchV1 {
    let value: unknown = input;
    if (typeof input === "string") {
        try {
            value = JSON.parse(input);
        } catch (error) {
            throw new EditFormatV1Error(
                `Invalid Edit Format v1 JSON: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    const validation = validateEditBatchV1(value);
    if (!validation.ok) {
        throw new EditFormatV1Error("Invalid Edit Format v1 document.", validation.issues);
    }
    return validation.value;
}
