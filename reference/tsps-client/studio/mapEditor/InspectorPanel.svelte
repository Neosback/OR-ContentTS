<script lang="ts">
    import {
        BUILDING_SHAPES,
        BUILDING_STYLES,
        type BuildingShape,
        type BuildingStyle,
    } from "../../game/plugins/editmode/BuildingGenerator";
    import type { EditModeSelection } from "../../game/plugins/editmode/types";
    import DefinitionFields from "./DefinitionFields.svelte";
    import { editModePlugin, editModeState } from "./editorState";

    let buildingStyle = $state<BuildingStyle>("Varrock");
    let buildingShape = $state<BuildingShape>("Rectangle");
    let buildingFloors = $state(1);
    let capture = $state<{ key: string; dataUrl?: string; loading: boolean }>();
    let status = $state<{ key: string; text: string }>();

    const plugin = $derived($editModePlugin);
    const editorState = $derived($editModeState);
    const selection = $derived(editorState?.selection);
    const key = $derived(selection ? selectionKey(selection) : "");

    const isEntity = $derived(selection?.kind === "loc" || selection?.kind === "npc");
    const isGround = $derived(!!selection && selection.kind !== "building" && !isEntity);
    const hasRange = $derived(
        !!selection &&
            selection.tileEndX !== undefined &&
            selection.tileEndY !== undefined &&
            (selection.tileEndX !== selection.tileX || selection.tileEndY !== selection.tileY),
    );
    const rangeWidth = $derived(hasRange && selection ? Math.abs(selection.tileEndX! - selection.tileX) + 1 : 0);
    const rangeDepth = $derived(hasRange && selection ? Math.abs(selection.tileEndY! - selection.tileY) + 1 : 0);
    const canBuild = $derived(rangeWidth > 2 && rangeDepth > 2 && selection?.plane === 0);
    // Read `editorState` so these re-evaluate on every plugin commit.
    const canIsland = $derived(editorState && hasRange && plugin ? plugin.canGenerateIsland() : false);
    const definition = $derived(
        editorState && selection && isEntity && plugin
            ? plugin.describeDefinition(selection.kind as "loc" | "npc", selection.locId)
            : undefined,
    );
    const menuOptions = $derived.by(() => {
        if (!selection || !definition || !plugin) return [];
        if (selection.kind === "npc") {
            return [...plugin.getNpcMenuOptions(selection.locId).map((option) => option.option), "Examine"];
        }
        const actions = definition.fields.find(([name]) => name === "actions")?.[1];
        return [...(actions && actions !== "—" ? actions.split(", ") : []), "Examine"];
    });

    function selectionKey(value: EditModeSelection): string {
        return `${value.kind}:${value.locId}:${value.tileX}:${value.tileY}:${value.plane}:${value.tileEndX}:${value.tileEndY}`;
    }

    function title(value: EditModeSelection): string {
        if (value.kind === "building") return "Building";
        if (value.locId >= 0) {
            const name = value.locName || (value.kind === "npc" ? "Unknown NPC" : "Unknown object");
            return `${name} · ${value.kind === "npc" ? "NPC" : "ID"} ${value.locId}`;
        }
        return hasRange ? "Ground tiles" : "Ground tile";
    }

    function location(value: EditModeSelection): string {
        if (value.kind === "building") {
            return `World ${value.tileX}, ${value.tileY} → ${value.tileEndX}, ${value.tileEndY} · planes ${value.plane}–${value.planeEnd ?? value.plane}`;
        }
        return hasRange
            ? `World ${value.tileX}, ${value.tileY} → ${value.tileEndX}, ${value.tileEndY}, ${value.plane}`
            : `World ${value.tileX}, ${value.tileY}, ${value.plane}`;
    }

    async function copyText(text: () => string, done: string): Promise<void> {
        const at = key;
        try {
            await navigator.clipboard.writeText(text());
            status = { key: at, text: done };
        } catch (error) {
            status = { key: at, text: `Copy failed: ${error instanceof Error ? error.message : String(error)}` };
        }
    }

    function captureImage(): void {
        if (!plugin) return;
        const at = key;
        capture = { key: at, loading: true };
        void plugin.captureSelectionImage().then((dataUrl) => {
            if (capture?.key !== at) return;
            capture = dataUrl ? { key: at, dataUrl, loading: false } : undefined;
        });
    }
</script>

