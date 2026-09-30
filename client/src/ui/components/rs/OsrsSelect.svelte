<script lang="ts" generics="T extends { value: string; label: string }">
    import "../../../components/rs/select/OsrsSelect.css";

    let {
        options,
        onSelect,
        placeholder = "Search",
    }: {
        options: readonly T[];
        onSelect: (option: T) => void;
        placeholder?: string;
    } = $props();

    let query = $state("");
    let open = $state(false);
    let selected = $state<T | null>(null);
    let highlighted = $state(0);
    let input = $state<HTMLInputElement>();
    let root = $state<HTMLDivElement>();

    const filtered = $derived.by(() => {
        const q = query.trim().toLowerCase();
        return q ? options.filter((option) => option.label.toLowerCase().includes(q)) : options;
    });

    function choose(option: T): void {
        selected = option;
        query = "";
        open = false;
        input?.blur();
        onSelect(option);
    }

    function onKeydown(event: KeyboardEvent): void {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            open = true;
            highlighted = Math.min(filtered.length - 1, highlighted + 1);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            highlighted = Math.max(0, highlighted - 1);
        } else if (event.key === "Enter") {
            const option = filtered[highlighted];
            if (option) choose(option);
        } else if (event.key === "Escape") {
            open = false;
            query = "";
            input?.blur();
        }
    }

    $effect(() => {
        query;
        highlighted = 0;
    });
</script>

<!-- Focus leaves the whole widget: close the menu (options use mousedown so they win the race). -->
<div
    bind:this={root}
    class="osrs-select-container"
    style="position: relative"
    onfocusout={(event) => {
        if (!root?.contains(event.relatedTarget as Node | null)) open = false;
    }}
>
    <div class="osrs-select-control" style="display: flex">
        <div class="osrs-select-value-container" style="display: grid; flex: 1; position: relative">
            {#if !query}
                {#if selected}
                    <div class="osrs-select-single-value" style="grid-area: 1 / 1; pointer-events: none">{selected.label}</div>
                {:else}
                    <div class="osrs-select-placeholder" style="grid-area: 1 / 1; pointer-events: none">{placeholder}</div>
                {/if}
            {/if}
            <div class="osrs-select-input" style="grid-area: 1 / 1">
                <input
                    bind:this={input}
                    bind:value={query}
                    onfocus={() => (open = true)}
                    onkeydown={onKeydown}
                    autocomplete="off"
                    spellcheck="false"
                    style="width: 100%; background: transparent; border: 0; outline: 0; color: inherit; font: inherit; text-align: center"
                />
            </div>
        </div>
    </div>
    {#if open}
        <div
            class="osrs-select-menu"
            style="position: absolute; left: 0; right: 0; bottom: 100%; z-index: 10; background-color: #3e3529; max-height: 300px; overflow-y: auto; margin-bottom: 2px"
        >
            <div class="osrs-select-menu-list">
                {#each filtered as option, index (option.value)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="osrs-select-option"
                        style="padding: 4px 8px; cursor: pointer; text-align: center; {index === highlighted ? 'background-color: #787169' : ''}"
                        onmousedown={(event) => {
                            event.preventDefault();
                            choose(option);
                        }}
                    >
                        {option.label}
                    </div>
                {:else}
                    <div class="osrs-select-no-options-message" style="padding: 4px 8px; text-align: center">No options</div>
                {/each}
            </div>
        </div>
    {/if}
</div>
