import type { LocalCacheProfile } from "./local-cache-profiles";
import { resolveOpenRuneProfileFileSystem } from "./openrune-profile-project-filesystem";
import { indexOpenRuneProject, type OpenRuneProjectIndex } from "../project/openrune-project-index";
import type { ProjectFileSystem } from "../project/project-filesystem";

export type OpenRuneSetupHealthStatus =
    | "unavailable"
    | "invalid-project"
    | "needs-bootstrap"
    | "ready";

export type OpenRuneSetupHealth = {
    status: OpenRuneSetupHealthStatus;
    project?: OpenRuneProjectIndex;
    fileSystem?: ProjectFileSystem;
    projectRead: boolean;
    projectWrite: boolean;
    liveCache: boolean;
    serverCache: boolean;
    sourceEditing: boolean;
    message: string;
};

export type InspectOpenRuneSetupHealthOptions = {
    fileSystem?: ProjectFileSystem;
};

export async function inspectOpenRuneSetupHealth(
    profile: LocalCacheProfile,
    options: InspectOpenRuneSetupHealthOptions = {},
): Promise<OpenRuneSetupHealth> {
    let fileSystem: ProjectFileSystem | undefined;
    try {
        fileSystem =
            options.fileSystem ??
            (await resolveOpenRuneProfileFileSystem(profile));
    } catch {
        fileSystem = undefined;
    }
    if (!fileSystem) {
        return {
            status: "unavailable",
            projectRead: false,
            projectWrite: false,
            liveCache: false,
            serverCache: false,
            sourceEditing: false,
            message:
                profile.openRuneAccessMode === "browser-handle"
                    ? "Project access needs to be reconnected in this browser."
                    : "OpenRune project access is unavailable.",
        };
    }

    let project: OpenRuneProjectIndex;
    try {
        project = await indexOpenRuneProject(fileSystem);
    } catch {
        return {
            status: "unavailable",
            fileSystem,
            projectRead: fileSystem.capabilities.read,
            projectWrite: fileSystem.capabilities.write,
            liveCache: false,
            serverCache: false,
            sourceEditing: false,
            message: "OpenRune project access is unavailable or needs to be reconnected.",
        };
    }
    if (!project.isOpenRuneProject) {
        return {
            status: "invalid-project",
            project,
            fileSystem,
            projectRead: fileSystem.capabilities.read,
            projectWrite: fileSystem.capabilities.write,
            liveCache: false,
            serverCache: false,
            sourceEditing: false,
            message: "The selected folder is not an OpenRune Server project root.",
        };
    }

    const liveCache = project.liveCachePath !== undefined;
    return {
        status: liveCache ? "ready" : "needs-bootstrap",
        project,
        fileSystem,
        projectRead: fileSystem.capabilities.read,
        projectWrite: fileSystem.capabilities.write,
        liveCache,
        serverCache: project.serverCachePath !== undefined,
        sourceEditing: fileSystem.capabilities.write,
        message: liveCache
            ? "OpenRune project is ready."
            : "OpenRune project is valid. LIVE has not been generated yet.",
    };
}
