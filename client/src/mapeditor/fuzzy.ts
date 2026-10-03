/**
 * Small fuzzy matcher for the command palette: every query character must appear in order. Matches score higher when
 * they start the text or a word and when they run together, so "rot" finds "Rotate" before "Select Roof tool".
 */
export function fuzzyScore(query: string, text: string): number | undefined {
    const q = query.trim().toLowerCase();
    if (!q) return 0;
    const t = text.toLowerCase();
    let score = 0;
    let at = 0;
    let previous = -2;
    for (const ch of q) {
        if (ch === " ") {
            previous = -2;
            continue;
        }
        const found = t.indexOf(ch, at);
        if (found < 0) return undefined;
        const boundary = found === 0 || /[\s\-_./:()]/.test(t[found - 1]);
        score += 1 + (boundary ? 6 : 0) + (found === previous + 1 ? 4 : 0) - Math.min(found - at, 8) * 0.1;
        previous = found;
        at = found + 1;
    }
    // Whole-text matches beat scattered letters: "grid" should find "Chunk grid" before "Toggle terrain smoothing".
    const at0 = t.indexOf(q);
    if (t.startsWith(q)) score += 60;
    else if (at0 >= 0) score += /[\s\-_./:()]/.test(t[at0 - 1]) ? 45 : 30;
    return score - t.length * 0.02;
}

/** Items that match, best first; ties keep their original order. */
export function rankByFuzzy<T>(items: readonly T[], query: string, textOf: (item: T) => string): T[] {
    if (!query.trim()) return [...items];
    const scored: { item: T; score: number; index: number }[] = [];
    items.forEach((item, index) => {
        const score = fuzzyScore(query, textOf(item));
        if (score !== undefined) scored.push({ item, score, index });
    });
    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    return scored.map((entry) => entry.item);
}
