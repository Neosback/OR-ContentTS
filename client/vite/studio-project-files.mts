import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { watch as fsWatch, type FSWatcher } from "node:fs";
import { copyFile, mkdir, open, readdir, readFile, realpath, rename, stat, unlink } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * Lets the browser read and write an OpenRune project folder through the Studio dev server, for browsers without the
 * File System Access API (Firefox, Safari) and for anyone who wants the desktop app's safe-write rules in a browser.
 *
 * It mirrors the desktop file layer (`src-tauri/src/access.rs`): a folder is granted once, every path is project-relative
 * and confined to it (`..` and symlinks that lead out are refused), writes are atomic with an optional "file is still
 * what you read" check and a backup of what they replace, and changes made elsewhere are streamed back.
 *
 * Only this machine can use it: requests must come from localhost with a matching origin and carry a token that only
 * same-origin pages can fetch, so another website cannot reach the folders you grant.
 */

export const STUDIO_PROJECT_MOUNT = "/__studio/project";

export type ProjectFilesErrorCode = "INVALID_PATH" | "NOT_FOUND" | "NOT_DIRECTORY" | "IS_DIRECTORY" | "ACCESS_DENIED" | "CONFLICT" | "IO_FAILED";

export class ProjectFilesError extends Error {
    constructor(
        readonly code: ProjectFilesErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "ProjectFilesError";
    }

    get status(): number {
        switch (this.code) {
            case "NOT_FOUND":
                return 404;
            case "ACCESS_DENIED":
                return 403;
            case "CONFLICT":
                return 409;
            case "IO_FAILED":
                return 500;
            default:
                return 400;
        }
    }
}

export type ProjectEntry = { name: string; path: string; kind: "file" | "directory"; size?: number; modifiedAt?: number };
export type WriteGuards = { expectedMtimeMs?: number; mustNotExist?: boolean; backup?: boolean };
export type ProjectChange = { paths: string[] };

const BACKUPS_KEPT = 10;
const WATCH_DEBOUNCE_MS = 300;
const NOISE_SEGMENTS = new Set([".git", ".gradle", ".idea", "node_modules", "build", "target", ".DS_Store"]);

function isNoise(relativePath: string): boolean {
    const segments = relativePath.split("/");
    if (segments.some((segment) => NOISE_SEGMENTS.has(segment))) return true;
    return segments[segments.length - 1]!.includes(".studio-tmp-");
}

/** Normalizes a project-relative path like the browser side does; the project root is "". */
export function normalizeRelative(input: string): string {
    if (input.includes("\0")) throw new ProjectFilesError("INVALID_PATH", "Project paths must not contain NUL bytes.");
    const slashed = input.replaceAll("\\", "/");
    if (slashed.startsWith("/")) throw new ProjectFilesError("INVALID_PATH", "Absolute paths are not project-relative.");
    if (slashed.includes(":")) throw new ProjectFilesError("INVALID_PATH", "Project paths must not contain ':' or a drive prefix.");
    const segments: string[] = [];
    for (const segment of slashed.split("/")) {
        if (!segment || segment === ".") continue;
        if (segment === "..") throw new ProjectFilesError("INVALID_PATH", "Project paths must not contain '..'.");
        segments.push(segment);
    }
    return segments.join("/");
}

function fnv1a(text: string): string {
    let hash = 0xcbf29ce484222325n;
    for (const byte of Buffer.from(text)) {
        hash ^= BigInt(byte);
        hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
    }
    return hash.toString(16).padStart(16, "0");
}

function ioError(error: unknown, relative: string): ProjectFilesError {
    if (error instanceof ProjectFilesError) return error;
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return new ProjectFilesError("NOT_FOUND", `"${relative}" does not exist.`);
    if (code === "ENOTDIR") return new ProjectFilesError("NOT_DIRECTORY", `"${relative}" is not a folder.`);
    if (code === "EISDIR") return new ProjectFilesError("IS_DIRECTORY", `"${relative}" is a folder.`);
    if (code === "EACCES" || code === "EPERM") return new ProjectFilesError("ACCESS_DENIED", `No permission for "${relative}".`);
    return new ProjectFilesError("IO_FAILED", error instanceof Error ? error.message : String(error));
}

type Grant = { id: string; root: string };

export type ProjectFilesOptions = {
    /** Where the copies of overwritten files go (never inside the project). */
    backupsDir?: string;
};

/** The file operations, independent of HTTP so they can be tested directly. */
export class ProjectFileService {
    private readonly grants = new Map<string, Grant>();
    private readonly backupsDir: string;

    constructor(options: ProjectFilesOptions = {}) {
        this.backupsDir = options.backupsDir ?? path.join(os.homedir(), ".openrune-studio", "backups");
    }

