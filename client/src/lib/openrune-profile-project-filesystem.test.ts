import { describe, expect, it, vi } from "vitest";

import {
    BrowserProjectFileSystem,
    type BrowserDirectoryHandle,
} from "../project/browser-project-filesystem";
import type { LocalCacheProfile } from "./local-cache-profiles";
import {
    openRuneProjectRootIdentity,
    resolveOpenRuneProfileFileSystem,
} from "./openrune-profile-project-filesystem";

function browserProfile(): LocalCacheProfile {
    return {
        id: "browser-openrune",
        name: "OpenRune",
        revision: "241",
        locationNotes: "OpenRune-Server",
        setupKind: "openrune",
        openRuneAccessMode: "browser-handle",
    };
}

function fakeHandle(): BrowserDirectoryHandle {
    return {
        kind: "directory",
        name: "OpenRune-Server",
        entries: async function* () {},
        getDirectoryHandle: vi.fn(),
        getFileHandle: vi.fn(),
    };
}

describe("OpenRune profile project filesystem resolution", () => {
    it("uses a stable browser-handle identity without requiring an absolute path", () => {
        expect(openRuneProjectRootIdentity(browserProfile())).toBe(
            "browser:browser-openrune",
        );
    });

    it("opens a browser project handle through the shared ProjectFileSystem abstraction", async () => {
        const handle = fakeHandle();
        const fileSystem = await resolveOpenRuneProfileFileSystem(
            browserProfile(),
            {
                loadBrowserHandle: async () => handle,
            },
        );

        expect(fileSystem).toBeInstanceOf(BrowserProjectFileSystem);
        expect(
            (fileSystem as BrowserProjectFileSystem).rootHandle,
        ).toBe(handle);
    });

    it("returns unavailable when a browser handle is missing", async () => {
        await expect(
            resolveOpenRuneProfileFileSystem(browserProfile(), {
                loadBrowserHandle: async () => undefined,
            }),
        ).resolves.toBeUndefined();
    });
});
