<script lang="ts">
    import { getTileBrushModel } from "../../../mapeditor/plugins/builtins/tile-brush-model";
    import { TILE_ROTATION_NAMES, TILE_SHAPE_NAMES } from "../../../mapeditor/tile-shape-paint";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";
    import { brushFloorColours } from "./brush-colours";
    import ShapeThumb from "./ShapeThumb.svelte";

    const editor = useEditorState();
    const host = editor.host;

    const brush = $derived(editor.read(() => ({ shape: getTileBrushModel(host).shape, rotation: getTileBrushModel(host).rotation, shapeOn: getTileBrushModel(host).enabled.shape })));
    const colours = $derived(editor.read(() => brushFloorColours(host)));
    // The preview uses the shape being painted; with Shape unticked tiles keep their own shape, shown here as the chosen one.
    const previewShape = $derived(brush.shape);
</script>

<div class="map-editor-panel flex min-h-0 flex-1 flex-col">
    <div class="shrink-0 border-b border-border bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
        Rotation: <span class="font-medium text-foreground">{TILE_ROTATION_NAMES[brush.rotation]}</span>.
        {#if previewShape === 0}
            A full tile ({TILE_SHAPE_NAMES[0]}) has no rotation: pick another shape to see the turns.
        {:else}
            Turns the {TILE_SHAPE_NAMES[previewShape]} shape on tiles that have an overlay.
        {/if}
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <div class="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1.5" role="radiogroup" aria-label="Overlay rotation">
            {#each TILE_ROTATION_NAMES as name, index (index)}
                {@const selected = brush.rotation === index}
                <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    class={cn(
                        "flex flex-col items-center gap-1 rounded-md border p-2 text-[11px] transition-colors",
                        selected ? "border-primary bg-primary/15 text-foreground" : "border-border/70 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                    onclick={() => getTileBrushModel(host).setRotation(index)}
                >
                    <ShapeThumb shape={previewShape} rotation={index} underlay={colours.underlay} overlay={colours.overlay} size={52} />
                    <span>{name}</span>
                </button>
            {/each}
        </div>
    </div>
</div>
