<script lang="ts">
    import type { Component } from "svelte";

    import PanelFrame from "./PanelFrame.svelte";

    let { palette: Palette }: { palette: Component } = $props();
</script>

<PanelFrame>
    <Palette />
</PanelFrame>
