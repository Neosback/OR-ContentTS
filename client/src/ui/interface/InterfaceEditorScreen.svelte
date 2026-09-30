<script lang="ts">
    import { onDestroy, onMount } from "svelte";

    import { InterfaceViewer } from "../../interface/InterfaceViewer";
    import { getActiveProfileIdAsync, loadLocalCacheProfilesAsync } from "../../lib/local-cache-profiles";
    import { resolveActiveProfileCache } from "../../lib/resolve-active-profile-cache";
    import OsrsLoadingBar from "../components/rs/OsrsLoadingBar.svelte";
    import { router } from "../lib/router.svelte";
    import InterfaceWorkbench from "./InterfaceWorkbench.svelte";
    import { InterfaceEditorState } from "./interface-editor-state.svelte";

    let loadingLabel = $state("Loading selected cache...");
    let loadingProgress = $state(0);
    let errorMessage = $state<string>();
    let state = $state<InterfaceEditorState>();
    let abortController: AbortController | undefined;

    async function load(): Promise<void> {
        const controller = new AbortController();
        abortController = controller;

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

        loadingLabel = "Decoding interfaces and preloading assets...";
        loadingProgress = 82;
        let viewer: InterfaceViewer;
        try {
            viewer = new InterfaceViewer(resolvedCache);
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : "Failed to open cache for the interface viewer.";
            return;
        }
        if (controller.signal.aborted) return;

        loadingLabel = "Starting interface viewer...";
        loadingProgress = 100;
        state = new InterfaceEditorState(viewer);
    }

    onMount(() => {
        void load().catch((error) => {
            if (abortController?.signal.aborted) return;
            console.error(error);
            errorMessage = error instanceof Error ? error.message : "Failed to load selected cache.";
        });
    });

    onDestroy(() => {
        abortController?.abort("component-unmount");
        state?.dispose();
    });

    const progress = $derived(Math.max(0, Math.min(100, loadingProgress)));
</script>

<div class="App max-height flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    {#if errorMessage}
        <div class="center-container max-height content-text">{errorMessage}</div>
    {:else if state}
        <InterfaceWorkbench {state} />
    {:else}
        <div class="center-container max-height">
            <OsrsLoadingBar text={`${loadingLabel} - ${progress}%`} {progress} />
        </div>
    {/if}
</div>
