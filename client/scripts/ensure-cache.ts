import AdmZip from "adm-zip";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OPENRS2_API = "https://archive.openrs2.org";
const CLIENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHES_DIR = path.join(CLIENT_ROOT, "caches");
const TARGET_FILE = path.join(CLIENT_ROOT, "cache-target.json");
const LOCK_FILE = path.join(CACHES_DIR, ".cache-download.lock");
const LOCK_POLL_MS = 1_000;
const LOCK_STALE_MS = 10 * 60 * 1_000;

type CacheTarget = {
    game: "oldschool";
    revision: number;
    environment?: string;
    date?: string;
};

type OpenRS2CacheEntry = {
    id: number;
    scope: string;
    game: string;
    environment: string;
    language: string;
    builds: Array<{ major: number; minor: number | null }>;
    timestamp: string;
    valid_indexes: number;
    indexes: number;
    valid_groups: number;
    groups: number;
    size: number;
};

function readTarget(): CacheTarget {
    const raw = JSON.parse(fs.readFileSync(TARGET_FILE, "utf8")) as Partial<CacheTarget>;
    const revision = raw.revision;
    if (raw.game !== "oldschool" || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision <= 0) {
        throw new Error("cache-target.json must define an oldschool cache with a positive integer revision.");
    }
    if (raw.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
        throw new Error("cache-target.json date must use YYYY-MM-DD when provided.");
    }
    return {
        game: raw.game,
        revision,
        environment: raw.environment ?? "live",
        date: raw.date,
    };
}

function isComplete(entry: OpenRS2CacheEntry): boolean {
    if (entry.valid_indexes !== entry.indexes || entry.indexes <= 0 || entry.groups <= 0) return false;
    return entry.valid_groups / entry.groups >= 0.9;
}

async function findCache(target: CacheTarget): Promise<OpenRS2CacheEntry> {
    console.log(`[CacheBootstrap] Looking for OSRS revision ${target.revision} on OpenRS2...`);
    const response = await fetch(`${OPENRS2_API}/caches.json`);
    if (!response.ok) {
        throw new Error(`OpenRS2 cache index failed: ${response.status} ${response.statusText}`);
    }

    const entries = (await response.json()) as OpenRS2CacheEntry[];
    const matches = entries
        .filter(
            (entry) =>
                entry.scope === "runescape" &&
                entry.game === target.game &&
                entry.environment === target.environment &&
                entry.language === "en" &&
                entry.builds[0]?.major === target.revision &&
                Boolean(entry.timestamp) &&
                isComplete(entry),
        )
        .filter((entry) => !target.date || entry.timestamp.startsWith(target.date))
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

    const match = matches[0];
    if (!match) {
        const dateHint = target.date ? ` on ${target.date}` : "";
        throw new Error(`No complete OpenRS2 cache found for revision ${target.revision}${dateHint}.`);
    }
    return match;
}

function cacheName(entry: OpenRS2CacheEntry): string {
    return `osrs-${entry.builds[0].major}_${entry.timestamp.slice(0, 10)}`;
}

function isCacheValid(cacheDir: string): boolean {
    return ["main_file_cache.dat2", "main_file_cache.idx255", "info.json", "keys.json"].every((name) =>
        fs.existsSync(path.join(cacheDir, name)),
    );
}

function acquireLock(): boolean {
    fs.mkdirSync(CACHES_DIR, { recursive: true });
    if (fs.existsSync(LOCK_FILE)) {
        try {
            if (Date.now() - fs.statSync(LOCK_FILE).mtimeMs > LOCK_STALE_MS) {
                fs.unlinkSync(LOCK_FILE);
            }
        } catch {}
    }
    try {
        fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: "wx" });
        return true;
    } catch {
        return false;
    }
}

function releaseLock(): void {
    try {
        fs.unlinkSync(LOCK_FILE);
    } catch {}
}

