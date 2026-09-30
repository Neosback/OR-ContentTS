<script lang="ts">
    import { tick } from "svelte";

    import "../../../components/rs/menu/OsrsMenu.css";
    import { MenuTargetType } from "../../../rs/MenuEntry";
    import type { OsrsMenuProps } from "./osrs-menu";

    const BORDER_SIZE = 10;

    let { x, y, entries, tooltip, debugId }: OsrsMenuProps = $props();
    let host = $state<HTMLDivElement>();
    let realX = $state(x);
    let realY = $state(y);

    const visibleEntries = $derived.by(() => {
        if (!tooltip) return entries;
        return entries
            .filter((entry) => entry.option !== "Walk here" && entry.option !== "Examine" && entry.option !== "Cancel")
            .slice(0, 1);
    });

    function targetClass(type: MenuTargetType): string {
        switch (type) {
            case MenuTargetType.NPC:
                return "npc-name";
            case MenuTargetType.LOC:
                return "object-name";
            case MenuTargetType.OBJ:
                return "item-name";
            default:
                return "";
        }
    }

    async function positionMenu(): Promise<void> {
        await tick();
        if (!host) return;

        let { width, height } = host.getBoundingClientRect();
        let nextX: number;
        let nextY: number;
        if (tooltip) {
            nextX = x;
            nextY = y + 20;
        } else {
            width -= BORDER_SIZE * 2;
            height -= BORDER_SIZE * 2;
            nextX = x - width / 2 - BORDER_SIZE;
            nextY = y - BORDER_SIZE;
        }
        const parent = host.parentElement;
        if (parent) {
            const rect = parent.getBoundingClientRect();
            nextX = Math.max(Math.min(nextX, rect.width - width - BORDER_SIZE), -BORDER_SIZE);
            nextY = Math.max(Math.min(nextY, rect.height - height - BORDER_SIZE), -BORDER_SIZE);
        }
        realX = nextX;
        realY = nextY;
    }

    $effect(() => {
        x;
        y;
        tooltip;
        visibleEntries;
        void positionMenu();
    });
</script>

{#if visibleEntries.length > 0}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        bind:this={host}
        class="context-menu-container"
        class:tooltip
        style={`left: ${realX}px; top: ${realY}px;`}
        oncontextmenu={(event) => event.preventDefault()}
        onfocus={(event) => {
            if (tooltip) event.preventDefault();
        }}
    >
        <div class="context-menu">
            {#if !tooltip}
                <div class="title">Choose Option</div>
                <div class="line"></div>
            {/if}
            <div class="options">
                {#each visibleEntries as entry, index (`${entry.option}-${entry.targetId}-${index}`)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="option" onclick={() => entry.onClick?.(entry)}>
                        <span class="option-name">{entry.option}</span>
                        {#if entry.targetType !== MenuTargetType.NONE}
                            {" "}<span class={targetClass(entry.targetType)}>{entry.targetName}</span>
                        {/if}
                        {#if entry.targetLevel > 0}
                            {" "}<span class="npc-level"> (Level-{entry.targetLevel})</span>
                        {/if}
                        {#if debugId && entry.targetId !== -1}
                            <span class="target-id"> (Id-{entry.targetId})</span>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
    </div>
{/if}
