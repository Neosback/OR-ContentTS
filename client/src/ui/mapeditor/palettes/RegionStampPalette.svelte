<script lang="ts">
    import { REGION_STAMP_COPY_OPTION_ROWS } from "../../../mapeditor/plugins/builtins/region-stamp-copy-options";
    import { boundsHeight, boundsWidth } from "../../../mapeditor/plugins/builtins/region-stamp-types";
    import { Label } from "../../components/ui/label";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;

    const bounds = $derived(editor.read(() => host.getRegionStampSelectBounds()));
    const draft = $derived(editor.read(() => host.getRegionStampDraftBounds()));
    const pasteActive = $derived(editor.read(() => host.isRegionStampPlacementActive()));
    const rotation = $derived(editor.read(() => host.getRegionStampRotation()));
    const stamp = $derived(editor.read(() => host.getRegionStampClipboard()));

    function formatBounds(b: { minWorldX: number; minWorldY: number; maxWorldX: number; maxWorldY: number }): string {
        return `${boundsWidth(b)}×${boundsHeight(b)} tiles (${b.minWorldX},${b.minWorldY})–(${b.maxWorldX},${b.maxWorldY})`;
    }
</script>

<div class="map-editor-panel flex min-h-0 flex-1 flex-col gap-3 p-4">
    <p class="text-xs text-muted-foreground">
        Drag to select a region, then press C to choose what to copy. Paste preview renders real terrain and objects — use R to rotate before clicking to place.
    </p>
    {#if pasteActive && stamp}
        <div class="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100/90">
            Paste mode — left-drag pan · click place · R rotate ({rotation & 3}) · Esc cancel
        </div>
    {/if}
    {#if draft}
        <div class="rounded-md border border-cyan-500/40 bg-cyan-500/10 p-2 text-xs">
            <Label class="text-xs text-muted-foreground">Selecting</Label>
            <p class="mt-1 font-mono tabular-nums">{formatBounds(draft)}</p>
        </div>
    {:else if bounds}
        <div class="rounded-md border border-cyan-500/40 bg-cyan-500/10 p-2 text-xs">
            <Label class="text-xs text-muted-foreground">Selected region</Label>
            <p class="mt-1 font-mono tabular-nums">{formatBounds(bounds)}</p>
            <p class="mt-1 text-muted-foreground">C copy · Delete clear region</p>
        </div>
    {:else}
        <p class="text-xs text-muted-foreground">Drag on the map to select tiles.</p>
    {/if}
    {#if stamp && !pasteActive}
        <div class="rounded-md border bg-muted/30 p-2 text-xs">
            <Label class="text-xs text-muted-foreground">Clipboard</Label>
            <p class="mt-1 font-mono tabular-nums">
                {stamp.width}×{stamp.height} · {new Set(stamp.tiles.map((tile) => tile.level)).size} levels · {stamp.objects.length} objects
            </p>
            <p class="mt-1 text-muted-foreground">
                Includes: {REGION_STAMP_COPY_OPTION_ROWS.filter((row) => (stamp.copyOptions ?? {})[row.key]).map((row) => row.label).join(", ") || "nothing"}
            </p>
            <p class="mt-1 text-muted-foreground">Press C again to enter paste mode</p>
        </div>
    {/if}
</div>
