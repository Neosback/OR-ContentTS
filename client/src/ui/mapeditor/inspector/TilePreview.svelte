<script lang="ts">
    import { getOverlayHighlightUvTriangles } from "../../../rs/scene/SceneTileModel";
    import { HSL_RGB_MAP } from "../../../rs/util/ColorUtil";
    import type { IEditorPluginHost } from "../../../mapeditor/plugins/editor-plugin-host";
    import { useEditorState } from "../editor-state.svelte";
    import { Rasterizer, type RasterTexture, type RasterVertex } from "./raster";

    /** Always renders the same fixed-size frame, so the Inspector layout never jumps when no tile is chosen. */
    let { host, target }: { host: IEditorPluginHost; target?: { worldX: number; worldY: number; level: number } } = $props();

    const editor = useEditorState();

    const SIZE = 144;
    const DPR = Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    const PIXELS = SIZE * DPR;
    const raster = new Rasterizer(PIXELS, PIXELS);

    let canvas = $state<HTMLCanvasElement>();
    /** Blended: the tile as the map shows it (underlay colours blended with neighbours). Off: the raw floor colours. */
    let blended = $state(true);

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

    const rgb = (value: number): [number, number, number] => [(value >> 16) & 255, (value >> 8) & 255, value & 255];

    function vertex(x: number, y: number, [r, g, b]: [number, number, number], u?: number, v?: number): RasterVertex {
        return { x, y, z: 0, r, g, b, u, v };
    }

    function draw(): void {
        const ctx = canvas?.getContext("2d");
        if (!ctx) return;
        raster.clear();
        if (!target) {
            ctx.clearRect(0, 0, PIXELS, PIXELS);
            return;
        }
        const { worldX, worldY, level } = target;
        const info = host.getTileInfo(level, worldX, worldY);
        const tileModel = host.getTileModel(level, worldX, worldY);
        // Tile-model vertices are in scene units (128 per tile, z pointing north); make them tile-local, north up.
        const originX = (tileModel?.sceneX ?? 0) * 128;
        const originZ = (tileModel?.sceneY ?? 0) * 128;
        const px = (x: number) => ((x - originX) / 128) * PIXELS;
        const py = (z: number) => PIXELS - ((z - originZ) / 128) * PIXELS;

        if (blended && tileModel) {
            for (const face of tileModel.model.faces) {
                const textureId = face.vertices[0].textureId;
                const tex = textureId >= 0 ? texture(textureId) : undefined;
                raster.draw({
                    vertices: face.vertices.map((v) => {
                        const shade = 255 * (0.35 + 0.65 * ((v.hsl & 127) / 127));
                        return tex ? vertex(px(v.x), py(v.z), [shade, shade, shade], v.u, v.v) : vertex(px(v.x), py(v.z), rgb(HSL_RGB_MAP[v.hsl & 0xffff]));
                    }) as [RasterVertex, RasterVertex, RasterVertex],
                    texture: tex,
                });
            }
        } else if (info) {
            const underlay = (info.u ?? 0) > 0 ? host.underlayTypeLoader.load((info.u ?? 0) - 1).getRgb() : 0x1c1c1c;
            const base = rgb(underlay);
            const corners = [vertex(0, 0, base), vertex(PIXELS, 0, base), vertex(PIXELS, PIXELS, base), vertex(0, PIXELS, base)];
            raster.draw({ vertices: [corners[0], corners[1], corners[2]] });
            raster.draw({ vertices: [corners[0], corners[2], corners[3]] });
            if ((info.o ?? 0) > 0 && tileModel) {
                const overlay = host.overlayTypeLoader.load((info.o ?? 0) - 1);
                const color = rgb(overlay.getRgb());
                for (const [u0, v0, u1, v1, u2, v2] of getOverlayHighlightUvTriangles(tileModel.model, tileModel.sceneX, tileModel.sceneY)) {
                    raster.draw({ vertices: [vertex(u0 * PIXELS, (1 - v0) * PIXELS, color), vertex(u1 * PIXELS, (1 - v1) * PIXELS, color), vertex(u2 * PIXELS, (1 - v2) * PIXELS, color)] });
                }
            }
        }
        ctx.clearRect(0, 0, PIXELS, PIXELS);
        ctx.putImageData(new ImageData(raster.color, PIXELS, PIXELS), 0, 0);
    }

    $effect(() => {
        // Re-draw when the tile, the blend switch, or the map (edits) change.
        void target?.worldX;
        void target?.worldY;
        void target?.level;
        void blended;
        void editor.snapshot.current;
        draw();
    });
</script>

<div class="flex flex-col items-center gap-1.5">
    <div class="relative" style="width: {SIZE}px; height: {SIZE}px">
        <canvas
            bind:this={canvas}
            width={PIXELS}
            height={PIXELS}
            style="width: {SIZE}px; height: {SIZE}px"
            class="rounded-md border bg-muted/30"
            aria-label="Preview of the tile"
        ></canvas>
        {#if !target}
            <p class="pointer-events-none absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] text-muted-foreground">Hover or click a tile</p>
        {/if}
    </div>
    <label class="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
        <input type="checkbox" bind:checked={blended} class="size-3.5 accent-blue-500" />
        Blending (as shown on the map)
    </label>
</div>
