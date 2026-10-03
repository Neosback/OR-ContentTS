<script lang="ts">
    import Braces from "@lucide/svelte/icons/braces";
    import Search from "@lucide/svelte/icons/search";

    import { Button } from "../../components/ui/button";
    import { Input } from "../../components/ui/input";
    import VirtualList from "../../components/VirtualList.svelte";
    import InterfaceSettings from "../InterfaceSettings.svelte";
    import type { InterfaceEditorState } from "../interface-editor-state.svelte";

    let { state }: { state: InterfaceEditorState } = $props();

    function entryTitle(entry: (typeof state.entries)[number]): string {
        const parts = [`Interface ${entry.id}`];
        if (entry.metadata.projectSymbol) parts.push(entry.metadata.projectSymbol);
        if (entry.metadata.provenance) {
            const source = entry.metadata.provenance;
            parts.push(`${source.sourcePath}${source.line ? `:${source.line}` : ""}`);
        }
        if (entry.metadata.cacheName && entry.metadata.cacheName !== entry.name) {
            parts.push(`Cache name: ${entry.metadata.cacheName}`);
        }
        if (entry.metadata.diagnostics.length) parts.push(...entry.metadata.diagnostics);
        return parts.join("\n");
    }
</script>

<div class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
    <div class="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <span class="text-sm font-semibold">Interfaces</span>
        <div class="flex shrink-0 items-center gap-1">
            <Button
                type="button"
                size="icon"
                class="size-6"
                variant="outline"
                disabled={state.selectedId == null}
                title={state.selectedId == null ? "Select an interface first" : "JSON for selected interface from local decode"}
                onclick={state.runInterfaceViewerExport}
            >
                <Braces class="size-3.5" />
            </Button>
            <InterfaceSettings {state} />
        </div>
    </div>

    <div class="shrink-0 border-b px-2 py-2">
        <div class="flex items-center gap-2">
            <div class="relative min-w-0 flex-1">
                <Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    class="h-7 pl-7 text-xs"
                    placeholder="Search interfaces…"
                    value={state.search}
                    oninput={(event) => (state.search = event.currentTarget.value)}
                />
            </div>
            <select
                class="h-7 w-[112px] rounded-md border border-input bg-background px-2 text-xs"
                value={state.legacyFilter}
                onchange={(event) => (state.legacyFilter = event.currentTarget.value as typeof state.legacyFilter)}
            >
                <option value="all">All</option>
                <option value="new">New</option>
                <option value="legacy">Legacy</option>
            </select>
        </div>
    </div>

    <VirtualList
        items={state.filtered}
        rowHeight={32}
        overscan={8}
        class="min-h-0 flex-1"
        label="Interfaces"
    >
        {#snippet row(entry)}
            <button
                type="button"
                role="option"
                aria-selected={state.selectedId === entry.id}
                onclick={() => state.setSelectedId(entry.id)}
                class="flex h-full w-full items-center gap-2 border-b px-3 text-left text-xs hover:bg-muted/50"
                class:bg-muted={state.selectedId === entry.id}
                title={entryTitle(entry)}
            >
                <span class="shrink-0 font-mono text-muted-foreground">{entry.id}</span>
                <span class="min-w-0 flex-1 truncate">{entry.name}</span>
                {#if entry.metadata.diagnostics.length}
                    <span class="shrink-0 text-[10px] font-semibold text-amber-500" aria-label="Metadata warning">!</span>
                {/if}
            </button>
        {/snippet}
        {#snippet empty()}
            <div class="px-3 py-4 text-xs text-muted-foreground">
                {state.entries.length === 0 ? "No interfaces decoded from cache." : "No matches."}
            </div>
        {/snippet}
    </VirtualList>
    <div class="shrink-0 border-t px-2 py-1 text-center text-[10px] text-muted-foreground">
        Showing {state.filtered.length} of {state.entries.length}
    </div>
</div>