    /** Grants a folder (absolute path, `~` allowed). Returns the id to use with every other call. */
    async grant(rawPath: string): Promise<{ grantId: string; root: string }> {
        const expanded = rawPath.startsWith("~") ? path.join(os.homedir(), rawPath.slice(1)) : rawPath;
        if (!path.isAbsolute(expanded)) throw new ProjectFilesError("INVALID_PATH", "Choose a folder by its full path.");
        let root: string;
        try {
            root = await realpath(expanded);
            if (!(await stat(root)).isDirectory()) throw new ProjectFilesError("NOT_DIRECTORY", `${root} is not a folder.`);
        } catch (error) {
            throw ioError(error, expanded);
        }
        for (const existing of this.grants.values()) if (existing.root === root) return { grantId: existing.id, root };
        const id = randomBytes(12).toString("hex");
        this.grants.set(id, { id, root });
        return { grantId: id, root };
    }

    private grantFor(grantId: string): Grant {
        const grant = this.grants.get(grantId);
        if (!grant) throw new ProjectFilesError("ACCESS_DENIED", "That folder was not granted (or the Studio server restarted): choose it again.");
        return grant;
    }

    /** Resolves a project-relative path to a real path inside the grant, refusing anything that leads outside it. */
    private async resolve(grantId: string, relative: string): Promise<{ normalized: string; absolute: string; grant: Grant }> {
        const grant = this.grantFor(grantId);
        const normalized = normalizeRelative(relative);
        const absolute = normalized ? path.join(grant.root, ...normalized.split("/")) : grant.root;
        // Canonicalize the deepest part that exists so a symlink (or a symlinked parent) cannot lead out of the folder.
        let existing = absolute;
        const missing: string[] = [];
        for (;;) {
            try {
                const real = await realpath(existing);
                const full = path.join(real, ...missing.reverse());
                if (full !== grant.root && !full.startsWith(grant.root + path.sep)) {
                    throw new ProjectFilesError("ACCESS_DENIED", `"${normalized}" leads outside the project folder.`);
                }
                return { normalized, absolute: full, grant };
            } catch (error) {
                if (error instanceof ProjectFilesError) throw error;
                const parent = path.dirname(existing);
                if (parent === existing) throw ioError(error, normalized);
                missing.push(path.basename(existing));
                existing = parent;
            }
        }
    }

    private async entryFor(grant: Grant, parentRelative: string, name: string, absolute: string): Promise<ProjectEntry | undefined> {
        const relative = parentRelative ? `${parentRelative}/${name}` : name;
        try {
            const info = await stat(absolute); // follows symlinks: a link to a folder lists as a folder
            return info.isDirectory()
                ? { name, path: relative, kind: "directory", modifiedAt: info.mtimeMs }
                : { name, path: relative, kind: "file", size: info.size, modifiedAt: info.mtimeMs };
        } catch {
            return undefined; // a dangling link or a file that vanished mid-listing
        }
    }

    async list(grantId: string, relative: string): Promise<ProjectEntry[]> {
        const { normalized, absolute, grant } = await this.resolve(grantId, relative);
        let names: string[];
        try {
            names = await readdir(absolute);
        } catch (error) {
            throw ioError(error, normalized);
        }
        const entries = await Promise.all(names.map((name) => this.entryFor(grant, normalized, name, path.join(absolute, name))));
        return entries
            .filter((entry): entry is ProjectEntry => entry !== undefined)
            .sort((a, b) => Number(a.kind === "file") - Number(b.kind === "file") || a.name.localeCompare(b.name));
    }

    async stat(grantId: string, relative: string): Promise<ProjectEntry | undefined> {
        const { normalized, absolute, grant } = await this.resolve(grantId, relative);
        const name = normalized ? normalized.slice(normalized.lastIndexOf("/") + 1) : "";
        const parent = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
        const entry = await this.entryFor(grant, parent, name, absolute);
        return normalized ? entry : entry && { ...entry, name: "", path: "" };
    }

    async read(grantId: string, relative: string): Promise<Buffer> {
        const { normalized, absolute } = await this.resolve(grantId, relative);
        try {
            return await readFile(absolute);
        } catch (error) {
            throw ioError(error, normalized);
        }
    }

    async mkdir(grantId: string, relative: string): Promise<void> {
        const { normalized, absolute } = await this.resolve(grantId, relative);
        try {
            await mkdir(absolute, { recursive: true });
        } catch (error) {
            throw ioError(error, normalized);
        }
    }

