/**
 * Which items a customizable bar shows and in what order. A bar is described by its full item order plus the ids that
 * are hidden, so an item added later (a plugin's, a new control) appears at the end and hidden unless it is one of the
 * bar's defaults. Pure so it can be tested; `bar-model.ts` adds the saving and the notifications.
 */
export type BarConfig = { order: string[]; hidden: string[] };

export type BarResolved = { order: string[]; hidden: ReadonlySet<string> };

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === "string");

/** Merges saved choices with the items that exist now; unknown saved ids are dropped. */
export function resolveBar(saved: unknown, available: readonly string[], defaultVisible: readonly string[]): BarResolved {
    const known = new Set(available);
    const savedOrder = isStringArray((saved as BarConfig | undefined)?.order) ? (saved as BarConfig).order : undefined;
    const savedHidden = isStringArray((saved as BarConfig | undefined)?.hidden) ? (saved as BarConfig).hidden : undefined;

    if (!savedOrder) {
        const visible = new Set(defaultVisible.filter((id) => known.has(id)));
        // Defaults first, in their given order, then everything else (hidden).
        const order = [...visible, ...available.filter((id) => !visible.has(id))];
        return { order, hidden: new Set(available.filter((id) => !visible.has(id))) };
    }

    const order: string[] = [];
    const seen = new Set<string>();
    for (const id of savedOrder) {
        if (known.has(id) && !seen.has(id)) {
            seen.add(id);
            order.push(id);
        }
    }
    const hidden = new Set((savedHidden ?? []).filter((id) => known.has(id)));
    for (const id of available) {
        if (!seen.has(id)) {
            order.push(id);
            if (!defaultVisible.includes(id)) hidden.add(id);
        }
    }
    return { order, hidden };
}

export function visibleBarItems(bar: BarResolved): string[] {
    return bar.order.filter((id) => !bar.hidden.has(id));
}

/** Moves `id` one place up (-1) or down (+1) among all items, as the customize dialog lists them. */
export function moveBarItem(order: readonly string[], id: string, delta: -1 | 1): string[] {
    const index = order.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return [...order];
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}

export function toBarConfig(bar: BarResolved): BarConfig {
    return { order: [...bar.order], hidden: [...bar.hidden] };
}