<div class="inspector">
    {#if !editorState || !plugin}
        <p class="studio-empty">Waiting for the map editor to load…</p>
    {:else if !selection}
        <p class="studio-empty">Nothing selected. Click a tile, object or NPC in the scene.</p>
    {:else}
        <header>
            <h2>{title(selection)}</h2>
            <p>{location(selection)}</p>
        </header>

        {#if selection.kind === "building"}
            <dl class="facts">
                <dt>Shape</dt>
                <dd>{selection.buildingShape ?? "Building"} · {selection.buildingWidth} × {selection.buildingDepth} tiles</dd>
                <dt>Floors</dt>
                <dd>{selection.buildingFloors} · {selection.buildingTileCount} selected tiles</dd>
                <dt>Objects</dt>
                <dd>
                    {selection.buildingObjectCount} total · {selection.buildingWallCount} walls/corners ·
                    {selection.buildingDoorCount} doors · {selection.buildingRoofCount} roof ·
                    {selection.buildingDecorationCount} decorations · {selection.buildingOtherCount} other
                </dd>
                <dt>Wall type</dt>
                <dd>{selection.buildingWallId === undefined ? "Mixed/unknown" : `ID ${selection.buildingWallId}`}</dd>
            </dl>
            <div class="actions">
                <button
                    type="button"
                    class="studio-button"
                    disabled={!selection.buildingProfile}
                    onclick={() => copyText(() => `${JSON.stringify(selection.buildingProfile, null, 2)}\n`, "Building copied")}
                >
                    Copy building profile
                </button>
            </div>
        {:else}
            <p class="meta">
                {selection.kind === "loc" && selection.rotation !== undefined
                    ? `Object rotation ${selection.rotation}`
                    : `Placement rotation ${editorState.config.rotation}`}
            </p>

            {#if menuOptions.length > 0}
                <ul class="menu" aria-label="Right-click options">
                    {#each menuOptions as option, index (index)}
                        <li><span class="option">{option}</span> <span class="target" class:npc={selection.kind === "npc"}>{selection.locName}</span></li>
                    {/each}
                </ul>
            {/if}

            <div class="actions">
                {#if isGround}
                    <button type="button" class="studio-button" onclick={() => plugin.paintSelection()}>Paint overlay</button>
                {/if}
                {#if selection.kind === "loc"}
                    <button type="button" class="studio-button" onclick={() => plugin.rotateSelection()}>Rotate</button>
                    <button type="button" class="studio-button" onclick={() => plugin.duplicateSelection()}>Duplicate</button>
                    <button type="button" class="studio-button danger" onclick={() => plugin.deleteSelection()}>Delete</button>
                {/if}
                {#if isEntity}
                    <button type="button" class="studio-button" disabled={capture?.key === key && capture.loading} onclick={captureImage}>
                        {capture?.key === key && capture.loading ? "Capturing…" : "Capture image"}
                    </button>
                {/if}
                {#if isGround && !hasRange}
                    <button
                        type="button"
                        class="studio-button"
                        disabled={!editorState.world.definition}
                        title={editorState.world.definition ? undefined : "Needs world data from a server or project"}
                        onclick={() => plugin.setSpawnPoint()}
                    >
                        Set spawn point
                    </button>
                {/if}
                {#if hasRange}
                    <button type="button" class="studio-button" onclick={() => copyText(() => plugin.copyArea(), "Area copied")}>Copy area</button>
                    <button type="button" class="studio-button danger" onclick={() => plugin.clearArea()}>Clear area</button>
                    <button type="button" class="studio-button" onclick={() => plugin.flattenArea()}>Flatten area</button>
                    {#if canIsland}
                        <button type="button" class="studio-button" onclick={() => plugin.generateIsland()}>Generate island</button>
                    {/if}
                {/if}
            </div>

            {#if canBuild}
                <section class="generator">
                    <h3 class="studio-section-title">Generate building</h3>
                    <div class="options">
                        <select class="studio-input" aria-label="Building style" bind:value={buildingStyle}>
                            {#each BUILDING_STYLES as name (name)}<option value={name}>{name}</option>{/each}
                        </select>
                        <select class="studio-input" aria-label="Floors" bind:value={buildingFloors}>
                            {#each [1, 2, 3] as count (count)}<option value={count}>{count} floor{count === 1 ? "" : "s"}</option>{/each}
                        </select>
                        <select class="studio-input" aria-label="Building shape" bind:value={buildingShape}>
                            {#each BUILDING_SHAPES as name (name)}<option value={name}>{name}</option>{/each}
                        </select>
                    </div>
                    <button
                        type="button"
                        class="studio-button"
                        onclick={() => plugin.generateBuilding(buildingStyle, buildingFloors, buildingShape)}
                    >
                        Generate
                    </button>
                </section>
            {/if}

            {#if capture?.key === key && capture.dataUrl}
                <img class="capture" src={capture.dataUrl} alt={`Captured ${selection.kind === "npc" ? "NPC" : "object"} image`} />
            {/if}

            {#if definition}
                <details class="definition">
                    <summary>Definition</summary>
                    <DefinitionFields {definition} />
                </details>
            {/if}
        {/if}

        {#if status?.key === key}
            <p class="status" role="status">{status.text}</p>
        {/if}
    {/if}
</div>

<style>
    .inspector {
        display: grid;
        gap: 10px;
        align-content: start;
        padding: 12px;
    }

    header h2 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
    }

    header p,
    .meta {
        margin: 2px 0 0;
        color: var(--studio-muted);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
    }

    .meta {
        margin: 0;
    }

    .facts {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 4px 10px;
        margin: 0;
        font-size: 12px;
    }

    .facts dt {
        color: var(--studio-muted);
    }

    .facts dd {
        margin: 0;
    }

    /* Mirrors the in-game right-click menu so options read at a glance. */
    .menu {
        margin: 0;
        padding: 4px 6px;
        border-radius: 4px;
        background: #5d5447;
        color: #fff;
        font: bold 12px/1.5 Arial, Helvetica, sans-serif;
        text-shadow: 1px 1px #000;
        list-style: none;
    }

    .target {
        color: #00ffff;
    }

    .target.npc {
        color: #ffff00;
    }

    .actions {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 6px;
    }

    .generator {
        display: grid;
        gap: 6px;
        padding-top: 8px;
        border-top: 1px solid var(--studio-border);
    }

    .generator h3 {
        margin: 0;
    }

    .options {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
    }

    .capture {
        display: block;
        width: 100%;
        max-height: 240px;
        object-fit: contain;
        border-radius: 4px;
        background: var(--studio-surface-2);
    }

    .definition summary {
        cursor: pointer;
        color: var(--studio-muted);
        font-size: 12px;
    }

    .status {
        margin: 0;
        color: var(--studio-muted);
        font-size: 12px;
    }
</style>
