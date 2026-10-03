<script lang="ts">
    import WorldMapModal from "../../components/rs/WorldMapModal.svelte";
    import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
    import type { LaunchController } from "../launch.svelte";
    import StartCard from "./StartCard.svelte";

    let { launch }: { launch: LaunchController } = $props();

    // The dialog's open state lives on the controller so the world map can open it too.
    let open = $derived(launch.locationDialogOpen);
    function setOpen(next: boolean): void {
        launch.locationDialogOpen = next;
    }

    // Starting a region keeps this open for the progress bar, then closes it once the editor has the new place loaded.
    let started = false;
    $effect(() => {
        if (!open) {
            started = false;
            return;
        }
        if (launch.isEnteringEditor && launch.launchMode === "region") started = true;
        else if (started && !launch.isEnteringEditor) {
            started = false;
            setOpen(false);
        }
    });

    // Opening it again lands on the current place rather than whatever was typed last time.
    $effect(() => {
        if (open) launch.primeForLocationChange();
    });
</script>

<!-- A modal dialog makes everything outside it inert, so while the world map is open the dialog steps aside (and comes
     back with the region the map picked) instead of covering a map that could not be clicked or dragged. -->
<Dialog
    open={open && !launch.isWorldMapOpen}
    onOpenChange={(next) => {
        if (!launch.isWorldMapOpen) setOpen(next);
    }}
>
    <DialogContent class="max-w-md gap-3 bg-card" aria-describedby="change-location-description">
        <DialogHeader>
            <DialogTitle>Change location</DialogTitle>
            <DialogDescription id="change-location-description">
                Pick another region to edit. Regions outside the new area are unloaded; save your project first if you have changes.
            </DialogDescription>
        </DialogHeader>
        <StartCard mode="region" title="Region / World Start" ariaLabel="Change region" {launch} />
    </DialogContent>
</Dialog>

{#if launch.mapEditor}
    {@const editor = launch.mapEditor}
    <WorldMapModal
        open={launch.isWorldMapOpen && open}
        onClose={() => (launch.isWorldMapOpen = false)}
        onDoubleClick={(x, y) => launch.onWorldMapDoubleClick(x, y)}
        onRegionSelect={(_mapX, _mapY, regionId) => launch.selectRegionId(regionId)}
        getPosition={() => ({ x: editor.camera.getPosX(), y: editor.camera.getPosZ() })}
        loadMapImageBlob={(mapX, mapY) => editor.loadMinimapPreviewBlob(mapX, mapY)}
    />
{/if}
