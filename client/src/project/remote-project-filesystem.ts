import {
    ProjectFileSystemError,
    normalizeProjectPath,
    type ProjectFileChange,
    type ProjectFileEntry,
    type ProjectFileSystem,
    type ProjectFileSystemCapabilities,
    type ProjectFileSystemErrorCode,
    type ProjectWriteOptions,
} from "./project-filesystem";

/**
 * ProjectFileSystem over the Studio dev server's project API (`vite/studio-project-files.mts`): a folder on this
 * computer, read and written through the page's own server. It is how Firefox and Safari (no File System Access API)
 * open an OpenRune project, and it gives any browser the desktop app's safe writes: atomic, "changed since you read it"
 * checks, backups of what is replaced, and a stream of changes made elsewhere.
 */

const MOUNT = "/__studio/project";
const OWN_WRITE_SUPPRESS_MS = 2000;

export type StudioServerSession = { token: string; canPickFolder: boolean; platform: string };

export type RemoteProjectFileSystemOptions = {
    /** Origin of the Studio server; empty means the page's own origin. */
    baseUrl?: string;
    fetch?: typeof fetch;
    /** Constructor for the change stream (tests). */
    eventSource?: typeof EventSource;
};

function resolveFetch(options: { fetch?: typeof fetch }): typeof fetch {
    return options.fetch ?? ((input, init) => globalThis.fetch(input, init));
}

/** The server's session (and the token that unlocks the rest), or undefined when this page has no Studio server. */
export async function probeStudioServer(options: RemoteProjectFileSystemOptions = {}): Promise<StudioServerSession | undefined> {
    try {
        const response = await resolveFetch(options)(`${options.baseUrl ?? ""}${MOUNT}/session`, { cache: "no-store" });
        if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return undefined;
        const body = (await response.json()) as { ok?: boolean; token?: string; canPickFolder?: boolean; platform?: string };
        return body.ok && typeof body.token === "string" ? { token: body.token, canPickFolder: body.canPickFolder === true, platform: body.platform ?? "" } : undefined;
    } catch {
        return undefined;
    }
}

/** Asks the Studio server to open the operating system's folder picker. Resolves to the chosen path, or undefined if cancelled. */
export async function pickFolderViaStudioServer(session: StudioServerSession, options: RemoteProjectFileSystemOptions = {}): Promise<string | undefined> {
    const response = await resolveFetch(options)(`${options.baseUrl ?? ""}${MOUNT}/pick`, { method: "POST", headers: { "x-studio-token": session.token } });
    if (!response.ok) throw await errorFrom(response, "");
    const body = (await response.json()) as { path?: string | null };
    return body.path || undefined;
}

async function errorFrom(response: Response, path: string): Promise<ProjectFileSystemError> {
    let code: ProjectFileSystemErrorCode = "IO_FAILED";
    let message = `The Studio server answered ${response.status}.`;
    try {
        const body = (await response.json()) as { code?: ProjectFileSystemErrorCode; message?: string };
        if (body.code) code = body.code;
        if (body.message) message = body.message;
    } catch {
        // not JSON: keep the generic text
    }
    return new ProjectFileSystemError(code, message, path || undefined);
}

export class RemoteProjectFileSystem implements ProjectFileSystem {
    readonly capabilities: ProjectFileSystemCapabilities;
    private session?: StudioServerSession;
    private grantId?: string;
    private granting?: Promise<string>;
    private readonly recentWrites = new Map<string, number>();

    constructor(
        readonly rootPath: string,
        private readonly options: RemoteProjectFileSystemOptions = {},
    ) {
        if (!rootPath) throw new ProjectFileSystemError("INVALID_PATH", "A project folder path is required.", rootPath);
        this.capabilities = { read: true, write: true, watch: typeof (options.eventSource ?? globalThis.EventSource) === "function" };
    }

    private url(route: string, params: Record<string, string>): string {
        const query = new URLSearchParams(params).toString();
        return `${this.options.baseUrl ?? ""}${MOUNT}/${route}${query ? `?${query}` : ""}`;
    }

    private async ensureSession(): Promise<StudioServerSession> {
        if (this.session) return this.session;
        const session = await probeStudioServer(this.options);
        if (!session) throw new ProjectFileSystemError("READ_UNAVAILABLE", "The Studio server is not reachable. Start Studio with `npm run dev` and open it from there.", this.rootPath);
        return (this.session = session);
    }

