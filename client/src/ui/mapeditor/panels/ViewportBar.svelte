<script lang="ts">
    import type { DockviewGroupPanel } from "dockview-core";
    import Settings2 from "@lucide/svelte/icons/settings-2";
    import Redo2 from "@lucide/svelte/icons/redo-2";
    import Search from "@lucide/svelte/icons/search";
    import Undo2 from "@lucide/svelte/icons/undo-2";

    import { VIEWPORT_BAR, VIEWPORT_BAR_PREFIX } from "../../../mapeditor/bar-kinds";
    import { getBarModel } from "../../../mapeditor/bar-model";
    import { openCommandPalette } from "../../../mapeditor/command-palette-signal";
    import { executeEditorCommand } from "../../../mapeditor/commands/editor-command-registry";
    import { getViewControl } from "../../../mapeditor/view-controls";
    import { contextMenu } from "../../components/context-menu/context-menu.svelte";
    import { fromExternal } from "../../lib/external.svelte";
    import { cn } from "../../lib/utils";
    import { openCustomizeBar } from "../customize-bar.svelte";
    import { useEditorState } from "../editor-state.svelte";
    import { SCENE_PANEL_ID } from "../workbench-controller.svelte";

    /** The toolbar at the right end of the 3D view's tab row (plane, undo, ... and customize). Shown only on the group that holds the 3D panel. */
    let { group }: { group: DockviewGroupPanel } = $props();

    const editor = useEditorState();
    const host = editor.host;

    const hasScene = fromExternal(
        (listener) => {
            const subscription = group.api.onDidActivePanelChange(listener);
            return () => subscription.dispose();
        },
        () => group.panels.some((panel) => panel.id === SCENE_PANEL_ID),
    );

    const bar = $derived.by(() => {
        editor.snapshot.current;
        return getBarModel(host, VIEWPORT_BAR).visibleIds;
    });
    const plane = $derived(editor.read(() => host.viewPlaneMax));
    const history = $derived(editor.history.current);
    const toggles = $derived(
        editor.read(() => Object.fromEntries(bar.filter((id) => id.startsWith(VIEWPORT_BAR_PREFIX)).map((id) => [id, getViewControl(id.slice(VIEWPORT_BAR_PREFIX.length))?.get(host) === true]))),
    );

    function setPlane(next: number): void {
        host.viewPlaneMax = Math.max(0, Math.min(3, next));
        host.notifyWorkbenchStateChanged();
    }

    const iconButton = "grid size-6 shrink-0 cursor-pointer place-items-center rounded border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40";
</script>

{#if hasScene.current}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="flex h-full items-center gap-1 pr-1.5 text-xs"
        role="toolbar"
        aria-label="Viewport bar"
        oncontextmenu={(event) => contextMenu.open(event, "Viewport bar", [{ id: "customize", label: "Customize this bar…", onSelect: () => openCustomizeBar("viewport") }])}
    >
        {#each bar as id (id)}
            {#if id === "plane"}
                <div class="flex items-center gap-0.5" title="View plane" role="group" aria-label="View plane">
                    <span class="mr-0.5 text-muted-foreground">Plane</span>
                    <button type="button" class={iconButton} aria-label="Decrease view plane" disabled={plane <= 0} onclick={() => setPlane(plane - 1)}>−</button>
                    <span class="w-3 text-center font-mono tabular-nums">{plane}</span>
                    <button type="button" class={iconButton} aria-label="Increase view plane" disabled={plane >= 3} onclick={() => setPlane(plane + 1)}>+</button>
                </div>
            {:else if id === "undo"}
                <button type="button" class={iconButton} aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!history.canUndo} onclick={() => executeEditorCommand("workbench.undo", { host })}>
                    <Undo2 class="size-3.5" aria-hidden="true" />
                </button>
            {:else if id === "redo"}
                <button type="button" class={iconButton} aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!history.canRedo} onclick={() => executeEditorCommand("workbench.redo", { host })}>
                    <Redo2 class="size-3.5" aria-hidden="true" />
                </button>
            {:else if id === "search"}
                <button type="button" class={iconButton} aria-label="Command palette" title="Command palette (Ctrl/Cmd+K)" onclick={() => openCommandPalette()}>
                    <Search class="size-3.5" aria-hidden="true" />
                </button>
            {:else if id.startsWith(VIEWPORT_BAR_PREFIX)}
                {@const control = getViewControl(id.slice(VIEWPORT_BAR_PREFIX.length))}
                {#if control}
                    <button
                        type="button"
                        class={cn("h-6 shrink-0 cursor-pointer rounded border px-1.5", toggles[id] ? "border-primary/50 bg-primary/15 text-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground")}
                        aria-pressed={toggles[id]}
                        title={control.description}
                        onclick={() => control.set(host, !toggles[id])}
                    >
                        {control.label}
                    </button>
                {/if}
            {/if}
        {/each}
        <button type="button" class={iconButton} aria-label="Customize the viewport bar" title="Customize this bar" onclick={() => openCustomizeBar("viewport")}>
            <Settings2 class="size-3.5" aria-hidden="true" />
        </button>
    </div>
{/if}
