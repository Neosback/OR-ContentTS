/**
 * Opens the command palette from anywhere (a key, the title bar, a registered command) without the engine knowing
 * about the UI: the palette component subscribes while it is mounted.
 */
const listeners = new Set<() => void>();

export function onOpenCommandPalette(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function openCommandPalette(): void {
    for (const listener of listeners) listener();
}
