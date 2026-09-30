<script lang="ts">
    import RefreshCw from "@lucide/svelte/icons/refresh-cw";
    import ZoomIn from "@lucide/svelte/icons/zoom-in";
    import ZoomOut from "@lucide/svelte/icons/zoom-out";

    import compassSrc from "../../../components/rs/minimap/compass.png";
    import minimapBlack from "../../../components/rs/minimap/minimap-black.png";
    import "../../../mapeditor/MapEditorMinimap.css";
    import { RS_TO_DEGREES } from "../../../rs/MathConstants";
    import { Button } from "../../components/ui/button";
    import { useEditorState } from "../editor-state.svelte";
    import PanelFrame from "./PanelFrame.svelte";

    /** Visible square (px) for the dock minimap. */
    const VIEW_SIZE = 300;
    /** Rough extent of the 3×3 tile assembly in source pixels (before scale). */
    const TILE_SPACE = 765;
    const DEFAULT_ZOOM = 2.35;
    const MIN_ZOOM = 1.2;
    const MAX_ZOOM = 4.25;
    const ZOOM_STEP = 0.2;

    interface TileSlot {
        stack: HTMLDivElement;
        layers: [HTMLImageElement, HTMLImageElement];
        activeIdx: 0 | 1;
        currentKey: string;
        desiredKey: string;
        preloadFor?: string;
        /** Last blob URL committed for this square; shown again while a refresh has no URL yet. */
        displayedBlobUrl?: string;
        displayedForSquare?: string;
    }

    const editor = useEditorState();
    const host = editor.host;

    let wrap = $state<HTMLDivElement>();
    let zoom = $state(DEFAULT_ZOOM);

    const yawDegrees = $derived((2047 - editor.hud.cameraYaw) * RS_TO_DEGREES);
    const scale = $derived((VIEW_SIZE / TILE_SPACE) * zoom);

    function refreshTiles(): void {
        host.refreshMinimapAroundCamera();
        const cameraMapX = host.camera.getPosX() >> 6;
        const cameraMapY = host.camera.getPosZ() >> 6;
        for (let mx = 0; mx < 3; mx++) {
            for (let my = 0; my < 3; my++) host.getMinimapImageUrl(cameraMapX - 1 + mx, cameraMapY - 1 + my);
        }
    }

    // Nine tiles, each two stacked <img>s that cross-fade when a fresher image arrives. Kept imperative: it runs per frame.
    $effect(() => {
        const root = wrap;
        if (!root) return;

        const slots: TileSlot[] = [];
        for (let i = 0; i < 9; i++) {
            const stack = document.createElement("div");
            stack.className = "map-editor-minimap-stack";
            const a = document.createElement("img");
            const b = document.createElement("img");
            for (const el of [a, b]) {
                el.className = "map-editor-minimap-layer";
                el.alt = "";
                el.width = 256;
                el.height = 256;
                el.src = minimapBlack;
            }
            a.classList.add("map-editor-minimap-layer--on");
            b.classList.add("map-editor-minimap-layer--off");
            stack.append(a, b);
            root.appendChild(stack);
            slots.push({ stack, layers: [a, b], activeIdx: 0, currentKey: "", desiredKey: "" });
        }

        let raf = 0;
        const animate = (): void => {
            const cameraX = host.camera.getPosX();
            const cameraY = host.camera.getPosZ();
            const cameraMapX = cameraX >> 6;
            const cameraMapY = cameraY >> 6;
            const offsetX = (-128 + (cameraX % 64) * 4) | 0;
            const offsetY = (-128 + (cameraY % 64) * 4) | 0;

            let slotIdx = 0;
            for (let mx = 0; mx < 3; mx++) {
                for (let my = 0; my < 3; my++) {
                    const slot = slots[slotIdx++]!;
                    const mapX = cameraMapX - 1 + mx;
                    const mapY = cameraMapY - 1 + my;
                    slot.stack.style.left = `${mx * 255 - offsetX}px`;
                    slot.stack.style.top = `${255 * 2 - my * 255 + offsetY}px`;

                    const minimapUrl = host.getMinimapImageUrl(mapX, mapY);
                    const squareKey = `${mapX},${mapY}`;
                    const canHoldPrevious = !minimapUrl && slot.displayedBlobUrl !== undefined && slot.displayedForSquare === squareKey;
                    const urlToShow = minimapUrl ?? (canHoldPrevious ? slot.displayedBlobUrl : undefined);
                    const slotKey = `${squareKey}:${urlToShow ?? minimapBlack}`;
                    if (slot.currentKey === slotKey) continue;
                    slot.desiredKey = slotKey;

                    if (!urlToShow) {
                        slot.layers[slot.activeIdx].src = minimapBlack;
                        slot.displayedBlobUrl = undefined;
                        slot.displayedForSquare = undefined;
                        slot.currentKey = slotKey;
                        delete slot.preloadFor;
                        continue;
                    }
                    if (!minimapUrl) {
                        slot.currentKey = slotKey;
                        continue;
                    }
                    if (slot.preloadFor !== undefined) continue;
                    slot.preloadFor = slotKey;

                    const standbyIdx = (1 - slot.activeIdx) as 0 | 1;
                    const standby = slot.layers[standbyIdx];
                    const active = slot.layers[slot.activeIdx];
                    const pre = new Image();
                    pre.onload = () => {
                        if (slot.desiredKey !== slotKey) return;
                        standby.src = minimapUrl;
                        const crossfade = (): void => {
                            if (slot.desiredKey !== slotKey) return;
                            active.classList.replace("map-editor-minimap-layer--on", "map-editor-minimap-layer--off");
                            standby.classList.replace("map-editor-minimap-layer--off", "map-editor-minimap-layer--on");
                            slot.activeIdx = standbyIdx;
                            slot.currentKey = slotKey;
                            slot.displayedBlobUrl = minimapUrl;
                            slot.displayedForSquare = squareKey;
                            delete slot.preloadFor;
                        };
                        const twoFrames = (): void => void requestAnimationFrame(() => requestAnimationFrame(crossfade));
                        if (standby.complete) twoFrames();
                        else standby.onload = () => slot.desiredKey === slotKey && twoFrames();
                    };
                    pre.onerror = () => {
                        if (slot.desiredKey !== slotKey) return;
                        slot.layers[slot.activeIdx].src = minimapBlack;
                        slot.displayedBlobUrl = undefined;
                        slot.displayedForSquare = undefined;
                        slot.currentKey = `${squareKey}:${minimapBlack}`;
                        delete slot.preloadFor;
                    };
                    pre.src = minimapUrl;
                }
            }
            raf = requestAnimationFrame(animate);
        };
        raf = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(raf);
            root.replaceChildren();
        };
    });
