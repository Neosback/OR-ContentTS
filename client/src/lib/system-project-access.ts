import { RemoteProjectFileSystem, probeStudioServer, type StudioServerSession } from "../project/remote-project-filesystem";
import type { ProjectFileSystem } from "../project/project-filesystem";
import { TauriProjectFileSystem } from "../project/tauri-project-filesystem";
import { isTauriRuntime } from "./tauri/is-tauri";

/**
 * A project folder that is identified by its path on this computer ("system-path"). The desktop app reads and writes it
 * directly; in a browser the same path goes through the Studio server (dev server), so Firefox and Safari work too and a
 * setup made in one place opens in the other.
 */

export type SystemPathAccess = "desktop" | "server" | "none";

let cachedServer: Promise<StudioServerSession | undefined> | undefined;

/** The Studio server's session for this page, probed once (a failed probe is retried the next time it is asked for). */
export function studioServerSession(forceProbe = false): Promise<StudioServerSession | undefined> {
    if (!cachedServer || forceProbe) {
        cachedServer = probeStudioServer().then((session) => {
            if (!session) cachedServer = undefined;
            return session;
        });
    }
    return cachedServer;
}

export async function systemPathAccess(): Promise<SystemPathAccess> {
    if (isTauriRuntime()) return "desktop";
    return (await studioServerSession()) ? "server" : "none";
}

/** A filesystem for a system path, or undefined when neither the desktop app nor a Studio server is available. */
export async function createSystemPathFileSystem(rootPath: string): Promise<ProjectFileSystem | undefined> {
    const access = await systemPathAccess();
    if (access === "desktop") return new TauriProjectFileSystem(rootPath);
    if (access === "server") return new RemoteProjectFileSystem(rootPath);
    return undefined;
}

/** `root` + `parts` with the separator `root` already uses (Windows paths keep their backslashes). */
export function joinSystemPath(root: string, ...parts: string[]): string {
    const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
    return [root.replace(/[/\\]+$/, ""), ...parts].join(separator);
}
