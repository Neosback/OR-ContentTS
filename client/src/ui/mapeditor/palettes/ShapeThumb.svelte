<script lang="ts">
    import { getTileShapeTriangles } from "../../../rs/scene/SceneTileModel";

    /** A tile shape drawn from the real shape tables: the underlay as the base, the overlay on top, north up. */
    let {
        shape,
        rotation = 0,
        underlay,
        overlay,
        size = 44,
    }: {
        /** Stored overlay shape 0-11, or undefined for a tile without an overlay. */
        shape: number | undefined;
        rotation?: number;
        /** 0xRRGGBB */
        underlay: number;
        overlay: number;
        size?: number;
    } = $props();

    const DPR = Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    let canvas = $state<HTMLCanvasElement>();

    const rgb = (value: number): string => `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;

    $effect(() => {
        const ctx = canvas?.getContext("2d");
        if (!ctx) return;
        const px = size * DPR;
        ctx.clearRect(0, 0, px, px);
        const { underlay: under, overlay: over } = getTileShapeTriangles(shape, rotation);
        const draw = (triangles: typeof under, colour: string): void => {
            ctx.fillStyle = colour;
            for (const [x0, y0, x1, y1, x2, y2] of triangles) {
                ctx.beginPath();
                ctx.moveTo(x0 * px, (1 - y0) * px);
                ctx.lineTo(x1 * px, (1 - y1) * px);
                ctx.lineTo(x2 * px, (1 - y2) * px);
                ctx.closePath();
                ctx.fill();
            }
        };
        // The base first, so hairline gaps between triangles show the underlay rather than the page.
        ctx.fillStyle = rgb(underlay);
        ctx.fillRect(0, 0, px, px);
        draw(under, rgb(underlay));
        draw(over, rgb(overlay));
    });
</script>

<canvas bind:this={canvas} width={size * DPR} height={size * DPR} style="width: {size}px; height: {size}px" class="rounded-sm border border-border/70" aria-hidden="true"></canvas>
