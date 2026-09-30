<script lang="ts">
    import type { Component } from "svelte";

    import { TooltipProvider } from "../../components/ui/tooltip";

    /** Root of every dock panel. Panels mount outside the app tree, so provider contexts (tooltips) are re-established here. */
    let { component: Panel, props = {} }: { component: Component<any>; props?: Record<string, unknown> } = $props();
</script>

<TooltipProvider delayDuration={300}>
    <Panel {...props} />
</TooltipProvider>
