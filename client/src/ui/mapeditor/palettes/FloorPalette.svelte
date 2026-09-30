<script lang="ts">
    import ArrowDown from "@lucide/svelte/icons/arrow-down";
    import ArrowUp from "@lucide/svelte/icons/arrow-up";
    import Check from "@lucide/svelte/icons/check";
    import Shuffle from "@lucide/svelte/icons/shuffle";
    import Sparkles from "@lucide/svelte/icons/sparkles";
    import Wand2 from "@lucide/svelte/icons/wand-2";
    import X from "@lucide/svelte/icons/x";

    import {
        UNDERLAY_GRADIENT_PATTERNS,
        shuffleUnderlayIdsInPlace,
        underlayGradientPatternLabel,
        type UnderlayGradientPattern,
        type UnderlayPanelTab,
    } from "../../../mapeditor/map-editor-underlay-gradient";
    import { Badge } from "../../components/ui/badge";
    import { Button } from "../../components/ui/button";
    import { CardContent, CardHeader, CardTitle } from "../../components/ui/card";
    import { Label } from "../../components/ui/label";
    import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
    import { ScrollArea } from "../../components/ui/scroll-area";
    import { Separator } from "../../components/ui/separator";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";
    import type { FloorPaletteAdapter } from "./floor-adapters";
    import { rgbToCss } from "./floor-adapters";
    import SwatchGrid from "./SwatchGrid.svelte";

    let { adapter }: { adapter: FloorPaletteAdapter } = $props();

    type SwatchFilter = "all" | "textured" | "plain";

    const editor = useEditorState();
    const noun = adapter.kind === "overlay" ? "overlay" : "underlay";
    const byId = new Map(adapter.items.map((item) => [item.id, item]));

    let swatchFilter = $state<SwatchFilter>("all");
    let basePickerOpen = $state(false);
    let replaceOpenIndex = $state<number | null>(null);

    const selectedId = $derived(editor.read(() => adapter.selectedId()));
    const gradient = $derived(editor.read(() => adapter.gradient()));
    const visibleItems = $derived(
        swatchFilter === "textured" ? adapter.items.filter((i) => i.textured) : swatchFilter === "plain" ? adapter.items.filter((i) => !i.textured) : adapter.items,
    );
    const baseItem = $derived(byId.get(gradient.baseId));
    const noneSelected = $derived(selectedId === -1);

    function move(index: number, dir: -1 | 1): void {
        const next = [...gradient.ids];
        const j = index + dir;
        if (j < 0 || j >= next.length) return;
        [next[index], next[j]] = [next[j]!, next[index]!];
        adapter.setIds(next);
    }
    function shuffle(): void {
        const next = [...gradient.ids];
        shuffleUnderlayIdsInPlace(next, (performance.now() * 1000) ^ (next.length * 0x9e3779b9));
        adapter.setIds(next);
    }
    function replaceAt(index: number, newId: number): void {
        const oldId = gradient.ids[index];
        if (oldId === undefined || oldId === newId) return;
        const next = [...gradient.ids];
        next[index] = newId;
        adapter.setIds(next);
        replaceOpenIndex = null;
    }

    const tabs: readonly (readonly [UnderlayPanelTab, string])[] = [["swatches", "Swatches"], ["gradient", "Gradient"]];
    const filters: readonly (readonly [SwatchFilter, string])[] = [["all", "All"], ["textured", "Textured"], ["plain", "Non-textured"]];
    const chip = "map-editor-swatch group relative aspect-square min-h-[2.5rem] overflow-hidden rounded-md border-2 transition-all";
    const checkBadge = "absolute left-1 top-1 z-[2] flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md";
</script>

