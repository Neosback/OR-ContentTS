<script lang="ts">
    import { getTileBrushModel } from "../../../mapeditor/plugins/builtins/tile-brush-model";
    import { TILE_SHAPE_NAMES } from "../../../mapeditor/tile-shape-paint";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";
    import { brushFloorColours } from "./brush-colours";
    import ShapeThumb from "./ShapeThumb.svelte";

    const editor = useEditorState();
    const host = editor.host;

    const brush = $derived(editor.read(() => ({ shape: getTileBrushModel(host).shape, rotation: getTileBrushModel(host).rotation, on: getTileBrushModel(host).enabled.shape })));
    const colours = $derived(editor.read(() => brushFloorColours(host)));
</script>

<div class="map-editor-panel flex min-h-0 flex-1 flex-col">
    <div class="shrink-0 border-b border-border bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
        Overlay shape: <span class="font-medium text-foreground">{brush.shape} · {TILE_SHAPE_NAMES[brush.shape]}</span>. Painted onto tiles that have an overlay; a full tile (0) has no rotation.
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <div class="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5" role="radiogroup" aria-label="Overlay shape">
            {#each TILE_SHAPE_NAMES as name, index (index)}
                {@const selected = brush.shape === index}
                <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    class={cn(
                        "flex flex-col items-center gap-1 rounded-md border p-1.5 text-[10px] transition-colors",
                        selected ? "border-primary bg-primary/15 text-foreground" : "border-border/70 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        selected && !brush.on && "opacity-70",
                    )}
                    title={`Shape ${index}: ${name}`}
                    onclick={() => getTileBrushModel(host).setShape(index)}
                >
                    <ShapeThumb shape={index} rotation={brush.rotation} underlay={colours.underlay} overlay={colours.overlay} size={44} />
                    <span class="font-mono tabular-nums">{index} · {name}</span>
                </button>
            {/each}
        </div>
    </div>
</div>