    /** Grants the folder once per page (and again if the server was restarted). */
    private ensureGrant(): Promise<string> {
        if (this.grantId) return Promise.resolve(this.grantId);
        this.granting ??= (async () => {
            const session = await this.ensureSession();
            const response = await resolveFetch(this.options)(this.url("grant", {}), {
                method: "POST",
                headers: { "x-studio-token": session.token, "content-type": "application/json" },
                body: JSON.stringify({ path: this.rootPath }),
            });
            if (!response.ok) throw await errorFrom(response, this.rootPath);
            const body = (await response.json()) as { grantId: string };
            return (this.grantId = body.grantId);
        })().finally(() => {
            this.granting = undefined;
        });
        return this.granting;
    }

    private async call(route: string, path: string, init: RequestInit = {}, retry = true): Promise<Response> {
        const normalized = normalizeProjectPath(path);
        const grant = await this.ensureGrant();
        const session = await this.ensureSession();
        let response: Response;
        try {
            response = await resolveFetch(this.options)(this.url(route, { grant, path: normalized }), {
                ...init,
                headers: { ...(init.headers as Record<string, string> | undefined), "x-studio-token": session.token },
            });
        } catch (error) {
            if (retry) {
                // A dropped connection (the server restarted) is worth one fresh start before giving up.
                this.grantId = undefined;
                this.session = undefined;
                return this.call(route, path, init, false);
            }
            throw new ProjectFileSystemError("READ_UNAVAILABLE", "The Studio server is not reachable.", normalized, { cause: error });
        }
        if (response.status === 403 && retry) {
            // The server restarted (grants and token are per run): fetch a fresh session and grant again, once.
            this.grantId = undefined;
            this.session = undefined;
            return this.call(route, path, init, false);
        }
        if (!response.ok) throw await errorFrom(response, normalized);
        return response;
    }

    async list(path = ""): Promise<ProjectFileEntry[]> {
        return (await (await this.call("list", path)).json()) as ProjectFileEntry[];
    }

    async stat(path: string): Promise<ProjectFileEntry | undefined> {
        const body = (await (await this.call("stat", path)).json()) as { entry: ProjectFileEntry | null };
        return body.entry ?? undefined;
    }

    async exists(path: string): Promise<boolean> {
        return (await this.stat(path)) !== undefined;
    }

    async readBytes(path: string): Promise<Uint8Array> {
        return new Uint8Array(await (await this.call("read", path)).arrayBuffer());
    }

    async readText(path: string): Promise<string> {
        return new TextDecoder().decode(await this.readBytes(path));
    }

    async writeBytes(path: string, data: Uint8Array, options?: ProjectWriteOptions): Promise<void> {
        const normalized = normalizeProjectPath(path);
        const headers: Record<string, string> = { "content-type": "application/octet-stream" };
        if (options?.expectedModifiedAt === null) headers["x-expected-mtime"] = "none";
        else if (options?.expectedModifiedAt !== undefined) headers["x-expected-mtime"] = String(options.expectedModifiedAt);
        if (options?.backup === false) headers["x-backup"] = "0";
        this.rememberOwnWrite(normalized);
        await this.call("write", normalized, { method: "PUT", headers, body: data as unknown as BodyInit });
    }

    async writeText(path: string, text: string, options?: ProjectWriteOptions): Promise<void> {
        await this.writeBytes(path, new TextEncoder().encode(text), options);
    }

    /** Creates a folder (and its parents). Not part of ProjectFileSystem, used by export-style writers. */
    async makeDirectory(path: string): Promise<void> {
        await this.call("mkdir", path, { method: "POST" });
    }

    private rememberOwnWrite(path: string): void {
        const now = Date.now();
        this.recentWrites.set(path, now);
        for (const [key, at] of this.recentWrites) if (now - at > OWN_WRITE_SUPPRESS_MS * 4) this.recentWrites.delete(key);
    }

    private isOwnWrite(path: string): boolean {
        const at = this.recentWrites.get(path);
        return at !== undefined && Date.now() - at < OWN_WRITE_SUPPRESS_MS;
    }

    watch(listener: (change: ProjectFileChange) => void): () => void {
        let source: EventSource | undefined;
        let stopped = false;
        void (async () => {
            const Source = this.options.eventSource ?? globalThis.EventSource;
            if (typeof Source !== "function") return;
            const grant = await this.ensureGrant();
            const session = await this.ensureSession();
            if (stopped) return;
            source = new Source(this.url("watch", { grant, token: session.token }));
            source.onmessage = (event) => {
                try {
                    const change = JSON.parse(String(event.data)) as { paths?: unknown };
                    if (!Array.isArray(change.paths)) return;
                    const paths = change.paths.filter((path): path is string => typeof path === "string" && !this.isOwnWrite(path));
                    if (paths.length > 0) listener({ paths });
                } catch {
                    // ignore a malformed event
                }
            };
        })().catch(() => undefined);
        return () => {
            stopped = true;
            source?.close();
        };
    }
}