    /** Atomic write: a temp file beside the target is written, flushed and renamed over it. */
    async write(grantId: string, relative: string, data: Uint8Array, guards: WriteGuards = {}): Promise<void> {
        const { normalized, absolute } = await this.resolve(grantId, relative);
        if (!normalized) throw new ProjectFilesError("IS_DIRECTORY", "The project folder itself cannot be written.");
        let existing: Awaited<ReturnType<typeof stat>> | undefined;
        try {
            existing = await stat(absolute);
        } catch {
            existing = undefined;
        }
        if (existing?.isDirectory()) throw new ProjectFilesError("IS_DIRECTORY", `"${normalized}" is a folder.`);
        if (guards.mustNotExist && existing) throw new ProjectFilesError("CONFLICT", `"${normalized}" already exists.`);
        if (guards.expectedMtimeMs !== undefined) {
            if (!existing) throw new ProjectFilesError("CONFLICT", `"${normalized}" was removed since it was read.`);
            if (Math.floor(existing.mtimeMs) !== Math.floor(guards.expectedMtimeMs)) {
                throw new ProjectFilesError("CONFLICT", `"${normalized}" changed on disk since it was read.`);
            }
        }

        try {
            await mkdir(path.dirname(absolute), { recursive: true });
            if (existing && guards.backup !== false) await this.backUp(absolute);
            const temp = path.join(path.dirname(absolute), `.${path.basename(absolute)}.studio-tmp-${process.pid}-${randomBytes(4).toString("hex")}`);
            const handle = await open(temp, "w", existing ? existing.mode & 0o777 : 0o644);
            try {
                await handle.writeFile(data);
                await handle.sync();
            } finally {
                await handle.close();
            }
            try {
                await rename(temp, absolute);
            } catch (error) {
                await unlink(temp).catch(() => undefined);
                throw error;
            }
        } catch (error) {
            throw ioError(error, normalized);
        }
    }

    private async backUp(absolute: string): Promise<void> {
        const folder = path.join(this.backupsDir, fnv1a(absolute));
        await mkdir(folder, { recursive: true });
        await copyFile(absolute, path.join(folder, `${path.basename(absolute)}.${Date.now()}.bak`));
        const kept = (await readdir(folder)).filter((name) => name.endsWith(".bak")).sort();
        for (const name of kept.slice(0, Math.max(0, kept.length - BACKUPS_KEPT))) await unlink(path.join(folder, name)).catch(() => undefined);
    }

    /** Reports files changed outside this server (editors, builds, git), debounced; returns the stop function. */
    watch(grantId: string, listener: (change: ProjectChange) => void): () => void {
        const grant = this.grantFor(grantId);
        let watcher: FSWatcher | undefined;
        let timer: NodeJS.Timeout | undefined;
        let pending = new Set<string>();
        try {
            watcher = fsWatch(grant.root, { recursive: true }, (_event, filename) => {
                if (!filename) return;
                const relative = String(filename).split(path.sep).join("/");
                if (isNoise(relative)) return;
                pending.add(relative);
                clearTimeout(timer);
                timer = setTimeout(() => {
                    const paths = [...pending].sort();
                    pending = new Set();
                    if (paths.length > 0) listener({ paths });
                }, WATCH_DEBOUNCE_MS);
            });
            watcher.on("error", () => undefined);
        } catch {
            // Recursive watching is not available here (older Linux Node): the editor still works, it just will not see outside changes.
        }
        return () => {
            clearTimeout(timer);
            watcher?.close();
        };
    }
}

// ---------------------------------------------------------------------------------------------------------------------
// HTTP layer

function allowedHost(header: string | undefined): boolean {
    if (!header) return false;
    const host = header.startsWith("[") ? header.slice(0, header.indexOf("]") + 1) : header.split(":")[0]!;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, error: unknown): void {
    const failure = error instanceof ProjectFilesError ? error : new ProjectFilesError("IO_FAILED", error instanceof Error ? error.message : String(error));
    sendJson(res, failure.status, { code: failure.code, message: failure.message });
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = chunk as Buffer;
        size += buffer.length;
        if (size > limit) throw new ProjectFilesError("INVALID_PATH", "That upload is too large.");
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}

/** Opens the operating system's folder picker; resolves to the chosen path, or null when it was cancelled. */
export function pickFolderWithOs(prompt = "Choose the OpenRune project folder"): Promise<string | null> {
    return new Promise((resolve, reject) => {
        let command: string;
        let args: string[];
        if (process.platform === "darwin") {
            command = "osascript";
            args = ["-e", `POSIX path of (choose folder with prompt ${JSON.stringify(prompt)})`];
        } else if (process.platform === "win32") {
            command = "powershell";
            args = [
                "-NoProfile",
                "-Command",
                `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = ${JSON.stringify(prompt)}; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }`,
            ];
        } else {
            command = "zenity";
            args = ["--file-selection", "--directory", `--title=${prompt}`];
        }
        const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
        let output = "";
        child.stdout.on("data", (chunk) => (output += String(chunk)));
        child.on("error", () => reject(new ProjectFilesError("IO_FAILED", "This computer has no folder picker the Studio server can open; type the folder path instead.")));
        child.on("close", () => {
            let picked = output.trim();
            // osascript and zenity end folder paths with a separator; the root itself keeps its one.
            if (picked.length > 1 && /[/\\]$/.test(picked)) picked = picked.slice(0, -1);
            resolve(picked || null);
        });
    });
}

