import type { ProjectFileSystem } from "./project-filesystem";
import type {
    OpenRuneModuleIndexEntry,
    OpenRuneProjectIndex,
} from "./openrune-project-index";

export const OPENRUNE_GAMEVAL_TABLES = [
    "area",
    "bas",
    "category",
    "clientscript",
    "component",
    "content",
    "controller",
    "droptrigger",
    "currency",
    "dbcol",
    "dbrow",
    "dbtable",
    "enum",
    "font",
    "headbar",
    "hitmark",
    "interface",
    "inv",
    "jingle",
    "loc",
    "mesanim",
    "midi",
    "models",
    "npc",
    "obj",
    "param",
    "projanim",
    "queue",
    "seq",
    "spotanim",
    "stat",
    "synth",
    "timer",
    "varbit",
    "varcon",
    "varn",
    "varobj",
    "varp",
    "walktrigger",
] as const;

export type OpenRuneGameValTable = (typeof OPENRUNE_GAMEVAL_TABLES)[number];

const TABLE_SET = new Set<string>(OPENRUNE_GAMEVAL_TABLES);
const GAMEVAL_SECTION = /^\s*\[gamevals\.([^.\]]+)\]\s*$/;

export type GameValTomlEntry = {
    table: OpenRuneGameValTable;
    key: string;
    symbol: string;
    id: number;
    sourcePath: string;
    line: number;
    modulePath?: string;
};

export type GameValTomlIssueCode =
    | "UNSUPPORTED_TABLE"
    | "MALFORMED_ENTRY"
    | "INVALID_ID"
    | "DUPLICATE_SYMBOL"
    | "SYMBOL_CONFLICT"
    | "ID_CONFLICT";

export type GameValTomlIssue = {
    code: GameValTomlIssueCode;
    message: string;
    sourcePath: string;
    line?: number;
    table?: string;
    symbol?: string;
    id?: number;
    related?: Array<{
        sourcePath: string;
        line: number;
        table: string;
        symbol: string;
        id: number;
        modulePath?: string;
    }>;
};

export type GameValTomlFileIndex = {
    sourcePath: string;
    modulePath?: string;
    entries: GameValTomlEntry[];
    issues: GameValTomlIssue[];
};

export type GameValTomlIndex = {
    files: GameValTomlFileIndex[];
    entries: GameValTomlEntry[];
    issues: GameValTomlIssue[];
    bySymbol: ReadonlyMap<string, readonly GameValTomlEntry[]>;
    byTableId: ReadonlyMap<string, readonly GameValTomlEntry[]>;
};

function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function compareEntries(a: GameValTomlEntry, b: GameValTomlEntry): number {
    return (
        compareText(a.table, b.table) ||
        compareText(a.key, b.key) ||
        a.id - b.id ||
        compareText(a.sourcePath, b.sourcePath) ||
        a.line - b.line
    );
}

function tableIdKey(table: string, id: number): string {
    return `${table}\u0000${id}`;
}

function sourceRef(entry: GameValTomlEntry) {
    return {
        sourcePath: entry.sourcePath,
        line: entry.line,
        table: entry.table,
        symbol: entry.symbol,
        id: entry.id,
        modulePath: entry.modulePath,
    };
}

/**
 * Parses the subset of TOML consumed by OpenRune's GameValProvider.
 *
 * Only exact [gamevals.<table>] sections participate. Entries are line-oriented
 * key = integer mappings. Inline comments on mapping values are intentionally
 * not stripped because OpenRune's current manual loader passes the complete
 * right-hand side to toIntOrNull().
 */
export function parseGameValToml(
    sourcePath: string,
    text: string,
    modulePath?: string,
): GameValTomlFileIndex {
    const entries: GameValTomlEntry[] = [];
    const issues: GameValTomlIssue[] = [];
    let currentTable: OpenRuneGameValTable | undefined;

    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
        const lineNumber = index + 1;
        const trimmed = lines[index]!.trim();

        if (!trimmed || trimmed.startsWith("#")) continue;

        const section = GAMEVAL_SECTION.exec(trimmed);
        if (section) {
            const table = section[1]!;
            if (TABLE_SET.has(table)) {
                currentTable = table as OpenRuneGameValTable;
            } else {
                currentTable = undefined;
                issues.push({
                    code: "UNSUPPORTED_TABLE",
                    message: `Unsupported OpenRune GameVal table "${table}" at ${sourcePath}:${lineNumber}.`,
                    sourcePath,
                    line: lineNumber,
                    table,
                });
            }
            continue;
        }

        if (trimmed.startsWith("[")) {
            currentTable = undefined;
            continue;
        }

        if (!currentTable) continue;

        const equalsIndex = trimmed.indexOf("=");
        if (equalsIndex <= 0) {
            issues.push({
                code: "MALFORMED_ENTRY",
                message: `Expected key = integer in [gamevals.${currentTable}] at ${sourcePath}:${lineNumber}.`,
                sourcePath,
                line: lineNumber,
                table: currentTable,
            });
            continue;
        }

        const key = trimmed.slice(0, equalsIndex).trim();
        const rawId = trimmed.slice(equalsIndex + 1).trim();
        if (!key) {
            issues.push({
                code: "MALFORMED_ENTRY",
                message: `GameVal key is empty at ${sourcePath}:${lineNumber}.`,
                sourcePath,
                line: lineNumber,
                table: currentTable,
            });
            continue;
        }

        if (!/^[+-]?\d+$/.test(rawId)) {
            issues.push({
                code: "INVALID_ID",
                message: `GameVal id "${rawId}" for "${currentTable}.${key}" is not an integer at ${sourcePath}:${lineNumber}.`,
                sourcePath,
                line: lineNumber,
                table: currentTable,
                symbol: `${currentTable}.${key}`,
            });
            continue;
        }

        const id = Number(rawId);
        if (!Number.isSafeInteger(id) || id < -1 || id > 0x7fffffff) {
            issues.push({
                code: "INVALID_ID",
                message: `GameVal id "${rawId}" for "${currentTable}.${key}" must be -1 or a non-negative 32-bit integer at ${sourcePath}:${lineNumber}.`,
                sourcePath,
                line: lineNumber,
                table: currentTable,
                symbol: `${currentTable}.${key}`,
            });
            continue;
        }

        entries.push({
            table: currentTable,
            key,
            symbol: `${currentTable}.${key}`,
            id,
            sourcePath,
            line: lineNumber,
            modulePath,
        });
    }

    return {
        sourcePath,
        modulePath,
        entries,
        issues,
    };
}

