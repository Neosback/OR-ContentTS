<script lang="ts">
    import { isCopyableObjectKind } from "../../../mapeditor/plugins/builtins/object-copy-placement";
    import { getTileBrushModel } from "../../../mapeditor/plugins/builtins/tile-brush-model";
    import { executeEditorCommand } from "../../../mapeditor/commands/editor-command-registry";
    import { useEditorState } from "../editor-state.svelte";
    import ObjectPreview from "../inspector/ObjectPreview.svelte";
    import TilePreview from "../inspector/TilePreview.svelte";
    import CollapsibleSection from "./CollapsibleSection.svelte";

    const editor = useEditorState();
    const host = editor.host;

    const selectedObject = $derived(editor.read(() => host.selectedObject));
    const hoveredObject = $derived(editor.read(() => host.hoveredObject));
    const selectedTile = $derived(editor.read(() => host.selectedTile));
    const hoverTile = $derived(editor.hud.hoverTile);
    const level = $derived(editor.read(() => host.selectedLevel));
    const copyActive = $derived(editor.read(() => host.isObjectCopyPlacementActive() && !!host.getObjectCopyTemplate()));

    // What each section describes: the selection, or whatever the cursor is over when nothing is selected.
    const tileTarget = $derived(selectedTile ?? (hoverTile ? { ...hoverTile, level } : undefined));
    const tileIsSelection = $derived(selectedTile !== undefined);
    const objectTarget = $derived(selectedObject ?? hoveredObject);
    const objectIsSelection = $derived(selectedObject !== undefined);

    const tile = $derived(
        tileTarget ? editor.read(() => host.getTileInfo(tileTarget.level, tileTarget.worldX, tileTarget.worldY)) : undefined,
    );
    // Stored underlay/overlay values are id + 1 (0 = none).
    const underlayId = $derived(tile && (tile.u ?? 0) > 0 ? (tile.u ?? 0) - 1 : undefined);
    const overlayId = $derived(tile && (tile.o ?? 0) > 0 ? (tile.o ?? 0) - 1 : undefined);
    const underlay = $derived(underlayId !== undefined ? host.underlayTypeLoader.load(underlayId) : undefined);
    const overlay = $derived(overlayId !== undefined ? host.overlayTypeLoader.load(overlayId) : undefined);
    const flagBits = $derived.by(() => {
        const flags = tile?.f ?? 0;
        const bits: number[] = [];
        for (let bit = 0; bit < 8; bit++) if (flags & (1 << bit)) bits.push(1 << bit);
        return bits;
    });

    const locType = $derived.by(() => {
        if (!objectTarget) return undefined;
        try {
            return host.locTypeLoader.load(objectTarget.locTypeId);
        } catch {
            return undefined;
        }
    });
    const actions = $derived((locType?.actions ?? []).filter((action) => !!action));

    const hex = (rgb: number): string => `#${(rgb & 0xffffff).toString(16).padStart(6, "0")}`;
    const css = (rgb: number): string => `rgb(${(rgb >> 16) & 255}, ${(rgb >> 8) & 255}, ${rgb & 255})`;

    function clearSelection(): void {
        executeEditorCommand("object-selector.clear-selection", { host });
        host.setSelectedTile(undefined);
    }

    /** Loads this tile's underlay, overlay, height and flags into the Tile painter brush (each part can be unticked there). */
    function sendTileToBrush(): void {
        if (tile) getTileBrushModel(host).sendTile(tile);
    }

    const row = "grid grid-cols-[5.5rem_1fr] items-baseline gap-x-2 gap-y-0.5";
    const link = "text-xs text-sky-400 underline-offset-2 hover:underline";
</script>

