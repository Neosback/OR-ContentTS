<script lang="ts">
    import { onDestroy, onMount } from "svelte";

    import OsrsLoadingBar from "../components/rs/OsrsLoadingBar.svelte";
    import EditorWorkbench from "./EditorWorkbench.svelte";
    import { LaunchController } from "./launch.svelte";
    import LaunchScreen from "./launch/LaunchScreen.svelte";
    import { ProjectSessionController } from "./project-session.svelte";

    const projects = new ProjectSessionController();
    const launch = new LaunchController(projects);
    const progress = $derived(Math.max(0, Math.min(100, launch.loadingProgress)));

    onMount(() => launch.start());
    onDestroy(() => {
        launch.dispose();
        projects.dispose();
    });

    function closeProjectToLaunch(discardChanges: boolean): void {
        projects.closeProject(discardChanges);
        launch.returnToLaunch();
    }
</script>

<div class="App max-height flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    {#if launch.phase === "loading"}
        <div class="center-container max-height">
            <OsrsLoadingBar text={launch.loadingLabel} {progress} />
        </div>
    {:else if launch.phase === "error"}
        <div class="center-container max-height content-text">{launch.errorMessage}</div>
    {:else if launch.pluginHost && launch.rendererActivated}
        <div class="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <EditorWorkbench
                host={launch.pluginHost}
                projectSession={projects}
                onCloseProject={closeProjectToLaunch}
                {launch}
            />
            {#if launch.showLaunchPanel}
                <div class="absolute inset-0 z-50 bg-background">
                    <LaunchScreen {launch} />
                </div>
            {/if}
        </div>
    {:else}
        <LaunchScreen {launch} />
    {/if}
</div>
