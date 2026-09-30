<script lang="ts">
    import Braces from "@lucide/svelte/icons/braces";
    import Search from "@lucide/svelte/icons/search";

    import { Button } from "../../components/ui/button";
    import { Input } from "../../components/ui/input";
    import InterfaceSettings from "../InterfaceSettings.svelte";
    import type { InterfaceEditorState } from "../interface-editor-state.svelte";

    let { state }: { state: InterfaceEditorState } = $props();
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

    <div class="min-h-0 flex-1 overflow-y-auto">
        {#if state.entries.length === 0}
            <div class="px-3 py-4 text-xs text-muted-foreground">No interfaces decoded from cache.</div>
        {:else if state.filtered.length === 0}
            <div class="px-3 py-4 text-xs text-muted-foreground">No matches.</div>
        {:else}
            {#each state.filtered as entry (entry.id)}
                <button
                    type="button"
                    onclick={() => state.setSelectedId(entry.id)}
                    class="flex w-full items-center gap-2 border-b px-3 py-1.5 text-left text-xs hover:bg-muted/50"
                    class:bg-muted={state.selectedId === entry.id}
                >
                    <span class="shrink-0 font-mono text-muted-foreground">{entry.id}</span>
                    <span class="truncate">{entry.name}</span>
                </button>
            {/each}
        {/if}
    </div>
    <div class="shrink-0 border-t px-2 py-1 text-center text-[10px] text-muted-foreground">
        Showing {state.filtered.length} of {state.entries.length}
    </div>
</div>
