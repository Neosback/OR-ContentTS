<script lang="ts">
    import { getTileBrushModel } from "../../../mapeditor/plugins/builtins/tile-brush-model";
    import { getTileFlagsToolModel } from "../../../mapeditor/plugins/builtins/tile-flags-tool-model";
    import { Badge } from "../../components/ui/badge";
    import { Button } from "../../components/ui/button";
    import { CardContent } from "../../components/ui/card";
    import { Label } from "../../components/ui/label";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;
    const model = $derived(editor.read(() => getTileFlagsToolModel(host)));
    // The model object is stable; re-read its fields whenever the snapshot changes.
    const paintCount = $derived(editor.read(() => getTileFlagsToolModel(host).paintFlags.size));
    const rows = $derived(
        editor.read(() =>
            getTileFlagsToolModel(host).descriptors.map((descriptor) => ({
                descriptor,
                show: getTileFlagsToolModel(host).isShowEnabled(descriptor.flag),
                paint: getTileFlagsToolModel(host).isPaintEnabled(descriptor.flag),
            })),
        ),
    );
    const swatch = (c: readonly number[]): string => `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${c[3]})`;
</script>

<div class="map-editor-panel flex min-h-0 flex-1 flex-col">
    <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
        <span class="min-w-0 truncate" title="Left-click or drag adds the flags set to Paint. Hold Ctrl while painting to clear them.">Left-click or drag adds the flags set to Paint. Hold Ctrl while painting to clear them.</span>
        <Badge variant="outline" class="h-5 shrink-0 border-border px-2 font-mono text-[10px] font-normal">{paintCount} paint</Badge>
    </div>
    <CardContent class="min-h-0 flex-1 overflow-y-auto p-2">
        <div class="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-1.5">
            {#each rows as { descriptor, show, paint } (descriptor.flag)}
                <div class="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 rounded-md border border-border/70 bg-card/40 px-2 py-1">
                    <div class="flex min-w-0 items-center gap-2">
                        <span class="size-3 shrink-0 rounded-sm border border-border/60" style="background-color: {swatch(descriptor.color)}" aria-hidden="true"></span>
                        <Label class="min-w-0 text-xs font-normal leading-snug text-foreground">{descriptor.label}</Label>
                    </div>
                    <Button size="sm" variant={show ? "secondary" : "outline"} class="h-6 w-16 px-1 text-[10px]" title="Show this flag on the map" onclick={() => model.setShowFlag(descriptor.flag, !show)}>
                        Show {show ? "on" : "off"}
                    </Button>
                    <Button size="sm" variant={paint ? "default" : "outline"} class={cn("h-6 w-16 px-1 text-[10px]", paint && "ring-1 ring-primary/35")} title="Paint this flag" onclick={() => { model.setPaintFlag(descriptor.flag, !paint); if (!paint) getTileBrushModel(host).setEnabled("flags", true); }}>
                        Paint {paint ? "on" : "off"}
                    </Button>
                </div>
            {/each}
        </div>
        <p class="mt-2 text-[11px] text-muted-foreground">
            Bridge / Render Z-1 on plane 1 show on ground (plane 0) in the 3D view; painting those flags on plane 0 also writes plane 1 (OSRS storage).
        </p>
    </CardContent>
</div>
