<script lang="ts">
    import { isCopyableObjectKind } from "../../../mapeditor/plugins/builtins/object-copy-placement";
    import { Label } from "../../components/ui/label";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;
    const hovered = $derived(editor.read(() => host.hoveredObject));
    const selected = $derived(editor.read(() => host.selectedObject));
    const copyActive = $derived(editor.read(() => host.isObjectCopyPlacementActive() && !!host.getObjectCopyTemplate()));
</script>

<div class="map-editor-panel flex min-h-0 flex-1 flex-col gap-3 p-4">
    <p class="text-xs text-muted-foreground">
        Hover objects for an orange wireframe preview. Left-click to select (blue wireframe) or click empty space to deselect. Press R to rotate the selected object. Press C to copy it — click the map to place copies; Esc cancels copy mode. Customize wireframe colors in Settings → Gizmo Style → Object selector wireframe.
    </p>
    {#if copyActive}
        <div class="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100/90">
            Copy placement active — click the map to place · <span class="font-medium">Esc</span> to cancel
        </div>
    {/if}
    {#if hovered}
        <div class="rounded-md border border-orange-500/40 bg-orange-500/10 p-2 text-xs">
            <Label class="text-xs text-muted-foreground">Hovered object</Label>
            <p class="mt-1 font-mono tabular-nums">Loc #{hovered.locTypeId} · plane {hovered.level} · {hovered.kind}</p>
        </div>
    {:else}
        <p class="text-xs text-muted-foreground">Hover a tile with an object to preview it.</p>
    {/if}
    {#if selected}
        <div class="rounded-md border bg-muted/30 p-2 text-xs">
            <Label class="text-xs text-muted-foreground">Selected object</Label>
            <p class="mt-1 font-mono tabular-nums">Loc #{selected.locTypeId} · plane {selected.level} · {selected.kind} · rot {selected.rotation & 3}</p>
            {#if isCopyableObjectKind(selected.kind)}
                <p class="mt-1 text-muted-foreground">Press R to rotate · Press C to copy</p>
            {/if}
            <button
                type="button"
                class="mt-2 text-xs text-primary underline-offset-2 hover:underline"
                onclick={() => {
                    host.cancelObjectCopyPlacement();
                    host.clearSelectedObject();
                    host.notifyWorkbenchStateChanged();
                }}
            >
                Clear selection
            </button>
        </div>
    {:else}
        <p class="text-xs text-muted-foreground">No object selected — left-click an object in the map view.</p>
    {/if}
</div>
