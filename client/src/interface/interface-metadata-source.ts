import type { GameVals } from "../rs/config/gameval/GameVals";
import { GameValGroupType } from "../rs/config/gameval/GameValGroupType";
import type {
    Interface as CacheInterfaceGameVal,
    InterfaceComponent as CacheInterfaceComponentGameVal,
} from "../rs/config/gameval/impl/Interface";
import {
    findGameValId,
    type GameValRegistry,
    type GameValRegistryEntry,
} from "../project/gameval-registry";

export type InterfaceMetadataProvenance = {
    sourceKind: string;
    sourcePath: string;
    line?: number;
    modulePath?: string;
};

export type InterfaceMetadata = {
    id: number;
    cacheName?: string;
    projectSymbol?: string;
    projectKey?: string;
    provenance?: InterfaceMetadataProvenance;
    declarations: readonly InterfaceMetadataProvenance[];
    displayName: string;
};

export type InterfaceComponentMetadata = {
    interfaceId: number;
    componentId: number;
    packedId: number;
    cacheName?: string;
    projectSymbol?: string;
    projectKey?: string;
    provenance?: InterfaceMetadataProvenance;
    declarations: readonly InterfaceMetadataProvenance[];
    displayName?: string;
};

export interface InterfaceMetadataSource {
    getInterface(id: number): InterfaceMetadata;
    getComponent(interfaceId: number, componentId: number, packedId?: number): InterfaceComponentMetadata;
}

function provenance(entry: GameValRegistryEntry): InterfaceMetadataProvenance {
    return {
        sourceKind: entry.source.sourceKind,
        sourcePath: entry.source.sourcePath,
        line: entry.source.line,
        modulePath: entry.source.modulePath,
    };
}

function declarationProvenance(entry: GameValRegistryEntry): InterfaceMetadataProvenance[] {
    return entry.declarations.map((source) => ({
        sourceKind: source.sourceKind,
        sourcePath: source.sourcePath,
        line: source.line,
        modulePath: source.modulePath,
    }));
}

function firstProjectEntry(
    registry: GameValRegistry | null,
    candidates: readonly [table: string, id: number][],
): GameValRegistryEntry | undefined {
    if (!registry) return undefined;
    for (const [table, id] of candidates) {
        const found = findGameValId(registry, table, id);
        if (found) return found;
    }
    return undefined;
}

function loadCacheInterfaces(gameVals: GameVals | null): void {
    if (!gameVals) return;
    try {
        gameVals.get(GameValGroupType.IFTYPES);
    } catch {
        // Metadata enrichment is optional; numeric ids remain authoritative.
    }
}

function cacheInterface(
    gameVals: GameVals | null,
    id: number,
): CacheInterfaceGameVal | undefined {
    if (!gameVals) return undefined;
    loadCacheInterfaces(gameVals);
    return gameVals.getFastAs<CacheInterfaceGameVal>(GameValGroupType.IFTYPES, id);
}

function cacheComponent(
    gameVals: GameVals | null,
    interfaceId: number,
    componentId: number,
): CacheInterfaceComponentGameVal | undefined {
    return cacheInterface(gameVals, interfaceId)?.components.find(
        (component) => component.id === componentId,
    );
}

function clean(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

/**
 * Framework-neutral interface metadata enrichment.
 *
 * Cache GameVals describe the selected cache and therefore remain the closest
 * metadata to runtime truth. OpenRune project GameVals/RSCM add authoring names
 * and source provenance, but never replace numeric ids or decoded widget types.
 */
export function createInterfaceMetadataSource(
    gameVals: GameVals | null,
    registry: GameValRegistry | null,
): InterfaceMetadataSource {
    return {
        getInterface(id: number): InterfaceMetadata {
            const cacheName = clean(cacheInterface(gameVals, id)?.name);
            const project = firstProjectEntry(registry, [["interface", id]]);
            const projectKey = clean(project?.key);
            return {
                id,
                cacheName,
                projectSymbol: project?.symbol,
                projectKey,
                provenance: project ? provenance(project) : undefined,
                declarations: project ? declarationProvenance(project) : [],
                displayName: projectKey ?? cacheName ?? `Interface ${id}`,
            };
        },

        getComponent(
            interfaceId: number,
            componentId: number,
            packedId = ((interfaceId & 0xffff) << 16) | (componentId & 0xffff),
        ): InterfaceComponentMetadata {
            const cacheName = clean(cacheComponent(gameVals, interfaceId, componentId)?.name);
            const project = firstProjectEntry(registry, [
                ["component", packedId],
                ["components", packedId],
            ]);
            const projectKey = clean(project?.key);
            return {
                interfaceId,
                componentId,
                packedId,
                cacheName,
                projectSymbol: project?.symbol,
                projectKey,
                provenance: project ? provenance(project) : undefined,
                declarations: project ? declarationProvenance(project) : [],
                displayName: projectKey ?? cacheName,
            };
        },
    };
}
