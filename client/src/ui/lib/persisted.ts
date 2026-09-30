/** localStorage helpers that never throw (private windows, blocked storage, quota). */

export function readStorage(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeStorage(key: string, value: string | null): void {
    try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
    } catch {
        // Not remembered; the UI still works.
    }
}

export function readJson<T>(key: string): T | undefined {
    const raw = readStorage(key);
    if (raw === null) return undefined;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return undefined;
    }
}