async function waitForLock(): Promise<void> {
    console.log("[CacheBootstrap] Another process is downloading the cache; waiting...");
    while (fs.existsSync(LOCK_FILE)) {
        try {
            if (Date.now() - fs.statSync(LOCK_FILE).mtimeMs > LOCK_STALE_MS) {
                fs.unlinkSync(LOCK_FILE);
                break;
            }
        } catch {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
    }
}

async function downloadBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText} (${url})`);
    return Buffer.from(await response.arrayBuffer());
}

async function writeCache(entry: OpenRS2CacheEntry, cacheDir: string): Promise<void> {
    fs.mkdirSync(cacheDir, { recursive: true });
    console.log(`[CacheBootstrap] Downloading OpenRS2 cache ${entry.id} into ${path.relative(CLIENT_ROOT, cacheDir)}...`);

    const zip = new AdmZip(await downloadBuffer(`${OPENRS2_API}/caches/${entry.scope}/${entry.id}/disk.zip`));
    zip.extractEntryTo("cache/", cacheDir, false, true);

    const keysResponse = await fetch(`${OPENRS2_API}/caches/${entry.scope}/${entry.id}/keys.json`);
    const xteas: Record<string, number[]> = {};
    if (keysResponse.ok) {
        const keys = (await keysResponse.json()) as Array<{ group: number; key: number[] }>;
        for (const key of keys) xteas[String(key.group)] = key.key;
    }

    fs.writeFileSync(path.join(cacheDir, "keys.json"), JSON.stringify(xteas), "utf8");
    fs.writeFileSync(path.join(cacheDir, "info.json"), JSON.stringify(entry), "utf8");
}

function writeCacheList(): void {
    fs.mkdirSync(CACHES_DIR, { recursive: true });
    const items: Array<{
        name: string;
        game: string;
        environment: string;
        revision: number;
        timestamp: string;
        size: number;
    }> = [];

    for (const name of fs.readdirSync(CACHES_DIR)) {
        const cacheDir = path.join(CACHES_DIR, name);
        if (!fs.existsSync(cacheDir) || !fs.statSync(cacheDir).isDirectory() || !isCacheValid(cacheDir)) continue;
        try {
            const entry = JSON.parse(fs.readFileSync(path.join(cacheDir, "info.json"), "utf8")) as OpenRS2CacheEntry;
            const revision = entry.builds[0]?.major;
            if (!Number.isSafeInteger(revision) || !entry.timestamp) continue;
            items.push({
                name,
                game: entry.game,
                environment: entry.environment,
                revision,
                timestamp: entry.timestamp,
                size: entry.size ?? 0,
            });
        } catch {
            // Ignore unrelated or corrupt local cache directories. They can be repaired manually.
        }
    }

    items.sort((a, b) => b.revision - a.revision || Date.parse(b.timestamp) - Date.parse(a.timestamp));
    fs.writeFileSync(path.join(CACHES_DIR, "caches.json"), JSON.stringify(items), "utf8");
}

async function main(): Promise<void> {
    const target = readTarget();
    const entry = await findCache(target);
    const name = cacheName(entry);
    const cacheDir = path.join(CACHES_DIR, name);

    if (isCacheValid(cacheDir)) {
        writeCacheList();
        console.log(`[CacheBootstrap] ${name} is already present.`);
        return;
    }

    if (!acquireLock()) {
        await waitForLock();
        if (isCacheValid(cacheDir)) {
            writeCacheList();
            return;
        }
        if (!acquireLock()) throw new Error("Could not acquire the cache bootstrap lock.");
    }

    try {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        await writeCache(entry, cacheDir);
        if (!isCacheValid(cacheDir)) throw new Error("Cache download completed but validation failed.");
        writeCacheList();
        console.log(`[CacheBootstrap] ${name} is ready.`);
    } finally {
        releaseLock();
    }
}

main().catch((error) => {
    console.error("[CacheBootstrap] Fatal:", error);
    process.exitCode = 1;
});
