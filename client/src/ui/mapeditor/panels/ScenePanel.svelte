<script lang="ts">
    import { onMount } from "svelte";

    import "../../../mapeditor/MapEditorContainer.css";
    import { contextMenu } from "../../components/context-menu/context-menu.svelte";
    import { TooltipProvider } from "../../components/ui/tooltip";
    import { rendererCanvas } from "../../lib/actions";
    import { useEditorState } from "../editor-state.svelte";
    import { BRUSH_PANEL_ID } from "../workbench-controller.svelte";
    import QuickControlsMenu from "./QuickControlsMenu.svelte";
    import { buildViewportMenuItems } from "./viewport-menu";

    const editor = useEditorState();
    const host = editor.host;
    const hud = editor.hud;

    onMount(() => host.setViewMode("editor"));

    // Quick controls live in the viewport when the brush bar is docked (or its plugin is off); otherwise in the brush window.
    const stickyNav = $derived(
        editor.read(() => !host.isWorkbenchUiPluginEnabled("brush_workspace")) || editor.layout?.locations[BRUSH_PANEL_ID] === "grid",
    );

    function onContextMenu(event: MouseEvent): void {
        event.preventDefault();
        if (!host.viewportContextMenuAllowed(event.altKey)) return;
        // Capture the hovered tile now so the copied data matches what was under the cursor when the menu opened.
        const snapshot = host.inspectHoveredTile();
        host.contextMenuObject = snapshot?.hoveredObject;
        contextMenu.open(event, "Inspect", buildViewportMenuItems(snapshot), () => {
            host.contextMenuObject = undefined;
        });
    }
</script>

<TooltipProvider delayDuration={250}>
    <div class="map-editor-viewport-panel relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-background">
        {#if stickyNav}
            <div class="pointer-events-none absolute right-2 top-2 z-20">
                <div class="pointer-events-auto flex items-center gap-1 rounded-md border border-border/70 bg-card/90 p-0.5 backdrop-blur-sm">
                    <QuickControlsMenu />
                </div>
            </div>
        {/if}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="map-editor-viewport-canvas-host relative h-full min-h-0 overflow-hidden" oncontextmenu={onContextMenu}>
            <div class="map-editor-hud">
                <div class="fps-counter content-text">{hud.fps}</div>
                <div class="fps-counter content-text">{hud.debugText}</div>
            </div>
            <div class="renderer-canvas h-full w-full" tabindex="0" role="application" use:rendererCanvas={host.renderer}></div>
        </div>
    </div>
</TooltipProvider>
