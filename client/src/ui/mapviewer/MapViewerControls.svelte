<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { vec3 } from "gl-matrix";

    import { lerp, slerp } from "../../util/MathUtil";
    import { ProjectionType, type CameraView } from "../../mapviewer/Camera";
    import {
        createRenderer,
        getAvailableRenderers,
        getRendererName,
        type MapViewerRendererType,
    } from "../../mapviewer/MapViewerRenderers";
    import type { MapViewerUiState } from "./map-viewer-state.svelte";

    enum VarType {
        VARP = 0,
        VARBIT = 1,
    }

    let { state }: { state: MapViewerUiState } = $props();
    const mapViewer = state.mapViewer;

    let projectionType = $state(mapViewer.camera.projectionType);
    let fov = $state(mapViewer.camera.fov);
    let orthoZoom = $state(mapViewer.camera.orthoZoom);
    let cameraSpeed = $state(mapViewer.cameraSpeed);
    let renderDistance = $state(mapViewer.renderDistance);
    let unloadDistance = $state(mapViewer.unloadDistance);
    let lodDistance = $state(mapViewer.lodDistance);
    let varType = $state<VarType>(VarType.VARBIT);
    let varId = $state(0);
    let varValue = $state(0);
    let animationDuration = $state(10);
    let cameraPoints = $state<CameraView[]>([]);
    let cameraRunning = $state(false);
    let animationRaf = 0;

    const rendererOptions = getAvailableRenderers().map((type) => ({ value: type, label: getRendererName(type) }));

    function addCameraPoint(): void {
        cameraPoints = [
            ...cameraPoints,
            {
                position: vec3.fromValues(mapViewer.camera.pos[0], mapViewer.camera.pos[1], mapViewer.camera.pos[2]),
                pitch: mapViewer.camera.pitch,
                yaw: mapViewer.camera.yaw,
                fov: mapViewer.camera.fov,
                orthoZoom: mapViewer.camera.orthoZoom,
            },
        ];
    }

    function deleteLastPoint(): void {
        cameraPoints = cameraPoints.slice(0, -1);
    }

    function stopCamera(): void {
        cameraRunning = false;
        if (animationRaf) cancelAnimationFrame(animationRaf);
        animationRaf = 0;
    }

    function startCamera(): void {
        const segmentCount = cameraPoints.length - 1;
        if (segmentCount <= 0) {
            stopCamera();
            return;
        }
        stopCamera();
        cameraRunning = true;
        let start: number | undefined;
        const animate = (time: number): void => {
            if (!cameraRunning) return;
            start ??= time;
            const elapsed = time - start;
            const overall = elapsed / (Math.max(1, animationDuration) * 1000);
            const startIndex = Math.floor(overall * segmentCount);
            const to = cameraPoints[startIndex + 1];
            const from = cameraPoints[startIndex];
            if (elapsed > animationDuration * 1000 || !from || !to) {
                mapViewer.setCamera(cameraPoints[cameraPoints.length - 1]!);
                stopCamera();
                return;
            }
            const local = (overall * segmentCount) % 1;
            mapViewer.setCamera({
                position: vec3.fromValues(
                    lerp(from.position[0], to.position[0], local),
                    lerp(from.position[1], to.position[1], local),
                    lerp(from.position[2], to.position[2], local),
                ),
                pitch: lerp(from.pitch, to.pitch, local),
                yaw: slerp(from.yaw, to.yaw, local, 2048),
                fov: lerp(from.fov, to.fov, local),
                orthoZoom: lerp(from.orthoZoom, to.orthoZoom, local),
            });
            animationRaf = requestAnimationFrame(animate);
        };
        animationRaf = requestAnimationFrame(animate);
    }

    function toggleCamera(): void {
        if (cameraRunning) stopCamera();
        else startCamera();
    }

    function applyVar(): void {
        const updated =
            varType === VarType.VARP
                ? mapViewer.varManager.setVarp(varId, varValue)
                : mapViewer.varManager.setVarbit(varId, varValue);
        if (updated) {
            mapViewer.updateVars();
            mapViewer.renderer.mapManager.clearMaps();
        }
    }

    function clearVars(): void {
        mapViewer.varManager.clear();
        mapViewer.updateVars();
        mapViewer.renderer.mapManager.clearMaps();
    }

    onMount(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.repeat) return;
            if (event.key === "F2") toggleCamera();
            else if (event.key === "F3") addCameraPoint();
            else if (event.key === "F4") deleteLastPoint();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    });

    onDestroy(stopCamera);
