<script lang="ts">
    import type { InterfaceEditorState } from "../interface-editor-state.svelte";
    import Cs2ManualRunner from "./Cs2ManualRunner.svelte";
    import Cs1Simulator from "./Cs1Simulator.svelte";

    let { state }: { state: InterfaceEditorState } = $props();
</script>

<div class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
    <div class="shrink-0 border-b px-3 py-2 text-sm font-semibold">Client script</div>
    <div class="min-h-0 flex-1 overflow-y-auto">
        {#if state.selectedId == null}
            <div class="px-3 py-4 text-xs text-muted-foreground">Select an interface first.</div>
        {:else if !state.isInterfaceLoaded}
            <div class="px-3 py-4 text-xs text-muted-foreground">Loading…</div>
        {:else if state.rootWidgetV3 === true}
            <Cs2ManualRunner {state} />
        {:else if state.rootWidgetV3 === false}
            <Cs1Simulator {state} />
        {:else}
            <div class="px-3 py-2 text-xs text-muted-foreground">
                Could not determine legacy vs IF3 for this interface. You can still run CS2 manually below.
            </div>
            <Cs2ManualRunner {state} />
        {/if}
    </div>
</div>
