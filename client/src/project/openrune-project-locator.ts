import type { ProjectFileSystem } from "./project-filesystem";
import { indexOpenRuneProject, type OpenRuneProjectIndex } from "./openrune-project-index";
import { ScopedProjectFileSystem } from "./scoped-project-filesystem";

/**
 * Finds an OpenRune Server project from a folder the user picked, and explains clearly when it cannot.
 *
 * The user may pick the repository root (the usual case), a folder that contains it (for example a workspace folder),
 * or a folder inside it. Only the first two can be recovered: access never extends above the picked folder.
 */

export type ProjectRejectionCode =
    | "UNREADABLE"
    | "EMPTY"
    | "INSIDE_PROJECT"
    | "MISSING_MARKERS"
    | "NO_GRADLE";

export type ProjectRejection = {
    code: ProjectRejectionCode;
    /** One sentence for the person setting up the project. */
    message: string;
    /** Marker files/folders that were found. */
    found: string[];
    /** What was expected and not found. */
    missing: string[];
};

export type ProjectCandidate = {
    /** Path of the project root relative to the picked folder ("" = the picked folder itself). */
    subPath: string;
    name: string;
};

export type ProjectLocation =
    | { kind: "project"; subPath: ""; project: OpenRuneProjectIndex }
    | { kind: "nested"; candidates: ProjectCandidate[] }
    | { kind: "rejected"; rejection: ProjectRejection };

const SKIP_DIRECTORIES = new Set([
    ".git", ".gradle", ".idea", ".vscode", ".data", "build", "dist", "node_modules", "out", "target", "caches", "cache",
]);
const SETTINGS = ["settings.gradle.kts", "settings.gradle"];
const OPENRUNE_SIGNALS = ["or-cache/build.gradle.kts", "or-cache/build.gradle", ".data", "game.yml", "game.example.yml"];

async function anyExists(fs: ProjectFileSystem, paths: readonly string[]): Promise<string[]> {
    const found: string[] = [];
    for (const path of paths) {
        try {
            if (await fs.exists(path)) found.push(path);
        } catch {
            /* unreadable: treat as absent */
        }
    }
    return found;
}

/** The same rule as `indexOpenRuneProject`, without walking the source tree. */
export async function looksLikeOpenRuneRoot(fs: ProjectFileSystem): Promise<boolean> {
    return (await anyExists(fs, SETTINGS)).length > 0 && (await anyExists(fs, OPENRUNE_SIGNALS)).length > 0;
}

async function findNested(fs: ProjectFileSystem, maxDepth: number, maxDirectories: number): Promise<ProjectCandidate[]> {
    const candidates: ProjectCandidate[] = [];
    let visited = 0;
    let level: string[] = [""];
    for (let depth = 0; depth < maxDepth && level.length > 0; depth++) {
        const next: string[] = [];
        for (const directory of level) {
            let entries;
            try {
                entries = await fs.list(directory);
            } catch {
                continue;
            }
            for (const entry of entries) {
                if (entry.kind !== "directory" || SKIP_DIRECTORIES.has(entry.name)) continue;
                if (visited++ >= maxDirectories) return candidates;
                if (await looksLikeOpenRuneRoot(new ScopedProjectFileSystem(fs, entry.path))) {
                    candidates.push({ subPath: entry.path, name: entry.name });
                } else if (!entry.name.startsWith(".")) {
                    next.push(entry.path);
                }
            }
        }
        level = next;
    }
    return candidates;
}

export async function explainRejection(fs: ProjectFileSystem): Promise<ProjectRejection> {
    let names: string[];
    try {
        names = (await fs.list("")).map((entry) => entry.name);
    } catch {
        return {
            code: "UNREADABLE",
            message: "This folder could not be read. Check that the app has access to it (Settings > Folder access).",
            found: [],
            missing: [],
        };
    }
    if (names.length === 0) {
        return { code: "EMPTY", message: "This folder is empty.", found: [], missing: ["settings.gradle.kts"] };
    }

    const settings = names.filter((name) => SETTINGS.includes(name));
    const buildFiles = names.filter((name) => name === "build.gradle.kts" || name === "build.gradle");
    const signals = await anyExists(fs, OPENRUNE_SIGNALS);
    const found = [...settings, ...signals];

    if (settings.length > 0) {
        return {
            code: "MISSING_MARKERS",
            message: `Found ${settings[0]}, but nothing that identifies OpenRune Server: expected an or-cache module, a .data folder, or game.yml. Is this the OpenRune Server repository?`,
            found,
            missing: ["or-cache/build.gradle.kts", ".data/", "game.yml"],
        };
    }
    if (buildFiles.length > 0) {
        return {
            code: "INSIDE_PROJECT",
            message: "This looks like a single Gradle module inside a project. Choose the repository root instead: the folder that contains settings.gradle.kts.",
            found: buildFiles,
            missing: ["settings.gradle.kts"],
        };
    }
    return {
        code: "NO_GRADLE",
        message: `No Gradle project here (no settings.gradle.kts). The folder contains: ${names.slice(0, 6).join(", ")}${names.length > 6 ? ", ..." : ""}.`,
        found: [],
        missing: ["settings.gradle.kts"],
    };
}

export type LocateOptions = {
    /** How many folder levels below the picked folder to search. */
    maxDepth?: number;
    /** Upper bound on folders inspected, so a huge folder cannot stall setup. */
    maxDirectories?: number;
};

export async function locateOpenRuneProject(fs: ProjectFileSystem, options: LocateOptions = {}): Promise<ProjectLocation> {
    if (await looksLikeOpenRuneRoot(fs)) {
        const project = await indexOpenRuneProject(fs);
        if (project.isOpenRuneProject) return { kind: "project", subPath: "", project };
    }
    const candidates = await findNested(fs, options.maxDepth ?? 2, options.maxDirectories ?? 150);
    if (candidates.length > 0) return { kind: "nested", candidates };
    return { kind: "rejected", rejection: await explainRejection(fs) };
}
