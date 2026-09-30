<script lang="ts">
    import type { Snippet } from "svelte";

    import { mapEditorDockPanelShellClassName } from "../../../mapeditor/map-editor-workbench-chrome";
    import { cn } from "../../lib/utils";

    let { children, shellClass }: { children: Snippet; shellClass?: string } = $props();
</script>

<!-- Lightweight shell for docked palette panels (placement lives on the tab's context menu). -->
<div class={cn(mapEditorDockPanelShellClassName("h-full min-h-0 border-0 shadow-none"), shellClass)}>
    {@render children()}
</div>
