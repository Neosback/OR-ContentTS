<script lang="ts">
    import Eye from "@lucide/svelte/icons/eye";
    import Sparkles from "@lucide/svelte/icons/sparkles";

    import { componentTypeName } from "../../../interface/interface-editor-tree-utils";
    import type { TreeRow } from "../../../interface/interface-editor-workbench-model";
    import { Button } from "../../components/ui/button";
    import { cn } from "../../lib/utils";
    import type { InterfaceEditorState } from "../interface-editor-state.svelte";

    let { state }: { state: InterfaceEditorState } = $props();

    function rowTitle(row: TreeRow): string {
        const parts = [`Component ${row.id} · ${componentTypeName(row.type)}`];
        if (row.metadata?.projectSymbol) parts.push(row.metadata.projectSymbol);
        if (row.metadata?.provenance) {
            const source = row.metadata.provenance;
            parts.push(`${source.sourcePath}${source.line ? `:${source.line}` : ""}`);
        }
        if (row.metadata?.diagnostics.length) parts.push(...row.metadata.diagnostics);
        return parts.join("\n");
    }
</script>

<div class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
    <div class="shrink-0 border-b px-3 py-2">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm font-semibold">Components</span>
            <div class="flex shrink-0 flex-wrap items-center justify-end gap-1">
                <Button
                    type="button"
                    size="sm"
                    variant={state.showGeneratedTreeRows ? "default" : "outline"}
                    class="h-7 gap-1 px-2 text-[11px]"
                    title="Show widgets created at runtime (CS2)"
                    disabled={!state.isInterfaceLoaded || !state.interfaceData}
                    onclick={() => state.setShowGeneratedTreeRows((value) => !value)}
                >
                    <Sparkles class="size-3.5" />
                    Generated
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    class="h-7 gap-1 px-2 text-[11px]"
                    title="Set hide=false on every widget"
                    disabled={!state.isInterfaceLoaded || !state.interfaceData}
                    onclick={state.unhideAllComponents}
                >
                    <Eye class="size-3.5" />
                    Unhide all
                </Button>
            </div>
        </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
        {#if state.selectedId == null}
            <div class="px-3 py-4 text-xs text-muted-foreground">Select an interface first.</div>
        {:else if !state.isInterfaceLoaded}
            <div class="px-3 py-4 text-xs text-muted-foreground">Loading component tree…</div>
        {:else if state.componentTreeRows.length === 0}
            <div class="px-3 py-4 text-xs text-muted-foreground">No component nodes found.</div>
        {:else if state.componentTreeRowsForList.length === 0}
            <div class="px-3 py-4 text-xs text-muted-foreground">No components match the current filter. Turn on Generated to include runtime-created widgets.</div>
        {:else}
            {#each state.componentTreeRowsForList as row (row.nodeKey)}
                <button
                    type="button"
                    onclick={() => (state.selectedComponentNodeKey = row.nodeKey)}
                    oncontextmenu={(event) => state.handleComponentRightClick(event, row.nodeKey)}
                    class={cn(
                        "flex w-full items-center gap-2 border-b px-3 py-1.5 text-left text-xs hover:bg-muted/50",
                        state.selectedComponentNodeKey === row.nodeKey && "bg-cyan-500/10",
                    )}
                    style:padding-left="{12 + row.depth * 14}px"
                    title={rowTitle(row)}
                >
                    <span class="shrink-0 font-mono text-muted-foreground">{row.id}</span>
                    <span class="min-w-0 flex-1 truncate">
                        {row.metadata?.displayName ?? componentTypeName(row.type)}{row.dynamicCreated ? " *" : ""}
                    </span>
                    {#if row.metadata?.displayName}
                        <span class="shrink-0 text-[10px] text-muted-foreground">{componentTypeName(row.type)}</span>
                    {/if}
                    {#if row.metadata?.diagnostics.length}
                        <span class="shrink-0 text-[10px] font-semibold text-amber-500" aria-label="Metadata warning">!</span>
                    {/if}
                </button>
            {/each}
        {/if}
    </div>
</div>