function pushMap(
    map: Map<string, GameValTomlEntry[]>,
    key: string,
    entry: GameValTomlEntry,
): void {
    const existing = map.get(key);
    if (existing) existing.push(entry);
    else map.set(key, [entry]);
}

export function buildGameValTomlIndex(
    files: readonly GameValTomlFileIndex[],
): GameValTomlIndex {
    const sortedFiles = [...files].sort((a, b) => compareText(a.sourcePath, b.sourcePath));
    const entries = sortedFiles.flatMap((file) => file.entries).sort(compareEntries);
    const issues = sortedFiles.flatMap((file) => file.issues);

    const bySymbolMutable = new Map<string, GameValTomlEntry[]>();
    const byTableIdMutable = new Map<string, GameValTomlEntry[]>();

    for (const entry of entries) {
        pushMap(bySymbolMutable, entry.symbol, entry);
        if (entry.id >= 0) {
            pushMap(byTableIdMutable, tableIdKey(entry.table, entry.id), entry);
        }
    }

    for (const [symbol, declarations] of bySymbolMutable) {
        if (declarations.length < 2) continue;
        const ids = new Set(declarations.map((entry) => entry.id));
        issues.push({
            code: ids.size === 1 ? "DUPLICATE_SYMBOL" : "SYMBOL_CONFLICT",
            message:
                ids.size === 1
                    ? `GameVal TOML symbol "${symbol}" is declared multiple times.`
                    : `GameVal TOML symbol "${symbol}" maps to conflicting ids.`,
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
            message: `GameVal TOML table "${first.table}" assigns id ${first.id} to multiple symbols.`,
            sourcePath: first.sourcePath,
            table: first.table,
            id: first.id,
            related: declarations.map(sourceRef),
        });
    }

    issues.sort(
        (a, b) =>
            compareText(a.sourcePath, b.sourcePath) ||
            (a.line ?? 0) - (b.line ?? 0) ||
            compareText(a.code, b.code) ||
            compareText(a.symbol ?? "", b.symbol ?? ""),
    );

    const bySymbol = new Map<string, readonly GameValTomlEntry[]>();
    for (const [symbol, declarations] of bySymbolMutable) {
        bySymbol.set(symbol, [...declarations].sort(compareEntries));
    }

    const byTableId = new Map<string, readonly GameValTomlEntry[]>();
    for (const [key, declarations] of byTableIdMutable) {
        byTableId.set(key, [...declarations].sort(compareEntries));
    }

    return {
        files: sortedFiles,
        entries,
        issues,
        bySymbol,
        byTableId,
    };
}

function moduleForSource(
    sourcePath: string,
    modules: readonly OpenRuneModuleIndexEntry[],
): string | undefined {
    for (const module of modules) {
        if (module.gameValTomlFiles.includes(sourcePath)) return module.path;
    }
    return undefined;
}

export async function indexProjectGameValToml(
    fileSystem: ProjectFileSystem,
    project: Pick<OpenRuneProjectIndex, "gameValTomlFiles" | "modules">,
): Promise<GameValTomlIndex> {
    const files: GameValTomlFileIndex[] = [];
    const sortedPaths = [...project.gameValTomlFiles].sort(compareText);

    for (const sourcePath of sortedPaths) {
        files.push(
            parseGameValToml(
                sourcePath,
                await fileSystem.readText(sourcePath),
                moduleForSource(sourcePath, project.modules),
            ),
        );
    }

    return buildGameValTomlIndex(files);
}

export function findGameValTomlSymbol(
    index: GameValTomlIndex,
    symbol: string,
): readonly GameValTomlEntry[] {
    return index.bySymbol.get(symbol) ?? [];
}

export function findGameValTomlId(
    index: GameValTomlIndex,
    table: string,
    id: number,
): readonly GameValTomlEntry[] {
    if (!Number.isSafeInteger(id) || id < 0) return [];
    return index.byTableId.get(tableIdKey(table, id)) ?? [];
}
