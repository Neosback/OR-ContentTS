<script lang="ts">
    import Globe from "@lucide/svelte/icons/globe";
    import Layers3 from "@lucide/svelte/icons/layers-3";
    import MapPinned from "@lucide/svelte/icons/map-pinned";

    import { cn } from "../../lib/utils";
    import type { LaunchController, LaunchMode } from "../launch.svelte";

    let {
        mode,
        title,
        ariaLabel,
        launch,
    }: { mode: LaunchMode; title: string; ariaLabel: string; launch: LaunchController } = $props();

    const active = $derived(launch.activeMode === mode);
    const preview = $derived(mode === "sandbox" ? launch.sandboxPreview : launch.regionPreview);
    const tileSize = $derived(mode === "sandbox" ? launch.sandboxTileSize : launch.regionPreview.tileSize);
    const entering = $derived(launch.isEnteringEditor && launch.launchMode === mode);
    const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

    function setRadius(value: string): void {
        const next = Math.min(3, Math.max(0, Number(value) || 0));
        if (mode === "sandbox") launch.sandboxRegionRadius = next;
        else launch.regionRadius = next;
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<section
    class={cn("relative rounded-lg border border-border bg-background/50 p-4 transition-all", active ? "border-primary/60 shadow-sm" : "cursor-pointer")}
    onclick={() => (launch.activeMode = mode)}
    aria-label={ariaLabel}
>
    <div class={cn("transition-all", active ? "opacity-100 blur-0" : "opacity-55 blur-[1px] hover:opacity-75 hover:blur-0")}>
        <div class="mb-4 flex items-center gap-2">
            <div class="rounded-md bg-primary/15 p-2 text-primary"><MapPinned class="size-4" /></div>
            <div>
                <h2 class="text-sm font-semibold">{title}</h2>
                <p class="text-xs text-muted-foreground">Jump directly to a target region, or open world map.</p>
            </div>
        </div>

        {#if mode === "region"}
            <label class="mb-2 block text-xs font-medium text-muted-foreground" for="launch-region-id">Target region ID</label>
            <input
                id="launch-region-id"
                type="text"
                placeholder="e.g. 12850"
                bind:value={launch.targetRegion}
                disabled={!active || launch.hasAnyCoordInput}
                class={cn("mb-3", field)}
            />
            <span class="mb-2 block text-xs font-medium text-muted-foreground">Or target coordinates (X, Y)</span>
            <div class="mb-3 grid grid-cols-2 gap-2">
                <input type="number" min="0" placeholder="X" bind:value={launch.targetRegionX} disabled={!active || launch.hasRegionIdInput} class={field} />
                <input type="number" min="0" placeholder="Y" bind:value={launch.targetRegionY} disabled={!active || launch.hasRegionIdInput} class={field} />
            </div>
        {/if}

        <label class="mb-2 block text-xs font-medium text-muted-foreground" for="launch-radius-{mode}">Regions around target</label>
        <input
            id="launch-radius-{mode}"
            type="number"
            min="0"
            max="3"
            value={mode === "sandbox" ? launch.sandboxRegionRadius : launch.regionRadius}
            oninput={(event) => setRadius(event.currentTarget.value)}
            disabled={!active}
            class={cn("mb-3", field)}
        />

        {#if mode === "sandbox"}
            <div class="mb-3 rounded-md border border-border/70 bg-background/60 p-3">
                <div class="mt-2">
                    <p class="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Region area preview</p>
                    <div class="mx-auto mt-1 grid w-fit justify-center gap-1" style="grid-template-columns: repeat({preview.columns}, {tileSize}px)">
                        {#each { length: preview.cellCount } as _, index (index)}
                            <div class="rounded-[3px] bg-primary/70" style="width: {tileSize}px; height: {tileSize}px"></div>
                        {/each}
                    </div>
                </div>
            </div>
        {:else}
            <div class="mb-3">
                <p class="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Region area preview</p>
                <div class="mx-auto grid w-fit justify-center gap-1" style="grid-template-columns: repeat({preview.columns}, {tileSize}px)">
                    {#each { length: preview.cellCount } as _, index (index)}
                        <div class="rounded-[3px] bg-primary/70" style="width: {tileSize}px; height: {tileSize}px"></div>
                    {/each}
                </div>
                <p class="mt-2 text-[11px] text-muted-foreground">
                    {#if preview.safeCount > preview.cellCount}
                        Radius {preview.safeRadius} = {preview.safeCount} regions (showing first {preview.cellCount}).
                    {:else}
                        Radius {preview.safeRadius} = {preview.safeCount} regions in {preview.rows} rows.
                    {/if}
                </p>
            </div>
        {/if}

        <div class="flex gap-2">
            <button
                type="button"
                class="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-60"
                onclick={() => launch.launchRegion(mode)}
                disabled={!active || (mode === "region" && !launch.canOpenRegion)}
            >
                <Layers3 class="size-4" />
                {mode === "sandbox" ? "Generate" : "Open Region"}
            </button>
            {#if mode === "region"}
                <button
                    type="button"
                    class="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-60"
                    onclick={() => (launch.isWorldMapOpen = true)}
                    disabled={!active}
                >
                    <Globe class="size-4" />
                    World Map
                </button>
            {/if}
        </div>

        <div class="mt-3 rounded-md border border-border/70 bg-background/60 p-2">
            <div class="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{entering ? (mode === "sandbox" ? "Preparing sandbox..." : "Preparing region...") : "Ready"}</span>
                <span>{entering ? `${launch.enteringProgress}%` : "Idle"}</span>
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                    class={cn("h-full rounded-full bg-primary transition-all duration-300", entering && "animate-pulse")}
                    style="width: {entering ? Math.max(6, launch.enteringProgress) : 0}%"
                ></div>
            </div>
            {#if entering && launch.enteringTotal > 0}
                <p class="mt-1 text-[11px] text-muted-foreground">Loaded ~{launch.enteringLoaded} / {launch.enteringTotal} regions</p>
            {/if}
        </div>
    </div>
    {#if !active}
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span class="rounded-full border border-border bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow-sm">Click to activate</span>
        </div>
    {/if}
</section>
