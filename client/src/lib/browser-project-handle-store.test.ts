import { describe, expect, it, vi } from "vitest";

import type { BrowserDirectoryHandle } from "../project/browser-project-filesystem";
import {
    ensureBrowserProjectPermission,
    queryBrowserProjectPermission,
    type BrowserPermissionCapableDirectoryHandle,
} from "./browser-project-handle-store";

function handle(
    query: "granted" | "denied" | "prompt",
    request: "granted" | "denied" | "prompt" = query,
): BrowserPermissionCapableDirectoryHandle {
    return {
        kind: "directory",
        name: "OpenRune-Server",
        entries: async function* () {},
        getDirectoryHandle: vi.fn(),
        getFileHandle: vi.fn(),
        queryPermission: vi.fn(async () => query),
        requestPermission: vi.fn(async () => request),
    };
}

describe("browser project permissions", () => {
    it("returns the current read/write permission without prompting", async () => {
        const candidate = handle("prompt", "granted");
        await expect(queryBrowserProjectPermission(candidate)).resolves.toBe("prompt");
        expect(candidate.requestPermission).not.toHaveBeenCalled();
    });

    it("requests read/write permission only when explicitly allowed", async () => {
        const candidate = handle("prompt", "granted");

        await expect(
            ensureBrowserProjectPermission(candidate, false),
        ).resolves.toBe("prompt");
        expect(candidate.requestPermission).not.toHaveBeenCalled();

        await expect(
            ensureBrowserProjectPermission(candidate, true),
        ).resolves.toBe("granted");
        expect(candidate.requestPermission).toHaveBeenCalledWith({
            mode: "readwrite",
        });
    });

    it("treats handles without permission methods as directly usable", async () => {
        const candidate = {
            kind: "directory",
            name: "OpenRune-Server",
            entries: async function* () {},
            getDirectoryHandle: vi.fn(),
            getFileHandle: vi.fn(),
        } as BrowserDirectoryHandle;

        await expect(
            ensureBrowserProjectPermission(candidate, false),
        ).resolves.toBe("granted");
    });
});
