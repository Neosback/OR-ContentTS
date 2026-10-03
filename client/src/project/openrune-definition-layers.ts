/**
 * OpenRune's packers read every TOML block that names the same id and fold them together, so a definition is often
 * written as layers: one block sets `category`, another adds `[npc.params]`, a pack module overrides a field. That is
 * normal. These helpers tell harmless layering from a field that two blocks set to different values.
 */

type Entry = { key: string; value: string };

const HEADER = /^\s*(\[\[?)\s*([^\[\]]+?)\s*\]\]?\s*(?:#.*)?$/;

function stripComment(value: string): string {
    let quote: string | undefined;
    for (let index = 0; index < value.length; index++) {
        const char = value[index]!;
        if (quote) {
            if (char === "\\" && quote === '"') index++;
            else if (char === quote) quote = undefined;
        } else if (char === '"' || char === "'") quote = char;
        else if (char === "#") return value.slice(0, index);
    }
    return value;
}

/** Flattens one block's text to `key -> value` (nested tables as `section.key`, array tables as `section[n].key`). */
export function layerEntries(rawText: string): { entries: Map<string, string>; arrayCounts: Map<string, number> } {
    const entries = new Map<string, string>();
    const arrayCounts = new Map<string, number>();
    let prefix = "";
    const lines = rawText.split(/\r?\n/);
    for (let index = 1; index < lines.length; index++) {
        const line = lines[index]!;
        const header = HEADER.exec(line);
        if (header) {
            const name = header[2]!.trim();
            if (header[1] === "[[") {
                const n = arrayCounts.get(name) ?? 0;
                arrayCounts.set(name, n + 1);
                prefix = `${name}[${n}].`;
            } else prefix = `${name}.`;
            continue;
        }
        const equals = line.indexOf("=");
        if (equals <= 0 || line.trimStart().startsWith("#")) continue;
        const rawKey = line.slice(0, equals).trim();
        const key = rawKey.startsWith('"') && rawKey.endsWith('"') ? rawKey.slice(1, -1) : rawKey;
        entries.set(prefix + key, stripComment(line.slice(equals + 1)).trim());
    }
    return { entries, arrayCounts };
}

/** The keys that two or more of `blocks` set to different values (or, for array tables, a different number of rows). */
export function conflictingLayerKeys(blocks: readonly { rawText: string }[]): string[] {
    const seen = new Map<string, Set<string>>();
    const counts = new Map<string, Set<number>>();
    for (const block of blocks) {
        const { entries, arrayCounts } = layerEntries(block.rawText);
        for (const [key, value] of entries) {
            const values = seen.get(key) ?? new Set<string>();
            values.add(value);
            seen.set(key, values);
        }
        for (const [name, count] of arrayCounts) {
            const values = counts.get(name) ?? new Set<number>();
            values.add(count);
            counts.set(name, values);
        }
    }
    const keys = [...seen].filter(([, values]) => values.size > 1).map(([key]) => key);
    for (const [name, values] of counts) if (values.size > 1) keys.push(`${name}[]`);
    return keys.sort();
}
