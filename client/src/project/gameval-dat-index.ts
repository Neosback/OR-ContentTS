import { projectPathName, type ProjectFileSystem } from "./project-filesystem";
import type { OpenRuneProjectIndex } from "./openrune-project-index";

export type GameValDatSourceKind = "base" | "generated";

export type GameValDatEntry = {
    table: string;
    key: string;
    symbol: string;
    id: number;
    sourcePath: string;
    sourceKind: GameValDatSourceKind;
    tableIndex: number;
    entryIndex: number;
};

export type GameValDatTable = {
    name: string;
    tableIndex: number;
    entries: GameValDatEntry[];
};

export type GameValDatIssueCode =
    | "INVALID_TABLE_COUNT"
    | "INVALID_ENTRY_COUNT"
    | "TRUNCATED_DATA"
    | "INVALID_UTF8"
    | "MALFORMED_ENTRY"
    | "INVALID_ID"
    | "TRAILING_DATA"
    | "DUPLICATE_SYMBOL"
    | "SYMBOL_CONFLICT"
    | "ID_CONFLICT";

export type GameValDatIssue = {
    code: GameValDatIssueCode;
    message: string;
    sourcePath: string;
    offset?: number;
    table?: string;
    symbol?: string;
    id?: number;
    related?: Array<{
        sourcePath: string;
        sourceKind: GameValDatSourceKind;
        table: string;
        symbol: string;
        id: number;
        tableIndex: number;
        entryIndex: number;
    }>;
};

export type GameValDatFileIndex = {
    sourcePath: string;
    sourceKind: GameValDatSourceKind;
    tables: GameValDatTable[];
    entries: GameValDatEntry[];
    issues: GameValDatIssue[];
    bytesConsumed: number;
};

export type GameValDatIndex = {
    baseFile?: GameValDatFileIndex;
    generatedFile?: GameValDatFileIndex;
    files: GameValDatFileIndex[];
    entries: GameValDatEntry[];
    issues: GameValDatIssue[];
    maxBaseId: ReadonlyMap<string, number>;
    bySymbol: ReadonlyMap<string, readonly GameValDatEntry[]>;
    byTableId: ReadonlyMap<string, readonly GameValDatEntry[]>;
};

export type CustomGameValEntry = {
    table: string;
    key: string;
    id: number;
    sourcePath: string;
    line?: number;
};

export type CustomGameValValidationIssueCode =
    | "BASE_ID_RESERVED"
    | "SYMBOL_CONFLICT"
    | "ID_CONFLICT";

export type CustomGameValValidationIssue = {
    code: CustomGameValValidationIssueCode;
    message: string;
    table: string;
    key: string;
    symbol: string;
    id: number;
    sourcePath: string;
    line?: number;
    maxBaseId?: number;
    related?: GameValDatEntry[];
};

const decoder = new TextDecoder("utf-8", { fatal: true });

function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function compareEntries(a: GameValDatEntry, b: GameValDatEntry): number {
    return (
        compareText(a.table, b.table) ||
        compareText(a.key, b.key) ||
        a.id - b.id ||
        compareText(a.sourcePath, b.sourcePath) ||
        a.tableIndex - b.tableIndex ||
        a.entryIndex - b.entryIndex
    );
}

function tableIdKey(table: string, id: number): string {
    return `${table}\u0000${id}`;
}

function sourceRef(entry: GameValDatEntry) {
    return {
        sourcePath: entry.sourcePath,
        sourceKind: entry.sourceKind,
        table: entry.table,
        symbol: entry.symbol,
        id: entry.id,
        tableIndex: entry.tableIndex,
        entryIndex: entry.entryIndex,
    };
}

function parseMapping(
    sourcePath: string,
    sourceKind: GameValDatSourceKind,
    table: string,
    tableIndex: number,
    entryIndex: number,
    value: string,
    issues: GameValDatIssue[],
): GameValDatEntry | undefined {
    const parts = value.split("=");
    if (parts.length !== 2) {
        issues.push({
            code: "MALFORMED_ENTRY",
            message: `GameVal DAT entry "${value}" in table "${table}" must use key=id format.`,
            sourcePath,
            table,
        });
        return undefined;
    }

    const key = parts[0]!.trim();
    const rawId = parts[1]!.trim();
    if (!key) {
        issues.push({
            code: "MALFORMED_ENTRY",
            message: `GameVal DAT entry in table "${table}" has an empty key.`,
            sourcePath,
            table,
        });
        return undefined;
    }

    if (!/^[+-]?\d+$/.test(rawId)) {
        issues.push({
            code: "INVALID_ID",
            message: `GameVal DAT id "${rawId}" for "${table}.${key}" is not an integer.`,
            sourcePath,
            table,
            symbol: `${table}.${key}`,
        });
        return undefined;
    }

    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < -1 || id > 0x7fffffff) {
        issues.push({
            code: "INVALID_ID",
            message: `GameVal DAT id "${rawId}" for "${table}.${key}" must be -1 or a non-negative 32-bit integer.`,
            sourcePath,
            table,
            symbol: `${table}.${key}`,
        });
        return undefined;
    }

    return {
        table,
        key,
        symbol: `${table}.${key}`,
        id,
        sourcePath,
        sourceKind,
        tableIndex,
        entryIndex,
    };
}

