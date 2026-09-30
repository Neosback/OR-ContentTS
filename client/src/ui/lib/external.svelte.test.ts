import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";

import { fromExternal } from "./external.svelte";

describe("fromExternal", () => {
    it("re-runs an effect when the store notifies and unsubscribes on teardown", () => {
        let value = 1;
        const listeners = new Set<() => void>();
        const store = fromExternal(
            (listener) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            () => value,
        );

        const seen: number[] = [];
        const cleanup = $effect.root(() => {
            $effect(() => {
                seen.push(store.current);
            });
        });
        flushSync();
        expect(seen).toEqual([1]);
        expect(listeners.size).toBe(1);

        value = 2;
        for (const listener of listeners) listener();
        flushSync();
        expect(seen).toEqual([1, 2]);

        cleanup();
        flushSync();
        expect(listeners.size).toBe(0);
    });
});
