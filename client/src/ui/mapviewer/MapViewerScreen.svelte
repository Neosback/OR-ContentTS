<script module lang="ts">
    import { registerSerializer } from "threads";

    import { renderDataLoaderSerializer } from "../../mapviewer/worker/RenderDataLoader";

    let serializerRegistered = false;

    function ensureViewerSerializer(): void {
        if (!serializerRegistered) {
            registerSerializer(renderDataLoaderSerializer);
            serializerRegistered = true;
        }
    }
</script>

<script lang="ts">
    import { onDestroy, onMount } from "svelte";

    import OsrsLoadingBar from "../components/rs/OsrsLoadingBar.svelte";
    import { router } from "../lib/router.svelte";
    import { isIos } from "../../util/DeviceUtil";
    import { getActiveProfileIdAsync, loadLocalCacheProfilesAsync } from "../../lib/local-cache-profiles";
    import { resolveActiveProfileCache } from "../../lib/resolve-active-profile-cache";
    import { getMapRenderWorkerPool } from "../../mapviewer/map-render-worker-pool";
    import { MapViewer } from "../../mapviewer/MapViewer";
    import { getAvailableRenderers } from "../../mapviewer/MapViewerRenderers";
    import { defaultWorldSource } from "../../world/default-world-source";
    import MapViewerContainer from "./MapViewerContainer.svelte";
    import { MapViewerUiState } from "./map-viewer-state.svelte";

    let loadingLabel = $state("Loading selected cache...");
    let loadingProgress = $state(0);
    let errorMessage = $state<string>();
    let uiState = $state<MapViewerUiState>();
    let abortController: AbortController | undefined;

    function isAbortError(error: unknown): boolean {
        return error instanceof DOMException && error.name === "AbortError";
    }

    async function load(): Promise<void> {
        const controller = new AbortController();
        abortController = controller;
        ensureViewerSerializer();

        loadingLabel = "Resolving cache profile...";
        loadingProgress = 10;

        const [profiles, activeProfileId] = await Promise.all([
            loadLocalCacheProfilesAsync(),
            getActiveProfileIdAsync(),
        ]);
        if (controller.signal.aborted) return;

        if (!activeProfileId) {
            errorMessage = "No cache selected. Pick one in Cache Repository.";
            return;
        }
        const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
        if (!activeProfile) {
            errorMessage = "Selected cache profile missing. Re-select in Cache Repository.";
            return;
        }

        loadingLabel = `Loading "${activeProfile.name}" cache...`;
        loadingProgress = 30;

        const resolvedCache = await resolveActiveProfileCache(activeProfile);
        if (controller.signal.aborted) return;
        if (!resolvedCache) {
            const returnTo = `${router.path}${router.search}`;
            router.navigate(`/cache-test?autoload=1&returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
            return;
        }

        loadingLabel = `Using "${activeProfile.name}" cache...`;
        loadingProgress = 45;

        loadingLabel = "Loading world data...";
        loadingProgress = 70;

        const worldData = await defaultWorldSource.loadWorld(
            { cacheInfo: resolvedCache.info },
            { signal: controller.signal },
        );
        loadingProgress = 86;

        const cache = resolvedCache;
        const { objSpawns, npcSpawns } = worldData;
        if (controller.signal.aborted) return;

        const mapImageCache = await window.caches.open("map-images");
        const availableRenderers = getAvailableRenderers();
        if (availableRenderers.length === 0) {
            errorMessage = "No renderers available";
            return;
        }

        const mapViewer = new MapViewer(
            getMapRenderWorkerPool(),
            { caches: [cache.info], latest: cache.info },
            objSpawns,
            npcSpawns,
            mapImageCache,
            availableRenderers[0]!,
            cache,
        );
        mapViewer.applySearchParams(new URLSearchParams(router.search));
        mapViewer.init();

        loadingLabel = "Starting renderer...";
        loadingProgress = 100;
        uiState = new MapViewerUiState(mapViewer);
    }

    onMount(() => {
        if (isIos) {
            errorMessage = "iOS is not supported.";
            return;
        }
        void load().catch((error) => {
            if (isAbortError(error) || abortController?.signal.aborted) return;
            console.error(error);
            errorMessage =
                error instanceof Error
                    ? error.message
                    : "Failed to load selected cache. Import it in Cache Repository.";
        });
    });

    onDestroy(() => {
        if (abortController && !abortController.signal.aborted) abortController.abort("component-unmount");
        uiState?.stop();
    });

    const progress = $derived(Math.max(0, Math.min(100, loadingProgress)));
</script>

<div class="App max-height flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    {#if errorMessage}
        <div class="center-container max-height content-text">{errorMessage}</div>
    {:else if uiState}
        <MapViewerContainer state={uiState} />
    {:else}
        <div class="center-container max-height">
            <OsrsLoadingBar text={`${loadingLabel} - ${progress}%`} {progress} />
        </div>
    {/if}
</div>
