import {
    cacheSetupKind,
    type LocalCacheProfile,
} from "./local-cache-profiles";
import {
    openRuneProjectRootIdentity,
    resolveOpenRuneProfileFileSystem,
} from "./openrune-profile-project-filesystem";
import {
    OpenRuneProjectSession,
    type OpenRuneProjectSessionSnapshot,
} from "../project/openrune-project-session";
import type { ProjectFileSystem } from "../project/project-filesystem";

export type ActiveOpenRuneProjectRuntimeState = {
    profileId: string;
    rootKey: string;
    session: OpenRuneProjectSession;
    snapshot: OpenRuneProjectSessionSnapshot;
};

export type ActiveOpenRuneProjectRuntimeListener = (
    state: ActiveOpenRuneProjectRuntimeState | null,
) => void;

export type ActiveOpenRuneProjectRuntimeOptions = {
    createFileSystem?: (
        profile: LocalCacheProfile,
    ) => ProjectFileSystem | undefined | Promise<ProjectFileSystem | undefined>;
};

let activeState: ActiveOpenRuneProjectRuntimeState | null = null;
let activationSerial = 0;
let inFlight:
    | {
          profileId: string;
          rootKey: string;
          promise: Promise<ActiveOpenRuneProjectRuntimeState>;
      }
    | undefined;
const listeners = new Set<ActiveOpenRuneProjectRuntimeListener>();

function publish(state: ActiveOpenRuneProjectRuntimeState | null): void {
    activeState = state;
    for (const listener of listeners) listener(state);
}

async function createDefaultFileSystem(
    profile: LocalCacheProfile,
): Promise<ProjectFileSystem | undefined> {
    return resolveOpenRuneProfileFileSystem(profile, {
        requestBrowserPermission: true,
    });
}

function requireOpenRuneRootKey(profile: LocalCacheProfile): string {
    if (cacheSetupKind(profile) !== "openrune") {
        throw new Error(
            `Profile "${profile.name}" is not an OpenRune project setup.`,
        );
    }
    return openRuneProjectRootIdentity(profile);
}

export function getActiveOpenRuneProjectRuntime(
    profileId?: string,
): ActiveOpenRuneProjectRuntimeState | null {
    if (!activeState) return null;
    if (profileId && activeState.profileId !== profileId) return null;
    return activeState;
}

export function getActiveOpenRuneProjectSession(
    profileId?: string,
): OpenRuneProjectSession | null {
    return getActiveOpenRuneProjectRuntime(profileId)?.session ?? null;
}

export function getActiveOpenRuneProjectSnapshot(
    profileId?: string,
): OpenRuneProjectSessionSnapshot | null {
    return getActiveOpenRuneProjectRuntime(profileId)?.snapshot ?? null;
}

export function subscribeActiveOpenRuneProjectRuntime(
    listener: ActiveOpenRuneProjectRuntimeListener,
): () => void {
    listeners.add(listener);
    listener(activeState);
    return () => listeners.delete(listener);
}

export function clearActiveOpenRuneProjectRuntime(): void {
    activationSerial++;
    inFlight = undefined;
    if (activeState) publish(null);
}

/**
 * Makes the runtime match the selected setup.
 *
 * Basic-cache setups clear any retained OpenRune session. OpenRune setups reuse
 * the current session when profile id/root are unchanged, so editors share one
 * indexed project graph rather than independently rescanning the checkout.
 */
export async function syncActiveOpenRuneProjectRuntime(
    profile: LocalCacheProfile,
    options: ActiveOpenRuneProjectRuntimeOptions = {},
): Promise<ActiveOpenRuneProjectRuntimeState | null> {
    if (cacheSetupKind(profile) !== "openrune") {
        clearActiveOpenRuneProjectRuntime();
        return null;
    }

    const rootKey = requireOpenRuneRootKey(profile);
    const current = getActiveOpenRuneProjectRuntime(profile.id);
    if (current?.rootKey === rootKey) return current;

    if (
        inFlight?.profileId === profile.id &&
        inFlight.rootKey === rootKey
    ) {
        return inFlight.promise;
    }

    if (
        activeState &&
        (activeState.profileId !== profile.id ||
            activeState.rootKey !== rootKey)
    ) {
        publish(null);
    }

    const serial = ++activationSerial;
    const build = (async (): Promise<ActiveOpenRuneProjectRuntimeState> => {
        const fileSystem = options.createFileSystem
            ? await options.createFileSystem(profile)
            : await createDefaultFileSystem(profile);
        if (!fileSystem) {
            throw new Error(
                `OpenRune project "${profile.name}" cannot be opened. Reconnect its project folder or check filesystem permission.`,
            );
        }

        const session = new OpenRuneProjectSession(fileSystem);
        const snapshot = await session.refresh();
        const next = {
            profileId: profile.id,
            rootKey,
            session,
            snapshot,
        };

        if (activationSerial === serial) publish(next);
        return next;
    })();

    inFlight = {
        profileId: profile.id,
        rootKey,
        promise: build,
    };

    try {
        return await build;
    } finally {
        if (inFlight?.promise === build) inFlight = undefined;
    }
}

/**
 * Re-indexes the active OpenRune project and atomically publishes the new
 * snapshot. If refresh fails, OpenRuneProjectSession keeps its previous complete
 * snapshot and this runtime keeps publishing that same prior state.
 */
export async function refreshActiveOpenRuneProjectRuntime(
    profile: LocalCacheProfile,
    options: ActiveOpenRuneProjectRuntimeOptions = {},
): Promise<ActiveOpenRuneProjectRuntimeState> {
    const rootKey = requireOpenRuneRootKey(profile);
    const current = getActiveOpenRuneProjectRuntime(profile.id);

    if (!current || current.rootKey !== rootKey) {
        const activated = await syncActiveOpenRuneProjectRuntime(
            profile,
            options,
        );
        if (!activated) {
            throw new Error(
                `OpenRune project "${profile.name}" could not be activated.`,
            );
        }
        return activated;
    }

    const serial = ++activationSerial;
    const snapshot = await current.session.refresh();
    const next = {
        ...current,
        snapshot,
    };
    if (activationSerial === serial) publish(next);
    return next;
}