</script>

<PanelFrame shellClass="overflow-auto">
    <div class="flex h-full min-h-0 w-full items-start justify-start overflow-auto p-2">
        <div class="map-editor-minimap-root">
            <div class="map-editor-minimap-square border border-border bg-black" style="width: {VIEW_SIZE}px; height: {VIEW_SIZE}px">
                <div class="map-editor-minimap-rotate-outer">
                    <div class="map-editor-minimap-rotate" style="transform: rotate({yawDegrees}deg)">
                        <div class="map-editor-minimap-scale" style="transform: scale({scale})">
                            <div bind:this={wrap} class="map-editor-minimap-images" style="width: {TILE_SPACE}px; height: {TILE_SPACE}px"></div>
                        </div>
                    </div>
                </div>

                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                <img
                    class="map-editor-minimap-compass"
                    src={compassSrc}
                    alt=""
                    style="transform: rotate({yawDegrees}deg)"
                    onclick={() => host.camera.setYaw(0)}
                />

                <Button size="icon" variant="secondary" class="absolute right-1 top-1 z-[2] h-7 w-7 shadow-sm" title="Refresh minimap tiles" aria-label="Refresh minimap tiles" onclick={refreshTiles}>
                    <RefreshCw class="size-3.5" aria-hidden="true" />
                </Button>

                <div class="map-editor-minimap-zoom-controls">
                    <Button size="icon" variant="secondary" class="h-7 w-7 shadow-sm" title="Zoom out" aria-label="Zoom out minimap" disabled={zoom <= MIN_ZOOM + 1e-6} onclick={() => (zoom = Math.max(MIN_ZOOM, zoom - ZOOM_STEP))}>
                        <ZoomOut class="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button size="icon" variant="secondary" class="h-7 w-7 shadow-sm" title="Zoom in" aria-label="Zoom in minimap" disabled={zoom >= MAX_ZOOM - 1e-6} onclick={() => (zoom = Math.min(MAX_ZOOM, zoom + ZOOM_STEP))}>
                        <ZoomIn class="size-3.5" aria-hidden="true" />
                    </Button>
                </div>
            </div>
        </div>
    </div>
</PanelFrame>
