<script lang="ts">
    import { onMount } from "svelte";

    import { STUDIO_HOME_PATH } from "../../config/studioMode";
    import { setStudioPanelOpener } from "../bridge/studioPanels";
    import { createStudioDock, type StudioDock } from "../workspace/dock";
    import {
        buildDefaultMapEditorLayout,
        MAP_EDITOR_LAYOUT_KEY,
        mapEditorPanels,
        openSidePanel,
        sidePanels,
    } from "./layout";

    let host: HTMLDivElement;
    let menuButton: HTMLButtonElement;
    let dock = $state<StudioDock>();
    let openPanels = $state<string[]>([]);

    function refreshOpenPanels(): void {
        openPanels = dock ? mapEditorPanels.filter((panel) => dock!.isOpen(panel.id)).map((panel) => panel.id) : [];
    }

    function togglePanel(id: string): void {
        if (!dock) return;
        const panel = dock.api.getPanel(id);
        if (panel) panel.api.close();
        else openSidePanel(dock, id);
    }

    /** Anchors the Panels popover under its button (it renders in the top layer). */
    function positionMenu(event: Event): void {
        if ((event as ToggleEvent).newState !== "open") return;
        const menu = event.currentTarget as HTMLElement;
        const anchor = menuButton.getBoundingClientRect();
        menu.style.top = `${anchor.bottom + 4}px`;
        menu.style.right = `${Math.max(8, window.innerWidth - anchor.right)}px`;
    }

    function resetLayout(): void {
        // The scene hosts the whole client and cannot be rebuilt in place.
        dock?.forgetLayout();
        window.location.reload();
    }

    onMount(() => {
        dock = createStudioDock(host, {
            panels: mapEditorPanels,
            storageKey: MAP_EDITOR_LAYOUT_KEY,
            defaultLayout: buildDefaultMapEditorLayout,
        });
        const openedDock = dock;
        refreshOpenPanels();
        const added = dock.api.onDidAddPanel(refreshOpenPanels);
        const removed = dock.api.onDidRemovePanel(refreshOpenPanels);
        // The editor toolbar's search and overlay buttons open the docked panels.
        setStudioPanelOpener((id) => openSidePanel(openedDock, id));
        return () => {
            setStudioPanelOpener(undefined);
            added.dispose();
            removed.dispose();
            dock?.dispose();
        };
    });
</script>

<div class="workspace">
    <header class="bar">
        <nav class="crumbs" aria-label="Breadcrumb">
            <a href={STUDIO_HOME_PATH}>OpenRune Content Studio</a>
            <span aria-hidden="true">/</span>
            <h1>Map Editor</h1>
        </nav>
        <button type="button" class="menu-button" bind:this={menuButton} popovertarget="studio-panels-menu">
            Panels
        </button>
        <div id="studio-panels-menu" class="menu" popover="auto" onbeforetoggle={positionMenu}>
            {#each sidePanels as panel (panel.id)}
                <label class="item">
                    <input type="checkbox" checked={openPanels.includes(panel.id)} onchange={() => togglePanel(panel.id)} />
                    {panel.title}
                </label>
            {/each}
            <hr />
            <button type="button" class="item" onclick={resetLayout}>Reset layout</button>
        </div>
    </header>
    <div class="dock" bind:this={host}></div>
</div>

<style>
    .workspace {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        background: var(--studio-bg);
        color: var(--studio-text);
        font: 13px/1.4 var(--studio-font);
    }

    .bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        height: 40px;
        padding: 0 12px;
        border-bottom: 1px solid var(--studio-border);
        background: var(--studio-surface);
        flex: none;
    }

    .crumbs {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        white-space: nowrap;
    }

    .crumbs a {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--studio-muted);
        text-decoration: none;
    }

    .crumbs a:hover {
        color: var(--studio-text);
    }

    .crumbs span {
        color: var(--studio-muted);
    }

    h1 {
        flex: none;
        margin: 0;
        font-size: 13px;
        font-weight: 600;
    }

    .menu-button {
        flex: none;
        padding: 4px 10px;
        border: 1px solid var(--studio-border);
        border-radius: var(--studio-radius);
        background: transparent;
        color: var(--studio-text);
        font: inherit;
        cursor: pointer;
    }

    .menu-button:hover {
        background: var(--studio-surface-2);
    }

    .menu {
        position: fixed;
        inset: auto;
        min-width: 180px;
        margin: 0;
        padding: 4px;
        border: 1px solid var(--studio-border);
        border-radius: var(--studio-radius);
        background: var(--studio-surface);
        color: var(--studio-text);
        font: 13px/1.4 var(--studio-font);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    }

    .item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        box-sizing: border-box;
        padding: 6px 8px;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
    }

    .item:hover {
        background: var(--studio-surface-2);
    }

    .item input {
        margin: 0;
        accent-color: var(--studio-accent);
    }

    .menu hr {
        margin: 4px 0;
        border: 0;
        border-top: 1px solid var(--studio-border);
    }

    .menu-button:focus-visible,
    .item:focus-visible,
    .crumbs a:focus-visible {
        outline: 2px solid var(--studio-focus);
        outline-offset: 1px;
    }

    .dock {
        flex: 1 1 auto;
        min-height: 0;
    }
</style>
