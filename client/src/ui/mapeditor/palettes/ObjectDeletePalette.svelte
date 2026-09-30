<script lang="ts">
    import { Label } from "../../components/ui/label";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;
    const hovered = $derived(editor.read(() => host.hoveredObject));
    const deleteHeld = $derived(editor.read(() => host.isObjectDeleteModeActive()));
</script>

<div class="map-editor-panel flex min-h-0 flex-1 flex-col gap-3 p-4">
    <p class="text-xs text-muted-foreground">
        Hover objects for a red wireframe preview. Hold Delete (or Backspace) and move the cursor over objects to remove them. Each deletion is undoable with Ctrl+Z.
    </p>
    {#if deleteHeld}
        <div class="rounded-md border border-red-500/50 bg-red-500/10 px-2 py-1.5 text-xs text-red-100/90">Delete held — hover objects to remove</div>
    {:else}
        <div class="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">Hold Delete to erase hovered objects</div>
    {/if}
    {#if hovered}
        <div class="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs">
            <Label class="text-xs text-muted-foreground">Hovered object</Label>
            <p class="mt-1 font-mono tabular-nums">Loc #{hovered.locTypeId} · plane {hovered.level} · {hovered.kind}</p>
        </div>
    {:else}
        <p class="text-xs text-muted-foreground">Hover a tile with an object to preview it.</p>
    {/if}
</div>
