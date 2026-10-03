<script lang="ts">
    import { getOverlayGradientModel } from "../../../mapeditor/plugins/builtins/overlay-gradient-model";
    import { getTileBrushModel } from "../../../mapeditor/plugins/builtins/tile-brush-model";
    import { getUnderlayGradientModel } from "../../../mapeditor/plugins/builtins/underlay-gradient-model";
    import { TILE_SHAPE_NAMES } from "../../../mapeditor/tile-shape-paint";
    import { getTileShapeTriangles } from "../../../rs/scene/SceneTileModel";
    import { useEditorState } from "../editor-state.svelte";

    /** The compact layout shows only the picture (caption below, smaller). */
    let { small = false }: { small?: boolean } = $props();

    const editor = useEditorState();
    const host = editor.host;

    const SIZE = 56;
    const DPR = Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    const PIXELS = SIZE * DPR;

    let canvas = $state<HTMLCanvasElement>();

    /** What one stroke will lay down: only the parts that are ticked, with the shape and rotation they imply. */
    const brush = $derived(
        editor.read(() => {
            const model = getTileBrushModel(host);
            const overlayOn = model.enabled.overlay && host.selectedOverlayId >= 0;
            const underlayGradient = getUnderlayGradientModel(host);
            const overlayGradient = getOverlayGradientModel(host);
            return {
                // In Gradient mode a stroke paints from a generated palette, not from the swatch you picked.
                underlayGradient: underlayGradient.underlayPanelTab === "gradient" && underlayGradient.underlayGradientIds.length > 0,
                overlayGradient: overlayGradient.overlayPanelTab === "gradient" && overlayGradient.overlayGradientIds.length > 0,
                underlay: model.enabled.underlay ? host.selectedUnderlayId : -1,
                overlay: overlayOn ? host.selectedOverlayId : -1,
                shape: model.enabled.shape ? model.shape : 0,
                rotation: model.enabled.rotation ? model.rotation : 0,
                shapeOn: model.enabled.shape,
                rotationOn: model.enabled.rotation,
            };
        }),
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
        const { underlay, overlay, shape, rotation } = brush;
        ctx.clearRect(0, 0, PIXELS, PIXELS);
        ctx.imageSmoothingEnabled = false;

        let base = 0x262626;
        if (underlay >= 0) {
            try {
                base = host.underlayTypeLoader.load(underlay).getRgb();
            } catch {
                /* unknown underlay id */
            }
        }
        ctx.fillStyle = rgb(base);
        ctx.fillRect(0, 0, PIXELS, PIXELS);

        if (overlay >= 0) {
            try {
                const type = host.overlayTypeLoader.load(overlay);
                const { overlay: triangles } = getTileShapeTriangles(shape, rotation);
                ctx.save();
                ctx.beginPath();
                for (const [x0, y0, x1, y1, x2, y2] of triangles) {
                    ctx.moveTo(x0 * PIXELS, (1 - y0) * PIXELS);
                    ctx.lineTo(x1 * PIXELS, (1 - y1) * PIXELS);
                    ctx.lineTo(x2 * PIXELS, (1 - y2) * PIXELS);
                    ctx.closePath();
                }
                ctx.clip();
                const texture = type.textureId >= 0 ? textureCanvas(type.textureId) : undefined;
                if (texture) ctx.drawImage(texture, 0, 0, PIXELS, PIXELS);
                else {
                    ctx.fillStyle = rgb(type.getRgb());
                    ctx.fillRect(0, 0, PIXELS, PIXELS);
                }
                ctx.restore();
            } catch {
                /* unknown overlay id */
            }
        }
    });

    const caption = $derived.by(() => {
        const parts: string[] = [];
        if (brush.underlay >= 0) parts.push(brush.underlayGradient ? "U gradient" : `U #${brush.underlay}`);
        if (brush.overlay >= 0) parts.push(brush.overlayGradient ? "O gradient" : `O #${brush.overlay}`);
        return parts.length > 0 ? parts.join(" · ") : "no floor";
    });
    const shapeCaption = $derived(
        brush.overlay >= 0 && (brush.shapeOn || brush.rotationOn)
            ? `${TILE_SHAPE_NAMES[brush.shape]}${brush.shape !== 0 ? ` · ${brush.rotation * 90}°` : ""}`
            : "",
    );
</script>

<div class="flex flex-col items-center gap-1 px-2 pt-2 pb-1.5">
    {#if !small}<span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Preview</span>{/if}
    <canvas
        bind:this={canvas}
        width={PIXELS}
        height={PIXELS}
        style="width: {SIZE}px; height: {SIZE}px"
        class="rounded-md border bg-muted/30"
        aria-label="What the brush will paint"
    ></canvas>
    <p class="text-center font-mono text-[10px] leading-tight text-muted-foreground tabular-nums">{caption}</p>
    {#if shapeCaption}
        <p class="text-center font-mono text-[10px] leading-tight text-muted-foreground tabular-nums">{shapeCaption}</p>
    {/if}
</div>
