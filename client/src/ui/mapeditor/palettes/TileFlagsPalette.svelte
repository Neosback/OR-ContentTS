<script lang="ts">
    import { getTileFlagsToolModel } from "../../../mapeditor/plugins/builtins/tile-flags-tool-model";
    import { Badge } from "../../components/ui/badge";
    import { Button } from "../../components/ui/button";
    import { CardContent, CardHeader, CardTitle } from "../../components/ui/card";
    import { Label } from "../../components/ui/label";
    import { Separator } from "../../components/ui/separator";
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
    <CardHeader class="space-y-1.5 border-b border-border bg-muted/20 px-4 py-3">
        <div class="flex items-center justify-between gap-2">
            <CardTitle class="text-sm font-semibold tracking-tight text-foreground">Tile flags</CardTitle>
            <Badge variant="outline" class="h-5 border-border px-2 font-mono text-[10px] font-normal">{paintCount} paint</Badge>
        </div>
        <div class="rounded-md border border-muted bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            Left-click or drag to add selected flags. Hold Ctrl while painting to clear them.
        </div>
    </CardHeader>
    <Separator />
    <CardContent class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        <div class="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Flag</span>
            <span class="text-center">Show</span>
            <span class="text-center">Paint</span>
        </div>
        {#each rows as { descriptor, show, paint } (descriptor.flag)}
            <div class="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 rounded-md border border-border/70 bg-card/40 px-2 py-1.5">
                <div class="flex min-w-0 items-center gap-2">
                    <span class="size-3 shrink-0 rounded-sm border border-border/60" style="background-color: {swatch(descriptor.color)}" aria-hidden="true"></span>
                    <Label class="min-w-0 text-xs font-normal leading-snug text-foreground">{descriptor.label}</Label>
                </div>
                <Button size="sm" variant={show ? "secondary" : "outline"} class="mx-auto h-7 w-14 px-1 text-[10px]" onclick={() => model.setShowFlag(descriptor.flag, !show)}>
                    {show ? "On" : "Off"}
                </Button>
                <Button size="sm" variant={paint ? "default" : "outline"} class={cn("mx-auto h-7 w-14 px-1 text-[10px]", paint && "ring-1 ring-primary/35")} onclick={() => model.setPaintFlag(descriptor.flag, !paint)}>
                    {paint ? "On" : "Off"}
                </Button>
            </div>
        {/each}
        <div class="rounded-md border border-border/80 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
            Show overlays stay visible while this tool is active. Paint adds selected bits; Ctrl+paint clears them. Bridge / Render Z-1 on plane 1 show on ground (plane 0) in the 3D view; painting those flags on plane 0 also writes plane 1 (OSRS storage).
        </div>
    </CardContent>
</div>
