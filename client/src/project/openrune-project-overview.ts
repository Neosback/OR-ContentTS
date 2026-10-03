import type { OpenRuneProjectSessionSnapshot } from "./openrune-project-session";

/**
 * A human-readable summary of everything an OpenRune project session loaded, and which Studio features that enables.
 * Pure data (no UI), so it can be shown after setup, from a saved setup, and tested.
 */

export type OverviewRow = {
    label: string;
    value: string;
    /** A longer explanation, shown as a tooltip. */
    hint?: string;
};

export type OverviewSection = {
    id: "project" | "caches" | "modules" | "sources" | "gamevals" | "configs" | "maps" | "server";
    title: string;
    rows: OverviewRow[];
};

export type FeatureStatus = "ready" | "partial" | "missing";

export type OverviewFeature = {
    id: string;
    label: string;
    status: FeatureStatus;
    /** What was found, or what is missing and what to do about it. */
    detail: string;
    /**
     * "active": a Studio editor reads this today. "indexed": the project data is loaded and queryable, but no editor
     * uses it yet. Kept honest on purpose: this list is for knowing what you can rely on.
     */
    usage: "active" | "indexed";
};

export type OverviewIssueGroup = {
    area: string;
    count: number;
    /** The first few messages. */
    samples: string[];
};

export type OpenRuneProjectOverview = {
    name: string;
    summary: string;
    sections: OverviewSection[];
    features: OverviewFeature[];
    issues: OverviewIssueGroup[];
    issueTotal: number;
};

const SAMPLE_LIMIT = 4;

function count(value: number, singular: string, plural = `${singular}s`): string {
    return `${value.toLocaleString("en-US")} ${value === 1 ? singular : plural}`;
}

function issueText(issue: unknown): string {
    if (issue && typeof issue === "object") {
        const record = issue as { message?: unknown; code?: unknown; path?: unknown; sourcePath?: unknown };
        const text = typeof record.message === "string" ? record.message : typeof record.code === "string" ? record.code : "Issue";
        const where = typeof record.sourcePath === "string" ? record.sourcePath : typeof record.path === "string" ? record.path : undefined;
        return where && !text.includes(where) ? `${text} (${where})` : text;
    }
    return String(issue);
}

function issueGroup(area: string, issues: readonly unknown[]): OverviewIssueGroup | undefined {
    if (issues.length === 0) return undefined;
    return { area, count: issues.length, samples: issues.slice(0, SAMPLE_LIMIT).map(issueText) };
}

