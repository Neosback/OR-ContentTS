import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

/**
 * Reverse proxy for the remote cache server (`/api/cache-proxy/*`). It replaces the Next route
 * handler: the target comes from the `x-cache-type` header, then the `cache-type` cookie, then
 * `API_PROXY_DESTINATION`, then localhost:8090.
 */

type CacheTarget = { ip: string; port: number };

const DEFAULT_TARGET: CacheTarget = { ip: "localhost", port: 8090 };
const MOUNT = "/api/cache-proxy";
const HOP_BY_HOP = new Set(["content-encoding", "transfer-encoding", "connection", "keep-alive"]);

function validPort(port: number): boolean {
    return Number.isFinite(port) && port >= 1 && port <= 65535;
}

function parseTargetFromEnv(): CacheTarget {
    const raw = process.env.API_PROXY_DESTINATION;
    if (!raw) return DEFAULT_TARGET;
    try {
        const url = new URL(raw);
        const port = Number(url.port || "8090");
        return validPort(port) ? { ip: url.hostname, port } : DEFAULT_TARGET;
    } catch {
        return DEFAULT_TARGET;
    }
}

function readCookie(header: string | undefined, name: string): string | undefined {
    if (!header) return undefined;
    for (const part of header.split(";")) {
        const [key, ...rest] = part.trim().split("=");
        if (key === name) {
            const value = rest.join("=");
            try {
                return decodeURIComponent(value);
            } catch {
                return value;
            }
        }
    }
    return undefined;
}

function parseTarget(req: IncomingMessage, fallback: CacheTarget): CacheTarget {
    const headerValue = req.headers["x-cache-type"];
    const raw = (Array.isArray(headerValue) ? headerValue[0] : headerValue) ?? readCookie(req.headers.cookie, "cache-type");
    if (!raw) return fallback;
    try {
        const parsed = JSON.parse(raw) as Partial<CacheTarget>;
        const ip = typeof parsed.ip === "string" ? parsed.ip.trim() : "";
        const port = Number(parsed.port);
        return ip && validPort(port) ? { ip, port } : fallback;
    } catch {
        return fallback;
    }
}

/** Zip routes can take a long time (build + large binary); avoid short proxy aborts. */
function timeoutMsFor(parts: string[]): number {
    if (parts[0] === "zip") return parts[1] === "download" ? 0 : 120_000;
    return 10_000;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
}

function offlineStatus(target: CacheTarget, message: string) {
    return {
        status: "ERROR",
        game: "unknown",
        revision: 0,
        environment: "offline",
        port: target.port,
        statusMessage: message,
    };
}

async function readBody(req: IncomingMessage): Promise<Uint8Array<ArrayBuffer> | undefined> {
    if (req.method === "GET" || req.method === "HEAD") return undefined;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined;
}

async function proxy(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const parts = url.pathname.slice(MOUNT.length).split("/").filter(Boolean);
    const target = parseTarget(req, parseTargetFromEnv());
    const destination = `http://${target.ip}:${target.port}/${parts.join("/")}${url.search}`;
    const isStatus = parts.join("/") === "status";
    const zipDownload = parts[0] === "zip" && parts[1] === "download";
    const timeoutMs = timeoutMsFor(parts);

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined || key === "content-length") continue;
        headers[key] = Array.isArray(value) ? value.join(", ") : value;
    }
    headers.host = `${target.ip}:${target.port}`;

    const controller = timeoutMs > 0 ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
        const upstream = await fetch(destination, {
            method: req.method,
            headers,
            body: await readBody(req),
            signal: controller?.signal,
            redirect: "manual",
            cache: "no-store",
        });

        if (isStatus && !upstream.ok) {
            return sendJson(res, 200, offlineStatus(target, "Cache server returned an error status"));
        }

        res.statusCode = upstream.status;
        res.statusMessage = upstream.statusText;
        upstream.headers.forEach((value, key) => {
            const lower = key.toLowerCase();
            if (HOP_BY_HOP.has(lower)) return;
            if (!zipDownload && lower === "content-length") return;
            res.setHeader(key, value);
        });

        const nullBody = upstream.status === 204 || upstream.status === 205 || upstream.status === 304;
        if (nullBody || !upstream.body) {
            res.end();
        } else if (zipDownload) {
            const reader = upstream.body.getReader();
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!res.write(value)) await new Promise((resolve) => res.once("drain", resolve));
            }
            res.end();
        } else {
            res.end(Buffer.from(await upstream.arrayBuffer()));
        }
    } catch (error) {
        if (res.headersSent) {
            res.destroy();
            return;
        }
        if (isStatus) {
            return sendJson(res, 200, offlineStatus(target, "Cache server is not responding"));
        }
        const cause = (error as { cause?: { code?: string } }).cause;
        if ((error as { name?: string }).name === "AbortError" || cause?.code === "ECONNREFUSED") {
            return sendJson(res, 503, { error: "Service unavailable", message: "Cache server is not responding" });
        }
        return sendJson(res, 502, {
            error: "Gateway error",
            message: error instanceof Error ? error.message : "Unknown proxy error",
        });
    } finally {
        if (timer) clearTimeout(timer);
    }
}

export function cacheProxy(): Plugin {
    const mount = (server: { middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) => {
        server.middlewares.use((req, res, next) => {
            if (!req.url?.startsWith(MOUNT)) return next();
            const url = new URL(req.url, "http://localhost");
            void proxy(req, res, url);
        });
    };
    return { name: "studio:cache-proxy", configureServer: mount, configurePreviewServer: mount };
}