</script>

<div class="map-controls-panel flex h-full max-h-full min-h-0 flex-col overflow-hidden">
    <div class="flex items-center justify-between border-b border-border bg-muted/30 px-2.5 py-1.5">
        <p class="text-[11px] font-semibold tracking-wide text-muted-foreground">Map Controls</p>
        <button type="button" class="rounded-md border border-input px-1.5 py-0.5 text-[10px] hover:bg-background" onclick={() => state.toggleUi()}>
            Hide UI
        </button>
    </div>

    <div class="map-controls-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-2 text-[11px]">
        <details class="rounded-md border border-border bg-background/60" open>
            <summary class="cursor-pointer px-2 py-1.5 font-semibold hover:bg-muted/40">Camera</summary>
            <div class="space-y-2 border-t border-border p-2">
                <label class="block space-y-1">
                    <span class="text-muted-foreground">Projection</span>
                    <select
                        class="h-8 w-full rounded-md border border-input bg-background px-2"
                        value={projectionType}
                        onchange={(event) => {
                            projectionType = Number(event.currentTarget.value) as ProjectionType;
                            mapViewer.camera.setProjectionType(projectionType);
                        }}
                    >
                        <option value={ProjectionType.PERSPECTIVE}>Perspective</option>
                        <option value={ProjectionType.ORTHO}>Ortho</option>
                    </select>
                </label>
                {#if projectionType === ProjectionType.PERSPECTIVE}
                    <label class="block space-y-1">
                        <span class="text-muted-foreground">FOV ({fov})</span>
                        <input class="w-full" type="range" min="30" max="90" step="1" value={fov} oninput={(event) => {
                            fov = Number(event.currentTarget.value);
                            mapViewer.camera.setFov(fov);
                        }} />
                    </label>
                {:else}
                    <label class="block space-y-1">
                        <span class="text-muted-foreground">Ortho Zoom ({orthoZoom})</span>
                        <input class="w-full" type="range" min="1" max="60" step="1" value={orthoZoom} oninput={(event) => {
                            orthoZoom = Number(event.currentTarget.value);
                            mapViewer.camera.orthoZoom = orthoZoom;
                            mapViewer.camera.updated = true;
                        }} />
                    </label>
                {/if}
                <label class="block space-y-1">
                    <span class="text-muted-foreground">Camera Speed ({cameraSpeed.toFixed(1)})</span>
                    <input class="w-full" type="range" min="0.1" max="5" step="0.1" value={cameraSpeed} oninput={(event) => {
                        cameraSpeed = Number(event.currentTarget.value);
                        mapViewer.cameraSpeed = cameraSpeed;
                    }} />
                </label>
                <label class="block space-y-1">
                    <span class="text-muted-foreground">Render Distance ({renderDistance})</span>
                    <input class="w-full" type="range" min="16" max="2000" step="16" value={renderDistance} oninput={(event) => {
                        renderDistance = Number(event.currentTarget.value);
                        mapViewer.renderDistance = renderDistance;
                    }} />
                </label>
                <label class="block space-y-1">
                    <span class="text-muted-foreground">Unload Distance ({unloadDistance})</span>
                    <input class="w-full" type="range" min="1" max="30" step="2" value={unloadDistance} oninput={(event) => {
                        unloadDistance = Number(event.currentTarget.value);
                        mapViewer.unloadDistance = unloadDistance;
                    }} />
                </label>
                <label class="block space-y-1">
                    <span class="text-muted-foreground">LOD Distance ({lodDistance})</span>
                    <input class="w-full" type="range" min="0" max="30" step="2" value={lodDistance} oninput={(event) => {
                        lodDistance = Number(event.currentTarget.value);
                        mapViewer.lodDistance = lodDistance;
                    }} />
                </label>
            </div>
        </details>

        <details class="rounded-md border border-border bg-background/60">
            <summary class="cursor-pointer px-2 py-1.5 font-semibold hover:bg-muted/40">Render</summary>
            <div class="space-y-2 border-t border-border p-2">
                <label class="block space-y-1">
                    <span class="text-muted-foreground">Renderer</span>
                    <select
                        class="h-8 w-full rounded-md border border-input bg-background px-2"
                        value={state.renderer?.type}
                        onchange={(event) => {
                            const type = event.currentTarget.value as MapViewerRendererType;
                            if (state.renderer?.type !== type) state.setRenderer(createRenderer(type, mapViewer));
                        }}
                    >
                        {#each rendererOptions as option (option.value)}
                            <option value={option.value}>{option.label}</option>
                        {/each}
                    </select>
                </label>
                <label class="block space-y-1">
                    <span class="text-muted-foreground">FPS Limit</span>
                    <input
                        class="h-8 w-full rounded-md border border-input bg-background px-2"
                        type="number"
                        min="1"
                        max="999"
                        value={state.renderer?.fpsLimit ?? 60}
                        onchange={(event) => {
                            if (state.renderer) state.renderer.fpsLimit = Number(event.currentTarget.value || 60);
                        }}
                    />
                </label>
            </div>
        </details>

        <details class="rounded-md border border-border bg-background/60">
            <summary class="cursor-pointer px-2 py-1.5 font-semibold hover:bg-muted/40">Vars</summary>
            <div class="space-y-2 border-t border-border p-2">
                <label class="block space-y-1">
                    <span class="text-muted-foreground">Type</span>
                    <select class="h-8 w-full rounded-md border border-input bg-background px-2" value={varType} onchange={(event) => (varType = Number(event.currentTarget.value) as VarType)}>
                        <option value={VarType.VARP}>Varplayer</option>
                        <option value={VarType.VARBIT}>Varbit</option>
                    </select>
                </label>
                <label class="block space-y-1">
                    <span class="text-muted-foreground">Id</span>
                    <input class="h-8 w-full rounded-md border border-input bg-background px-2" type="number" value={varId} oninput={(event) => (varId = Number(event.currentTarget.value || 0))} />
                </label>
                <label class="block space-y-1">
                    <span class="text-muted-foreground">Value</span>
                    <input class="h-8 w-full rounded-md border border-input bg-background px-2" type="number" value={varValue} oninput={(event) => (varValue = Number(event.currentTarget.value || 0))} />
                </label>
                <div class="grid grid-cols-2 gap-2">
                    <button type="button" class="rounded-md border border-input bg-background px-3 py-2 hover:bg-muted" onclick={applyVar}>Set</button>
                    <button type="button" class="rounded-md border border-input bg-background px-3 py-2 hover:bg-muted" onclick={clearVars}>Clear</button>
                </div>
            </div>
        </details>

        <details class="rounded-md border border-border bg-background/60">
            <summary class="cursor-pointer px-2 py-1.5 font-semibold hover:bg-muted/40">Record</summary>
            <div class="space-y-2 border-t border-border p-2">
                <label class="block space-y-1">
                    <span class="text-muted-foreground">Path Length (seconds)</span>
                    <input class="h-8 w-full rounded-md border border-input bg-background px-2" type="number" min="1" value={animationDuration} oninput={(event) => (animationDuration = Math.max(1, Number(event.currentTarget.value || 10)))} />
                </label>
                <div class="grid grid-cols-2 gap-2">
                    <button type="button" class="rounded-md border border-input bg-background px-3 py-2 hover:bg-muted" onclick={addCameraPoint}>Add (F3)</button>
                    <button type="button" class="rounded-md border border-input bg-background px-3 py-2 hover:bg-muted" onclick={deleteLastPoint}>Del Last (F4)</button>
                </div>
                <button type="button" class="w-full rounded-md border border-input bg-background px-3 py-2 hover:bg-muted" onclick={toggleCamera}>
                    {cameraRunning ? "Stop (F2)" : "Start (F2)"}
                </button>
                <div class="space-y-2">
                    {#each cameraPoints as point, index}
                        <div class="rounded-md border border-input bg-background p-2">
                            <p class="mb-2 text-[11px] text-muted-foreground">Point {index + 1}</p>
                            <div class="grid grid-cols-2 gap-2">
                                <button type="button" class="rounded-md border border-input px-2 py-1 hover:bg-muted" onclick={() => mapViewer.setCamera(point)}>Teleport</button>
                                <button type="button" class="rounded-md border border-input px-2 py-1 hover:bg-muted" onclick={() => (cameraPoints = cameraPoints.filter((_, i) => i !== index))}>Delete</button>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </details>

        <div class="content-text px-1 text-[11px]">{mapViewer.debugText ?? ""}</div>
    </div>
</div>
