<script lang="ts">
    import Copy from "@lucide/svelte/icons/copy";

    import { describeLocType, propertiesToText } from "../../../mapeditor/object-properties";
    import FloatingWindow from "../../components/FloatingWindow.svelte";
    import { notifyMessage } from "../../lib/notify";
    import { useEditorState } from "../editor-state.svelte";
    import { closeObjectProperties, objectProperties } from "../object-properties-window.svelte";

    const editor = useEditorState();
    const host = editor.host;

    const selected = $derived(editor.read(() => host.selectedObject));
    const locType = $derived.by(() => {
        if (!selected) return undefined;
        try {
            return host.locTypeLoader.load(selected.locTypeId);
        } catch {
            return undefined;
        }
    });
    const sections = $derived(locType ? describeLocType(locType) : []);
    let filter = $state("");
    const shown = $derived.by(() => {
        const needle = filter.trim().toLowerCase();
        if (!needle) return sections;
        return sections
            .map((section) => ({ ...section, rows: section.rows.filter((row) => `${section.title} ${row.label} ${row.value}`.toLowerCase().includes(needle)) }))
            .filter((section) => section.rows.length > 0);
    });

    async function copyAll(): Promise<void> {
        try {
            await navigator.clipboard.writeText(propertiesToText(sections));
            notifyMessage("Copied the object's properties.");
        } catch {
            notifyMessage("Could not copy to the clipboard.");
        }
    }
</script>

{#if objectProperties.open}
    <FloatingWindow title="Object properties" subtitle={locType ? `${locType.name && locType.name !== "null" ? locType.name : "unnamed"} · #${locType.id}` : undefined} onclose={closeObjectProperties}>
        {#snippet actions()}
            <button type="button" class="grid size-6 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" aria-label="Copy all properties" title="Copy all properties" disabled={!locType} onclick={() => void copyAll()}>
                <Copy class="size-3.5" aria-hidden="true" />
            </button>
        {/snippet}
        {#if locType}
            <div class="shrink-0 border-b border-border px-3 py-1.5">
                <input type="search" bind:value={filter} placeholder="Filter properties" aria-label="Filter properties" class="h-7 w-full rounded-md border border-input bg-background px-2 text-xs" />
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-xs">
                {#each shown as section (section.title)}
                    <section class="mb-3">
                        <h3 class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</h3>
                        <dl class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-0.5">
                            {#each section.rows as row (row.label)}
                                <dt class="truncate text-muted-foreground" title={row.label}>{row.label}</dt>
                                <dd class="min-w-0 break-words font-mono tabular-nums">{row.value}</dd>
                            {/each}
                        </dl>
                    </section>
                {:else}
                    <p class="text-muted-foreground">Nothing matches "{filter}".</p>
                {/each}
                <p class="mt-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">These come from the cache and are read-only. Placing a different object changes the map; the object type itself is not edited here.</p>
            </div>
        {:else}
            <p class="p-4 text-xs text-muted-foreground">Select an object in the 3D view and its properties appear here. The window follows your selection.</p>
        {/if}
    </FloatingWindow>
{/if}
