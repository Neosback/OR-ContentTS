<script lang="ts">
    import { OVERLAY_SAME_ID_FLOOD_BRUSH_HUD, OVERLAY_SAME_ID_FLOOD_UI } from "../../../mapeditor/overlay-flood-fill";
    import type { MapEditorBrushType } from "../../../mapeditor/map-editor-kinds";
    import { BUILTIN_BRUSH_TYPE_PLUGINS, getBuiltinEditorToolPlugin } from "../../../mapeditor/plugins/builtins/current-plugin-layout.builtin";
    import { Button } from "../../components/ui/button";
    import { Label } from "../../components/ui/label";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";
    import BrushToolSettings from "./BrushToolSettings.svelte";
    import CollapsibleSection from "./CollapsibleSection.svelte";
    import QuickControls from "./QuickControls.svelte";

    /** "bar" is the docked row under the map; "window" the floating/popout panel. */
    let { variant = "bar" }: { variant?: "bar" | "window" } = $props();

    const editor = useEditorState();
    const host = editor.host;
    const hud = editor.hud;

    const tool = $derived(editor.tool.current);
    const usesBrushControls = $derived(getBuiltinEditorToolPlugin(tool).usesBrushControls !== false);
    const floodActive = $derived(hud.brushTypeActive === OVERLAY_SAME_ID_FLOOD_BRUSH_HUD);
    const shapes = $derived(editor.read(() => BUILTIN_BRUSH_TYPE_PLUGINS.filter((p) => host.isBrushShapePluginEnabled(p.id))));



    const selectClass =
        "h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
</script>

{#snippet brushTypeSelect(className: string)}
    <select
        id="dock-brush-type"
        class={cn(selectClass, className)}
        value={floodActive ? "__flood__" : hud.brushType}
        disabled={!usesBrushControls || floodActive}
        onchange={(event) => {
            const value = event.currentTarget.value;
            if (value !== "__flood__") host.brushType = value as MapEditorBrushType;
        }}
    >
        {#if floodActive}
            <option value="__flood__" title={OVERLAY_SAME_ID_FLOOD_UI.description}>{OVERLAY_SAME_ID_FLOOD_UI.dropdownLabel}</option>
        {:else}
            {#each shapes as shape (shape.id)}
                <option value={shape.id} title={shape.description}>{shape.name}</option>
            {/each}
        {/if}
    </select>
{/snippet}

{#snippet radius(layout: "bar" | "window")}
    <div class={cn("flex items-center gap-2", layout === "window" && "flex-col items-stretch gap-1")}>
        <div class={cn("flex items-center gap-2", layout === "window" && "justify-between")}>
            <span class="shrink-0 whitespace-nowrap text-xs text-muted-foreground">Radius</span>
            <span class="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{hud.brushSize}</span>
        </div>
        <input
            id="dock-brush-radius"
            type="range"
            min="0"
            max="16"
            step="1"
            value={hud.brushSize}
            disabled={!usesBrushControls}
            class={cn("map-editor-panel-slider h-1.5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50", layout === "bar" ? "w-24" : "w-full")}
            oninput={(event) => (host.brushSize = Number(event.currentTarget.value))}
        />
    </div>
{/snippet}

{#if variant === "window"}
    <div class="flex h-full min-h-0 w-full min-w-0 flex-col">
        <CollapsibleSection title="Brushes">
            <div class="space-y-2.5 px-2.5 pb-2.5 pt-0.5">
                <div class="space-y-1">
                    <Label class="text-[10px] uppercase tracking-wide text-muted-foreground">Brush type</Label>
                    {@render brushTypeSelect("w-full max-w-none")}
                </div>
                {@render radius("window")}
            </div>
        </CollapsibleSection>
        <CollapsibleSection title="Settings">
            <div class="flex flex-col gap-1 border-b border-border/70 px-2.5 pb-2.5 pt-0.5">
                <p class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Quick controls</p>
                <QuickControls />
            </div>
            <BrushToolSettings />
        </CollapsibleSection>
    </div>
{:else}
    <div class="flex h-full min-h-0 w-full min-w-0 items-center gap-x-3 gap-y-0 overflow-hidden px-2 py-0.5">
        <label class="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span class="whitespace-nowrap">Brush type</span>
            {@render brushTypeSelect("max-w-[7.5rem] shrink-0")}
        </label>
        {@render radius("bar")}
    </div>
{/if}
