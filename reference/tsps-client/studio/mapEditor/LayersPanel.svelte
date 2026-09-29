<script lang="ts">
    import type { EditModePluginConfig } from "../../game/plugins/editmode/types";
    import { editModePlugin, editModeState } from "./editorState";

    type ToggleKey = {
        [K in keyof EditModePluginConfig]: EditModePluginConfig[K] extends boolean ? K : never;
    }[keyof EditModePluginConfig];

    const HEIGHT_LEVELS = [0, 1, 2, 3];

    const viewToggles: { key: ToggleKey; label: string }[] = [
        { key: "renderAllHeightLevels", label: "Render all height levels" },
        { key: "showMapIcons", label: "Show map icons" },
    ];

    const zoneToggles: { key: ToggleKey; label: string; tone: string }[] = [
        { key: "showPvpZones", label: "PvP", tone: "pvp" },
        { key: "showMultiCombatZones", label: "Multi-combat", tone: "multi" },
        { key: "showDuelZones", label: "Duel", tone: "duel" },
        { key: "showSafeZones", label: "Safe", tone: "safe" },
    ];

    function set(patch: Partial<EditModePluginConfig>): void {
        $editModePlugin?.setConfig(patch);
    }
</script>

<div class="layers">
    {#if $editModeState}
        {@const config = $editModeState.config}
        <section>
            <h2 id="layers-height">Height level</h2>
            <div class="segmented" role="radiogroup" aria-labelledby="layers-height">
                {#each HEIGHT_LEVELS as level (level)}
                    <button
                        type="button"
                        role="radio"
                        aria-checked={config.heightLevel === level}
                        class:active={config.heightLevel === level}
                        onclick={() => set({ heightLevel: level })}
                    >
                        {level}
                    </button>
                {/each}
            </div>
        </section>

        <section>
            <h2>View</h2>
            {#each viewToggles as toggle (toggle.key)}
                <label class="toggle">
                    <input
                        type="checkbox"
                        checked={config[toggle.key]}
                        onchange={(event) => set({ [toggle.key]: event.currentTarget.checked })}
                    />
                    <span>{toggle.label}</span>
                </label>
            {/each}
        </section>

        <section>
            <h2>Zones</h2>
            {#each zoneToggles as toggle (toggle.key)}
                <label class="toggle">
                    <input
                        type="checkbox"
                        checked={config[toggle.key]}
                        onchange={(event) => set({ [toggle.key]: event.currentTarget.checked })}
                    />
                    <span class="swatch" data-tone={toggle.tone} aria-hidden="true"></span>
                    <span>{toggle.label}</span>
                </label>
            {/each}
            {#if $editModeState.world.error}
                <p class="note">Zone data unavailable: {$editModeState.world.error}</p>
            {/if}
        </section>
    {:else}
        <p class="empty">Waiting for the map editor to load…</p>
    {/if}
</div>

<style>
    .layers {
        padding: 12px;
        display: grid;
        gap: 18px;
        align-content: start;
    }

    h2 {
        margin: 0 0 8px;
        color: var(--studio-muted);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }

    .segmented {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        border: 1px solid var(--studio-border);
        border-radius: var(--studio-radius);
        overflow: hidden;
    }

    .segmented button {
        padding: 6px 0;
        border: 0;
        border-left: 1px solid var(--studio-border);
        background: var(--studio-surface);
        color: var(--studio-text);
        font: inherit;
        cursor: pointer;
    }

    .segmented button:first-child {
        border-left: 0;
    }

    .segmented button:hover {
        background: var(--studio-surface-2);
    }

    .segmented button.active {
        background: var(--studio-accent);
        color: var(--studio-accent-text);
        font-weight: 600;
    }

    .segmented button:focus-visible {
        outline: 2px solid var(--studio-focus);
        outline-offset: -2px;
    }

    .toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
        cursor: pointer;
    }

    .toggle input {
        margin: 0;
        accent-color: var(--studio-accent);
    }

    .swatch {
        width: 10px;
        height: 10px;
        border-radius: 2px;
    }

    .swatch[data-tone="pvp"] {
        background: var(--studio-zone-pvp);
    }
    .swatch[data-tone="multi"] {
        background: var(--studio-zone-multi);
    }
    .swatch[data-tone="duel"] {
        background: var(--studio-zone-duel);
    }
    .swatch[data-tone="safe"] {
        background: var(--studio-zone-safe);
    }

    .note,
    .empty {
        margin: 0;
        color: var(--studio-muted);
        font-size: 12px;
    }
</style>
