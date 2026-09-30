<script lang="ts">
    import { overlayAdapter } from "./floor-adapters";
    import { useEditorState } from "../editor-state.svelte";
    import FloorPalette from "./FloorPalette.svelte";

    const editor = useEditorState();
    const adapter = overlayAdapter(editor.host);
</script>

<FloorPalette {adapter} />