class DatReader {
    offset = 0;

    constructor(
        private readonly data: Uint8Array,
        private readonly sourcePath: string,
        private readonly issues: GameValDatIssue[],
    ) {}

    get remaining(): number {
        return this.data.byteLength - this.offset;
    }

    readInt32(context: string): number | undefined {
        if (this.remaining < 4) {
            this.truncated(context, 4);
            return undefined;
        }
        const view = new DataView(
            this.data.buffer,
            this.data.byteOffset + this.offset,
            4,
        );
        const value = view.getInt32(0, false);
        this.offset += 4;
        return value;
    }

    readUint16(context: string): number | undefined {
        if (this.remaining < 2) {
            this.truncated(context, 2);
            return undefined;
        }
        const view = new DataView(
            this.data.buffer,
            this.data.byteOffset + this.offset,
            2,
        );
        const value = view.getUint16(0, false);
        this.offset += 2;
        return value;
    }

    readUtf8(length: number, context: string): string | undefined {
        if (this.remaining < length) {
            this.truncated(context, length);
            return undefined;
        }

        const start = this.offset;
        const bytes = this.data.subarray(start, start + length);
        this.offset += length;

        try {
            return decoder.decode(bytes);
        } catch (error) {
            this.issues.push({
                code: "INVALID_UTF8",
                message: `Invalid UTF-8 while reading ${context} from "${this.sourcePath}".`,
                sourcePath: this.sourcePath,
                offset: start,
            });
            return undefined;
        }
    }

    private truncated(context: string, needed: number): void {
        this.issues.push({
            code: "TRUNCATED_DATA",
            message: `Truncated GameVal DAT while reading ${context}: needed ${needed} byte(s), found ${this.remaining}.`,
            sourcePath: this.sourcePath,
            offset: this.offset,
        });
    }
}

/**
 * Decodes OpenRune's GameValDat format exactly as written by DataOutputStream:
 *
 * int32 table count
 *   uint16 UTF-8 table-name length
 *   table-name bytes
 *   int32 entry count
 *     uint16 UTF-8 entry length
 *     entry bytes (key=id)
 *
 * Multi-part keys such as interface:component are retained verbatim.
 */
export function parseGameValDat(
    sourcePath: string,
    sourceKind: GameValDatSourceKind,
    data: Uint8Array,
): GameValDatFileIndex {
    const issues: GameValDatIssue[] = [];
    const tables: GameValDatTable[] = [];
    const entries: GameValDatEntry[] = [];
    const reader = new DatReader(data, sourcePath, issues);

    const tableCount = reader.readInt32("table count");
    if (tableCount === undefined) {
        return {
            sourcePath,
            sourceKind,
            tables,
            entries,
            issues,
            bytesConsumed: reader.offset,
        };
    }

    const maxPossibleTables = Math.floor(reader.remaining / 6);
    if (tableCount < 0 || tableCount > maxPossibleTables) {
        issues.push({
            code: "INVALID_TABLE_COUNT",
            message: `GameVal DAT table count ${tableCount} is impossible for ${reader.remaining} remaining byte(s).`,
            sourcePath,
            offset: 0,
        });
        return {
            sourcePath,
            sourceKind,
            tables,
            entries,
            issues,
            bytesConsumed: reader.offset,
        };
    }

    outer: for (let tableIndex = 0; tableIndex < tableCount; tableIndex++) {
        const nameLength = reader.readUint16(`table ${tableIndex} name length`);
        if (nameLength === undefined) break;

        const table = reader.readUtf8(nameLength, `table ${tableIndex} name`);
        if (table === undefined) break;
        if (!table) {
            issues.push({
                code: "MALFORMED_ENTRY",
                message: `GameVal DAT table ${tableIndex} has an empty name.`,
                sourcePath,
                offset: reader.offset - nameLength,
            });
        }

        const entryCountOffset = reader.offset;
        const entryCount = reader.readInt32(`table "${table}" entry count`);
        if (entryCount === undefined) break;

        const maxPossibleEntries = Math.floor(reader.remaining / 2);
        if (entryCount < 0 || entryCount > maxPossibleEntries) {
            issues.push({
                code: "INVALID_ENTRY_COUNT",
                message: `GameVal DAT table "${table}" entry count ${entryCount} is impossible for ${reader.remaining} remaining byte(s).`,
                sourcePath,
                offset: entryCountOffset,
                table,
            });
            break;
        }

        const tableEntries: GameValDatEntry[] = [];
        for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
            const entryLength = reader.readUint16(
                `table "${table}" entry ${entryIndex} length`,
            );
            if (entryLength === undefined) break outer;

            const value = reader.readUtf8(
                entryLength,
                `table "${table}" entry ${entryIndex}`,
            );
            if (value === undefined) break outer;

            const entry = parseMapping(
                sourcePath,
                sourceKind,
                table,
                tableIndex,
                entryIndex,
                value,
                issues,
            );
            if (entry) {
                tableEntries.push(entry);
                entries.push(entry);
            }
        }

        tables.push({
            name: table,
            tableIndex,
            entries: tableEntries,
        });
    }

    if (reader.remaining > 0 && !issues.some((issue) => issue.code === "TRUNCATED_DATA")) {
        issues.push({
            code: "TRAILING_DATA",
            message: `GameVal DAT has ${reader.remaining} trailing byte(s) after the declared tables.`,
            sourcePath,
            offset: reader.offset,
        });
    }

    return {
        sourcePath,
        sourceKind,
        tables,
        entries,
        issues,
        bytesConsumed: reader.offset,
    };
}

