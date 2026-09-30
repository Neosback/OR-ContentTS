<script lang="ts">
    import { underlayAdapter } from "./floor-adapters";
    import { useEditorState } from "../editor-state.svelte";
    import FloorPalette from "./FloorPalette.svelte";

    const editor = useEditorState();
    const adapter = underlayAdapter(editor.host);
</script>

<FloorPalette {adapter} />
