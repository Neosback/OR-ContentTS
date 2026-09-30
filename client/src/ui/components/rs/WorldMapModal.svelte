<script lang="ts">
    import type { ComponentProps } from "svelte";

    import "../../../components/rs/worldmap/WorldMapModal.css";
    import { escapeClose, portal } from "../../lib/actions";
    import WorldMap from "./WorldMap.svelte";

    type Props = ComponentProps<typeof WorldMap> & { open: boolean; onClose: () => void };

    let { open, onClose, ...mapProps }: Props = $props();
</script>

{#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        use:portal
        use:escapeClose={onClose}
        class="worldmap-modal-overlay"
        onclick={(event) => {
            if (event.target === event.currentTarget) onClose();
        }}
    >
        <div class="worldmap-modal rs-border" role="dialog" aria-modal="true" aria-label="World map">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="worldmap-close-button" onclick={onClose}></div>
            <WorldMap {...mapProps} />
        </div>
    </div>
{/if}
