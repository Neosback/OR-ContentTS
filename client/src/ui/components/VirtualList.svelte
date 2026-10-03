<script lang="ts" generics="T">
    import type { Snippet } from "svelte";

    import { computeVirtualWindow } from "../lib/virtual-window";
    import { cn } from "../lib/utils";

    /**
     * A scrolling list that only renders the rows in view (plus a few either side). Rows are a fixed height, so tens
     * of thousands of entries cost the same as a dozen.
     */
    let {
        items,
        rowHeight,
        row,
        overscan = 4,
        class: className,
        label,
        empty,
    }: {
        items: readonly T[];
        rowHeight: number;
        row: Snippet<[item: T, index: number]>;
        overscan?: number;
        class?: string;
        label?: string;
        empty?: Snippet;
    } = $props();

    let scrollTop = $state(0);
    let viewport = $state(0);
    const win = $derived(computeVirtualWindow(scrollTop, viewport, rowHeight, items.length, overscan));
    const rows = $derived(items.slice(win.start, win.end));

    // A new list (a different search) starts at the top.
    let first: T | undefined;
    let scroller: HTMLDivElement | undefined;
    $effect(() => {
        const head = items[0];
        if (head !== first) {
            first = head;
            if (scroller) scroller.scrollTop = 0;
        }
    });
</script>

<div
    bind:this={scroller}
    bind:clientHeight={viewport}
    class={cn("overflow-y-auto", className)}
    role="listbox"
    aria-label={label}
    tabindex="-1"
    onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)}
>
    {#if items.length === 0}
        {@render empty?.()}
    {:else}
        <div style="height: {win.total}px; position: relative;">
            <div style="position: absolute; top: {win.offset}px; left: 0; right: 0;">
                {#each rows as item, i (win.start + i)}
                    <div style="height: {rowHeight}px;">{@render row(item, win.start + i)}</div>
                {/each}
            </div>
        </div>
    {/if}
</div>
