<script lang="ts">
    import WorldMapModal from "../components/rs/WorldMapModal.svelte";
    import { useEditorState } from "./editor-state.svelte";
    import type { LaunchController } from "./launch.svelte";

    /**
     * The world map over the editor, opened from the minimap's globe. Double-clicking a place goes there: inside the loaded
     * regions the camera just moves; anywhere else Change location opens on that region (the editor only holds the regions
     * it was opened on, so a new place means loading new ones).
     */
    let { launch }: { launch?: LaunchController } = $props();

    const editor = useEditorState();
    const host = editor.host;

    function goTo(worldX: number, worldY: number): void {
        const mapX = Math.floor(worldX / 64);
        const mapY = Math.floor(worldY / 64);
        editor.closeWorldMap();
        if (host.mapManager.mapSquares.has(mapX * 256 + mapY)) {
            host.goToWorldTile(Math.floor(worldX), Math.floor(worldY));
        } else {
            launch?.requestLocationChange(mapX * 256 + mapY);
        }
    }
</script>

<WorldMapModal
    open={editor.worldMapOpen}
    onClose={() => editor.closeWorldMap()}
    onDoubleClick={goTo}
    getPosition={() => ({ x: host.camera.getPosX(), y: host.camera.getPosZ() })}
    loadMapImageBlob={(mapX, mapY) => host.loadMinimapPreviewBlob(mapX, mapY)}
/>
