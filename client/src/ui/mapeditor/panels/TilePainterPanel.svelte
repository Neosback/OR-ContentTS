<script lang="ts">
    import type { DockviewPanelApi } from "dockview-core";
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    import ChevronUp from "@lucide/svelte/icons/chevron-up";
    import Ellipsis from "@lucide/svelte/icons/ellipsis";

    import { getTileBrushModel, TILE_BRUSH_COMPONENTS, type TileBrushComponent } from "../../../mapeditor/plugins/builtins/tile-brush-model";
    import { TILE_ROTATION_NAMES, TILE_SHAPE_NAMES } from "../../../mapeditor/tile-shape-paint";
    import { contextMenu } from "../../components/context-menu/context-menu.svelte";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";
    import HeightValuePalette from "../palettes/HeightValuePalette.svelte";
    import OverlayPalette from "../palettes/OverlayPalette.svelte";
    import RotationPalette from "../palettes/RotationPalette.svelte";
    import ShapePalette from "../palettes/ShapePalette.svelte";
    import TileFlagsPalette from "../palettes/TileFlagsPalette.svelte";
    import UnderlayPalette from "../palettes/UnderlayPalette.svelte";
    import {
        isStripPosition,
        isTilePainterCollapsed,
        onTilePainterDrawerChange,
        setTilePainterCollapsed,
        TILE_PAINTER_PANEL_ID,
        tilePainterPosition,
    } from "../tile-painter-drawer";
    import BrushPreview from "./BrushPreview.svelte";

    let { api }: { api: DockviewPanelApi } = $props();

    const editor = useEditorState();
    const host = editor.host;
    const workbench = $derived(editor.layout);

    const TABS: Record<TileBrushComponent, { label: string; hint: string }> = {
        underlay: { label: "Underlay", hint: "Base floor colour" },
        overlay: { label: "Overlay", hint: "Paths, water, textured floors" },
        shape: { label: "Shape", hint: "Which part of the tile the overlay covers" },
        rotation: { label: "Rotation", hint: "Quarter turns of the overlay shape" },
        height: { label: "Height", hint: "A tile height to stamp (raising and smoothing terrain is the Height tool)" },
        flags: { label: "Flags", hint: "Flags to set on the tiles you paint" },
    };

    const brush = $derived(
        editor.read(() => {
            const model = getTileBrushModel(host);
            return { enabled: { ...model.enabled }, tab: model.tab, shape: model.shape, rotation: model.rotation, heightValue: model.heightValue };
        }),
    );
    const appliedCount = $derived(TILE_BRUSH_COMPONENTS.filter((component) => brush.enabled[component]).length);

    /** The current value of a part, shown beside its name so the list reads as the brush's recipe. */
    function value(component: TileBrushComponent): string {
        switch (component) {
            case "shape":
                return `${brush.shape} ${TILE_SHAPE_NAMES[brush.shape]}`;
            case "rotation":
                return TILE_ROTATION_NAMES[brush.rotation];
            case "height":
                return String(brush.heightValue);
            default:
                return "";
        }
    }

    // Where the drawer sits decides its shape: a strip (below or above the 3D view) folds and has the parts list on the
    // left; in a side column, or when narrow, the parts become a row of chips above the palette.
    let floating = $state(api.location.type !== "grid");
    let position = $state(tilePainterPosition());
    let collapsed = $state(isTilePainterCollapsed());
    let width = $state(0);
    $effect(() => {
        const location = api.onDidLocationChange(() => {
            floating = api.location.type !== "grid";
        });
        const drawer = onTilePainterDrawerChange(() => {
            position = tilePainterPosition();
            collapsed = isTilePainterCollapsed();
        });
        return () => {
            location.dispose();
            drawer();
        };
    });
    const foldable = $derived(!floating && isStripPosition(position));
    const compact = $derived(width > 0 && width < 560);

    function setCollapsed(next: boolean): void {
        if (foldable) setTilePainterCollapsed(api.group, next);
    }

    function openMenu(event: MouseEvent): void {
        contextMenu.open(event, "Tile painter", workbench?.menuFor(TILE_PAINTER_PANEL_ID) ?? []);
    }

    function selectTab(component: TileBrushComponent): void {
        getTileBrushModel(host).setTab(component);
    }

    function toggle(component: TileBrushComponent, enabled: boolean): void {
        getTileBrushModel(host).setEnabled(component, enabled);
    }