export type ProjectFilesHandlerOptions = ProjectFilesOptions & {
    service?: ProjectFileService;
    /** Replace the OS folder picker (tests). */
    pickFolder?: () => Promise<string | null>;
    token?: string;
};

/**
 * The request handler. Returns true when the request was for this API (and has been answered), false to let the next
 * middleware have it.
 */
export function createProjectFilesHandler(options: ProjectFilesHandlerOptions = {}): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
    const service = options.service ?? new ProjectFileService(options);
    const token = options.token ?? randomBytes(24).toString("hex");
    const pickFolder = options.pickFolder ?? (() => pickFolderWithOs());

    return async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith(`${STUDIO_PROJECT_MOUNT}/`)) return false;
        const route = url.pathname.slice(STUDIO_PROJECT_MOUNT.length + 1);

        try {
            if (!allowedHost(req.headers.host)) throw new ProjectFilesError("ACCESS_DENIED", "Only this computer can use the Studio server.");
            const origin = req.headers.origin;
            if (origin !== undefined && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {
                throw new ProjectFilesError("ACCESS_DENIED", "Requests from other sites are not allowed.");
            }
            if (route === "session") {
                // No CORS headers: only same-origin pages can read the token.
                sendJson(res, 200, { ok: true, version: 1, token, canPickFolder: true, platform: process.platform });
                return true;
            }
            // EventSource cannot set headers, so the change stream takes its token from the query string.
            const presented = req.headers["x-studio-token"] ?? (route === "watch" ? url.searchParams.get("token") : undefined);
            if (presented !== token) throw new ProjectFilesError("ACCESS_DENIED", "Missing or wrong Studio token: reload the page.");

            const grantId = url.searchParams.get("grant") ?? "";
            const relative = url.searchParams.get("path") ?? "";

            if (route === "grant" && req.method === "POST") {
                const body = JSON.parse((await readBody(req, 1 << 20)).toString("utf8") || "{}") as { path?: unknown };
                if (typeof body.path !== "string" || !body.path) throw new ProjectFilesError("INVALID_PATH", "No folder path was given.");
                sendJson(res, 200, await service.grant(body.path));
            } else if (route === "pick" && req.method === "POST") {
                sendJson(res, 200, { path: await pickFolder() });
            } else if (route === "list") {
                sendJson(res, 200, await service.list(grantId, relative));
            } else if (route === "stat") {
                sendJson(res, 200, { entry: (await service.stat(grantId, relative)) ?? null });
            } else if (route === "read") {
                const data = await service.read(grantId, relative);
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/octet-stream");
                res.setHeader("Cache-Control", "no-store");
                res.end(data);
            } else if (route === "mkdir" && req.method === "POST") {
                await service.mkdir(grantId, relative);
                res.statusCode = 204;
                res.end();
            } else if (route === "write" && req.method === "PUT") {
                const guards: WriteGuards = {};
                const expected = req.headers["x-expected-mtime"];
                if (expected === "none") guards.mustNotExist = true;
                else if (typeof expected === "string" && expected !== "") guards.expectedMtimeMs = Number(expected);
                if (req.headers["x-backup"] === "0") guards.backup = false;
                await service.write(grantId, relative, await readBody(req, 1 << 30), guards);
                res.statusCode = 204;
                res.end();
            } else if (route === "watch") {
                res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
                res.write(": connected\n\n");
                const stop = service.watch(grantId, (change) => res.write(`data: ${JSON.stringify(change)}\n\n`));
                const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
                req.on("close", () => {
                    clearInterval(keepAlive);
                    stop();
                });
            } else {
                throw new ProjectFilesError("INVALID_PATH", `Unknown Studio server route "${route}".`);
            }
        } catch (error) {
            if (!res.headersSent) sendError(res, error);
            else res.end();
        }
        return true;
    };
}

/** Vite plugin: serves the API from the dev server and the preview server. */
export function studioProjectFiles(options: ProjectFilesHandlerOptions = {}): Plugin {
    const handler = createProjectFilesHandler(options);
    const use = (middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void }): void => {
        middlewares.use((req, res, next) => {
            void handler(req, res).then((handled) => {
                if (!handled) next();
            });
        });
    };
    return {
        name: "studio-project-files",
        configureServer: (server) => use(server.middlewares),
        configurePreviewServer: (server) => use(server.middlewares),
    };
}
