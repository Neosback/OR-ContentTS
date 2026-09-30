<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import nipplejs from "nipplejs";

    import type { MapViewerUiState } from "./map-viewer-state.svelte";

    let { state: viewerState }: { state: MapViewerUiState } = $props();
    let movementZone = $state<HTMLDivElement>();
    let cameraZone = $state<HTMLDivElement>();
    const managers: Array<ReturnType<typeof nipplejs.create>> = [];

    function bind(
        zone: HTMLElement,
        move: (event: object) => void,
        stop: (event: object) => void,
    ): void {
        const manager = nipplejs.create({
            zone,
            mode: "static",
            position: { left: "50%", top: "50%" },
            size: 75,
            color: "#007BFF",
        });
        manager.on("move", (event) => {
            const data = event.data;
            const radians = ((data.angle?.degree ?? 0) * Math.PI) / 180;
            const force = data.force ?? 0;
            move({
                type: "move",
                x: Math.cos(radians) * force,
                y: Math.sin(radians) * force,
                direction: data.direction?.angle ?? null,
                distance: data.distance ?? 0,
            });
        });
        manager.on("end", () => stop({ type: "stop" }));
        managers.push(manager);
    }

    onMount(() => {
        if (movementZone) {
            bind(
                movementZone,
                viewerState.mapViewer.inputManager.onPositionJoystickMove,
                viewerState.mapViewer.inputManager.onPositionJoystickStop,
            );
        }
        if (cameraZone) {
            bind(
                cameraZone,
                viewerState.mapViewer.inputManager.onCameraJoystickMove,
                viewerState.mapViewer.inputManager.onCameraJoystickStop,
            );
        }
    });

    onDestroy(() => {
        for (const manager of managers) manager.destroy();
        managers.length = 0;
    });
</script>

<div class="joystick-container left">
    <div bind:this={movementZone} class="h-[75px] w-[75px]" aria-label="Movement joystick"></div>
</div>
<div class="joystick-container right">
    <div bind:this={cameraZone} class="h-[75px] w-[75px]" aria-label="Camera joystick"></div>
</div>
