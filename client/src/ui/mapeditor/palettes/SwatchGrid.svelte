<script lang="ts">
    import type { FloorPaletteAdapter } from "./floor-adapters";
    import { rgbToCss } from "./floor-adapters";
    import { cn } from "../../lib/utils";

    /** A grid of small swatches used inside the "pick base" / "swap" popovers. */
    let {
        adapter,
        selectedId,
        onPick,
    }: { adapter: FloorPaletteAdapter; selectedId?: number; onPick: (id: number) => void } = $props();
</script>

<div class="map-editor-swatch-grid grid gap-1 pr-2">
    {#each adapter.items as item (item.id)}
        {@const preview = adapter.preview(item.id)}
        <button
            type="button"
            class={cn(
                "map-editor-swatch relative aspect-square min-h-8 overflow-hidden rounded-md border-2 border-border/80 hover:border-primary/50",
                item.id === selectedId && "ring-2 ring-primary ring-offset-2 ring-offset-popover",
            )}
            style="background-color: {rgbToCss(item.rgb)}"
            onclick={() => onPick(item.id)}
        >
            {#if preview}<img src={preview} alt="" class="absolute inset-0 h-full w-full object-cover opacity-80" />{/if}
            <span class="absolute bottom-0.5 right-0.5 rounded bg-background/90 px-0.5 font-mono text-[8px]">{item.id}</span>
        </button>
    {/each}
</div>
