import {
    indexProjectGameValRegistry,
    type GameValRegistry,
} from "./gameval-registry";
import {
    indexProjectOpenRuneConfigToml,
    type OpenRuneConfigTomlIndex,
} from "./openrune-config-toml";
import {
    indexProjectOpenRuneMapSources,
    type OpenRuneMapSourceIndex,
} from "./openrune-map-source-toml";
import {
    indexOpenRuneProject,
    type OpenRuneProjectIndex,
} from "./openrune-project-index";
import {
    indexProjectOpenRuneServerToml,
    type OpenRuneServerTomlIndex,
} from "./openrune-server-toml";
import type { ProjectFileSystem } from "./project-filesystem";

export type OpenRuneProjectSessionCapabilities = {
    openRune: true;
    projectRead: boolean;
    projectWrite: boolean;
    liveCache: boolean;
    serverCache: boolean;
    gameVals: boolean;
    rscm: boolean;
    packConfigs: boolean;
    mapSourceToml: boolean;
    serverSourceToml: boolean;
    sourceEditing: boolean;
};

export type OpenRuneProjectSessionDiagnostics = {
    gameVals: number;
    configToml: number;
    mapSources: number;
    serverToml: number;
    total: number;
};

export type OpenRuneProjectSessionSnapshot = {
    generation: number;
    fileSystem: ProjectFileSystem;
    project: OpenRuneProjectIndex;
    gameVals: GameValRegistry;
    configToml: OpenRuneConfigTomlIndex;
    mapSources: OpenRuneMapSourceIndex;
    serverToml: OpenRuneServerTomlIndex;
    capabilities: OpenRuneProjectSessionCapabilities;
    diagnostics: OpenRuneProjectSessionDiagnostics;
};

export type OpenRuneProjectSessionErrorCode = "NOT_OPENRUNE_PROJECT";

export class OpenRuneProjectSessionError extends Error {
    constructor(
        readonly code: OpenRuneProjectSessionErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "OpenRuneProjectSessionError";
    }
}

function capabilitiesFor(
    fileSystem: ProjectFileSystem,
    project: OpenRuneProjectIndex,
    gameVals: GameValRegistry,
): OpenRuneProjectSessionCapabilities {
    const packConfigs = project.packRoots.some(
        (packRoot) => packRoot.configsPath !== undefined,
    );
    const mapSourceToml = project.rawMapSources.root !== undefined;
    const serverSourceToml =
        project.rawServerSources.root !== undefined || packConfigs;

    return {
        openRune: true,
        projectRead: fileSystem.capabilities.read,
        projectWrite: fileSystem.capabilities.write,
        liveCache: project.liveCachePath !== undefined,
        serverCache: project.serverCachePath !== undefined,
        gameVals: gameVals.declarations.length > 0,
        rscm: project.rscmFiles.length > 0,
        packConfigs,
        mapSourceToml,
        serverSourceToml,
        sourceEditing: fileSystem.capabilities.write,
    };
}

function diagnosticsFor(
    gameVals: GameValRegistry,
    configToml: OpenRuneConfigTomlIndex,
    mapSources: OpenRuneMapSourceIndex,
    serverToml: OpenRuneServerTomlIndex,
): OpenRuneProjectSessionDiagnostics {
    const gameValIssues =
        gameVals.issues.length +
        gameVals.sourceIssues.dat.length +
        gameVals.sourceIssues.toml.length +
        gameVals.sourceIssues.rscm.length;
    const configIssues = configToml.issues.length;
    const mapIssues = mapSources.issues.length;
    const serverIssues = serverToml.issues.length;

    return {
        gameVals: gameValIssues,
        configToml: configIssues,
        mapSources: mapIssues,
        serverToml: serverIssues,
        total: gameValIssues + configIssues + mapIssues + serverIssues,
    };
}

/**
 * Framework-neutral, source-first OpenRune project runtime.
 *
 * A session owns one ProjectFileSystem and derives all OpenRune indexes from
 * that same root. refresh() is atomic: the previous snapshot remains active
 * until project discovery, GameVals, and all dependent source indexes finish
 * successfully.
 *
 * UI/runtime integrations should retain one session per active OpenRune setup
 * instead of independently rescanning the repository for each editor.
 */
export class OpenRuneProjectSession {
    private current?: OpenRuneProjectSessionSnapshot;
    private refreshInFlight?: Promise<OpenRuneProjectSessionSnapshot>;

    constructor(readonly fileSystem: ProjectFileSystem) {}

    get snapshot(): OpenRuneProjectSessionSnapshot | undefined {
        return this.current;
    }

    async refresh(): Promise<OpenRuneProjectSessionSnapshot> {
        if (this.refreshInFlight) return this.refreshInFlight;

        const refresh = this.buildSnapshot();
        this.refreshInFlight = refresh;

        try {
            return await refresh;
        } finally {
            if (this.refreshInFlight === refresh) {
                this.refreshInFlight = undefined;
            }
        }
    }

    private async buildSnapshot(): Promise<OpenRuneProjectSessionSnapshot> {
        const project = await indexOpenRuneProject(this.fileSystem);
        if (!project.isOpenRuneProject) {
            throw new OpenRuneProjectSessionError(
                "NOT_OPENRUNE_PROJECT",
                "The selected directory is not an OpenRune Server project root.",
            );
        }

        const gameVals = await indexProjectGameValRegistry(
            this.fileSystem,
            project,
        );

        const [configToml, mapSources, serverToml] = await Promise.all([
            indexProjectOpenRuneConfigToml(
                this.fileSystem,
                project,
                gameVals,
            ),
            indexProjectOpenRuneMapSources(
                this.fileSystem,
                project,
                gameVals,
            ),
            indexProjectOpenRuneServerToml(
                this.fileSystem,
                project,
                gameVals,
            ),
        ]);

        const next: OpenRuneProjectSessionSnapshot = {
            generation: (this.current?.generation ?? 0) + 1,
            fileSystem: this.fileSystem,
            project,
            gameVals,
            configToml,
            mapSources,
            serverToml,
            capabilities: capabilitiesFor(
                this.fileSystem,
                project,
                gameVals,
            ),
            diagnostics: diagnosticsFor(
                gameVals,
                configToml,
                mapSources,
                serverToml,
            ),
        };

        this.current = next;
        return next;
    }
}

export async function openOpenRuneProjectSession(
    fileSystem: ProjectFileSystem,
): Promise<OpenRuneProjectSession> {
    const session = new OpenRuneProjectSession(fileSystem);
    await session.refresh();
    return session;
}
