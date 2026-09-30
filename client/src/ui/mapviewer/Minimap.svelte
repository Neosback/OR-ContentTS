<script lang="ts">
    import { onDestroy } from "svelte";

    import "../../../components/rs/minimap/MinimapContainer.css";
    import compassSrc from "../../../components/rs/minimap/compass.png";
    import frameSrc from "../../../components/rs/minimap/minimap-frame.png";
    import minimapBlack from "../../../components/rs/minimap/minimap-black.png";
    import { RS_TO_DEGREES } from "../../../rs/MathConstants";
    import type { MapViewerUiState } from "./map-viewer-state.svelte";

    let { state }: { state: MapViewerUiState } = $props();
    let imageHost = $state<HTMLDivElement>();
    let raf = 0;

    const yawDegrees = $derived((2047 - state.cameraYaw) * RS_TO_DEGREES);

    $effect(() => {
        const host = imageHost;
        if (!host) return;

        const images: HTMLImageElement[] = [];
        for (let i = 0; i < 9; i++) {
            const image = document.createElement("img");
            image.className = "minimap-image";
            image.alt = "";
            image.width = 256;
            image.height = 256;
            image.src = minimapBlack;
            host.appendChild(image);
            images.push(image);
        }

        const frame = (): void => {
            const pos = state.getPosition();
            const cameraMapX = pos.x >> 6;
            const cameraMapY = pos.y >> 6;
            const offsetX = (-128 + (pos.x % 64) * 4) | 0;
            const offsetY = (-128 + (pos.y % 64) * 4) | 0;

            let index = 0;
            for (let mx = 0; mx < 3; mx++) {
                for (let my = 0; my < 3; my++) {
                    const mapX = cameraMapX - 1 + mx;
                    const mapY = cameraMapY - 1 + my;
                    const image = images[index++]!;
                    image.style.left = `${mx * 255 - offsetX}px`;
                    image.style.top = `${255 * 2 - my * 255 + offsetY}px`;
                    const nextSrc = state.loadMinimapImageUrl(mapX, mapY) ?? minimapBlack;
                    if (image.src !== new URL(nextSrc, window.location.href).href) image.src = nextSrc;
                }
            }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);

        return () => {
            cancelAnimationFrame(raf);
            host.replaceChildren();
        };
    });

    onDestroy(() => cancelAnimationFrame(raf));
</script>

<div class="flex h-full min-h-0 flex-col gap-2 overflow-auto bg-card/95 p-2 text-card-foreground">
    <div class="minimap-container">
        <img src={frameSrc} alt="" />
        <div class="minimap" style:transform="rotate({yawDegrees}deg)">
            <div bind:this={imageHost} class="minimap-images"></div>
        </div>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <img
            class="compass"
            style:transform="rotate({yawDegrees}deg)"
            alt=""
            src={compassSrc}
            onclick={() => state.mapViewer.camera.setYaw(0)}
        />
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="worldmap-icon" onclick={() => state.openWorldMap()}></div>
    </div>
    <div class="fps-counter content-text text-[11px]">{state.fps}</div>
    <div class="fps-counter content-text text-[11px]">{state.debugText ?? ""}</div>
</div>
