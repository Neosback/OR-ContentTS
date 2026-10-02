<script lang="ts">
    import { onDestroy } from "svelte";

    import { wheelDeltaPixels } from "../../../mapviewer/InputManager";
    import {
        WorldMapBitmapCache,
        worldMapDecodePixels,
    } from "../../../mapviewer/world-map-bitmap-cache";
    import { getMapSquareId } from "../../../rs/map/MapFileIndex";
    import { clamp } from "../../../util/MathUtil";
    import locationsImport from "../../../components/rs/worldmap/locations.json";
    import "../../../components/rs/worldmap/WorldMap.css";
    import { elementSize } from "../../lib/actions";
    import OsrsSelect from "./OsrsSelect.svelte";

    interface Location {
        name: string;
        coords: number[];
        size?: string;
    }

    type WorldMapTile = {
        id: number;
        mapX: number;
        mapY: number;
        left: number;
        bottom: number;
    };

    type PendingTile = {
        key: string;
        mapX: number;
        mapY: number;
        decodePixels: number;
    };

    /** Wheel distance (px) per world map zoom level; about one mouse-wheel notch. */
    const WHEEL_STEP_PIXELS = 60;
    const TILE_SIZES = [0.25, 0.375, 0.5, 0.75, 1, 2, 3, 4, 5, 6, 8, 10];
    const DEFAULT_TILE_SIZE = 3;
    const MAX_X = 100 * 64;
    const MAX_Y = 200 * 64;
    const MAX_CONCURRENT_TILE_LOADS = 8;

    const locations: Location[] = locationsImport.locations;
    const locationsByKey = new Map<string, Location>();
    const locationOptions = locations.map((location) => {
        const value = `${location.name} ${location.coords.join(",")}`;
        locationsByKey.set(value, location);
        return { value, label: location.name };
    });

    function tileSizeForLocation(size?: string): number {
        return size === "large" ? 2 : size === "medium" ? 3 : 4;
    }

    let {
        onDoubleClick,
        onRegionSelect,
        getPosition,
        loadMapImageBlob,
    }: {
        onDoubleClick: (x: number, y: number) => void;
        onRegionSelect?: (mapX: number, mapY: number, regionId: number) => void;
        getPosition: () => { x: number; y: number };
        loadMapImageBlob: (
            mapX: number,
            mapY: number,
        ) => Promise<Blob | undefined>;
    } = $props();

    let width = $state(0);
    let height = $state(0);
    let canvas = $state<HTMLCanvasElement>();
    let dragEl = $state<HTMLDivElement>();
    let isDragging = $state(false);
    let dragLast = { x: 0, y: 0 };
    let pos = $state(getPosition());
    let tileSizeIndex = $state(TILE_SIZES.indexOf(DEFAULT_TILE_SIZE));
    let hoverRegion = $state<{ mapX: number; mapY: number } | undefined>();
    let selectedRegion = $state<{ mapX: number; mapY: number } | undefined>();
    let wheelAccum = 0;

    const bitmapCache = new WorldMapBitmapCache<string, ImageBitmap>();
    const pendingLoads = new Map<string, PendingTile>();
    const activeLoads = new Map<string, Promise<void>>();
    let visibleKeys = new Set<string>();
    let renderRaf = 0;
    let disposed = false;

    const tileSize = $derived(TILE_SIZES[tileSizeIndex]);
    const cameraX = $derived(pos.x | 0);
    const cameraY = $derived(pos.y | 0);
    const halfWidth = $derived((width / 2) | 0);
    const halfHeight = $derived((height / 2) | 0);

    /** Region images currently in view, with their on-screen position. */
    const tiles = $derived.by(() => {
        const imageSize = 64 * tileSize;
        const mapX = pos.x >> 6;
        const mapY = pos.y >> 6;
        const x = halfWidth - (cameraX % 64) * tileSize - tileSize / 2;
        const y = halfHeight - (cameraY % 64) * tileSize - tileSize / 2;
        const startX = -Math.ceil(x / imageSize) - 1;
        const startY = -Math.ceil(y / imageSize) - 1;
        const endX = Math.ceil((width - x) / imageSize) + 1;
        const endY = Math.ceil((height - y) / imageSize) + 1;

        const result: WorldMapTile[] = [];
        for (let rx = startX; rx < endX; rx++) {
            for (let ry = startY; ry < endY; ry++) {
                const imageMapX = mapX + rx;
                const imageMapY = mapY + ry;
                if (
                    imageMapX < 0 ||
                    imageMapY < 0 ||
                    imageMapX >= 100 ||
                    imageMapY >= 200
                ) {
                    continue;
                }
                result.push({
                    id: getMapSquareId(imageMapX, imageMapY),
                    mapX: imageMapX,
                    mapY: imageMapY,
                    left: x + rx * imageSize,
                    bottom: y + ry * imageSize,
                });
            }
        }
        return result;
    });

    function bitmapKey(tile: WorldMapTile, decodePixels: number): string {
        return `${tile.id}:${decodePixels}`;
    }

    function requestRender(): void {
        if (disposed || renderRaf) return;
        renderRaf = requestAnimationFrame(() => {
            renderRaf = 0;
            renderWorldMap();
        });
    }

    function queueVisibleTileLoads(
        currentTiles: readonly WorldMapTile[],
        decodePixels: number,
    ): void {
        const nextVisible = new Set<string>();
        const centerX = width / 2;
        const centerY = height / 2;
        const regionPx = 64 * tileSize;

        const prioritized = [...currentTiles].sort((a, b) => {
            const ax = a.left + regionPx / 2 - centerX;
            const ay = height - a.bottom - regionPx / 2 - centerY;
            const bx = b.left + regionPx / 2 - centerX;
            const by = height - b.bottom - regionPx / 2 - centerY;
            return ax * ax + ay * ay - (bx * bx + by * by);
        });

        pendingLoads.clear();
        for (const tile of prioritized) {
            const key = bitmapKey(tile, decodePixels);
            nextVisible.add(key);
            if (bitmapCache.get(key) || activeLoads.has(key)) continue;
            pendingLoads.set(key, {
                key,
                mapX: tile.mapX,
                mapY: tile.mapY,
                decodePixels,
            });
        }

        visibleKeys = nextVisible;
        bitmapCache.evict(visibleKeys);
        pumpLoads();
    }

    function pumpLoads(): void {
        if (disposed) return;
        while (
            activeLoads.size < MAX_CONCURRENT_TILE_LOADS &&
            pendingLoads.size > 0
        ) {
            const next = pendingLoads.entries().next().value as
                | [string, PendingTile]
                | undefined;
            if (!next) break;

            const [key, tile] = next;
            pendingLoads.delete(key);

            const promise = loadTile(tile).finally(() => {
                activeLoads.delete(key);
                if (!disposed) {
                    pumpLoads();
                    requestRender();
                }
            });
            activeLoads.set(key, promise);
        }
    }

    async function decodeBitmap(
        blob: Blob,
        pixels: number,
    ): Promise<ImageBitmap> {
        if (pixels >= 256) return createImageBitmap(blob);
        try {
            return await createImageBitmap(blob, {
                resizeWidth: pixels,
                resizeHeight: pixels,
                resizeQuality: "high",
            });
        } catch {
            return createImageBitmap(blob);
        }
    }

    async function loadTile(tile: PendingTile): Promise<void> {
        const blob = await loadMapImageBlob(tile.mapX, tile.mapY);
        if (!blob || disposed) return;

        const bitmap = await decodeBitmap(blob, tile.decodePixels);
        if (disposed) {
            bitmap.close();
            return;
        }

        bitmapCache.set(tile.key, bitmap, visibleKeys);
    }

    function renderWorldMap(): void {
        const target = canvas;
        if (!target || width <= 0 || height <= 0) return;

        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const pixelWidth = Math.max(1, Math.ceil(width * dpr));
        const pixelHeight = Math.max(1, Math.ceil(height * dpr));
        if (target.width !== pixelWidth || target.height !== pixelHeight) {
            target.width = pixelWidth;
            target.height = pixelHeight;
        }

        const ctx = target.getContext("2d");
        if (!ctx) return;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, target.width, target.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        const currentTiles = tiles;
        const regionPx = 64 * tileSize;
        const decodePixels = worldMapDecodePixels(regionPx, dpr);

        queueVisibleTileLoads(currentTiles, decodePixels);

        for (const tile of currentTiles) {
            const top = height - tile.bottom - regionPx;
            const bitmap = bitmapCache.get(bitmapKey(tile, decodePixels));
            if (bitmap) {
                ctx.drawImage(
                    bitmap,
                    tile.left,
                    top,
                    regionPx,
                    regionPx,
                );
            }

            ctx.strokeStyle = "rgba(248, 250, 252, 0.35)";
            ctx.lineWidth = 1;
            ctx.strokeRect(tile.left, top, regionPx, regionPx);

            const fontSize = Math.max(9, Math.min(12, tileSize * 2.6));
            const label = String(tile.id);
            ctx.font = `600 ${fontSize}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const textWidth = ctx.measureText(label).width;
            const labelX = tile.left + regionPx / 2;
            const labelY = top + regionPx / 2;
            ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
            ctx.fillRect(
                labelX - textWidth / 2 - 4,
                labelY - fontSize / 2 - 2,
                textWidth + 8,
                fontSize + 4,
            );
            ctx.fillStyle = "rgba(248, 250, 252, 0.96)";
            ctx.fillText(label, labelX, labelY);
        }
    }

    $effect(() => {
        canvas;
        width;
        height;
        tileSize;
        pos.x;
        pos.y;
        tiles;
        requestRender();
    });

    function mapToScreen(mapX: number, mapY: number): { left: number; bottom: number } {
        const baseLeft = halfWidth - (cameraX % 64) * tileSize - tileSize / 2;
        const baseBottom = halfHeight - (cameraY % 64) * tileSize - tileSize / 2;
        return {
            left: baseLeft + (mapX - (cameraX >> 6)) * 64 * tileSize,
            bottom: baseBottom + (mapY - (cameraY >> 6)) * 64 * tileSize,
        };
    }

    function regionAt(offsetX: number, offsetY: number): { mapX: number; mapY: number; regionId: number } | undefined {
        const tileX = cameraX + (offsetX - halfWidth) / tileSize + 0.5;
        const tileY = cameraY + (halfHeight - offsetY) / tileSize + 0.5;
        const mapX = Math.floor(tileX / 64);
        const mapY = Math.floor(tileY / 64);
        if (mapX < 0 || mapY < 0) return undefined;
        return { mapX, mapY, regionId: getMapSquareId(mapX, mapY) };
    }

    function local(clientX: number, clientY: number): { x: number; y: number } {
        const rect = dragEl?.getBoundingClientRect();
        return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
    }

    function drag(x: number, y: number): void {
        const deltaX = (dragLast.x - x) / tileSize;
        const deltaY = (y - dragLast.y) / tileSize;
        dragLast = { x, y };
        pos = { x: clamp(pos.x + deltaX, 0, MAX_X), y: clamp(pos.y + deltaY, 0, MAX_Y) };
    }

    function zoom(delta: number): number {
        tileSizeIndex = clamp(tileSizeIndex + delta, 0, TILE_SIZES.length - 1);
        return TILE_SIZES[tileSizeIndex];
    }

    function onWheel(event: WheelEvent): void {
        wheelAccum += wheelDeltaPixels(event);
        if (Math.abs(wheelAccum) < WHEEL_STEP_PIXELS) return;
        const direction = -Math.sign(wheelAccum);
        wheelAccum = 0;

        const { offsetX, offsetY } = event;
        const deltaX = (offsetX - halfWidth) / tileSize;
        const deltaY = (halfHeight - offsetY) / tileSize;
        const newSize = zoom(direction);
        pos = {
            x: clamp(pos.x + deltaX - (offsetX - halfWidth) / newSize, 0, MAX_X),
            y: clamp(pos.y + deltaY - (halfHeight - offsetY) / newSize, 0, MAX_Y),
        };
    }

    function onLocationSelected(option: { value: string }): void {
        const location = locationsByKey.get(option.value);
        if (!location) return;
        pos = { x: location.coords[0], y: location.coords[1] };
        tileSizeIndex = TILE_SIZES.indexOf(tileSizeForLocation(location.size));
    }

    const hover = $derived(hoverRegion ? mapToScreen(hoverRegion.mapX, hoverRegion.mapY) : undefined);
    const selected = $derived(selectedRegion ? mapToScreen(selectedRegion.mapX, selectedRegion.mapY) : undefined);
    const regionPx = $derived(64 * tileSize);

    onDestroy(() => {
        disposed = true;
        if (renderRaf) cancelAnimationFrame(renderRaf);
        renderRaf = 0;
        pendingLoads.clear();
        bitmapCache.clear();
    });
</script>

<div class="worldmap-container">
    <div class="worldmap" use:elementSize={(size) => ((width = size.width), (height = size.height))}>
        <canvas
            bind:this={canvas}
            aria-hidden="true"
            style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1"
        ></canvas>
        <div
            class="worldmap-border"
            style="position: absolute; left: {halfWidth - cameraX * tileSize}px; bottom: {halfHeight - cameraY * tileSize}px; width: {MAX_X * tileSize}px; height: {MAX_Y * tileSize}px; z-index: 2"
        ></div>
        {#if hover}
            <div
                style="position: absolute; left: {hover.left}px; bottom: {hover.bottom}px; width: {regionPx}px; height: {regionPx}px; border: 1px solid rgba(248, 250, 252, 0.9); background: rgba(0, 0, 0, 0.28); pointer-events: none; z-index: 3"
            ></div>
        {/if}
        {#if selected}
            <div
                style="position: absolute; left: {selected.left}px; bottom: {selected.bottom}px; width: {regionPx}px; height: {regionPx}px; border: 2px solid rgba(248, 250, 252, 0.95); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.65) inset; pointer-events: none; z-index: 4"
            ></div>
        {/if}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            bind:this={dragEl}
            class="worldmap-drag"
            class:dragging={isDragging}
            style="z-index: 5"
            title="Double click to teleport"
            ondblclick={(event) => {
                isDragging = false;
                onDoubleClick(cameraX + (event.offsetX - halfWidth) / tileSize + 0.5, cameraY + (halfHeight - event.offsetY) / tileSize + 0.5);
            }}
            onclick={(event) => {
                const region = regionAt(event.offsetX, event.offsetY);
                if (!region) return;
                selectedRegion = { mapX: region.mapX, mapY: region.mapY };
                onRegionSelect?.(region.mapX, region.mapY, region.regionId);
            }}
            onmousedown={(event) => {
                isDragging = true;
                const p = local(event.clientX, event.clientY);
                dragLast = p;
            }}
            onmousemove={(event) => {
                const p = local(event.clientX, event.clientY);
                const hovered = regionAt(p.x, p.y);
                hoverRegion = hovered ? { mapX: hovered.mapX, mapY: hovered.mapY } : undefined;
                if (isDragging) drag(p.x, p.y);
            }}
            onmouseup={() => (isDragging = false)}
            onmouseleave={() => (isDragging = false)}
            ontouchstart={(event) => {
                const touch = event.touches[0];
                isDragging = true;
                dragLast = local(touch.clientX, touch.clientY);
            }}
            ontouchmove={(event) => {
                if (!isDragging) return;
                const touch = event.touches[0];
                const p = local(touch.clientX, touch.clientY);
                drag(p.x, p.y);
            }}
            ontouchend={() => (isDragging = false)}
            onwheel={onWheel}
        ></div>
    </div>
    <div class="worldmap-footer rs-border rs-background">
        <span class="flex hide-mobile text-xs text-muted-foreground">
            {hoverRegion
                ? `Hover: ${getMapSquareId(hoverRegion.mapX, hoverRegion.mapY)} (${hoverRegion.mapX}, ${hoverRegion.mapY})`
                : "Click a region to select"}
        </span>
        <div class="worldmap-location-select">
            <OsrsSelect options={locationOptions} onSelect={onLocationSelected} />
        </div>
        <span class="worldmap-zoom-buttons flex align-right">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="worldmap-zoom-button worldmap-zoom-out" onclick={() => zoom(-1)}></div>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="worldmap-zoom-button worldmap-zoom-in" onclick={() => zoom(1)}></div>
        </span>
    </div>
</div>
