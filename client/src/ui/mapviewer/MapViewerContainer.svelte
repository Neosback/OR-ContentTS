<script lang="ts">
    import { onDestroy, onMount } from "svelte";

    import "../../mapviewer/MapViewerContainer.css";
    import { isTouchDevice } from "../../util/DeviceUtil";
    import OsrsMenu from "../components/rs/OsrsMenu.svelte";
    import WorldMapModal from "../components/rs/WorldMapModal.svelte";
    import { rendererCanvas } from "../lib/actions";
    import MapViewerToolsDock from "./MapViewerToolsDock.svelte";
    import TouchJoysticks from "./TouchJoysticks.svelte";
    import type { MapViewerUiState } from "./map-viewer-state.svelte";

    let { state }: { state: MapViewerUiState } = $props();

    onMount(() => {
        state.start();
        const onKeyDown = (event: KeyboardEvent): void => {
            if (!event.repeat && event.key === "F1") state.toggleUi();
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    });

    onDestroy(() => state.stop());
</script>

<div class="map-viewer-root max-height h-full min-h-0 w-full min-w-0 flex-1">
    <div class="map-viewer-viewport">
        {#if state.menu}
            <OsrsMenu {...state.menu} />
        {/if}

        {#if !state.hideUi}
            <div class="map-viewer-hud-layer">
                <WorldMapModal
                    open={state.worldMapOpen}
                    onClose={() => state.closeWorldMap()}
                    onDoubleClick={(x, y) => state.teleportFromWorldMap(x, y)}
                    getPosition={state.getPosition}
                    loadMapImageBlob={state.loadMapImageBlob}
                />
            </div>
        {/if}

        {#if !state.hideUi && isTouchDevice}
            <TouchJoysticks {state} />
        {/if}

        {#if state.renderer}
            <div use:rendererCanvas={state.renderer} class="renderer-canvas h-full w-full" tabindex="0"></div>
        {/if}
    </div>

    {#if !state.hideUi}
        <div class="map-viewer-tools-dock border-l border-border bg-background">
            <MapViewerToolsDock {state} />
        </div>
    {/if}
</div>
