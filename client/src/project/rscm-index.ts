import { projectPathName, type ProjectFileSystem } from "./project-filesystem";
import type { OpenRuneProjectIndex } from "./openrune-project-index";

export type RscmEntry = {
    namespace: string;
    key: string;
    symbol: string;
    id: number;
    sourcePath: string;
    line: number;
};

export type RscmIssueCode =
    | "INVALID_SOURCE"
    | "MALFORMED_LINE"
    | "INVALID_ID"
    | "DUPLICATE_SYMBOL"
    | "SYMBOL_CONFLICT"
    | "ID_CONFLICT";

export type RscmIssue = {
    code: RscmIssueCode;
    message: string;
    sourcePath?: string;
    line?: number;
    symbol?: string;
    namespace?: string;
    id?: number;
    related?: Array<{ sourcePath: string; line: number; symbol: string; id: number }>;
};

export type RscmFileIndex = {
    sourcePath: string;
    namespace?: string;
    entries: RscmEntry[];
    issues: RscmIssue[];
};

export type RscmIndex = {
    files: RscmFileIndex[];
    entries: RscmEntry[];
    issues: RscmIssue[];
    bySymbol: ReadonlyMap<string, readonly RscmEntry[]>;
    byNamespaceId: ReadonlyMap<string, readonly RscmEntry[]>;
};

function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function compareEntries(a: RscmEntry, b: RscmEntry): number {
    return (
        compareText(a.symbol, b.symbol) ||
        a.id - b.id ||
        compareText(a.sourcePath, b.sourcePath) ||
        a.line - b.line
    );
}

function namespaceFromPath(sourcePath: string): string | undefined {
    const name = projectPathName(sourcePath);
    if (!name.toLowerCase().endsWith(".rscm")) return undefined;
    const namespace = name.slice(0, -5).trim();
    return namespace || undefined;
}

function isComment(line: string): boolean {
    return line.startsWith("#") || line.startsWith("//") || line.startsWith(";");
}

function sourceRef(entry: RscmEntry) {
    return {
        sourcePath: entry.sourcePath,
        line: entry.line,
        symbol: entry.symbol,
        id: entry.id,
    };
}

/**
 * Parses one line-oriented RuneScape Config Mapping file.
 *
 * The filename supplies the namespace (for example item.rscm -> item.*).
 * Mapping lines are `key=value`; colons inside keys are preserved because
 * grouped mappings such as component/column identities use them as part of the
 * key. `-1` is retained as an unassigned value.
 */
export function parseRscmFile(sourcePath: string, text: string): RscmFileIndex {
    const namespace = namespaceFromPath(sourcePath);
    const issues: RscmIssue[] = [];
    const entries: RscmEntry[] = [];

    if (!namespace) {
        issues.push({
            code: "INVALID_SOURCE",
            message: `RSCM source "${sourcePath}" must have a non-empty .rscm filename.`,
            sourcePath,
        });
        return { sourcePath, entries, issues };
    }

    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
        const lineNumber = index + 1;
        const line = lines[index]!.trim();
        if (!line || isComment(line)) continue;

        const separator = line.indexOf("=");
        if (separator <= 0 || separator === line.length - 1) {
            issues.push({
                code: "MALFORMED_LINE",
                message: `Expected key=value mapping at ${sourcePath}:${lineNumber}.`,
                sourcePath,
                line: lineNumber,
                namespace,
            });
            continue;
        }

        const key = line.slice(0, separator).trim();
        const rawId = line.slice(separator + 1).trim();
        if (!key) {
            issues.push({
                code: "MALFORMED_LINE",
                message: `RSCM key is empty at ${sourcePath}:${lineNumber}.`,
                sourcePath,
                line: lineNumber,
                namespace,
            });
            continue;
        }

        if (!/^-?\d+$/.test(rawId)) {
            issues.push({
                code: "INVALID_ID",
                message: `RSCM id "${rawId}" is not an integer at ${sourcePath}:${lineNumber}.`,
                sourcePath,
                line: lineNumber,
                namespace,
            });
            continue;
        }

        const id = Number(rawId);
        if (!Number.isSafeInteger(id) || id < -1) {
            issues.push({
                code: "INVALID_ID",
                message: `RSCM id "${rawId}" must be -1 or a non-negative safe integer at ${sourcePath}:${lineNumber}.`,
                sourcePath,
                line: lineNumber,
                namespace,
            });
            continue;
        }

        entries.push({
            namespace,
            key,
            symbol: `${namespace}.${key}`,
            id,
            sourcePath,
            line: lineNumber,
        });
    }

    return {
        sourcePath,
        namespace,
        entries,
        issues,
    };
}

