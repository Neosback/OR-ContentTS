<script lang="ts">
    import { getQuickControlsModel } from "../../../mapeditor/quick-controls-model";
    import { getViewControl, type ViewControl } from "../../../mapeditor/view-controls";
    import { Button } from "../../components/ui/button";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;

    const items = $derived(
        editor.read(() =>
            getQuickControlsModel(host)
                .pinned.map((id) => getViewControl(id))
                .filter((control): control is ViewControl => control !== undefined)
                .map((control) => ({ control, on: control.get(host) })),
        ),
    );
</script>

<div class="flex flex-wrap gap-1">
    {#each items as { control, on } (control.id)}
        <Button variant={on ? "secondary" : "ghost"} size="sm" class="h-7 px-2 text-xs" title={control.description} aria-pressed={on} onclick={() => control.set(host, !on)}>
            {control.label}
        </Button>
    {:else}
        <span class="text-xs text-muted-foreground">Nothing pinned. Pin controls in the Rendering panel.</span>
    {/each}
    <Button variant="outline" size="sm" class="h-7 px-2 text-xs" onclick={() => editor.layout?.openPanel("editor-rendering")}>Rendering…</Button>
</div>
