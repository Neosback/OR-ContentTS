import {
    projectParentPath,
    projectPathName,
    type ProjectFileEntry,
    type ProjectFileSystem,
} from "./project-filesystem";

export type OpenRuneModuleFamily =
    | "api"
    | "content"
    | "engine"
    | "server"
    | "cache"
    | "tools"
    | "other";

export type OpenRuneGameConfig = {
    path: string;
    name?: string;
    revision?: number;
    environment?: string;
    world?: number;
};

export type OpenRuneModuleIndexEntry = {
    path: string;
    name: string;
    buildFile: string;
    family: OpenRuneModuleFamily;
    isPackModule: boolean;
    packRoots: string[];
    gameValTomlFiles: string[];
};

export type OpenRunePackRoot = {
    modulePath: string;
    path: string;
    configsPath?: string;
    modelsPath?: string;
    spritesPath?: string;
    cs2Path?: string;
    interfacesPath?: string;
};

export type OpenRuneRawMapSources = {
    root?: string;
    npcRoot?: string;
    objRoot?: string;
    areaRoot?: string;
    npcTomlFiles: string[];
    objTomlFiles: string[];
    areaTomlFiles: string[];
};

export type OpenRuneRawServerSources = {
    root?: string;
    tomlFiles: string[];
};

export type OpenRuneProjectIndex = {
    isOpenRuneProject: boolean;
    markers: string[];
    gameConfig?: OpenRuneGameConfig;
    modules: OpenRuneModuleIndexEntry[];
    packRoots: OpenRunePackRoot[];
    gameValTomlFiles: string[];
    rscmFiles: string[];
    gameValBinaryFiles: string[];
    rawMapSources: OpenRuneRawMapSources;
    rawServerSources: OpenRuneRawServerSources;
    liveCachePath?: string;
    serverCachePath?: string;
};

const SOURCE_SKIP_DIRECTORY_NAMES = new Set([
    ".git",
    ".gradle",
    ".idea",
    ".vscode",
    "build",
    "dist",
    "node_modules",
    "out",
    "target",
]);

function pathDepth(path: string): number {
    return path ? path.split("/").length : 0;
}

