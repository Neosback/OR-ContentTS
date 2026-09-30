<script lang="ts">
    import { tick } from "svelte";

    import { clickOutside, escapeClose, portal } from "../../lib/actions";
    import { clampMenuPosition, contextMenu } from "./context-menu.svelte";

    let menuEl = $state<HTMLDivElement>();
    let position = $state({ x: 0, y: 0 });

    const request = $derived(contextMenu.request);

    $effect(() => {
        const current = request;
        if (!current) return;
        position = { x: current.x, y: current.y };
        void tick().then(() => {
            if (!menuEl) return;
            const { width, height } = menuEl.getBoundingClientRect();
            if (width > 0 && height > 0) position = clampMenuPosition({ x: current.x, y: current.y }, { width, height });
        });
    });
</script>

{#if request}
    <div
        bind:this={menuEl}
        use:portal
        use:clickOutside={() => contextMenu.close()}
        use:escapeClose={() => contextMenu.close()}
        role="menu"
        tabindex="-1"
        oncontextmenu={(event: MouseEvent) => event.preventDefault()}
        class="fixed z-[300] min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        style="left: {position.x}px; top: {position.y}px"
    >
        {#if request.title}
            <div class="px-2 py-1.5 text-sm font-semibold">{request.title}</div>
        {/if}
        {#each request.items as item (item.id)}
            {@const Icon = item.icon}
            <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                class="flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
                onclick={() => {
                    contextMenu.close();
                    item.onSelect();
                }}
            >
                {#if Icon}<Icon aria-hidden="true" />{/if}
                {item.label}
            </button>
        {/each}
    </div>
{/if}