function pushMap(
    map: Map<string, GameValDatEntry[]>,
    key: string,
    entry: GameValDatEntry,
): void {
    const existing = map.get(key);
    if (existing) existing.push(entry);
    else map.set(key, [entry]);
}

export function buildGameValDatIndex(
    files: readonly GameValDatFileIndex[],
): GameValDatIndex {
    const sortedFiles = [...files].sort(
        (a, b) =>
            (a.sourceKind === b.sourceKind
                ? 0
                : a.sourceKind === "base"
                  ? -1
                  : 1) || compareText(a.sourcePath, b.sourcePath),
    );
    const entries = sortedFiles.flatMap((file) => file.entries).sort(compareEntries);
    const issues = sortedFiles.flatMap((file) => file.issues);

    const baseFile = sortedFiles.find((file) => file.sourceKind === "base");
    const generatedFile = sortedFiles.find((file) => file.sourceKind === "generated");

    const maxBaseIdMutable = new Map<string, number>();
    for (const entry of baseFile?.entries ?? []) {
        if (entry.id < 0) continue;
        const current = maxBaseIdMutable.get(entry.table) ?? -1;
        if (entry.id > current) maxBaseIdMutable.set(entry.table, entry.id);
    }

    const bySymbolMutable = new Map<string, GameValDatEntry[]>();
    const byTableIdMutable = new Map<string, GameValDatEntry[]>();

    for (const entry of entries) {
        pushMap(bySymbolMutable, entry.symbol, entry);
        if (entry.id >= 0) pushMap(byTableIdMutable, tableIdKey(entry.table, entry.id), entry);
    }

    for (const [symbol, declarations] of bySymbolMutable) {
        if (declarations.length < 2) continue;
        const ids = new Set(declarations.map((entry) => entry.id));
        issues.push({
            code: ids.size === 1 ? "DUPLICATE_SYMBOL" : "SYMBOL_CONFLICT",
            message:
                ids.size === 1
                    ? `GameVal DAT symbol "${symbol}" is declared multiple times.`
                    : `GameVal DAT symbol "${symbol}" maps to conflicting ids.`,
            sourcePath: declarations[0]!.sourcePath,
            table: declarations[0]!.table,
            symbol,
            related: declarations.map(sourceRef),
        });
    }

    for (const declarations of byTableIdMutable.values()) {
        const symbols = new Set(declarations.map((entry) => entry.symbol));
        if (symbols.size < 2) continue;
        const first = declarations[0]!;
        issues.push({
            code: "ID_CONFLICT",
            message: `GameVal DAT table "${first.table}" assigns id ${first.id} to multiple symbols.`,
            sourcePath: first.sourcePath,
            table: first.table,
            id: first.id,
            related: declarations.map(sourceRef),
        });
    }

    issues.sort(
        (a, b) =>
            compareText(a.sourcePath, b.sourcePath) ||
            (a.offset ?? 0) - (b.offset ?? 0) ||
            compareText(a.code, b.code) ||
            compareText(a.symbol ?? "", b.symbol ?? ""),
    );

    const bySymbol = new Map<string, readonly GameValDatEntry[]>();
    for (const [symbol, declarations] of bySymbolMutable) {
        bySymbol.set(symbol, [...declarations].sort(compareEntries));
    }

    const byTableId = new Map<string, readonly GameValDatEntry[]>();
    for (const [key, declarations] of byTableIdMutable) {
        byTableId.set(key, [...declarations].sort(compareEntries));
    }

    return {
        baseFile,
        generatedFile,
        files: sortedFiles,
        entries,
        issues,
        maxBaseId: maxBaseIdMutable,
        bySymbol,
        byTableId,
    };
}

