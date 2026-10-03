<script lang="ts">
    import { clampTileHeight, getTileBrushModel, TILE_HEIGHT_MAX, TILE_HEIGHT_MIN } from "../../../mapeditor/plugins/builtins/tile-brush-model";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;

    const height = $derived(editor.read(() => getTileBrushModel(host).heightValue));

    const set = (value: number): void => getTileBrushModel(host).setHeight(clampTileHeight(value));
</script>

<div class="map-editor-panel flex min-h-0 flex-1 flex-col">
    <div class="shrink-0 border-b border-border bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
        The height every painted tile gets. This is a value to stamp, like a colour: raising, lowering and smoothing terrain is the
        <span class="font-medium text-foreground">Height</span> tool.
    </div>
    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div class="flex items-center gap-2">
            <label class="text-xs text-muted-foreground" for="tile-brush-height">Height</label>
            <input
                id="tile-brush-height"
                type="number"
                min={TILE_HEIGHT_MIN}
                max={TILE_HEIGHT_MAX}
                step="8"
                value={height}
                class="h-8 w-24 rounded-md border border-input bg-background px-2 font-mono text-xs tabular-nums"
                oninput={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(value)) set(value);
                }}
            />
            <button type="button" class="h-8 rounded-md border border-input px-2 text-xs hover:bg-muted" onclick={() => set(0)}>Reset to 0</button>
        </div>
        <input
            type="range"
            min={TILE_HEIGHT_MIN}
            max={TILE_HEIGHT_MAX}
            step="8"
            value={height}
            aria-label="Tile height"
            class="map-editor-panel-slider h-1.5 w-full cursor-pointer accent-primary"
            oninput={(event) => set(Number(event.currentTarget.value))}
        />
        <div class="flex justify-between font-mono text-[10px] text-muted-foreground tabular-nums">
            <span>{TILE_HEIGHT_MIN} (highest)</span>
            <span>0 (ground)</span>
        </div>
    </div>
</div>
