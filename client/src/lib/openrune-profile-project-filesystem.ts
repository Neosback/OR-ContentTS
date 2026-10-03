import {
    cacheSetupKind,
    openRuneProjectAccessMode,
    type LocalCacheProfile,
} from "./local-cache-profiles";
import {
    ensureBrowserProjectPermission,
    loadBrowserProjectHandle,
} from "./browser-project-handle-store";
import { createSystemPathFileSystem } from "./system-project-access";
import { BrowserProjectFileSystem } from "../project/browser-project-filesystem";
import type { ProjectFileSystem } from "../project/project-filesystem";

export type ResolveOpenRuneProfileFileSystemOptions = {
    requestBrowserPermission?: boolean;
    loadBrowserHandle?: (
        profileId: string,
    ) => Promise<
        | ConstructorParameters<typeof BrowserProjectFileSystem>[0]
        | undefined
    >;
};

export function openRuneProjectRootIdentity(profile: LocalCacheProfile): string {
    const mode = openRuneProjectAccessMode(profile);
    if (mode === "browser-handle") return `browser:${profile.id}`;
    return `system:${profile.openRuneRootPath ?? ""}`;
}

export async function resolveOpenRuneProfileFileSystem(
    profile: LocalCacheProfile,
    options: ResolveOpenRuneProfileFileSystemOptions = {},
): Promise<ProjectFileSystem | undefined> {
    if (cacheSetupKind(profile) !== "openrune") return undefined;

    const mode = openRuneProjectAccessMode(profile);
    if (mode === "browser-handle") {
        const loadHandle = options.loadBrowserHandle ?? loadBrowserProjectHandle;
        const handle = await loadHandle(profile.id);
        if (!handle) return undefined;

        const permission = await ensureBrowserProjectPermission(
            handle,
            options.requestBrowserPermission === true,
        );
        if (permission !== "granted") return undefined;
        return new BrowserProjectFileSystem(handle);
    }

    if (mode === "system-path" && profile.openRuneRootPath) {
        // The desktop app, or the browser through the Studio server; undefined when neither is available.
        return createSystemPathFileSystem(profile.openRuneRootPath);
    }

    return undefined;
}