export async function indexProjectGameValDat(
    fileSystem: ProjectFileSystem,
    project: Pick<OpenRuneProjectIndex, "gameValBinaryFiles">,
): Promise<GameValDatIndex> {
    const byName = new Map(
        project.gameValBinaryFiles.map((path) => [projectPathName(path), path] as const),
    );
    const files: GameValDatFileIndex[] = [];

    const basePath = byName.get("gamevals.dat");
    if (basePath) {
        files.push(parseGameValDat(basePath, "base", await fileSystem.readBytes(basePath)));
    }

    const generatedPath = byName.get("gamevals_generated.dat");
    if (generatedPath) {
        files.push(
            parseGameValDat(
                generatedPath,
                "generated",
                await fileSystem.readBytes(generatedPath),
            ),
        );
    }

    return buildGameValDatIndex(files);
}

export function findGameValDatSymbol(
    index: GameValDatIndex,
    symbol: string,
): readonly GameValDatEntry[] {
    return index.bySymbol.get(symbol) ?? [];
}

export function findGameValDatId(
    index: GameValDatIndex,
    table: string,
    id: number,
): readonly GameValDatEntry[] {
    if (!Number.isSafeInteger(id) || id < 0) return [];
    return index.byTableId.get(tableIdKey(table, id)) ?? [];
}

/**
 * Applies OpenRune's custom mapping constraints against the parsed DAT baseline.
 *
 * Positive custom IDs must be strictly greater than the base OSRS max ID for
 * that table. Generated DAT mappings participate in symbol/id collision checks
 * but do not raise the base-ID ceiling. -1 remains an allowed unassigned value.
 */
export function validateCustomGameVals(
    index: GameValDatIndex,
    customEntries: readonly CustomGameValEntry[],
): CustomGameValValidationIssue[] {
    const issues: CustomGameValValidationIssue[] = [];

    for (const entry of customEntries) {
        const symbol = `${entry.table}.${entry.key}`;
        if (entry.id < -1 || !Number.isSafeInteger(entry.id) || entry.id > 0x7fffffff) {
            continue;
        }
        if (entry.id === -1) continue;

        const maxBaseId = index.maxBaseId.get(entry.table) ?? -1;
        if (entry.id <= maxBaseId) {
            issues.push({
                code: "BASE_ID_RESERVED",
                message: `Custom GameVal "${symbol}" uses id ${entry.id}, but OpenRune reserves 0..${maxBaseId} for the base cache in table "${entry.table}".`,
                table: entry.table,
                key: entry.key,
                symbol,
                id: entry.id,
                sourcePath: entry.sourcePath,
                line: entry.line,
                maxBaseId,
            });
        }

        const symbolDeclarations = index.bySymbol.get(symbol) ?? [];
        const symbolConflicts = symbolDeclarations.filter(
            (existing) => existing.id >= 0 && existing.id !== entry.id,
        );
        if (symbolConflicts.length > 0) {
            issues.push({
                code: "SYMBOL_CONFLICT",
                message: `Custom GameVal "${symbol}" conflicts with an existing DAT mapping.`,
                table: entry.table,
                key: entry.key,
                symbol,
                id: entry.id,
                sourcePath: entry.sourcePath,
                line: entry.line,
                related: [...symbolConflicts],
            });
        }

        const idDeclarations = index.byTableId.get(tableIdKey(entry.table, entry.id)) ?? [];
        const idConflicts = idDeclarations.filter((existing) => existing.symbol !== symbol);
        if (idConflicts.length > 0) {
            issues.push({
                code: "ID_CONFLICT",
                message: `Custom GameVal "${symbol}" uses id ${entry.id}, which is already mapped to another symbol in table "${entry.table}".`,
                table: entry.table,
                key: entry.key,
                symbol,
                id: entry.id,
                sourcePath: entry.sourcePath,
                line: entry.line,
                related: [...idConflicts],
            });
        }
    }

    return issues.sort(
        (a, b) =>
            compareText(a.sourcePath, b.sourcePath) ||
            (a.line ?? 0) - (b.line ?? 0) ||
            compareText(a.code, b.code) ||
            compareText(a.symbol, b.symbol),
    );
}
