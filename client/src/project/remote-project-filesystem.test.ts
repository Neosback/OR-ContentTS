// @vitest-environment node
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createProjectFilesHandler } from "../../vite/studio-project-files.mts";
import { RemoteProjectFileSystem, pickFolderViaStudioServer, probeStudioServer } from "./remote-project-filesystem";
import { ProjectFileSystemError } from "./project-filesystem";

let base: string;
let dir: string;
let server: http.Server;
let origin: string;

async function startServer(options: { token?: string } = {}): Promise<void> {
    const handler = createProjectFilesHandler({ backupsDir: path.join(base, "backups"), token: options.token ?? "t", pickFolder: async () => dir });
    server = http.createServer((req, res) => void handler(req, res).then((handled) => !handled && res.end()));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeEach(async () => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "remote-fs-"));
    dir = path.join(base, "OpenRune");
    fs.mkdirSync(path.join(dir, ".data", "raw-cache", "server"), { recursive: true });
    fs.writeFileSync(path.join(dir, "settings.gradle.kts"), 'rootProject.name = "OpenRune"');
    fs.writeFileSync(path.join(dir, ".data", "raw-cache", "server", "npcs.toml"), '[[npc]]\nid = "npc.imp"\n');
    await startServer();
});

afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(base, { recursive: true, force: true });
});

describe("RemoteProjectFileSystem", () => {
    it("is found by probing, and not found where there is no Studio server", async () => {
        expect(await probeStudioServer({ baseUrl: origin })).toMatchObject({ token: "t", canPickFolder: true });
        expect(await probeStudioServer({ baseUrl: "http://127.0.0.1:1" })).toBeUndefined();
        expect(await pickFolderViaStudioServer((await probeStudioServer({ baseUrl: origin }))!, { baseUrl: origin })).toBe(dir);
    });

    it("lists, stats and reads like any other project filesystem", async () => {
        const fileSystem = new RemoteProjectFileSystem(dir, { baseUrl: origin });
        expect(fileSystem.capabilities).toMatchObject({ read: true, write: true });
        expect((await fileSystem.list("")).map((entry) => entry.path)).toEqual([".data", "settings.gradle.kts"]);
        expect(await fileSystem.exists("settings.gradle.kts")).toBe(true);
        expect(await fileSystem.exists("nope.txt")).toBe(false);
        expect(await fileSystem.readText(".data/raw-cache/server/npcs.toml")).toContain("npc.imp");
        await expect(fileSystem.readText("nope.txt")).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(fileSystem.readText("../escape.txt")).rejects.toBeInstanceOf(ProjectFileSystemError);
    });

    it("writes with the desktop rules: atomic, guarded by modified time, backed up", async () => {
        const fileSystem = new RemoteProjectFileSystem(dir, { baseUrl: origin });
        const file = ".data/raw-cache/server/npcs.toml";
        const seen = (await fileSystem.stat(file))!.modifiedAt!;
        await fileSystem.writeText(file, '[[npc]]\nid = "npc.imp"\nname = "Imp"\n', { expectedModifiedAt: seen });
        expect(fs.readFileSync(path.join(dir, file), "utf8")).toContain('name = "Imp"');

        // the file moved on since `seen`
        await expect(fileSystem.writeText(file, "stale", { expectedModifiedAt: seen - 10_000 })).rejects.toMatchObject({ code: "CONFLICT" });
        expect(fs.readFileSync(path.join(dir, file), "utf8")).toContain('name = "Imp"');
        await expect(fileSystem.writeText(file, "x", { expectedModifiedAt: null })).rejects.toMatchObject({ code: "CONFLICT" });

        await fileSystem.writeText("content/new.toml", "a = 1", { expectedModifiedAt: null });
        expect(fs.readFileSync(path.join(dir, "content", "new.toml"), "utf8")).toBe("a = 1");
        expect(fs.readdirSync(path.join(base, "backups")).length).toBe(1);
    });

    it("works with a source writer's stamped read: a race becomes a CONFLICT", async () => {
        const { readTextStamped, writeTextGuarded } = await import("./project-filesystem");
        const fileSystem = new RemoteProjectFileSystem(dir, { baseUrl: origin });
        const file = ".data/raw-cache/server/npcs.toml";
        const { text, modifiedAt } = await readTextStamped(fileSystem, file);
        fs.utimesSync(path.join(dir, file), new Date(), new Date(Date.now() + 5000));
        await expect(writeTextGuarded(fileSystem, file, `${text}# edited`, modifiedAt, (error) => new Error(`stale: ${error.code}`))).rejects.toThrow("stale: CONFLICT");
    });

    it("grants again on its own after the server restarts", async () => {
        const fileSystem = new RemoteProjectFileSystem(dir, { baseUrl: origin });
        expect(await fileSystem.exists("settings.gradle.kts")).toBe(true);
        const port = (server.address() as AddressInfo).port;
        await new Promise((resolve) => server.close(resolve));
        const handler = createProjectFilesHandler({ backupsDir: path.join(base, "backups"), token: "second-run" });
        server = http.createServer((req, res) => void handler(req, res).then((handled) => !handled && res.end()));
        await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
        expect(await fileSystem.readText("settings.gradle.kts")).toContain("OpenRune");
    });

    it("says so plainly when the Studio server is not running", async () => {
        const fileSystem = new RemoteProjectFileSystem(dir, { baseUrl: "http://127.0.0.1:1" });
        await expect(fileSystem.list("")).rejects.toMatchObject({ code: "READ_UNAVAILABLE", message: expect.stringContaining("Studio server") });
    });
});