function comparePaths(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function moduleFamily(path: string): OpenRuneModuleFamily {
    const first = path.split("/")[0] ?? "";
    switch (first) {
        case "api":
            return "api";
        case "content":
            return "content";
        case "engine":
            return "engine";
        case "server":
            return "server";
        case "or-cache":
            return "cache";
        case "tools":
            return "tools";
        default:
            return "other";
    }
}

function parseYamlScalar(value: string): string | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function parseTopLevelGameConfig(path: string, text: string): OpenRuneGameConfig {
    const result: OpenRuneGameConfig = { path };

    for (const rawLine of text.split(/\r?\n/)) {
        if (!rawLine || /^\s/.test(rawLine)) continue;
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const colon = line.indexOf(":");
        if (colon <= 0) continue;

        const key = line.slice(0, colon).trim();
        const value = parseYamlScalar(line.slice(colon + 1));
        if (value === undefined) continue;

        if (key === "name") {
            result.name = value;
        } else if (key === "environment") {
            result.environment = value;
        } else if (key === "revision") {
            const revision = Number(value);
            if (Number.isSafeInteger(revision)) result.revision = revision;
        } else if (key === "world") {
            const world = Number(value);
            if (Number.isSafeInteger(world)) result.world = world;
        }
    }

    return result;
}

async function directoryExists(fs: ProjectFileSystem, path: string): Promise<boolean> {
    const entry = await fs.stat(path);
    return entry?.kind === "directory";
}

async function firstExistingFile(
    fs: ProjectFileSystem,
    candidates: readonly string[],
): Promise<string | undefined> {
    for (const path of candidates) {
        const entry = await fs.stat(path);
        if (entry?.kind === "file") return path;
    }
    return undefined;
}

async function firstExistingDirectory(
    fs: ProjectFileSystem,
    candidates: readonly string[],
): Promise<string | undefined> {
    for (const path of candidates) {
        if (await directoryExists(fs, path)) return path;
    }
    return undefined;
}

async function collectFiles(
    fs: ProjectFileSystem,
    root: string,
    predicate: (path: string) => boolean,
): Promise<string[]> {
    if (!(await directoryExists(fs, root))) return [];

    const files: string[] = [];
    const visit = async (directory: string): Promise<void> => {
        const entries = await fs.list(directory);
        for (const entry of entries) {
            if (entry.kind === "directory") {
                await visit(entry.path);
            } else if (predicate(entry.path)) {
                files.push(entry.path);
            }
        }
    };

    await visit(root);
    return files.sort(comparePaths);
}

type SourceWalk = {
    files: Set<string>;
    directories: Set<string>;
};

async function walkSourceTree(fs: ProjectFileSystem): Promise<SourceWalk> {
    const files = new Set<string>();
    const directories = new Set<string>([""]);

    const visit = async (directory: string): Promise<void> => {
        const entries = await fs.list(directory);
        for (const entry of entries) {
            if (entry.kind === "file") {
                files.add(entry.path);
                continue;
            }

            directories.add(entry.path);
            const name = projectPathName(entry.path);
            if (SOURCE_SKIP_DIRECTORY_NAMES.has(name)) continue;
            if (entry.path === ".data" || entry.path.startsWith(".data/")) continue;
            await visit(entry.path);
        }
    };

    await visit("");
    return { files, directories };
}

function nearestModulePath(path: string, modulePaths: readonly string[]): string | undefined {
    let current = projectParentPath(path);
    while (current) {
        if (modulePaths.includes(current)) return current;
        current = projectParentPath(current);
    }
    return modulePaths.includes("") ? "" : undefined;
}

function directPackRootsForModule(
    modulePath: string,
    directories: ReadonlySet<string>,
): string[] {
    const canonical = modulePath
        ? `${modulePath}/src/main/resources/pack`
        : "src/main/resources/pack";
    return directories.has(canonical) ? [canonical] : [];
}

function childIfDirectory(
    root: string,
    child: string,
    directories: ReadonlySet<string>,
): string | undefined {
    const path = `${root}/${child}`;
    return directories.has(path) ? path : undefined;
}

export async function indexOpenRuneProject(
    fs: ProjectFileSystem,
): Promise<OpenRuneProjectIndex> {
    const markers: string[] = [];
    for (const marker of [
        "settings.gradle.kts",
        "settings.gradle",
        "build.gradle.kts",
        "build.gradle",
        "game.yml",
        "game.example.yml",
        "or-cache/build.gradle.kts",
        "or-cache/build.gradle",
    ]) {
        if (await fs.exists(marker)) markers.push(marker);
    }

    const gameConfigPath = await firstExistingFile(fs, ["game.yml", "game.example.yml"]);
    const gameConfig = gameConfigPath
        ? parseTopLevelGameConfig(gameConfigPath, await fs.readText(gameConfigPath))
        : undefined;

    const source = await walkSourceTree(fs);
    const buildFiles = [...source.files]
        .filter((path) => {
            const name = projectPathName(path);
            return name === "build.gradle.kts" || name === "build.gradle";
        })
        .sort(comparePaths);

    const modulePaths = buildFiles
        .map((path) => projectParentPath(path))
        .filter((path) => path !== "")
        .sort((a, b) => pathDepth(a) - pathDepth(b) || comparePaths(a, b));

    const gameValTomlFiles = [...source.files]
        .filter((path) => projectPathName(path) === "gamevals.toml")
        .sort(comparePaths);

    const modules: OpenRuneModuleIndexEntry[] = modulePaths.map((modulePath) => {
        const buildFile =
            buildFiles.find((path) => projectParentPath(path) === modulePath) ??
            `${modulePath}/build.gradle.kts`;
        const packRoots = directPackRootsForModule(modulePath, source.directories);
        return {
            path: modulePath,
            name: projectPathName(modulePath),
            buildFile,
            family: moduleFamily(modulePath),
            isPackModule:
                projectPathName(modulePath) === "pack" &&
                modulePath.startsWith("content/"),
            packRoots,
            gameValTomlFiles: gameValTomlFiles.filter(
                (path) => nearestModulePath(path, modulePaths) === modulePath,
            ),
        };
    });

    const packRoots: OpenRunePackRoot[] = modules.flatMap((module) =>
        module.packRoots.map((path) => ({
            modulePath: module.path,
            path,
            configsPath: childIfDirectory(path, "configs", source.directories),
            modelsPath: childIfDirectory(path, "models", source.directories),
            spritesPath: childIfDirectory(path, "sprites", source.directories),
            cs2Path: childIfDirectory(path, "cs2", source.directories),
            interfacesPath: childIfDirectory(path, "interfaces", source.directories),
        })),
    );

    const rscmFiles = await collectFiles(
        fs,
        ".data/gamevals",
        (path) => path.toLowerCase().endsWith(".rscm"),
    );
    const gameValBinaryFiles = await collectFiles(
        fs,
        ".data/gamevals-binary",
        () => true,
    );

    const rawMapRoot = await firstExistingDirectory(fs, [".data/raw-cache/map"]);
    const npcRoot = await firstExistingDirectory(fs, [".data/raw-cache/map/npcs"]);
    const objRoot = await firstExistingDirectory(fs, [".data/raw-cache/map/objs"]);
    const areaRoot = await firstExistingDirectory(fs, [".data/raw-cache/map/area"]);

    const rawServerRoot = await firstExistingDirectory(fs, [".data/raw-cache/server"]);

    const settingsMarker =
        markers.includes("settings.gradle.kts") || markers.includes("settings.gradle");
    const openRuneCacheMarker =
        markers.includes("or-cache/build.gradle.kts") || markers.includes("or-cache/build.gradle");
    const hasDataTree = await directoryExists(fs, ".data");

    return {
        isOpenRuneProject: settingsMarker && (openRuneCacheMarker || hasDataTree || Boolean(gameConfig)),
        markers,
        gameConfig,
        modules,
        packRoots,
        gameValTomlFiles,
        rscmFiles,
        gameValBinaryFiles,
        rawMapSources: {
            root: rawMapRoot,
            npcRoot,
            objRoot,
            areaRoot,
            npcTomlFiles: npcRoot
                ? await collectFiles(fs, npcRoot, (path) => path.toLowerCase().endsWith(".toml"))
                : [],
            objTomlFiles: objRoot
                ? await collectFiles(fs, objRoot, (path) => path.toLowerCase().endsWith(".toml"))
                : [],
            areaTomlFiles: areaRoot
                ? await collectFiles(fs, areaRoot, (path) => path.toLowerCase().endsWith(".toml"))
                : [],
        },
        rawServerSources: {
            root: rawServerRoot,
            tomlFiles: rawServerRoot
                ? await collectFiles(fs, rawServerRoot, (path) => path.toLowerCase().endsWith(".toml"))
                : [],
        },
        liveCachePath: await firstExistingDirectory(fs, [".data/cache/LIVE"]),
        serverCachePath: await firstExistingDirectory(fs, [".data/cache/SERVER"]),
    };
}
