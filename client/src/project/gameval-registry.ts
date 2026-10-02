import {
    indexProjectGameValDat,
    type GameValDatEntry,
    type GameValDatIndex,
    type GameValDatIssue,
} from "./gameval-dat-index";
import {
    indexProjectGameValToml,
    type GameValTomlEntry,
    type GameValTomlIndex,
    type GameValTomlIssue,
} from "./gameval-toml-index";
import type { OpenRuneProjectIndex } from "./openrune-project-index";
import type { ProjectFileSystem } from "./project-filesystem";
import {
    indexProjectRscm,
    type RscmEntry,
    type RscmIndex,
    type RscmIssue,
} from "./rscm-index";

export type GameValRegistrySourceKind =
    | "base-dat"
    | "generated-dat"
    | "module-toml"
    | "rscm";

export type GameValRegistryDeclaration = {
    table: string;
    key: string;
    symbol: string;
    id: number;
    sourceKind: GameValRegistrySourceKind;
    sourcePath: string;
    line?: number;
    modulePath?: string;
    tableIndex?: number;
    entryIndex?: number;
};

export type GameValRegistryEntry = {
    table: string;
    key: string;
    symbol: string;
    id: number;
    source: GameValRegistryDeclaration;
    declarations: readonly GameValRegistryDeclaration[];
};

export type GameValRegistryIssueCode =
    | "BASE_ID_RESERVED"
    | "SYMBOL_CONFLICT"
    | "ID_CONFLICT";

export type GameValRegistryIssue = {
    code: GameValRegistryIssueCode;
    message: string;
    table: string;
    symbol: string;
    id: number;
    sourcePath: string;
    line?: number;
    maxBaseId?: number;
    related?: readonly GameValRegistryDeclaration[];
};

export type GameValRegistrySourceIssues = {
    dat: readonly GameValDatIssue[];
    toml: readonly GameValTomlIssue[];
    rscm: readonly RscmIssue[];
};

export type GameValRegistry = {
    dat: GameValDatIndex;
    toml: GameValTomlIndex;
    rscm: RscmIndex;
    declarations: readonly GameValRegistryDeclaration[];
    entries: readonly GameValRegistryEntry[];
    issues: readonly GameValRegistryIssue[];
    sourceIssues: GameValRegistrySourceIssues;
    bySymbol: ReadonlyMap<string, GameValRegistryEntry>;
    byTableId: ReadonlyMap<string, GameValRegistryEntry>;
};

export type GameValRegistryIndexes = {
    dat: GameValDatIndex;
    toml: GameValTomlIndex;
    rscm: RscmIndex;
};

