<script lang="ts">
    import Play from "@lucide/svelte/icons/play";

    import { router } from "../../lib/router.svelte";
    import WorldMapModal from "../../components/rs/WorldMapModal.svelte";
    import { fallbackPreviewDataUrl, type LaunchController } from "../launch.svelte";
    import StartCard from "./StartCard.svelte";

    let { launch }: { launch: LaunchController } = $props();
</script>

<div class="flex h-full min-h-0 w-full items-center justify-center p-6">
    <div class="relative w-full max-w-4xl rounded-xl border border-border bg-card p-6 shadow-sm">
        {#if launch.mapEditor}
            {@const editor = launch.mapEditor}
            <WorldMapModal
                open={launch.isWorldMapOpen}
                onClose={() => (launch.isWorldMapOpen = false)}
                onDoubleClick={(x, y) => launch.onWorldMapDoubleClick(x, y)}
                onRegionSelect={(_mapX, _mapY, regionId) => launch.selectRegionId(regionId)}
                getPosition={() => ({ x: editor.camera.getPosX(), y: editor.camera.getPosZ() })}
                loadMapImageUrl={(mapX, mapY) => editor.getMinimapImageUrl(mapX, mapY)}
            />
        {/if}
        <div class="mb-5 flex items-start justify-between gap-3">
            <div>
                <h1 class="text-xl font-semibold tracking-tight">Map Editor Setup</h1>
                <p class="mt-1 text-sm text-muted-foreground">Choose a start mode before loading the editor. UI only for now.</p>
            </div>
            <button type="button" class="rounded-md border border-border bg-background px-3 py-1.5 text-xs" onclick={() => router.navigate("/map")}>
                Back
            </button>
        </div>
        <div class="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div class="grid gap-4 md:grid-cols-2">
                <StartCard mode="region" title="Region / World Start" ariaLabel="Activate region mode" {launch} />
                <StartCard mode="sandbox" title="Sandbox Mode" ariaLabel="Activate sandbox mode" {launch} />
            </div>
            <aside class="rounded-lg border border-border bg-background/60 p-3">
                <section class="mb-4 rounded-md border border-border bg-card p-2.5">
                    <h3 class="text-sm font-semibold">Load From File</h3>
                    <p class="mt-0.5 text-xs text-muted-foreground">Import a saved map file directly.</p>
                    <input
                        type="file"
                        class="mt-2 block w-full text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-xs"
                        onchange={(event) => (launch.selectedLoadFileName = event.currentTarget.files?.[0]?.name ?? "")}
                    />
                    <div class="mt-2 flex items-center justify-between gap-2">
                        <span class="truncate text-xs text-muted-foreground">{launch.selectedLoadFileName || "No file selected"}</span>
                        <!-- Loading saved map files is not implemented yet; the picker only records a name. -->
                        <button
                            type="button"
                            class="inline-flex items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs opacity-60"
                            disabled
                            title="Coming soon"
                        >
                            <Play class="size-3.5" />
                            Load File
                        </button>
                    </div>
                </section>
                <div class="mb-3 flex items-center justify-between">
                    <h3 class="text-sm font-semibold">Last Loaded</h3>
                    <span class="text-xs text-muted-foreground">{launch.lastLoadedMaps.length} total</span>
                </div>
                <div class="max-h-[460px] space-y-2 overflow-y-auto pr-1">
                    {#each launch.lastLoadedMaps as save (save.id)}
                        <div class="rounded-md border border-border bg-card p-2">
                            <div class="flex items-start gap-2">
                                <img
                                    src={launch.mapEditor?.getMinimapImageUrl(save.mapX, save.mapY) ?? (save.imageUrl || fallbackPreviewDataUrl(`R${save.regionId}`))}
                                    alt="{save.name} preview 64 by 64"
                                    width="64"
                                    height="64"
                                    class="h-16 w-16 rounded-md border border-border object-cover"
                                />
                                <div class="min-w-0 flex-1">
                                    <p class="truncate text-sm font-medium">{save.name}</p>
                                    <p class="mt-0.5 text-xs text-muted-foreground">{save.date}</p>
                                    <p class="mt-0.5 text-[11px] text-muted-foreground">Region {save.regionId} | Radius {save.radius}</p>
                                    <p class="mt-0.5 truncate text-[11px] text-muted-foreground">Cache: {save.cacheProfileName}</p>
                                    <button
                                        type="button"
                                        class="mt-2 inline-flex items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
                                        onclick={() => launch.loadSaved(save)}
                                    >
                                        <Play class="size-3.5" />
                                        Load
                                    </button>
                                </div>
                            </div>
                        </div>
                    {:else}
                        <p class="rounded-md border border-dashed border-border px-2 py-3 text-xs text-muted-foreground">
                            No last loaded entries yet for this cache profile.
                        </p>
                    {/each}
                </div>
            </aside>
        </div>
        <p class="mt-4 text-xs text-muted-foreground">
            Values are staged in UI only for now: target region ({launch.targetRegion || "none"}), radius ({launch.regionRadius}).
        </p>
        {#if launch.isSandboxPostProcessing}
            <div class="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-background/85 backdrop-blur-[1px]">
                <div class="h-[50vh] w-[50vw] min-h-[240px] min-w-[340px] rounded-lg border border-border bg-card p-6 shadow-md">
                    <p class="text-sm font-semibold">Processing Sandbox Terrain</p>
                    <p class="mt-1 text-xs text-muted-foreground">Flattening all loaded tile heights to 0...</p>
                    <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div class="h-full w-1/2 animate-pulse rounded-full bg-primary"></div>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>
