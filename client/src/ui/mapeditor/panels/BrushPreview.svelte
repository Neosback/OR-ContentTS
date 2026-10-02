<script lang="ts">
    import { getTileBrushModel } from "../../../mapeditor/plugins/builtins/tile-brush-model";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;

    const SIZE = 88;
    const DPR = Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    const PIXELS = SIZE * DPR;

    let canvas = $state<HTMLCanvasElement>();

    const brush = $derived(
        editor.read(() => ({
            underlay: getTileBrushModel(host).enabled.underlay ? host.selectedUnderlayId : -1,
            overlay: getTileBrushModel(host).enabled.overlay ? host.selectedOverlayId : -1,
            overlayOn: getTileBrushModel(host).enabled.overlay,
        })),
    );

    const rgb = (value: number): string => `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;

    function textureCanvas(id: number): HTMLCanvasElement | undefined {
        try {
            const pixels = host.textureLoader.getPixelsArgb(id, 64, true, 1.0);
            const source = document.createElement("canvas");
            source.width = source.height = 64;
            const data = new ImageData(64, 64);
            for (let i = 0; i < 64 * 64; i++) {
                const argb = pixels[i];
                data.data[i * 4] = (argb >> 16) & 255;
                data.data[i * 4 + 1] = (argb >> 8) & 255;
                data.data[i * 4 + 2] = argb & 255;
                data.data[i * 4 + 3] = 255;
            }
            source.getContext("2d")?.putImageData(data, 0, 0);
            return source;
        } catch {
            return undefined;
        }
    }

    $effect(() => {
        const ctx = canvas?.getContext("2d");
        if (!ctx) return;
        const { underlay, overlay } = brush;
        ctx.clearRect(0, 0, PIXELS, PIXELS);
        ctx.imageSmoothingEnabled = false;
        if (underlay >= 0) {
            try {
                ctx.fillStyle = rgb(host.underlayTypeLoader.load(underlay).getRgb());
                ctx.fillRect(0, 0, PIXELS, PIXELS);
            } catch {
                /* unknown underlay id */
            }
        }
        if (overlay >= 0) {
            try {
                const type = host.overlayTypeLoader.load(overlay);
                const inset = PIXELS * 0.2;
                const inner = PIXELS - inset * 2;
                const texture = type.textureId >= 0 ? textureCanvas(type.textureId) : undefined;
                if (texture) ctx.drawImage(texture, inset, inset, inner, inner);
                else {
                    ctx.fillStyle = rgb(type.getRgb());
                    ctx.fillRect(inset, inset, inner, inner);
                }
            } catch {
                /* unknown overlay id */
            }
        }
    });
</script>

<div class="flex w-[112px] shrink-0 flex-col items-center gap-1.5 border-r border-border bg-muted/10 p-2">
    <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Preview</span>
    <canvas
        bind:this={canvas}
        width={PIXELS}
        height={PIXELS}
        style="width: {SIZE}px; height: {SIZE}px"
        class="rounded-md border bg-muted/30"
        aria-label="Floor the brush will paint"
    ></canvas>
    <p class="text-center font-mono text-[10px] leading-tight text-muted-foreground tabular-nums">
        {#if brush.underlay >= 0}U #{brush.underlay}{/if}{#if brush.underlay >= 0 && brush.overlay >= 0}<br />{/if}{#if brush.overlay >= 0}O #{brush.overlay}{/if}{#if brush.underlay < 0 && brush.overlay < 0}no floor{/if}
    </p>
</div>
