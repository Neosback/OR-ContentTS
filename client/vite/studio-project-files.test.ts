// @vitest-environment node
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProjectFileService, ProjectFilesError, createProjectFilesHandler, normalizeRelative } from "./studio-project-files.mts";

let dir: string;
let backups: string;
let outside: string;

beforeEach(() => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "studio-files-"));
    dir = path.join(base, "project");
    outside = path.join(base, "outside");
    backups = path.join(base, "backups");
    fs.mkdirSync(path.join(dir, ".data", "cache"), { recursive: true });
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(dir, "game.yml"), "revision: 240\n");
    fs.writeFileSync(path.join(dir, ".data", "cache", "main_file_cache.dat2"), Buffer.from([1, 2, 3]));
    fs.writeFileSync(path.join(outside, "secret.txt"), "secret");
});

afterEach(() => fs.rmSync(path.dirname(dir), { recursive: true, force: true }));

describe("ProjectFileService", () => {
    it("lists, stats and reads inside a granted folder, hidden folders included", async () => {
        const service = new ProjectFileService({ backupsDir: backups });
        const { grantId } = await service.grant(dir);
        expect((await service.list(grantId, "")).map((entry) => `${entry.kind}:${entry.name}`)).toEqual(["directory:.data", "file:game.yml"]);
        expect((await service.list(grantId, ".data/cache"))[0]).toMatchObject({ name: "main_file_cache.dat2", path: ".data/cache/main_file_cache.dat2", size: 3 });
        expect(await service.stat(grantId, "game.yml")).toMatchObject({ kind: "file", size: 14 });
        expect(await service.stat(grantId, "missing.txt")).toBeUndefined();
        expect((await service.read(grantId, "game.yml")).toString()).toBe("revision: 240\n");
    });

    it("refuses paths that leave the folder: .., absolute paths and symlinks", async () => {
        const service = new ProjectFileService({ backupsDir: backups });
        const { grantId } = await service.grant(dir);
        expect(() => normalizeRelative("../outside/secret.txt")).toThrow(ProjectFilesError);
        await expect(service.read(grantId, "../outside/secret.txt")).rejects.toMatchObject({ code: "INVALID_PATH" });
        await expect(service.read(grantId, "/etc/passwd")).rejects.toMatchObject({ code: "INVALID_PATH" });

        fs.symlinkSync(outside, path.join(dir, "link"));
        await expect(service.read(grantId, "link/secret.txt")).rejects.toMatchObject({ code: "ACCESS_DENIED" });
        await expect(service.write(grantId, "link/new.txt", new Uint8Array([1]))).rejects.toMatchObject({ code: "ACCESS_DENIED" });
        expect(fs.existsSync(path.join(outside, "new.txt"))).toBe(false);
    });

    it("needs a grant, and a grant only covers its own folder", async () => {
        const service = new ProjectFileService({ backupsDir: backups });
        await expect(service.list("nope", "")).rejects.toMatchObject({ code: "ACCESS_DENIED" });
        await expect(service.grant("relative/path")).rejects.toMatchObject({ code: "INVALID_PATH" });
        await expect(service.grant(path.join(dir, "game.yml"))).rejects.toMatchObject({ code: "NOT_DIRECTORY" });
        await expect(service.grant(path.join(dir, "absent"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("writes atomically without leaving temp files and backs up what it replaces", async () => {
        const service = new ProjectFileService({ backupsDir: backups });
        const { grantId } = await service.grant(dir);
        await service.write(grantId, "game.yml", new TextEncoder().encode("revision: 241\n"));
        expect(fs.readFileSync(path.join(dir, "game.yml"), "utf8")).toBe("revision: 241\n");
        expect(fs.readdirSync(dir).filter((name) => name.includes("studio-tmp"))).toEqual([]);
        const [folder] = fs.readdirSync(backups);
        const saved = fs.readdirSync(path.join(backups, folder!));
        expect(saved).toHaveLength(1);
        expect(fs.readFileSync(path.join(backups, folder!, saved[0]!), "utf8")).toBe("revision: 240\n");
        // new files and nested folders are created
        await service.write(grantId, "content/new/file.toml", new TextEncoder().encode("a = 1"));
        expect(fs.readFileSync(path.join(dir, "content", "new", "file.toml"), "utf8")).toBe("a = 1");
    });

    it("keeps only the newest ten backups", async () => {
        const service = new ProjectFileService({ backupsDir: backups });
        const { grantId } = await service.grant(dir);
        for (let i = 0; i < 14; i++) {
            await service.write(grantId, "game.yml", new TextEncoder().encode(`v${i}`));
            await new Promise((resolve) => setTimeout(resolve, 2)); // distinct backup names
        }
        const [folder] = fs.readdirSync(backups);
        expect(fs.readdirSync(path.join(backups, folder!))).toHaveLength(10);
    });

    it("refuses a write when the file changed since it was read, or already exists", async () => {
        const service = new ProjectFileService({ backupsDir: backups });
        const { grantId } = await service.grant(dir);
        const seen = (await service.stat(grantId, "game.yml"))!.modifiedAt!;
        await service.write(grantId, "game.yml", new TextEncoder().encode("b"), { expectedMtimeMs: seen });
        // someone else touches it
        fs.utimesSync(path.join(dir, "game.yml"), new Date(), new Date(Date.now() + 5000));
        await expect(service.write(grantId, "game.yml", new TextEncoder().encode("c"), { expectedMtimeMs: seen })).rejects.toMatchObject({ code: "CONFLICT" });
        expect(fs.readFileSync(path.join(dir, "game.yml"), "utf8")).toBe("b");
        await expect(service.write(grantId, "absent.txt", new Uint8Array([1]), { expectedMtimeMs: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
        await expect(service.write(grantId, "game.yml", new Uint8Array([1]), { mustNotExist: true })).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("reports changes made outside, skipping version-control noise", async () => {
        const service = new ProjectFileService({ backupsDir: backups });
        const { grantId } = await service.grant(dir);
        const seen: string[][] = [];
        const stop = service.watch(grantId, (change) => seen.push(change.paths));
        fs.mkdirSync(path.join(dir, ".git"));
        await new Promise((resolve) => setTimeout(resolve, 100));
        fs.writeFileSync(path.join(dir, ".git", "index"), "x");
        fs.writeFileSync(path.join(dir, "game.yml"), "changed elsewhere");
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline && !seen.flat().includes("game.yml")) await new Promise((resolve) => setTimeout(resolve, 50));
        stop();
        expect(seen.flat()).toContain("game.yml");
        expect(seen.flat().some((p) => p.startsWith(".git"))).toBe(false);
    });
});

describe("project files HTTP handler", () => {
    async function serve(): Promise<{ origin: string; close: () => Promise<void> }> {
        const handler = createProjectFilesHandler({ backupsDir: backups, token: "t0ken", pickFolder: async () => dir });
        const server = http.createServer((req, res) => {
            void handler(req, res).then((handled) => {
                if (!handled) {
                    res.statusCode = 404;
                    res.end("not ours");
                }
            });
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const { port } = server.address() as AddressInfo;
        return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
    }

    it("hands the token to same-origin pages and rejects everything else", async () => {
        const { origin, close } = await serve();
        try {
            const session = await (await fetch(`${origin}/__studio/project/session`)).json();
            expect(session).toMatchObject({ ok: true, token: "t0ken" });
            // no CORS headers, so other sites cannot read it
            expect((await fetch(`${origin}/__studio/project/session`)).headers.get("access-control-allow-origin")).toBeNull();

            expect((await fetch(`${origin}/__studio/project/list?grant=x`)).status).toBe(403);
            // fetch() will not let a script set Host or Origin, so send those two by hand
            const raw = (headers: http.OutgoingHttpHeaders): Promise<number> =>
                new Promise((resolve, reject) => {
                    const url = new URL(origin);
                    const request = http.request({ host: url.hostname, port: url.port, path: "/__studio/project/session", headers }, (response) => {
                        response.resume();
                        resolve(response.statusCode ?? 0);
                    });
                    request.on("error", reject);
                    request.end();
                });
            const host = new URL(origin).host;
            expect(await raw({ host, origin: "https://evil.example" })).toBe(403);
            expect(await raw({ host: "evil.example" })).toBe(403);
            expect(await raw({ host, origin })).toBe(200);
            expect((await fetch(`${origin}/elsewhere`)).status).toBe(404);
        } finally {
            await close();
        }
    });

    it("grants, lists, reads and writes with the token, mapping failures to codes", async () => {
        const { origin, close } = await serve();
        try {
            const headers = { "x-studio-token": "t0ken", "content-type": "application/json" };
            const granted = (await (await fetch(`${origin}/__studio/project/grant`, { method: "POST", headers, body: JSON.stringify({ path: dir }) })).json()) as { grantId: string };
            const list = (await (await fetch(`${origin}/__studio/project/list?grant=${granted.grantId}&path=`, { headers })).json()) as { name: string }[];
            expect(list.map((entry) => entry.name)).toEqual([".data", "game.yml"]);

            const put = await fetch(`${origin}/__studio/project/write?grant=${granted.grantId}&path=game.yml`, { method: "PUT", headers: { "x-studio-token": "t0ken", "x-expected-mtime": "1" }, body: "nope" });
            expect(put.status).toBe(409);
            expect(await put.json()).toMatchObject({ code: "CONFLICT" });

            const missing = await fetch(`${origin}/__studio/project/read?grant=${granted.grantId}&path=nothing.txt`, { headers });
            expect(missing.status).toBe(404);

            const picked = await (await fetch(`${origin}/__studio/project/pick`, { method: "POST", headers })).json();
            expect(picked).toEqual({ path: dir });
        } finally {
            await close();
        }
    });
});
