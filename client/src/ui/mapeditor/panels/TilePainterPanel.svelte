<script lang="ts">
    import type { DockviewPanelApi } from "dockview-core";
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    import ChevronUp from "@lucide/svelte/icons/chevron-up";

    import { getTileBrushModel, TILE_BRUSH_COMPONENTS, type TileBrushComponent } from "../../../mapeditor/plugins/builtins/tile-brush-model";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";
    import HeightPalette from "../palettes/HeightPalette.svelte";
    import OverlayPalette from "../palettes/OverlayPalette.svelte";
    import TileFlagsPalette from "../palettes/TileFlagsPalette.svelte";
    import UnderlayPalette from "../palettes/UnderlayPalette.svelte";
    import { isTilePainterCollapsed, setTilePainterCollapsed } from "../tile-painter-drawer";
    import BrushPreview from "./BrushPreview.svelte";

    let { api }: { api: DockviewPanelApi } = $props();

    const editor = useEditorState();
    const host = editor.host;

    const TABS: Record<TileBrushComponent, { label: string; hint: string }> = {
        underlay: { label: "Underlay", hint: "Base floor colour" },
        overlay: { label: "Overlay", hint: "Paths, water, textured floors" },
        height: { label: "Height", hint: "Raise, lower, smooth or set terrain height" },
        flags: { label: "Flags", hint: "Blocked, bridge, roof and render flags" },
    };

    const brush = $derived(editor.read(() => ({ enabled: { ...getTileBrushModel(host).enabled }, tab: getTileBrushModel(host).tab })));
    const appliedCount = $derived(TILE_BRUSH_COMPONENTS.filter((component) => brush.enabled[component]).length);

    // Only a docked drawer folds; a floating one is an ordinary window.
    let docked = $state(api.location.type === "grid");
    let collapsed = $state(isTilePainterCollapsed());
    $effect(() => {
        const subscription = api.onDidLocationChange(() => {
            docked = api.location.type === "grid";
        });
        return () => subscription.dispose();
    });

    function setCollapsed(next: boolean): void {
        collapsed = next;
        if (docked) setTilePainterCollapsed(api.group, next);
    }

    function selectTab(component: TileBrushComponent): void {
        getTileBrushModel(host).setTab(component);
        if (collapsed) setCollapsed(false);
    }

    function toggle(component: TileBrushComponent, enabled: boolean): void {
        getTileBrushModel(host).setEnabled(component, enabled);
    }
</script>

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-card">
    <div class="flex h-[34px] shrink-0 items-stretch gap-0.5 border-b border-border bg-muted/20 pr-2 pl-1" role="tablist" aria-label="Tile painter">
        {#if docked}
            <button
                type="button"
                class="grid w-7 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={collapsed ? "Show the tile painter" : "Hide the tile painter"}
                aria-expanded={!collapsed}
                title={collapsed ? "Show the tile painter" : "Hide the tile painter"}
                onclick={() => setCollapsed(!collapsed)}
            >
                {#if collapsed}
                    <ChevronUp class="size-4" aria-hidden="true" />
                {:else}
                    <ChevronDown class="size-4" aria-hidden="true" />
                {/if}
            </button>
        {/if}
        {#each TILE_BRUSH_COMPONENTS as component (component)}
            {@const selected = brush.tab === component}
            <div
                class={cn(
                    "flex items-center gap-1.5 border-b-2 px-2.5 text-xs transition-colors",
                    selected ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
            >
                <input
                    type="checkbox"
                    class="size-3.5 cursor-pointer accent-blue-500"
                    checked={brush.enabled[component]}
                    onchange={(event) => toggle(component, event.currentTarget.checked)}
                    aria-label={`Apply ${TABS[component].label.toLowerCase()} to the brush`}
                    title={`Apply ${TABS[component].label.toLowerCase()} to the brush`}
                />
                <button type="button" role="tab" aria-selected={selected} class="h-full cursor-pointer" title={TABS[component].hint} onclick={() => selectTab(component)}>
                    {TABS[component].label}
                </button>
            </div>
        {/each}
        <p class="ml-auto self-center text-[11px] text-muted-foreground">
            {#if appliedCount === 0}
                Nothing ticked: the brush paints nothing
            {:else}
                Brush applies {appliedCount} of 4
            {/if}
        </p>
    </div>

    {#if !collapsed}
        <div class="flex min-h-0 flex-1">
            <BrushPreview />
            <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {#if brush.tab === "underlay"}
                    <UnderlayPalette />
                {:else if brush.tab === "overlay"}
                    <OverlayPalette />
                {:else if brush.tab === "height"}
                    <HeightPalette />
                {:else}
                    <TileFlagsPalette />
                {/if}
            </div>
        </div>
    {/if}
</div>
