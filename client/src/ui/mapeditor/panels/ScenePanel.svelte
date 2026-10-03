<script lang="ts">
    import { isStatusBarVisible } from "../../../mapeditor/status-bar-model";
    import { onMount } from "svelte";
    import { getObjectActionModel, LOC_DRAG_TYPE } from "../../../mapeditor/plugins/builtins/object-action-model";

    import "../../../mapeditor/MapEditorContainer.css";
    import { contextMenu } from "../../components/context-menu/context-menu.svelte";
    import { TooltipProvider } from "../../components/ui/tooltip";
    import { perf } from "../../../perf/perf-profile";
    import { Button } from "../../components/ui/button";
    import { rendererCanvas } from "../../lib/actions";
    import { perfState } from "../../lib/perf.svelte";
    import { useEditorState } from "../editor-state.svelte";
    import { buildViewportMenuItems } from "./viewport-menu";
    import { isViewportMinimapVisible } from "../../../mapeditor/viewport-minimap-model";
    import EditorMinimap from "./EditorMinimap.svelte";
    import QuickControlsMenu from "./QuickControlsMenu.svelte";

    const editor = useEditorState();
    const host = editor.host;
    const hud = editor.hud;
    const statusBarOn = $derived(editor.read(() => isStatusBarVisible(host)));
    const minimapOn = $derived(editor.read(() => isViewportMinimapVisible(host)));

    onMount(() => host.setViewMode("editor"));

    const isLocDrag = (event: DragEvent): boolean => event.dataTransfer?.types.includes(LOC_DRAG_TYPE) === true;

    /** While an object row is dragged over the view, the pointer drives the same hover the mouse does, so the ghost follows it. */
    function onDragOver(event: DragEvent): void {
        if (!isLocDrag(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        host.renderer.canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: event.clientX, clientY: event.clientY }));
    }

    function onDrop(event: DragEvent): void {
        if (!isLocDrag(event)) return;
        event.preventDefault();
        const locTypeId = Number(event.dataTransfer?.getData(LOC_DRAG_TYPE));
        const tile = host.getHoveredTile();
        const actions = getObjectActionModel(host);
        if (Number.isFinite(locTypeId) && tile) {
            actions.request({ type: "place-at", locTypeId, rotation: actions.placeRotation, worldX: tile.worldX, worldY: tile.worldY, level: host.getTilePickLevel() });
        }
        actions.cancel();
    }

    function onContextMenu(event: MouseEvent): void {
        event.preventDefault();
        if (!host.viewportContextMenuAllowed(event.altKey)) return;
        // Capture the hovered tile now so the copied data matches what was under the cursor when the menu opened.
        const snapshot = host.inspectHoveredTile();
        host.contextMenuObject = snapshot?.hoveredObject;
        contextMenu.open(event, "Tile and object", buildViewportMenuItems(snapshot, host), () => {
            host.contextMenuObject = undefined;
        });
    }
</script>

{#snippet guardBanner()}
    {@const snapshot = perfState.current}
    {#if snapshot.notice}
        <div class="pointer-events-auto absolute left-1/2 top-3 z-30 w-[min(32rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-md border {snapshot.paused ? 'border-red-500/60 bg-red-950/90' : 'border-amber-500/50 bg-amber-950/90'} p-3 text-xs text-foreground shadow-lg" role="alert">
            <p class="font-semibold">{snapshot.paused ? "Rendering paused" : "Performance guard"}</p>
            <p class="mt-1 leading-snug">{snapshot.notice.message}</p>
            <div class="mt-2 flex gap-2">
                {#if snapshot.paused}
                    <Button size="sm" class="h-7 text-xs" onclick={() => perf.resume()}>Resume</Button>
                {/if}
                <Button size="sm" variant="outline" class="h-7 text-xs" onclick={() => perf.dismissNotice()}>Dismiss</Button>
            </div>
        </div>
    {/if}
{/snippet}

<TooltipProvider delayDuration={250}>
    <div class="map-editor-viewport-panel relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-background">
        {@render guardBanner()}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="map-editor-viewport-canvas-host relative h-full min-h-0 overflow-hidden" oncontextmenu={onContextMenu} ondragover={onDragOver} ondrop={onDrop}>
            <div class="map-editor-hud">
                <div class="fps-counter content-text">{hud.fps}</div>
                {#if !statusBarOn}
                    <div class="fps-counter content-text">{hud.debugText}</div>
                {/if}
            </div>
            <div class="renderer-canvas h-full w-full" tabindex="0" role="application" use:rendererCanvas={host.renderer}></div>
        </div>
        {#if minimapOn}
            <div class="pointer-events-auto absolute right-2 top-2 z-20 drop-shadow-md">
                <EditorMinimap />
            </div>
        {/if}
        <!-- Quick controls: the pinned rendering switches, in the corner of the view they change. -->
        <div class="pointer-events-auto absolute bottom-2 right-2 z-20 rounded-md border border-border bg-card/85 shadow-md backdrop-blur">
            <QuickControlsMenu side="top" />
        </div>
    </div>
</TooltipProvider>
