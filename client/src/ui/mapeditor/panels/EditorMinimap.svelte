<script lang="ts">
    import { onDestroy } from "svelte";

    import "../../../components/rs/minimap/MinimapContainer.css";
    import compassSrc from "../../../components/rs/minimap/compass.png";
    import frameSrc from "../../../components/rs/minimap/minimap-frame.png";
    import minimapBlack from "../../../components/rs/minimap/minimap-black.png";
    import { RS_TO_DEGREES } from "../../../rs/MathConstants";
    import { useEditorState } from "../editor-state.svelte";

    /**
     * The game's round minimap, as in the map viewer: rotates with the camera, compass resets north, the globe opens the
     * world map. It shows the regions loaded in the editor (live, so edits appear), and black everywhere else.
     */
    const editor = useEditorState();
    const host = editor.host;

    let imageHost = $state<HTMLDivElement>();
    let raf = 0;
    const yawDegrees = $derived((2047 - editor.hud.cameraYaw) * RS_TO_DEGREES);

    $effect(() => {
        const root = imageHost;
        if (!root) return;

        const images: HTMLImageElement[] = [];
        for (let i = 0; i < 9; i++) {
            const image = document.createElement("img");
            image.className = "minimap-image";
            image.alt = "";
            image.width = 256;
            image.height = 256;
            image.src = minimapBlack;
            root.appendChild(image);
            images.push(image);
        }

        const black = new URL(minimapBlack, window.location.href).href;
        let lastRun = 0;
        const frame = (time: number): void => {
            raf = requestAnimationFrame(frame);
            // Tile assembly is cheap but not free, and docked panels stay mounted while hidden: about 15 Hz is plenty.
            if (time - lastRun < 66) return;
            lastRun = time;
            const x = host.camera.getPosX();
            const y = host.camera.getPosZ();
            const cameraMapX = x >> 6;
            const cameraMapY = y >> 6;
            const offsetX = (-128 + (x % 64) * 4) | 0;
            const offsetY = (-128 + (y % 64) * 4) | 0;

            let index = 0;
            for (let mx = 0; mx < 3; mx++) {
                for (let my = 0; my < 3; my++) {
                    const image = images[index++]!;
                    image.style.left = `${mx * 255 - offsetX}px`;
                    image.style.top = `${255 * 2 - my * 255 + offsetY}px`;
                    const next = host.getMinimapImageUrl(cameraMapX - 1 + mx, cameraMapY - 1 + my);
                    const wanted = next ? new URL(next, window.location.href).href : black;
                    if (image.src !== wanted) image.src = next ?? minimapBlack;
                }
            }
        };
        raf = requestAnimationFrame(frame);

        return () => {
            cancelAnimationFrame(raf);
            root.replaceChildren();
        };
    });

    onDestroy(() => cancelAnimationFrame(raf));
</script>

<div class="minimap-container" role="group" aria-label="Minimap">
    <img src={frameSrc} alt="" />
    <div class="minimap" style:transform="rotate({yawDegrees}deg)">
        <div bind:this={imageHost} class="minimap-images"></div>
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <img class="compass" style:transform="rotate({yawDegrees}deg)" alt="Compass: click to face north" title="Face north" src={compassSrc} onclick={() => host.camera.setYaw(0)} />
    <button type="button" class="worldmap-icon border-0 p-0" aria-label="Open the world map" title="World map" onclick={() => editor.openWorldMap()}></button>
</div>
