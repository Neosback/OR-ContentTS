<script lang="ts">
    import type { EditModeSearchKind } from "../../game/plugins/editmode/types";
    import DefinitionFields from "./DefinitionFields.svelte";
    import { editModePlugin, editModeState } from "./editorState";

    const KINDS: { kind: EditModeSearchKind; label: string; noun: string }[] = [
        { kind: "npc", label: "NPCs", noun: "NPC" },
        { kind: "loc", label: "Objects", noun: "object" },
        { kind: "item", label: "Items", noun: "item" },
    ];

    let inspected = $state<{ kind: EditModeSearchKind; id: number }>();
    let highlighted = $state(0);

    const search = $derived($editModeState?.search);
    const config = $derived($editModeState?.config);
    const selectedId = $derived(search?.kind === "npc" ? config?.npcId : config?.locId);
    const noun = $derived(KINDS.find((entry) => entry.kind === search?.kind)?.noun ?? "entry");
    const definition = $derived(
        inspected ? $editModePlugin?.describeDefinition(inspected.kind, inspected.id) : undefined,
    );

    function setKind(kind: EditModeSearchKind): void {
        const plugin = $editModePlugin;
        if (!plugin) return;
        if (kind !== "item") plugin.setConfig({ placeKind: kind });
        plugin.searchCache(plugin.getState().search.query, kind);
        highlighted = 0;
    }

    function query(text: string): void {
        const plugin = $editModePlugin;
        plugin?.searchCache(text, plugin.getState().search.kind);
        highlighted = 0;
    }

    /** Objects and NPCs arm the place tool; items can only be inspected. */
    function pick(id: number): void {
        const plugin = $editModePlugin;
        if (!plugin || !search) return;
        if (search.kind === "item") {
            inspected = { kind: "item", id };
            return;
        }
        plugin.setConfig({ placeKind: search.kind });
        plugin.useSearchResult(id);
        plugin.setConfig({ tool: "place" });
    }

    function onKeydown(event: KeyboardEvent): void {
        const results = search?.results ?? [];
        if (results.length === 0) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            highlighted = Math.min(results.length - 1, highlighted + 1);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            highlighted = Math.max(0, highlighted - 1);
        } else if (event.key === "Enter") {
            event.preventDefault();
            pick(results[Math.min(highlighted, results.length - 1)].id);
        }
    }
</script>

<div class="search">
    {#if search && config}
        <div class="kinds" role="tablist" aria-label="Search in">
            {#each KINDS as entry (entry.kind)}
                <button
                    type="button"
                    role="tab"
                    aria-selected={search.kind === entry.kind}
                    class:active={search.kind === entry.kind}
                    onclick={() => setKind(entry.kind)}
                >
                    {entry.label}
                </button>
            {/each}
        </div>

        <input
            class="studio-input"
            type="search"
            placeholder={`Search ${noun}s by name or ID`}
            aria-label={`Search ${noun}s by name or ID`}
            value={search.query}
            oninput={(event) => query(event.currentTarget.value)}
            onkeydown={onKeydown}
        />

        <ul class="results" role="listbox" aria-label="Results">
            {#if search.loading}
                <li class="studio-empty">Indexing the cache…</li>
            {:else if search.results.length === 0}
                <li class="studio-empty">
                    {search.query.trim() ? `No matching ${noun}s.` : `Type an ${noun} name or cache ID.`}
                </li>
            {:else}
                {#each search.results as result, index (result.id)}
                    <li
                        class="result"
                        class:highlighted={index === highlighted}
                        class:selected={search.kind !== "item" && result.id === selectedId}
                        role="option"
                        aria-selected={search.kind !== "item" && result.id === selectedId}
                    >
                        <button type="button" class="pick" onclick={() => pick(result.id)}>
                            <span class="id">{result.id}</span>
                            <span class="name">{result.name}</span>
                        </button>
                        <button
                            type="button"
                            class="inspect"
                            title={`Show ${noun} ${result.id} definition`}
                            aria-label={`Show ${noun} ${result.id} definition`}
                            onclick={() => (inspected = { kind: search.kind, id: result.id })}
                        >
                            i
                        </button>
                    </li>
                {/each}
            {/if}
        </ul>

        {#if inspected && definition}
            <section class="definition">
                <header>
                    <h2 class="studio-section-title">
                        {inspected.kind === "npc" ? "NPC" : inspected.kind === "loc" ? "Object" : "Item"}
                        {inspected.id} · {definition.name}
                    </h2>
                    <button type="button" class="studio-button" onclick={() => (inspected = undefined)}>Close</button>
                </header>
                <DefinitionFields {definition} />
            </section>
        {/if}
    {:else}
        <p class="studio-empty">Waiting for the map editor to load…</p>
    {/if}
</div>

<style>
    .search {
        display: flex;
        flex-direction: column;
        gap: 8px;
        height: 100%;
        box-sizing: border-box;
        padding: 12px;
    }

    .kinds {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        border: 1px solid var(--studio-border);
        border-radius: var(--studio-radius);
        overflow: hidden;
        flex: none;
    }

    .kinds button {
        padding: 5px 0;
        border: 0;
        border-left: 1px solid var(--studio-border);
        background: var(--studio-surface);
        color: var(--studio-text);
        font: inherit;
        cursor: pointer;
    }

    .kinds button:first-child {
        border-left: 0;
    }

    .kinds button.active {
        background: var(--studio-accent);
        color: var(--studio-accent-text);
        font-weight: 600;
    }

    .kinds button:focus-visible {
        outline: 2px solid var(--studio-focus);
        outline-offset: -2px;
    }

    .results {
        flex: 1 1 auto;
        min-height: 80px;
        margin: 0;
        padding: 0;
        overflow-y: auto;
        list-style: none;
    }

    .result {
        display: flex;
        align-items: stretch;
        border-radius: 4px;
    }

    .result.highlighted {
        background: var(--studio-surface-2);
    }

    .result.selected {
        box-shadow: inset 3px 0 0 var(--studio-accent);
    }

    .pick {
        display: flex;
        flex: 1 1 auto;
        gap: 8px;
        min-width: 0;
        padding: 5px 8px;
        border: 0;
        background: transparent;
        color: var(--studio-text);
        font: inherit;
        text-align: left;
        cursor: pointer;
    }

    .pick:hover {
        background: var(--studio-surface-2);
    }

    .id {
        flex: none;
        min-width: 44px;
        color: var(--studio-muted);
        font-variant-numeric: tabular-nums;
    }

    .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .inspect {
        flex: none;
        width: 28px;
        border: 0;
        background: transparent;
        color: var(--studio-muted);
        font: italic 600 12px/1 Georgia, serif;
        cursor: pointer;
    }

    .inspect:hover {
        color: var(--studio-text);
    }

    .pick:focus-visible,
    .inspect:focus-visible {
        outline: 2px solid var(--studio-focus);
        outline-offset: -2px;
    }

    .definition {
        flex: none;
        max-height: 45%;
        overflow-y: auto;
        padding-top: 8px;
        border-top: 1px solid var(--studio-border);
    }

    .definition header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .definition h2 {
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
