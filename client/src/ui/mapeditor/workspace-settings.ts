/**
 * All the map editor's saved preferences (keybinds, plugin switches, brush, panel display, pinned controls, layouts...)
 * live in localStorage under `map-editor-*` keys. A settings bundle is just those keys in one file, so a setup can be
 * backed up, moved to another machine, or shared. Cache profiles and projects are deliberately not included.
 */
export const SETTINGS_PREFIX = "map-editor-";
export const SETTINGS_FILE_KIND = "openrune-map-editor-settings";
export const SETTINGS_FILE_VERSION = 1;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const storageOrUndefined = (): StorageLike | undefined => {
    try {
        return typeof localStorage === "undefined" ? undefined : localStorage;
    } catch {
        return undefined;
    }
};

/** Keys that must not travel: they only make sense on the machine and session that wrote them. */
const EXCLUDED = new Set(["map-editor-dock-panel-restore-v1"]);

export function collectSettings(storage: StorageLike | undefined = storageOrUndefined()): Record<string, string> {
    const out: Record<string, string> = {};
    if (!storage) return out;
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key || !key.startsWith(SETTINGS_PREFIX) || EXCLUDED.has(key)) continue;
        const value = storage.getItem(key);
        if (value !== null) out[key] = value;
    }
    return out;
}

export function serializeSettings(settings: Record<string, string>): string {
    return JSON.stringify({ kind: SETTINGS_FILE_KIND, version: SETTINGS_FILE_VERSION, exportedAt: new Date().toISOString(), settings }, null, 2);
}

export function parseSettingsFile(text: string): { settings: Record<string, string> } | { error: string } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { error: "That file is not valid JSON." };
    }
    if (typeof parsed !== "object" || parsed === null || (parsed as { kind?: unknown }).kind !== SETTINGS_FILE_KIND) {
        return { error: "That is not a map editor settings file." };
    }
    const raw = (parsed as { settings?: unknown }).settings;
    if (typeof raw !== "object" || raw === null) return { error: "The settings file is empty." };
    const settings: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
        // Only map editor keys with string values are accepted, whatever else the file says.
        if (key.startsWith(SETTINGS_PREFIX) && !EXCLUDED.has(key) && typeof value === "string") settings[key] = value;
    }
    if (Object.keys(settings).length === 0) return { error: "The settings file has nothing to import." };
    return { settings };
}

/** Replaces the saved map editor settings with `settings`; returns how many keys were written. The editor must reload to use them. */
export function applySettings(settings: Record<string, string>, storage: StorageLike | undefined = storageOrUndefined()): number {
    if (!storage) return 0;
    const stale: string[] = [];
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(SETTINGS_PREFIX) && !EXCLUDED.has(key)) stale.push(key);
    }
    for (const key of stale) storage.removeItem(key);
    let written = 0;
    for (const [key, value] of Object.entries(settings)) {
        storage.setItem(key, value);
        written++;
    }
    return written;
}

/** Forgets every saved map editor setting (a full factory reset of the editor's preferences). */
export function clearSettings(storage: StorageLike | undefined = storageOrUndefined()): void {
    applySettings({}, storage);
}