function compareText(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function tableIdKey(table: string, id: number): string {
    return `${table}\u0000${id}`;
}

function tomlRootRank(path: string): number {
    if (path === "content" || path.startsWith("content/")) return 0;
    if (path === "api" || path.startsWith("api/")) return 1;
    return 2;
}

function compareDatDeclarations(
    a: GameValRegistryDeclaration,
    b: GameValRegistryDeclaration,
): number {
    return (
        compareText(a.sourcePath, b.sourcePath) ||
        (a.tableIndex ?? 0) - (b.tableIndex ?? 0) ||
        (a.entryIndex ?? 0) - (b.entryIndex ?? 0)
    );
}

function compareTomlDeclarations(
    a: GameValRegistryDeclaration,
    b: GameValRegistryDeclaration,
): number {
    return (
        tomlRootRank(a.sourcePath) - tomlRootRank(b.sourcePath) ||
        compareText(a.sourcePath, b.sourcePath) ||
        (a.line ?? 0) - (b.line ?? 0)
    );
}

function compareRscmDeclarations(
    a: GameValRegistryDeclaration,
    b: GameValRegistryDeclaration,
): number {
    return compareText(a.sourcePath, b.sourcePath) || (a.line ?? 0) - (b.line ?? 0);
}

function fromDat(entry: GameValDatEntry): GameValRegistryDeclaration {
    return {
        table: entry.table,
        key: entry.key,
        symbol: entry.symbol,
        id: entry.id,
        sourceKind: entry.sourceKind === "base" ? "base-dat" : "generated-dat",
        sourcePath: entry.sourcePath,
        tableIndex: entry.tableIndex,
        entryIndex: entry.entryIndex,
    };
}

function fromToml(entry: GameValTomlEntry): GameValRegistryDeclaration {
    return {
        table: entry.table,
        key: entry.key,
        symbol: entry.symbol,
        id: entry.id,
        sourceKind: "module-toml",
        sourcePath: entry.sourcePath,
        line: entry.line,
        modulePath: entry.modulePath,
    };
}

function fromRscm(entry: RscmEntry): GameValRegistryDeclaration {
    return {
        table: entry.namespace,
        key: entry.key,
        symbol: entry.symbol,
        id: entry.id,
        sourceKind: "rscm",
        sourcePath: entry.sourcePath,
        line: entry.line,
    };
}

function collectDeclarations(indexes: GameValRegistryIndexes): GameValRegistryDeclaration[] {
    const base = indexes.dat.files
        .filter((file) => file.sourceKind === "base")
        .flatMap((file) => file.entries.map(fromDat))
        .sort(compareDatDeclarations);
    const generated = indexes.dat.files
        .filter((file) => file.sourceKind === "generated")
        .flatMap((file) => file.entries.map(fromDat))
        .sort(compareDatDeclarations);
    const toml = indexes.toml.entries.map(fromToml).sort(compareTomlDeclarations);
    const rscm = indexes.rscm.entries.map(fromRscm).sort(compareRscmDeclarations);

    return [...base, ...generated, ...toml, ...rscm];
}

function pushDeclaration(
    map: Map<string, GameValRegistryDeclaration[]>,
    declaration: GameValRegistryDeclaration,
): void {
    const declarations = map.get(declaration.symbol);
    if (declarations) declarations.push(declaration);
    else map.set(declaration.symbol, [declaration]);
}

type EffectiveEntry = Omit<GameValRegistryEntry, "declarations">;

function effectiveFrom(
    declaration: GameValRegistryDeclaration,
): EffectiveEntry {
    return {
        table: declaration.table,
        key: declaration.key,
        symbol: declaration.symbol,
        id: declaration.id,
        source: declaration,
    };
}

function isDatSource(sourceKind: GameValRegistrySourceKind): boolean {
    return sourceKind === "base-dat" || sourceKind === "generated-dat";
}

/**
 * Builds the portable GameVal view using the same source phases as OpenRune:
 *
 * base DAT -> generated DAT -> content/api gamevals.toml -> RSCM.
 *
 * DAT mappings use first-declaration semantics. Custom TOML/RSCM declarations
 * may claim source provenance for an identical mapping, but they cannot
 * override an assigned symbol, reuse another symbol's id, or use an id at or
 * below the base-cache ceiling. RSCM is processed after TOML, matching
 * OpenRune's current GameValProvider source order.
 */
export function buildGameValRegistry(
    indexes: GameValRegistryIndexes,
): GameValRegistry {
    const declarations = collectDeclarations(indexes);
    const declarationsBySymbol = new Map<string, GameValRegistryDeclaration[]>();
    for (const declaration of declarations) {
        pushDeclaration(declarationsBySymbol, declaration);
    }

    const effectiveBySymbol = new Map<string, EffectiveEntry>();
    const effectiveByTableId = new Map<string, EffectiveEntry>();
    const issues: GameValRegistryIssue[] = [];

    for (const declaration of declarations) {
        if (!isDatSource(declaration.sourceKind)) continue;

        if (!effectiveBySymbol.has(declaration.symbol)) {
            const effective = effectiveFrom(declaration);
            effectiveBySymbol.set(declaration.symbol, effective);
            if (declaration.id >= 0) {
                const idKey = tableIdKey(declaration.table, declaration.id);
                if (!effectiveByTableId.has(idKey)) {
                    effectiveByTableId.set(idKey, effective);
                }
            }
        }
    }

    for (const declaration of declarations) {
        if (isDatSource(declaration.sourceKind)) continue;

        const maxBaseId = indexes.dat.maxBaseId.get(declaration.table) ?? -1;
        if (declaration.id >= 0 && declaration.id <= maxBaseId) {
            issues.push({
                code: "BASE_ID_RESERVED",
                message: `Custom GameVal "${declaration.symbol}" uses id ${declaration.id}, but OpenRune reserves 0..${maxBaseId} for the base cache in table "${declaration.table}".`,
                table: declaration.table,
                symbol: declaration.symbol,
                id: declaration.id,
                sourcePath: declaration.sourcePath,
                line: declaration.line,
                maxBaseId,
                related: effectiveBySymbol.has(declaration.symbol)
                    ? [effectiveBySymbol.get(declaration.symbol)!.source]
                    : undefined,
            });
            continue;
        }

        const existing = effectiveBySymbol.get(declaration.symbol);

        if (declaration.id === -1) {
            if (existing && existing.id !== -1) continue;

            effectiveBySymbol.set(declaration.symbol, effectiveFrom(declaration));
            continue;
        }

        if (existing && existing.id !== -1) {
            if (existing.id === declaration.id) {
                const effective = effectiveFrom(declaration);
                effectiveBySymbol.set(declaration.symbol, effective);

                const idKey = tableIdKey(declaration.table, declaration.id);
                const currentIdEntry = effectiveByTableId.get(idKey);
                if (!currentIdEntry || currentIdEntry.symbol === declaration.symbol) {
                    effectiveByTableId.set(idKey, effective);
                }
                continue;
            }

            issues.push({
                code: "SYMBOL_CONFLICT",
                message: `GameVal "${declaration.symbol}" is already assigned id ${existing.id}; "${declaration.sourcePath}" attempted ${declaration.id}.`,
                table: declaration.table,
                symbol: declaration.symbol,
                id: declaration.id,
                sourcePath: declaration.sourcePath,
                line: declaration.line,
                related: [existing.source],
            });
            continue;
        }

        const idKey = tableIdKey(declaration.table, declaration.id);
        const existingId = effectiveByTableId.get(idKey);
        if (existingId && existingId.symbol !== declaration.symbol) {
            issues.push({
                code: "ID_CONFLICT",
                message: `GameVal id ${declaration.id} in table "${declaration.table}" is already assigned to "${existingId.symbol}"; "${declaration.symbol}" cannot reuse it.`,
                table: declaration.table,
                symbol: declaration.symbol,
                id: declaration.id,
                sourcePath: declaration.sourcePath,
                line: declaration.line,
                related: [existingId.source],
            });
            continue;
        }

        const effective = effectiveFrom(declaration);
        effectiveBySymbol.set(declaration.symbol, effective);
        effectiveByTableId.set(idKey, effective);
    }

    issues.sort(
        (a, b) =>
            compareText(a.sourcePath, b.sourcePath) ||
            (a.line ?? 0) - (b.line ?? 0) ||
            compareText(a.code, b.code) ||
            compareText(a.symbol, b.symbol),
    );

    const entries = [...effectiveBySymbol.values()]
        .map<GameValRegistryEntry>((entry) => ({
            ...entry,
            declarations: declarationsBySymbol.get(entry.symbol) ?? [],
        }))
        .sort(
            (a, b) =>
                compareText(a.table, b.table) ||
                compareText(a.key, b.key) ||
                a.id - b.id,
        );

    const bySymbol = new Map<string, GameValRegistryEntry>();
    const byTableId = new Map<string, GameValRegistryEntry>();
    for (const entry of entries) {
        bySymbol.set(entry.symbol, entry);
        if (entry.id >= 0) {
            const idKey = tableIdKey(entry.table, entry.id);
            if (!byTableId.has(idKey)) byTableId.set(idKey, entry);
        }
    }

    return {
        ...indexes,
        declarations,
        entries,
        issues,
        sourceIssues: {
            dat: indexes.dat.issues,
            toml: indexes.toml.issues,
            rscm: indexes.rscm.issues,
        },
        bySymbol,
        byTableId,
    };
}

export async function indexProjectGameValRegistry(
    fileSystem: ProjectFileSystem,
    project: Pick<
        OpenRuneProjectIndex,
        "gameValBinaryFiles" | "gameValTomlFiles" | "modules" | "rscmFiles"
    >,
): Promise<GameValRegistry> {
    const [dat, toml, rscm] = await Promise.all([
        indexProjectGameValDat(fileSystem, project),
        indexProjectGameValToml(fileSystem, project),
        indexProjectRscm(fileSystem, project),
    ]);

    return buildGameValRegistry({ dat, toml, rscm });
}

export function findGameValSymbol(
    registry: GameValRegistry,
    symbol: string,
): GameValRegistryEntry | undefined {
    return registry.bySymbol.get(symbol);
}

export function findGameValId(
    registry: GameValRegistry,
    table: string,
    id: number,
): GameValRegistryEntry | undefined {
    if (!Number.isSafeInteger(id) || id < 0) return undefined;
    return registry.byTableId.get(tableIdKey(table, id));
}
