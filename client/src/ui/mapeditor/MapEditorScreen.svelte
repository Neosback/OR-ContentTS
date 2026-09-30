<script lang="ts">
    import { onDestroy, onMount } from "svelte";

    import OsrsLoadingBar from "../components/rs/OsrsLoadingBar.svelte";
    import { LaunchController } from "./launch.svelte";
    import LaunchScreen from "./launch/LaunchScreen.svelte";
    import EditorWorkbench from "./EditorWorkbench.svelte";

    const launch = new LaunchController();
    const progress = $derived(Math.max(0, Math.min(100, launch.loadingProgress)));

    onMount(() => launch.start());
    onDestroy(() => launch.dispose());
</script>

<div class="App max-height flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    {#if launch.phase === "loading"}
        <div class="center-container max-height">
            <OsrsLoadingBar text={launch.loadingLabel} {progress} />
        </div>
    {:else if launch.phase === "launch"}
        <LaunchScreen {launch} />
    {:else if launch.phase === "error"}
        <div class="center-container max-height content-text">{launch.errorMessage}</div>
    {:else if launch.pluginHost}
        <EditorWorkbench host={launch.pluginHost} />
    {/if}
</div>
