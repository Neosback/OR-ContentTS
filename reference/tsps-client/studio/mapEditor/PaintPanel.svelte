<script lang="ts">
    import type { EditModeOverlaySwatch } from "../../game/plugins/editmode/types";
    import { editModePlugin, editModeState } from "./editorState";

    const CLEAR: EditModeOverlaySwatch = { id: 0, colorRgb: 0x27303a, name: "Clear" };

    const RETRY_MS = 1000;

    const overlayId = $derived($editModeState?.config.overlayId);
    let swatches = $state<EditModeOverlaySwatch[]>([]);

    // Overlay definitions come from the cache, which may still be streaming when
    // the plugin appears; read them once they exist rather than on every commit.
    $effect(() => {
        const plugin = $editModePlugin;
        if (!plugin) return;
        const read = (): boolean => {
            const loaded = plugin.getOverlaySwatches();
            swatches = [CLEAR, ...loaded];
            return loaded.length > 0;
        };
        if (read()) return;
        const timer = window.setInterval(() => {
            if (read()) window.clearInterval(timer);
        }, RETRY_MS);
        return () => window.clearInterval(timer);
    });

    function hex(rgb: number): string {
        return `#${(rgb & 0xffffff).toString(16).padStart(6, "0")}`;
    }

    function label(swatch: EditModeOverlaySwatch): string {
        return swatch.name ? `Overlay ${swatch.id} · ${swatch.name}` : `Overlay ${swatch.id}`;
    }
</script>

<div class="paint">
    {#if $editModeState}
        <h2 class="studio-section-title">Terrain overlay</h2>
        <p class="studio-empty">Used by “Paint overlay” in the Inspector and by the path tool.</p>
        <div class="swatches" role="radiogroup" aria-label="Terrain overlay">
            {#each swatches as swatch (swatch.id)}
                <button
                    type="button"
                    role="radio"
                    aria-checked={swatch.id === overlayId}
                    class:active={swatch.id === overlayId}
                    style:background={hex(swatch.colorRgb)}
                    title={label(swatch)}
                    aria-label={label(swatch)}
                    onclick={() => $editModePlugin?.setConfig({ overlayId: swatch.id })}
                >
                    {swatch.id}
                </button>
            {/each}
        </div>
    {:else}
        <p class="studio-empty">Waiting for the map editor to load…</p>
    {/if}
</div>

<style>
    .paint {
        display: grid;
        gap: 8px;
        align-content: start;
        padding: 12px;
    }

    .paint h2 {
        margin: 0;
    }

    .swatches {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
        gap: 5px;
        margin-top: 4px;
    }

    .swatches button {
        height: 36px;
        padding: 0;
        border: 2px solid transparent;
        border-radius: 4px;
        color: #fff;
        font: 11px/1 var(--studio-font);
        text-shadow: 0 1px 2px #000;
        cursor: pointer;
    }

    .swatches button.active {
        border-color: var(--studio-accent);
        box-shadow: 0 0 0 1px var(--studio-bg);
    }

    .swatches button:focus-visible {
        outline: 2px solid var(--studio-focus);
        outline-offset: 1px;
    }
</style>
