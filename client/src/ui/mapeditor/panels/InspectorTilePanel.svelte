<script lang="ts">
    import type { DockviewPanelApi } from "dockview-core";
    import { untrack } from "svelte";

    import { getTileBrushModel } from "../../../mapeditor/plugins/builtins/tile-brush-model";
    import { useEditorState } from "../editor-state.svelte";
    import TilePreview from "../inspector/TilePreview.svelte";
    import PanelFrame from "./PanelFrame.svelte";

    let { api }: { api: DockviewPanelApi } = $props();

    const editor = useEditorState();
    const host = editor.host;

    const selectedTile = $derived(editor.read(() => host.selectedTile));
    const hoverTile = $derived(editor.hud.hoverTile);
    const level = $derived(editor.read(() => host.selectedLevel));

    // What this panel describes: the selected tile, or whatever the cursor is over when nothing is selected.
    const tileTarget = $derived(selectedTile ?? (hoverTile ? { ...hoverTile, level } : undefined));
    const tileIsSelection = $derived(selectedTile !== undefined);

    const tile = $derived(tileTarget ? editor.read(() => host.getTileInfo(tileTarget.level, tileTarget.worldX, tileTarget.worldY)) : undefined);
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

    const hex = (rgb: number): string => `#${(rgb & 0xffffff).toString(16).padStart(6, "0")}`;
    const css = (rgb: number): string => `rgb(${(rgb >> 16) & 255}, ${(rgb >> 8) & 255}, ${rgb & 255})`;

    // Clicking a tile brings this tab forward when it shares a tab group with the Object tab.
    $effect(() => {
        if (!selectedTile) return;
        untrack(() => {
            if (api.group.panels.length > 1) api.setActive();
        });
    });

    /** Quick route: loads this tile's floor, shape, height and flags into the Tile painter brush (each part can be unticked there). */
    function copyTileToBrush(): void {
        if (tile) getTileBrushModel(host).sendTile(tile);
    }

    const row = "grid grid-cols-[5.5rem_1fr] items-baseline gap-x-2 gap-y-0.5";
    const link = "text-xs text-sky-400 underline-offset-2 hover:underline";
</script>

<PanelFrame>
    <div class="map-editor-panel flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 py-2.5 text-xs">
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
                        <button type="button" class={link} title="Load this tile into the Tile painter brush. Alt+click in the 3D view does the same." onclick={copyTileToBrush}>
                            Copy tile into brush
                        </button>
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
                <p class="text-muted-foreground">Hover or click a tile in the 3D view.</p>
            {/if}
        </div>
    </div>
</PanelFrame>