function pushMap<K>(map: Map<K, RscmEntry[]>, key: K, entry: RscmEntry): void {
    const existing = map.get(key);
    if (existing) {
        existing.push(entry);
    } else {
        map.set(key, [entry]);
    }
}

function namespaceIdKey(namespace: string, id: number): string {
    return `${namespace}\u0000${id}`;
}

export function buildRscmIndex(files: readonly RscmFileIndex[]): RscmIndex {
    const sortedFiles = [...files].sort((a, b) => compareText(a.sourcePath, b.sourcePath));
    const entries = sortedFiles.flatMap((file) => file.entries).sort(compareEntries);
    const issues = sortedFiles.flatMap((file) => file.issues);

    const bySymbolMutable = new Map<string, RscmEntry[]>();
    const byNamespaceIdMutable = new Map<string, RscmEntry[]>();

    for (const entry of entries) {
        pushMap(bySymbolMutable, entry.symbol, entry);
        if (entry.id >= 0) {
            pushMap(byNamespaceIdMutable, namespaceIdKey(entry.namespace, entry.id), entry);
        }
    }

    for (const [symbol, declarations] of bySymbolMutable) {
        if (declarations.length < 2) continue;
        const ids = new Set(declarations.map((entry) => entry.id));
        issues.push({
            code: ids.size === 1 ? "DUPLICATE_SYMBOL" : "SYMBOL_CONFLICT",
            message:
                ids.size === 1
                    ? `RSCM symbol "${symbol}" is declared multiple times.`
                    : `RSCM symbol "${symbol}" maps to conflicting ids.`,
            symbol,
            namespace: declarations[0]!.namespace,
            related: declarations.map(sourceRef),
        });
    }

    for (const declarations of byNamespaceIdMutable.values()) {
        const symbols = new Set(declarations.map((entry) => entry.symbol));
        if (symbols.size < 2) continue;
        const first = declarations[0]!;
        issues.push({
            code: "ID_CONFLICT",
            message: `RSCM namespace "${first.namespace}" assigns id ${first.id} to multiple symbols.`,
            namespace: first.namespace,
            id: first.id,
            related: declarations.map(sourceRef),
        });
    }

    issues.sort(
        (a, b) =>
            compareText(a.sourcePath ?? "", b.sourcePath ?? "") ||
            (a.line ?? 0) - (b.line ?? 0) ||
            compareText(a.code, b.code) ||
            compareText(a.symbol ?? "", b.symbol ?? ""),
    );

    const bySymbol = new Map<string, readonly RscmEntry[]>();
    for (const [symbol, declarations] of bySymbolMutable) {
        bySymbol.set(symbol, [...declarations].sort(compareEntries));
    }

    const byNamespaceId = new Map<string, readonly RscmEntry[]>();
    for (const [key, declarations] of byNamespaceIdMutable) {
        byNamespaceId.set(key, [...declarations].sort(compareEntries));
    }

    return {
        files: sortedFiles,
        entries,
        issues,
        bySymbol,
        byNamespaceId,
    };
}

export async function indexProjectRscm(
    fileSystem: ProjectFileSystem,
    project: Pick<OpenRuneProjectIndex, "rscmFiles">,
): Promise<RscmIndex> {
    const files: RscmFileIndex[] = [];
    for (const sourcePath of [...project.rscmFiles].sort(compareText)) {
        files.push(parseRscmFile(sourcePath, await fileSystem.readText(sourcePath)));
    }
    return buildRscmIndex(files);
}

export function findRscmSymbol(index: RscmIndex, symbol: string): readonly RscmEntry[] {
    return index.bySymbol.get(symbol) ?? [];
}

export function findRscmId(
    index: RscmIndex,
    namespace: string,
    id: number,
): readonly RscmEntry[] {
    if (!Number.isSafeInteger(id) || id < 0) return [];
    return index.byNamespaceId.get(namespaceIdKey(namespace, id)) ?? [];
}