function tally<T>(items: Iterable<T>, key: (item: T) => string): Array<[string, number]> {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function listCounts(entries: Array<[string, number]>, limit = 8): string {
    if (entries.length === 0) return "none";
    const shown = entries.slice(0, limit).map(([name, n]) => `${name} ${n.toLocaleString("en-US")}`);
    return entries.length > limit ? `${shown.join(", ")} and ${entries.length - limit} more` : shown.join(", ");
}

export function describeOpenRuneProject(snapshot: OpenRuneProjectSessionSnapshot, profileName?: string): OpenRuneProjectOverview {
    const { project, gameVals, configToml, mapSources, serverToml, capabilities } = snapshot;
    const config = project.gameConfig;

    const packRoots = project.packRoots;
    const packWith = (field: "configsPath" | "modelsPath" | "spritesPath" | "cs2Path" | "interfacesPath") =>
        packRoots.filter((root) => root[field] !== undefined).length;
    const packCounts = {
        configs: packWith("configsPath"),
        models: packWith("modelsPath"),
        sprites: packWith("spritesPath"),
        cs2: packWith("cs2Path"),
        interfaces: packWith("interfacesPath"),
    };

    const moduleFamilies = tally(project.modules, (module) => module.family);
    const gameValTables = new Set(gameVals.declarations.map((declaration) => declaration.table));
    const gameValSources = tally(gameVals.declarations, (declaration) => declaration.sourceKind);
    const configTypes = tally(configToml.blocks, (block) => String((block as { type?: unknown }).type ?? "other"));
    const serverTables = [...serverToml.byTable.entries()].map(([table, blocks]): [string, number] => [String(table), blocks.length]).sort((a, b) => b[1] - a[1]);
    const spawnSquares = new Set<number>([...mapSources.npcsByMapSquare.keys(), ...mapSources.objsByMapSquare.keys()]);

    const sections: OverviewSection[] = [
        {
            id: "project",
            title: "Project",
            rows: [
                { label: "Name", value: config?.name ?? profileName ?? "Unnamed project" },
                { label: "Revision", value: config?.revision !== undefined ? String(config.revision) : "not set" },
                { label: "Environment", value: config?.environment ?? "not set" },
                { label: "World", value: config?.world !== undefined ? String(config.world) : "not set" },
                { label: "Game config", value: config?.path ?? "none (game.yml / game.example.yml not found)" },
                {
                    label: "Access",
                    value: capabilities.projectWrite ? "read and write" : "read only",
                    hint: capabilities.projectWrite ? undefined : "Source editing is off: the folder was opened without write access.",
                },
            ],
        },
        {
            id: "caches",
            title: "Caches",
            rows: [
                { label: "LIVE cache", value: project.liveCachePath ?? "not generated yet", hint: "Maps and interfaces are loaded from LIVE." },
                { label: "SERVER cache", value: project.serverCachePath ?? "not generated yet" },
            ],
        },
        {
            id: "modules",
            title: "Modules and pack sources",
            rows: [
                { label: "Gradle modules", value: `${count(project.modules.length, "module")} (${listCounts(moduleFamilies)})` },
                { label: "Pack modules", value: count(project.modules.filter((module) => module.isPackModule).length, "module") },
                { label: "Pack roots", value: count(packRoots.length, "pack root") },
                {
                    label: "Pack contents",
                    value: `configs ${packCounts.configs}, models ${packCounts.models}, sprites ${packCounts.sprites}, CS2 ${packCounts.cs2}, interfaces ${packCounts.interfaces}`,
                    hint: "How many pack roots contain each kind of source folder.",
                },
            ],
        },
        {
            id: "gamevals",
            title: "GameVals and RSCM",
            rows: [
                { label: "Declarations", value: count(gameVals.declarations.length, "declaration"), hint: "Named ids across all GameVal sources." },
                { label: "Tables", value: `${count(gameValTables.size, "table")}` },
                { label: "By source", value: listCounts(gameValSources) },
                {
                    label: "Files",
                    value: `${project.gameValBinaryFiles.length} DAT, ${project.gameValTomlFiles.length} module TOML, ${project.rscmFiles.length} RSCM`,
                },
            ],
        },
        {
            id: "configs",
            title: "Config sources",
            rows: [
                { label: "TOML files", value: count(configToml.files.length, "file") },
                { label: "Definitions", value: count(configToml.blocks.length, "definition") },
                { label: "By type", value: listCounts(configTypes) },
            ],
        },
        {
            id: "maps",
            title: "Map sources",
            rows: [
                { label: "NPC spawns", value: `${count(mapSources.npcs.length, "spawn")} in ${count(mapSources.npcFiles.length, "file")}` },
                { label: "Object spawns", value: `${count(mapSources.objs.length, "spawn")} in ${count(mapSources.objFiles.length, "file")}` },
                { label: "Areas", value: `${count(mapSources.areas.length, "area")} in ${count(mapSources.areaFiles.length, "file")}` },
                { label: "Map squares with spawns", value: count(spawnSquares.size, "square") },
            ],
        },
        {
            id: "server",
            title: "Server sources",
            rows: [
                { label: "TOML files", value: count(serverToml.files.length, "file") },
                { label: "Definitions", value: count(serverToml.blocks.length, "definition") },
                { label: "Inventories", value: count(serverToml.inventories.length, "inventory", "inventories") },
                { label: "By table", value: listCounts(serverTables) },
            ],
        },
    ];

    const packKinds = (Object.entries(packCounts) as Array<[string, number]>).filter(([, n]) => n > 0).map(([name]) => name);
    const features: OverviewFeature[] = [
        {
            id: "map-editor",
            label: "Map editor",
            status: capabilities.liveCache ? "ready" : "missing",
            detail: capabilities.liveCache
                ? "Loads terrain and objects from the LIVE cache."
                : "Needs the LIVE cache. Generate it with OpenRune bootstrap (.data/cache/LIVE), then reopen the project.",
            usage: "active",
        },
        {
            id: "interface-editor",
            label: "Interface editor and viewer",
            status: capabilities.liveCache ? "ready" : "missing",
            detail: capabilities.liveCache
                ? "Reads interfaces and sprites from the LIVE cache. Names come from the cache's own GameVals."
                : "Needs the LIVE cache. Generate it with OpenRune bootstrap (.data/cache/LIVE), then reopen the project.",
            usage: "active",
        },
        {
            id: "gamevals",
            label: "GameVal names and ids",
            status: capabilities.gameVals ? "ready" : "missing",
            detail: capabilities.gameVals
                ? `${count(gameVals.declarations.length, "declaration")} across ${count(gameValTables.size, "table")}.`
                : "No GameVal sources found (.data/gamevals, module GameVal TOML).",
            usage: "indexed",
        },
        {
            id: "rscm",
            label: "RSCM symbols",
            status: capabilities.rscm ? "ready" : "missing",
            detail: capabilities.rscm ? `${count(project.rscmFiles.length, "RSCM file")} found.` : "No .rscm files found.",
            usage: "indexed",
        },
        {
            id: "config-sources",
            label: "Config sources (TOML)",
            status: configToml.blocks.length > 0 ? "ready" : capabilities.packConfigs ? "partial" : "missing",
            detail:
                configToml.blocks.length > 0
                    ? `${count(configToml.blocks.length, "definition")} in ${count(configToml.files.length, "file")}.`
                    : capabilities.packConfigs
                      ? "Pack config folders exist but contain no definitions yet."
                      : "No pack config folders found.",
            usage: "indexed",
        },
        {
            id: "map-sources",
            label: "Spawn and area sources (TOML)",
            status: capabilities.mapSourceToml ? (mapSources.npcs.length + mapSources.objs.length + mapSources.areas.length > 0 ? "ready" : "partial") : "missing",
            detail: capabilities.mapSourceToml
                ? `${count(mapSources.npcs.length, "NPC spawn")}, ${count(mapSources.objs.length, "object spawn")}, ${count(mapSources.areas.length, "area")}.`
                : "No raw map source folder found (.data/raw-cache/map).",
            usage: "indexed",
        },
        {
            id: "server-sources",
            label: "Server definitions (TOML)",
            status: capabilities.serverSourceToml ? (serverToml.blocks.length + serverToml.inventories.length > 0 ? "ready" : "partial") : "missing",
            detail: capabilities.serverSourceToml
                ? `${count(serverToml.blocks.length, "definition")} and ${count(serverToml.inventories.length, "inventory", "inventories")}.`
                : "No server source folder found (.data/raw-cache/server).",
            usage: "indexed",
        },
        {
            id: "pack-sources",
            label: "Pack sources (models, sprites, CS2, interfaces)",
            status: packKinds.length === 0 ? "missing" : packKinds.length >= 4 ? "ready" : "partial",
            detail: packKinds.length === 0 ? "No pack roots with source folders found." : `Found: ${packKinds.join(", ")} in ${count(packRoots.length, "pack root")}.`,
            usage: "indexed",
        },
        {
            id: "source-editing",
            label: "Editing project sources",
            status: capabilities.projectWrite ? "ready" : "missing",
            detail: capabilities.projectWrite ? "The project folder is writable." : "The folder was opened read-only. Grant write access to edit sources.",
            usage: "indexed",
        },
        {
            id: "server-cache",
            label: "SERVER cache",
            status: capabilities.serverCache ? "ready" : "missing",
            detail: capabilities.serverCache ? `Found at ${project.serverCachePath}.` : "Not generated yet (.data/cache/SERVER).",
            usage: "indexed",
        },
    ];

    const issues = [
        issueGroup("GameVals", [...gameVals.issues, ...gameVals.sourceIssues.dat, ...gameVals.sourceIssues.toml, ...gameVals.sourceIssues.rscm]),
        issueGroup("Config sources", configToml.issues),
        issueGroup("Map sources", mapSources.issues),
        issueGroup("Server sources", serverToml.issues),
    ].filter((group): group is OverviewIssueGroup => group !== undefined);

    const ready = features.filter((feature) => feature.status === "ready").length;
    return {
        name: config?.name ?? profileName ?? "OpenRune project",
        summary: `${ready} of ${features.length} capabilities ready${snapshot.diagnostics.total > 0 ? `, ${count(snapshot.diagnostics.total, "issue")} to review` : ""}`,
        sections,
        features,
        issues,
        issueTotal: snapshot.diagnostics.total,
    };
}
