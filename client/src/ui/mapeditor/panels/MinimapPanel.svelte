<script lang="ts">
    import EditorMinimap from "./EditorMinimap.svelte";
    import PanelFrame from "./PanelFrame.svelte";
</script>

<!-- The dock version of the minimap: the same round minimap as the one inside the 3D view. -->
<PanelFrame shellClass="overflow-auto">
    <div class="flex h-full min-h-0 w-full items-start justify-start overflow-auto p-2">
        <EditorMinimap />
    </div>
</PanelFrame>
