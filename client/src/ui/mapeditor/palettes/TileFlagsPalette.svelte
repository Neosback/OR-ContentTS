<script lang="ts">
    import { getTileBrushModel } from "../../../mapeditor/plugins/builtins/tile-brush-model";
    import { FLAG_MEANING } from "../../../mapeditor/view-controls";
    import { getTileFlagsToolModel } from "../../../mapeditor/plugins/builtins/tile-flags-tool-model";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;


    const rows = $derived(
        editor.read(() =>
            getTileFlagsToolModel(host).descriptors.map((descriptor) => ({
                descriptor,
                paint: getTileFlagsToolModel(host).isPaintEnabled(descriptor.flag),
            })),
        ),
    );
    const paintLabels = $derived(rows.filter((row) => row.paint).map((row) => row.descriptor.shortLabel));
    const swatch = (c: readonly number[]): string => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;

    function togglePaint(flag: (typeof rows)[number]["descriptor"]["flag"], on: boolean): void {
        getTileFlagsToolModel(host).setPaintFlag(flag, on);
        // Choosing a flag puts flags into the brush, like picking a swatch does.
        if (on) getTileBrushModel(host).setEnabled("flags", true);
    }
</script>

<div class="map-editor-panel flex min-h-0 flex-1 flex-col">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b border-border bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
        <span>
            Tiles get: <span class="font-medium text-foreground">{paintLabels.length > 0 ? paintLabels.join(", ") : "no flags"}</span>
        </span>
        <span>Hold <kbd class="rounded border border-border px-1 font-mono">Ctrl</kbd> while painting to clear them instead</span>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-1.5" aria-label="Flags in the brush">
            {#each rows as { descriptor, paint } (descriptor.flag)}
                <li
                    class={cn(
                        "flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
                        paint ? "border-primary/60 bg-primary/10" : "border-border/70 hover:bg-muted/40",
                    )}
                >
                    <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <input
                            type="checkbox"
                            class="size-3.5 shrink-0 cursor-pointer accent-blue-500"
                            checked={paint}
                            onchange={(event) => togglePaint(descriptor.flag, event.currentTarget.checked)}
                        />
                        <span class="size-3 shrink-0 rounded-sm border border-border/60" style="background-color: {swatch(descriptor.color)}" aria-hidden="true"></span>
                        <span class="min-w-0">
                            <span class="block truncate text-xs font-medium leading-tight">
                                {descriptor.shortLabel}<span class="font-mono text-[10px] font-normal text-muted-foreground"> · {descriptor.flag}</span>
                            </span>
                            <span class="block truncate text-[10px] leading-tight text-muted-foreground">{FLAG_MEANING[descriptor.shortLabel] ?? descriptor.label}</span>
                        </span>
                    </label>
                </li>
            {/each}
        </ul>
        <p class="mt-2 text-[11px] text-muted-foreground">
            Showing or hiding flag colours on the map is in the Rendering panel. Bridge and Render Z-1 on plane 1 appear on plane 0 in the 3D view; painting them on plane 0 also writes plane 1.
        </p>
    </div>
</div>
