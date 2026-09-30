<script lang="ts">
    import { onDestroy, onMount } from "svelte";

    import { createStudioDock, type StudioDock } from "../lib/dock";
    import { sveltePanel } from "../lib/panel";
    import MapViewerControls from "./MapViewerControls.svelte";
    import Minimap from "./Minimap.svelte";
    import type { MapViewerUiState } from "./map-viewer-state.svelte";

    let { state: viewerState }: { state: MapViewerUiState } = $props();
    let host = $state<HTMLDivElement>();
    let dock: StudioDock | undefined;

    onMount(() => {
        if (!host) return;
        const panels = [
            sveltePanel({
                id: "controls",
                title: "Controls",
                component: MapViewerControls,
                props: { state: viewerState },
                isolateInput: true,
            }),
            sveltePanel({
                id: "minimap",
                title: "Minimap",
                component: Minimap,
                props: { state: viewerState },
                isolateInput: true,
            }),
        ];

        dock = createStudioDock(host, {
            panels,
            defaultLayout: (workspace) => {
                workspace.open("controls", { panelId: "map-controls", title: "Controls" });
                workspace.open("minimap", {
                    panelId: "map-minimap",
                    title: "Minimap",
                    position: { referencePanel: "map-controls", direction: "within" },
                    inactive: true,
                });
            },
        });
    });

    onDestroy(() => dock?.dispose());
</script>

<div bind:this={host} class="map-viewer-tools-dockview h-full w-full min-h-0 min-w-0"></div>
