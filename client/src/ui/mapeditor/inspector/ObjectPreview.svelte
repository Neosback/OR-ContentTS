<script lang="ts">
    import { computeTextureCoords, type Model } from "../../../rs/model/Model";
    import type { EditorObjectRef } from "../../../mapeditor/webgl/sceneLocPicker";
    import type { IEditorPluginHost } from "../../../mapeditor/plugins/editor-plugin-host";
    import { Rasterizer, type RasterTexture } from "./raster";
    import type { PreviewModel } from "./model-preview";
    import { clampView, DEFAULT_SCENE_VIEW, renderObjectScene, type SceneView } from "./object-scene";
    import { readSceneTheme } from "./theme-colors";

    /** Always renders the same fixed-size frame, so the Inspector layout never jumps when nothing is selected. */
    let { host, object }: { host: IEditorPluginHost; object?: EditorObjectRef } = $props();

    const SIZE = 200;
    const DPR = Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    const PIXELS = SIZE * DPR;
    const raster = new Rasterizer(PIXELS, PIXELS);
    const output = new Uint8ClampedArray(new ArrayBuffer(PIXELS * PIXELS * 4));
    const EMPTY_MODEL: PreviewModel = {
        faceCount: 0,
        verticesX: new Int32Array(0),
        verticesY: new Int32Array(0),
        verticesZ: new Int32Array(0),
        indices1: new Int32Array(0),
        indices2: new Int32Array(0),
        indices3: new Int32Array(0),
        faceColors: new Uint16Array(0),
    };

    let canvas = $state<HTMLCanvasElement>();
    let view = $state<SceneView>({ ...DEFAULT_SCENE_VIEW });
    let extent = $state<{ x: number; y: number; z: number }>();
    let themeVersion = $state(0);
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const locType = $derived.by(() => {
        if (!object) return undefined;
        try {
            return host.locTypeLoader.load(object.locTypeId);
        } catch {
            return undefined;
        }
    });

    // The model as the map renders it (lit, rotated); undefined when the loc has no model of its own.
    const model = $derived.by((): PreviewModel | undefined => {
        if (!object || !locType) return undefined;
        try {
            return host.locModelLoader.getModel(locType, object.locModelType, object.rotation & 3) as unknown as PreviewModel | undefined;
        } catch {
            return undefined;
        }
    });
    const uvs = $derived.by(() => {
        if (!model) return undefined;
        try {
            return model.uvs ?? computeTextureCoords(model as unknown as Model);
        } catch {
            return undefined;
        }
    });
    // Footprint on the ground: the loc's size, swapped when it is turned a quarter.
    const footprint = $derived.by(() => {
        const sizeX = Math.max(1, locType?.sizeX ?? 1);
        const sizeY = Math.max(1, locType?.sizeY ?? 1);
        return (object?.rotation ?? 0) & 1 ? { tilesX: sizeY, tilesZ: sizeX } : { tilesX: sizeX, tilesZ: sizeY };
    });

    const textures = new Map<number, RasterTexture | undefined>();
    function texture(id: number): RasterTexture | undefined {
        if (textures.has(id)) return textures.get(id);
        let result: RasterTexture | undefined;
        try {
            result = { size: 64, pixels: Int32Array.from(host.textureLoader.getPixelsArgb(id, 64, true, 1.0)) };
        } catch {
            result = undefined;
        }
        textures.set(id, result);
        return result;
    }

    // Re-read the colours when the app theme (class/data-theme on <html>) changes.
    $effect(() => {
        if (typeof MutationObserver === "undefined") return;
        const observer = new MutationObserver(() => themeVersion++);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
        return () => observer.disconnect();
    });

    // A different object starts from the default camera.
    let shownKey = "";
    $effect(() => {
        const key = object ? `${object.locTypeId}:${object.locModelType}:${object.rotation & 3}` : "";
        if (key !== shownKey) {
            shownKey = key;
            view = { ...DEFAULT_SCENE_VIEW };
        }
    });

    $effect(() => {
        void themeVersion;
        const ctx = canvas?.getContext("2d");
        if (!ctx || !canvas) return;
        const current = view;
        const theme = readSceneTheme(canvas);
        extent = renderObjectScene(raster, output, model ?? EMPTY_MODEL, current, footprint, theme, texture, uvs);
        if (!model) extent = undefined;
        ctx.putImageData(new ImageData(output, PIXELS, PIXELS), 0, 0);
    });

    function down(event: PointerEvent): void {
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        canvas?.setPointerCapture(event.pointerId);
    }

    function move(event: PointerEvent): void {
        if (!dragging) return;
        view = clampView({ ...view, yaw: view.yaw - (event.clientX - lastX) * 0.01, elevation: view.elevation + (event.clientY - lastY) * 0.01 });
        lastX = event.clientX;
        lastY = event.clientY;
    }

    function up(event: PointerEvent): void {
        dragging = false;
        canvas?.releasePointerCapture(event.pointerId);
    }

    function wheel(event: WheelEvent): void {
        event.preventDefault();
        view = clampView({ ...view, zoom: view.zoom * Math.exp(event.deltaY * 0.0012) });
    }

    function reset(): void {
        view = { ...DEFAULT_SCENE_VIEW };
    }
</script>

<div class="flex flex-col items-center gap-1">
    <div class="relative" style="width: {SIZE}px; height: {SIZE}px">
        <canvas
            bind:this={canvas}
            width={PIXELS}
            height={PIXELS}
            style="width: {SIZE}px; height: {SIZE}px"
            class="touch-none rounded-md border {model ? 'cursor-grab active:cursor-grabbing' : ''}"
            aria-label="3D preview of the selected object. Drag to rotate, scroll to zoom, double-click to reset."
            onpointerdown={down}
            onpointermove={move}
            onpointerup={up}
            onpointercancel={up}
            onwheel={wheel}
            ondblclick={reset}
        ></canvas>
        {#if !model}
            <p class="pointer-events-none absolute inset-x-0 top-3 text-center text-[11px] text-muted-foreground">
                {object ? "No model to preview" : "Hover or click an object"}
            </p>
        {/if}
    </div>
    <p class="h-4 text-[10px] text-muted-foreground">
        {#if extent}
            Drag to rotate · scroll to zoom · {Math.round(extent.x)} × {Math.round(extent.z)} × {Math.round(extent.y)}
        {/if}
    </p>
</div>