</script>

{#snippet partRow(component: TileBrushComponent, chip: boolean)}
    {@const selected = brush.tab === component}
    <div
        class={cn(
            "flex items-center gap-1.5 text-xs transition-colors",
            chip ? "rounded-md border px-1.5 py-0.5" : "rounded border-l-2 py-[3px] pr-1 pl-1.5",
            selected
                ? chip
                    ? "border-primary bg-muted/60 font-medium text-foreground"
                    : "border-primary bg-muted/60 font-medium text-foreground"
                : chip
                  ? "border-border/70 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
        )}
    >
        <input
            type="checkbox"
            class="size-3.5 shrink-0 cursor-pointer accent-blue-500"
            checked={brush.enabled[component]}
            onchange={(event) => toggle(component, event.currentTarget.checked)}
            aria-label={`Apply ${TABS[component].label.toLowerCase()} to the brush`}
            title={`Apply ${TABS[component].label.toLowerCase()} to the brush`}
        />
        <button
            type="button"
            role="tab"
            aria-selected={selected}
            class={cn("flex min-w-0 cursor-pointer items-baseline gap-1 text-left", !chip && "flex-1 justify-between")}
            title={TABS[component].hint}
            onclick={() => selectTab(component)}
        >
            <span>{TABS[component].label}</span>
            {#if value(component) && !chip}
                <span class="truncate font-mono text-[10px] text-muted-foreground">{value(component)}</span>
            {/if}
        </button>
    </div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex h-full min-h-0 flex-col overflow-hidden bg-card" bind:clientWidth={width} oncontextmenu={openMenu}>
    <!-- The bar only names the panel; everything else lives inside it. -->
    <div class="flex h-[34px] shrink-0 items-center gap-1 border-b border-border bg-muted/20 pr-1.5 pl-1">
        {#if foldable}
            <button
                type="button"
                class="grid w-7 shrink-0 cursor-pointer place-items-center self-stretch rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
        {:else}
            <span class="w-2 shrink-0"></span>
        {/if}
        <button type="button" class="cursor-pointer text-sm font-medium" onclick={() => collapsed && setCollapsed(false)}>Tile painter</button>
        <p class="ml-auto truncate text-[11px] text-muted-foreground">
            {#if appliedCount === 0}
                Nothing ticked
            {:else}
                Applies {appliedCount} of {TILE_BRUSH_COMPONENTS.length}
            {/if}
        </p>
        <button
            type="button"
            class="grid size-6 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Move or float the tile painter"
            title="Move or float the tile painter (also on right-click)"
            onclick={openMenu}
        >
            <Ellipsis class="size-4" aria-hidden="true" />
        </button>
    </div>

    {#if !(foldable && collapsed)}
        <div class={cn("flex min-h-0 flex-1", compact && "flex-col")}>
            {#if compact}
                <div class="flex shrink-0 items-start gap-2 border-b border-border bg-muted/10 px-2 py-1.5">
                    <div class="w-[72px] shrink-0"><BrushPreview small /></div>
                    <div class="flex flex-wrap gap-1" role="tablist" aria-label="Tile painter parts">
                        {#each TILE_BRUSH_COMPONENTS as component (component)}
                            {@render partRow(component, true)}
                        {/each}
                    </div>
                </div>
            {:else}
                <div class="flex w-[168px] shrink-0 flex-col overflow-y-auto border-r border-border bg-muted/10">
                    <BrushPreview />
                    <div class="flex flex-col px-1.5 pb-1.5" role="tablist" aria-label="Tile painter parts" aria-orientation="vertical">
                        {#each TILE_BRUSH_COMPONENTS as component (component)}
                            {@render partRow(component, false)}
                        {/each}
                    </div>
                </div>
            {/if}
            <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {#if brush.tab === "underlay"}
                    <UnderlayPalette />
                {:else if brush.tab === "overlay"}
                    <OverlayPalette />
                {:else if brush.tab === "shape"}
                    <ShapePalette />
                {:else if brush.tab === "rotation"}
                    <RotationPalette />
                {:else if brush.tab === "height"}
                    <HeightValuePalette />
                {:else}
                    <TileFlagsPalette />
                {/if}
            </div>
        </div>
    {/if}
</div>