<div class="map-editor-panel flex min-h-0 flex-1 flex-col">
    <CardHeader class="space-y-1.5 border-b border-border bg-muted/20 px-4 py-3">
        <div class="flex items-center justify-between gap-2">
            <CardTitle class="text-sm font-semibold tracking-tight text-foreground">{adapter.title}</CardTitle>
            <Badge
                variant="outline"
                class="h-5 border-border px-2 font-mono text-[10px] font-normal tabular-nums"
                title={swatchFilter === "all" ? `${adapter.items.length} ${noun}s` : `${visibleItems.length} shown (${adapter.items.length} total)`}
            >
                {swatchFilter === "all" ? adapter.items.length : `${visibleItems.length}/${adapter.items.length}`}
            </Badge>
        </div>
        <div class="flex gap-0.5 rounded-md border border-border bg-background/80 p-0.5">
            {#each tabs as [id, label] (id)}
                <Button size="sm" variant={gradient.tab === id ? "secondary" : "ghost"} class={cn("h-7 flex-1 text-[11px] font-medium", gradient.tab === id && "ring-1 ring-primary/35")} onclick={() => adapter.setTab(id)}>
                    {label}
                </Button>
            {/each}
        </div>
        {#if gradient.tab === "swatches"}
            <div class="rounded-md border border-primary/35 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-foreground" role="status">
                <span class="text-muted-foreground">Active {noun}: </span>
                <span class="font-mono tabular-nums text-primary">{noneSelected ? "None" : `#${selectedId}`}</span>
            </div>
            {#if adapter.hasTextureFilter}
                <div class="flex flex-col gap-1.5">
                    <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Show swatches</span>
                    <div class="flex flex-wrap gap-1">
                        {#each filters as [value, label] (value)}
                            <Button size="sm" variant={swatchFilter === value ? "secondary" : "outline"} class={cn("h-7 min-w-[4.5rem] flex-1 px-2 text-[11px] font-medium", swatchFilter === value && "ring-1 ring-primary/40")} aria-pressed={swatchFilter === value} onclick={() => (swatchFilter = value)}>
                                {label}
                            </Button>
                        {/each}
                    </div>
                </div>
            {/if}
        {:else}
            <div class="rounded-md border border-muted bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">Gradient mode paints from a generated {noun} palette.</div>
        {/if}
    </CardHeader>
    <Separator />
    <CardContent class="flex min-h-0 flex-1 flex-col p-0">
        <ScrollArea class="min-h-0 flex-1">
            {#if gradient.tab === "swatches"}
                <div class="map-editor-swatch-grid grid gap-1.5 p-3">
                    {#if adapter.hasNone}
                        <button
                            type="button"
                            onclick={() => adapter.clear()}
                            class={cn(
                                "map-editor-swatch group relative flex aspect-square min-h-[2.5rem] flex-col items-center justify-center rounded-md border-2 border-dashed transition-all",
                                "border-muted-foreground/25 bg-muted/30 text-muted-foreground hover:border-muted-foreground/45 hover:bg-muted/50",
                                noneSelected && "border-solid border-primary bg-primary/15 text-foreground ring-4 ring-primary/70 ring-offset-2 ring-offset-background",
                            )}
                        >
                            {#if noneSelected}<span class={checkBadge}><Check class="size-3 stroke-[3]" aria-hidden="true" /></span>{/if}
                            <span class="text-base font-light leading-none">-</span>
                            <span class="mt-0.5 text-[9px] font-medium uppercase tracking-wide">None</span>
                        </button>
                    {/if}
                    {#each visibleItems as item (item.id)}
                        {@const preview = adapter.preview(item.id)}
                        {@const useTexture = preview !== null && item.textured}
                        {@const selected = item.id === selectedId}
                        <button
                            type="button"
                            title="{adapter.kind === 'overlay' ? 'Overlay' : 'Underlay'} {item.id}{item.name ? ` - ${item.name}` : ''}"
                            onclick={() => adapter.select(item.id)}
                            class={cn(chip, "border-border/80 hover:border-primary/40", selected ? "border-primary ring-4 ring-primary/80 ring-offset-2 ring-offset-background" : "hover:ring-1 hover:ring-primary/15")}
                            style="background-color: {useTexture ? 'var(--muted)' : rgbToCss(item.rgb)}"
                        >
                            {#if selected}<span class={checkBadge}><Check class="size-3 stroke-[3]" aria-hidden="true" /></span>{/if}
                            {#if useTexture && preview}
                                <img src={preview} alt="" class="absolute inset-0 h-full w-full object-cover" loading="lazy" draggable="false" />
                            {/if}
                            {#if item.textured && preview === null}
                                <span class="pointer-events-none absolute inset-0 flex items-center justify-center px-0.5 text-center text-[8px] font-medium leading-tight text-muted-foreground">No preview</span>
                            {/if}
                            <span class="absolute bottom-0.5 right-0.5 z-[1] rounded border border-border/60 bg-background/90 px-0.5 py-px font-mono text-[9px] font-medium tabular-nums leading-none text-foreground">{item.id}</span>
                        </button>
                    {/each}
                </div>
            {:else}
                <div class="space-y-2 p-2">
                    <div class="flex flex-wrap items-end gap-1.5">
                        <div class="flex min-w-[8rem] flex-1 flex-col gap-0.5">
                            <Label class="text-[9px] uppercase tracking-wide text-muted-foreground">Base {noun}</Label>
                            <Popover bind:open={basePickerOpen}>
                                <PopoverTrigger>
                                    {#snippet child({ props })}
                                        <Button {...props} variant="outline" class="h-8 w-full justify-start gap-1.5 px-1.5 font-normal">
                                            <span class="size-6 shrink-0 rounded border border-border" style="background-color: {baseItem ? rgbToCss(baseItem.rgb) : 'var(--muted)'}"></span>
                                            <span class="min-w-0 flex-1 truncate text-left font-mono text-[11px] tabular-nums text-foreground">#{gradient.baseId}</span>
                                        </Button>
                                    {/snippet}
                                </PopoverTrigger>
                                <PopoverContent class="w-80 p-2" align="start">
                                    <p class="mb-2 text-xs font-medium text-foreground">Pick base {noun}</p>
                                    <ScrollArea class="h-48">
                                        <SwatchGrid {adapter} selectedId={gradient.baseId} onPick={(id) => { adapter.setBaseId(id); basePickerOpen = false; }} />
                                    </ScrollArea>
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div class="flex shrink-0 items-end gap-1">
                            <Button size="sm" variant="secondary" class="h-8 gap-1 px-2 text-[11px]" onclick={() => adapter.generate()}>
                                <Wand2 class="size-3.5 shrink-0" />
                                Generate
                            </Button>
                            <Button size="sm" variant="outline" class="h-8 px-2 text-[11px]" onclick={() => adapter.bumpPaintSeed()}>Phase</Button>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-1.5">
                        <div class="flex flex-col gap-1">
                            <Label class="text-[9px] uppercase tracking-wide text-muted-foreground">Palette size ({gradient.paletteSize})</Label>
                            <input type="range" min="2" max="24" value={gradient.paletteSize} oninput={(e) => adapter.setPaletteSize(Number(e.currentTarget.value))} class="h-2 w-full accent-primary" />
                        </div>
                        <div class="flex flex-col gap-1">
                            <Label class="text-[9px] uppercase tracking-wide text-muted-foreground">Pool ({gradient.candidatePool})</Label>
                            <input type="range" min="8" max="64" value={gradient.candidatePool} oninput={(e) => adapter.setCandidatePool(Number(e.currentTarget.value))} class="h-2 w-full accent-primary" />
                        </div>
                    </div>
                    <div class="flex flex-col gap-1">
                        <Label class="text-[9px] uppercase tracking-wide text-muted-foreground">Pattern when painting</Label>
                        <select class="h-8 rounded-md border border-border bg-background px-2 text-[11px]" value={gradient.pattern} onchange={(e) => adapter.setPattern(e.currentTarget.value as UnderlayGradientPattern)}>
                            {#each UNDERLAY_GRADIENT_PATTERNS as pattern (pattern)}
                                <option value={pattern}>{underlayGradientPatternLabel(pattern)}</option>
                            {/each}
                        </select>
                    </div>
                    <div class="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" class="h-7 gap-1 px-2 text-[11px]" onclick={() => adapter.randomMix()}>
                            <Sparkles class="size-3.5" />
                            Random mix
                        </Button>
                        <Button size="sm" variant="outline" class="h-7 gap-1 px-2 text-[11px]" onclick={shuffle}>
                            <Shuffle class="size-3.5" />
                            Shuffle
                        </Button>
                    </div>
                    <div class="flex min-h-8 flex-wrap gap-0.5 rounded-md border border-border bg-muted/20 p-1">
                        {#each gradient.ids as id, i (i)}
                            {@const item = byId.get(id)}
                            <div class="size-6 rounded-sm border border-border/80" style="background-color: {item ? rgbToCss(item.rgb) : '#333'}"></div>
                        {/each}
                        {#if gradient.ids.length === 0}<span class="px-2 py-1 text-[10px] text-muted-foreground">No palette yet</span>{/if}
                    </div>
                    <Separator />
                    <p class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Palette order</p>
                    <ul class="space-y-1.5">
                        {#each gradient.ids as id, index (index)}
                            {@const item = byId.get(id)}
                            {@const preview = item ? adapter.preview(item.id) : null}
                            <li class="flex items-center gap-1.5 rounded-md border border-border/80 bg-card/50 px-1.5 py-1">
                                <div class="relative size-8 shrink-0 rounded border border-border" style="background-color: {item ? rgbToCss(item.rgb) : '#333'}">
                                    {#if preview}<img src={preview} alt="" class="absolute inset-0 h-full w-full rounded object-cover opacity-80" />{/if}
                                </div>
                                <span class="min-w-0 flex-1 font-mono text-xs tabular-nums text-foreground">#{id}</span>
                                <div class="flex shrink-0 items-center gap-0.5">
                                    <Button size="sm" variant="ghost" class="size-7 p-0" disabled={index === 0} onclick={() => move(index, -1)}><ArrowUp class="size-3.5" /></Button>
                                    <Button size="sm" variant="ghost" class="size-7 p-0" disabled={index === gradient.ids.length - 1} onclick={() => move(index, 1)}><ArrowDown class="size-3.5" /></Button>
                                    <Popover open={replaceOpenIndex === index} onOpenChange={(open) => (replaceOpenIndex = open ? index : null)}>
                                        <PopoverTrigger>
                                            {#snippet child({ props })}
                                                <Button {...props} size="sm" variant="secondary" class="h-7 px-2 text-[10px]">Swap</Button>
                                            {/snippet}
                                        </PopoverTrigger>
                                        <PopoverContent class="w-80 p-2" align="end">
                                            <p class="mb-2 text-xs font-medium text-foreground">Replace with...</p>
                                            <ScrollArea class="h-48">
                                                <SwatchGrid {adapter} onPick={(newId) => replaceAt(index, newId)} />
                                            </ScrollArea>
                                        </PopoverContent>
                                    </Popover>
                                    <Button size="sm" variant="ghost" class="size-7 p-0 text-destructive hover:text-destructive" onclick={() => adapter.setIds(gradient.ids.filter((x) => x !== id))}>
                                        <X class="size-3.5" />
                                    </Button>
                                </div>
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
        </ScrollArea>
    </CardContent>
</div>