<div class="map-editor-panel flex min-h-0 flex-1 flex-col overflow-y-auto">
    {#if copyActive}
        <div class="m-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100/90">
            Copy placement active — click the map to place · <span class="font-medium">Esc</span> to cancel
        </div>
    {/if}

    <CollapsibleSection title="Tile">
        <div class="flex flex-col gap-2 px-2.5 pb-3 text-xs">
            <TilePreview {host} target={tileTarget} />
            <div class="flex min-h-[15rem] flex-col gap-2">
            {#if tileTarget}
                <p class="text-muted-foreground">
                    {tileIsSelection ? "Selected" : "Hovered"} tile ·
                    <span class="font-mono tabular-nums text-foreground">({tileTarget.worldX}, {tileTarget.worldY})</span> · plane {tileTarget.level}
                </p>
                {#if tile}
                    <dl class="{row} font-mono tabular-nums">
                        <dt class="text-muted-foreground">Map square</dt>
                        <dd>{Math.floor(tileTarget.worldX / 64)}, {Math.floor(tileTarget.worldY / 64)} · local {((tileTarget.worldX % 64) + 64) % 64}, {((tileTarget.worldY % 64) + 64) % 64}</dd>
                        <dt class="text-muted-foreground">Underlay</dt>
                        <dd class="flex items-center gap-1.5">
                            {#if underlay && underlayId !== undefined}
                                <span class="inline-block size-3 rounded-sm border" style="background: {css(underlay.getRgb())}"></span>
                                #{underlayId} · {hex(underlay.getRgb())}
                            {:else}
                                none
                            {/if}
                        </dd>
                        <dt class="text-muted-foreground">Overlay</dt>
                        <dd class="flex flex-wrap items-center gap-x-1.5">
                            {#if overlay && overlayId !== undefined}
                                <span class="inline-block size-3 rounded-sm border" style="background: {css(overlay.getRgb())}"></span>
                                #{overlayId} · {hex(overlay.getRgb())}{overlay.textureId >= 0 ? ` · texture ${overlay.textureId}` : ""}
                            {:else}
                                none
                            {/if}
                        </dd>
                        {#if overlayId !== undefined}
                            <dt class="text-muted-foreground">Shape</dt>
                            <dd>{tile.s} · rotation {tile.r}</dd>
                        {/if}
                        <dt class="text-muted-foreground">Height</dt>
                        <dd>{tile.h}{tile.hl && tile.hl.length > 1 ? ` · above: ${tile.hl.slice(1).join(", ")}` : ""}</dd>
                        <dt class="text-muted-foreground">Flags</dt>
                        <dd>{tile.f}{flagBits.length > 0 ? ` (bits ${flagBits.join(", ")})` : ""}</dd>
                    </dl>
                    <div class="flex flex-wrap gap-x-3 gap-y-1">
                        <button type="button" class={link} onclick={sendTileToBrush}>Send tile to tile brush</button>
                        {#if tileIsSelection}
                            <button type="button" class={link} onclick={() => host.setSelectedTile(undefined)}>Clear tile</button>
                        {/if}
                    </div>
                {:else}
                    <p class="text-muted-foreground">This tile's region is not loaded.</p>
                {/if}
                {#if tileIsSelection && hoverTile && (hoverTile.worldX !== tileTarget.worldX || hoverTile.worldY !== tileTarget.worldY)}
                    <p class="text-muted-foreground">Hovering ({hoverTile.worldX}, {hoverTile.worldY})</p>
                {/if}
            {:else}
                <p class="text-muted-foreground">Hover or click a tile in the map view.</p>
            {/if}
            </div>
        </div>
    </CollapsibleSection>

    <CollapsibleSection title="Object">
        <div class="flex flex-col gap-2 px-2.5 pb-3 text-xs">
            <ObjectPreview {host} object={objectTarget} />
            <div class="flex min-h-[16rem] flex-col gap-2">
            {#if objectTarget}
                <p class="text-muted-foreground">
                    {objectIsSelection ? "Selected" : "Hovered"} object ·
                    <span class="text-foreground">{locType?.name && locType.name !== "null" ? locType.name : `Loc #${objectTarget.locTypeId}`}</span>
                </p>
                <dl class="{row} font-mono tabular-nums">
                    <dt class="text-muted-foreground">Loc id</dt>
                    <dd>#{objectTarget.locTypeId}</dd>
                    <dt class="text-muted-foreground">Kind</dt>
                    <dd>{objectTarget.kind} · type {objectTarget.locModelType}</dd>
                    <dt class="text-muted-foreground">Position</dt>
                    <dd>map {objectTarget.mapX}, {objectTarget.mapY} · tile {objectTarget.anchorTileX}, {objectTarget.anchorTileY} · plane {objectTarget.level}</dd>
                    <dt class="text-muted-foreground">Rotation</dt>
                    <dd>{objectTarget.rotation & 3} ({(objectTarget.rotation & 3) * 90}°)</dd>
                    {#if locType}
                        <dt class="text-muted-foreground">Size</dt>
                        <dd>{locType.sizeX} × {locType.sizeY} tiles</dd>
                        <dt class="text-muted-foreground">Clipping</dt>
                        <dd>{locType.clipType === 0 ? "none" : locType.clipType === 1 ? "solid" : "standard"}{locType.obstructsGround ? " · obstructs ground" : ""}</dd>
                        <dt class="text-muted-foreground">Actions</dt>
                        <dd>{actions.length > 0 ? actions.join(" · ") : "none"}</dd>
                    {/if}
                </dl>
                {#if objectIsSelection}
                    <div class="flex flex-wrap gap-x-3 gap-y-1">
                        {#if isCopyableObjectKind(objectTarget.kind)}
                            <button type="button" class={link} onclick={() => executeEditorCommand("object-selector.rotate-selected", { host })}>Rotate (R)</button>
                            <button type="button" class={link} onclick={() => executeEditorCommand("object-selector.copy-object", { host })}>Copy (C)</button>
                        {/if}
                        <button type="button" class={link} onclick={clearSelection}>Clear selection</button>
                    </div>
                {/if}
            {:else}
                <p class="text-muted-foreground">Hover or click an object in the map view.</p>
            {/if}
            </div>
        </div>
    </CollapsibleSection>

    <p class="p-3 text-[11px] leading-snug text-muted-foreground">
        Click an object to select it, or bare ground to select a tile. <span class="font-medium">R</span> rotates, <span class="font-medium">C</span> copies, <span class="font-medium">Esc</span> cancels.
    </p>
</div>
