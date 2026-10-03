<script lang="ts">
    import type { DockviewPanelApi } from "dockview-core";
    import { untrack } from "svelte";

    import { executeEditorCommand } from "../../../mapeditor/commands/editor-command-registry";
    import { locModelTypeName } from "../../../mapeditor/object-properties";
    import { isCopyableObjectKind } from "../../../mapeditor/plugins/builtins/object-copy-placement";
    import { notifyMessage } from "../../lib/notify";
    import { objectProperties, openObjectProperties } from "../object-properties-window.svelte";
    import { useEditorState } from "../editor-state.svelte";
    import ObjectPreview from "../inspector/ObjectPreview.svelte";
    import PanelFrame from "./PanelFrame.svelte";

    let { api }: { api: DockviewPanelApi } = $props();

    const editor = useEditorState();
    const host = editor.host;

    const selectedObject = $derived(editor.read(() => host.selectedObject));
    const hoveredObject = $derived(editor.read(() => host.hoveredObject));
    const copyActive = $derived(editor.read(() => host.isObjectCopyPlacementActive() && !!host.getObjectCopyTemplate()));

    // What this panel describes: the selection, or whatever the cursor is over when nothing is selected.
    const objectTarget = $derived(selectedObject ?? hoveredObject);
    const objectIsSelection = $derived(selectedObject !== undefined);

    const locType = $derived.by(() => {
        if (!objectTarget) return undefined;
        try {
            return host.locTypeLoader.load(objectTarget.locTypeId);
        } catch {
            return undefined;
        }
    });
    const actions = $derived((locType?.actions ?? []).filter((action) => !!action));

    // Clicking an object brings this tab forward when it shares a tab group with the Tile tab.
    $effect(() => {
        if (!selectedObject) return;
        untrack(() => {
            if (api.group.panels.length > 1) api.setActive();
        });
    });

    // Where the object stands in world tile coordinates, and the tiles it covers once rotated.
    const worldTile = $derived(objectTarget ? { x: objectTarget.mapX * 64 + objectTarget.anchorTileX, y: objectTarget.mapY * 64 + objectTarget.anchorTileY } : undefined);
    const regionId = $derived(objectTarget ? (objectTarget.mapX << 8) | objectTarget.mapY : 0);
    const footprint = $derived.by(() => {
        if (!locType || !objectTarget) return undefined;
        return (objectTarget.rotation & 1) === 1 ? { x: locType.sizeY, y: locType.sizeX } : { x: locType.sizeX, y: locType.sizeY };
    });
    const modelCount = $derived((locType?.models ?? []).reduce((total, ids) => total + ids.length, 0));
    const recolours = $derived((locType?.recolorFrom?.length ?? 0) + (locType?.retextureFrom?.length ?? 0));

    async function copyText(text: string, what: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(text);
            notifyMessage(`Copied ${what}.`);
        } catch {
            notifyMessage("Could not copy to the clipboard.");
        }
    }

    function clearSelection(): void {
        executeEditorCommand("object-selector.clear-selection", { host });
        host.setSelectedTile(undefined);
    }

    const row = "grid grid-cols-[5.5rem_1fr] items-baseline gap-x-2 gap-y-0.5";
    const link = "text-xs text-sky-400 underline-offset-2 hover:underline";
</script>

<PanelFrame>
    <div class="map-editor-panel flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 py-2.5 text-xs">
        {#if copyActive}
            <div class="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100/90">
                Copy placement active — click the map to place · <span class="font-medium">Esc</span> to cancel
            </div>
        {/if}
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
                    <dd>{objectTarget.kind} · {locModelTypeName(objectTarget.locModelType)}</dd>
                    <dt class="text-muted-foreground">World tile</dt>
                    <dd>{worldTile?.x}, {worldTile?.y} · plane {objectTarget.level}</dd>
                    <dt class="text-muted-foreground">Region</dt>
                    <dd>{regionId} · map {objectTarget.mapX}, {objectTarget.mapY} · tile {objectTarget.anchorTileX}, {objectTarget.anchorTileY}</dd>
                    <dt class="text-muted-foreground">Rotation</dt>
                    <dd>{objectTarget.rotation & 3} ({(objectTarget.rotation & 3) * 90}°)</dd>
                    {#if locType}
                        <dt class="text-muted-foreground">Size</dt>
                        <dd>{locType.sizeX} × {locType.sizeY} tiles{footprint && (footprint.x !== locType.sizeX || footprint.y !== locType.sizeY) ? ` · covers ${footprint.x} × ${footprint.y} as placed` : ""}</dd>
                        <dt class="text-muted-foreground">Clipping</dt>
                        <dd>{locType.clipType === 0 ? "none" : locType.clipType === 1 ? "solid" : "standard"}{locType.obstructsGround ? " · obstructs ground" : ""}{locType.blocksProjectile ? "" : " · lets projectiles through"}</dd>
                        <dt class="text-muted-foreground">Models</dt>
                        <dd>{modelCount} model{modelCount === 1 ? "" : "s"}{recolours > 0 ? ` · ${recolours} recolour/retexture` : ""}</dd>
                        {#if locType.seqId >= 0}
                            <dt class="text-muted-foreground">Animation</dt>
                            <dd>sequence {locType.seqId}</dd>
                        {/if}
                        {#if locType.transforms && locType.transforms.length > 0}
                            <dt class="text-muted-foreground">Transforms</dt>
                            <dd>{locType.transforms.length} · varbit {locType.transformVarbit < 0 ? "none" : locType.transformVarbit} · varp {locType.transformVarp < 0 ? "none" : locType.transformVarp}</dd>
                        {/if}
                        <dt class="text-muted-foreground">Actions</dt>
                        <dd>{actions.length > 0 ? actions.join(" · ") : "none"}</dd>
                    {/if}
                </dl>
                <div class="flex flex-wrap gap-x-3 gap-y-1">
                    <button type="button" class={link} onclick={openObjectProperties} aria-pressed={objectProperties.open}>Properties…</button>
                    <button type="button" class={link} onclick={() => void copyText(String(objectTarget.locTypeId), "the loc id")}>Copy id</button>
                    <button type="button" class={link} onclick={() => void copyText(`${worldTile?.x}, ${worldTile?.y}, ${objectTarget.level}`, "the world position")}>Copy position</button>
                </div>
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
                <p class="text-muted-foreground">Hover or click an object in the 3D view.</p>
            {/if}
        </div>
        <p class="mt-auto pt-2 text-[11px] leading-snug text-muted-foreground">
            Click an object to select it, or bare ground to select a tile. <span class="font-medium">R</span> rotates, <span class="font-medium">C</span> copies, <span class="font-medium">Esc</span> cancels.
        </p>
    </div>
</PanelFrame>
