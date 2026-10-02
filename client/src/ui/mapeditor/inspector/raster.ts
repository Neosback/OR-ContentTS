/**
 * A tiny CPU triangle rasterizer for the Inspector's previews: depth buffer, Gouraud colours, optional texture with
 * alpha cut-outs, and translucent triangles. It draws into plain memory (no GPU), so previews cost no GPU memory.
 *
 * Smaller `z` is nearer. Colours are 0..255.
 */

export interface RasterTexture {
    /** Width and height in texels (a power of two). */
    size: number;
    /** ARGB, row-major. */
    pixels: Int32Array;
}

export interface RasterVertex {
    x: number;
    y: number;
    z: number;
    r: number;
    g: number;
    b: number;
    /**
     * 1 / view-space depth for perspective projection. When all three vertices have it, depth is the true view depth
     * and colours/UVs are interpolated perspective-correctly (`z` is then unused).
     */
    invW?: number;
    /** Texture coordinates (0..1, repeating); only read when the triangle has a texture. */
    u?: number;
    v?: number;
}

export interface RasterTriangle {
    vertices: [RasterVertex, RasterVertex, RasterVertex];
    /** When set the texel is multiplied by the interpolated vertex colour (which then acts as the shade). */
    texture?: RasterTexture;
    /** 1 = opaque (writes depth); less blends over what is already drawn and leaves depth alone. */
    opacity?: number;
}

export class Rasterizer {
    /** RGBA, transparent where nothing was drawn. */
    readonly color: Uint8ClampedArray<ArrayBuffer>;
    private readonly depth: Float32Array;
    /**
     * Coplanar triangles have (nearly) equal depth; within this tolerance the triangle drawn later wins instead of the
     * result flickering with float rounding. Set it to a small fraction of the scene depth.
     */
    depthTolerance = 0;

    constructor(
        readonly width: number,
        readonly height: number,
    ) {
        this.color = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
        this.depth = new Float32Array(width * height).fill(Infinity);
    }

    clear(): void {
        this.color.fill(0);
        this.depth.fill(Infinity);
    }

    draw(triangle: RasterTriangle): void {
        const [a, b, c] = triangle.vertices;
        const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (Math.abs(area) < 1e-6) return;

        const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
        const maxX = Math.min(this.width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
        const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
        const maxY = Math.min(this.height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
        if (minX > maxX || minY > maxY) return;

        const texture = triangle.texture;
        const perspective = a.invW !== undefined && b.invW !== undefined && c.invW !== undefined;
        const mask = texture ? texture.size - 1 : 0;
        const opacity = triangle.opacity ?? 1;
        const invArea = 1 / area;
        // Slightly negative so pixels exactly on a shared edge are covered by both triangles (no pin-holes).
        const eps = -1e-4;
        const color = this.color;
        const depth = this.depth;

        for (let y = minY; y <= maxY; y++) {
            const py = y + 0.5;
            for (let x = minX; x <= maxX; x++) {
                const px = x + 0.5;
                const w0 = ((b.x - px) * (c.y - py) - (b.y - py) * (c.x - px)) * invArea;
                const w1 = ((c.x - px) * (a.y - py) - (c.y - py) * (a.x - px)) * invArea;
                const w2 = 1 - w0 - w1;
                if (w0 < eps || w1 < eps || w2 < eps) continue;

                // Attribute weights: screen-linear, or perspective-correct when vertices carry 1/depth.
                let p0 = w0;
                let p1 = w1;
                let p2 = w2;
                let z: number;
                if (perspective) {
                    const iw = w0 * (a.invW as number) + w1 * (b.invW as number) + w2 * (c.invW as number);
                    z = 1 / iw;
                    p0 = (w0 * (a.invW as number)) / iw;
                    p1 = (w1 * (b.invW as number)) / iw;
                    p2 = (w2 * (c.invW as number)) / iw;
                } else {
                    z = w0 * a.z + w1 * b.z + w2 * c.z;
                }
                const index = y * this.width + x;
                if (z > depth[index] + this.depthTolerance) continue;

                let r = p0 * a.r + p1 * b.r + p2 * c.r;
                let g = p0 * a.g + p1 * b.g + p2 * c.g;
                let bl = p0 * a.b + p1 * b.b + p2 * c.b;

                if (texture) {
                    const u = p0 * (a.u ?? 0) + p1 * (b.u ?? 0) + p2 * (c.u ?? 0);
                    const v = p0 * (a.v ?? 0) + p1 * (b.v ?? 0) + p2 * (c.v ?? 0);
                    const texel = texture.pixels[((Math.floor(v * texture.size) & mask) * texture.size) + (Math.floor(u * texture.size) & mask)];
                    if (((texel >>> 24) & 255) < 128) continue; // cut-out (window panes, leaves)
                    r = (((texel >> 16) & 255) * r) / 255;
                    g = (((texel >> 8) & 255) * g) / 255;
                    bl = ((texel & 255) * bl) / 255;
                }

                const o = index * 4;
                if (opacity >= 1) {
                    color[o] = r;
                    color[o + 1] = g;
                    color[o + 2] = bl;
                    color[o + 3] = 255;
                    depth[index] = z;
                } else {
                    // Blend over the pixel; where nothing is behind yet the triangle shows through at its opacity.
                    const behind = color[o + 3] / 255;
                    const outAlpha = opacity + behind * (1 - opacity);
                    const inv = outAlpha > 0 ? 1 / outAlpha : 0;
                    color[o] = (r * opacity + color[o] * behind * (1 - opacity)) * inv;
                    color[o + 1] = (g * opacity + color[o + 1] * behind * (1 - opacity)) * inv;
                    color[o + 2] = (bl * opacity + color[o + 2] * behind * (1 - opacity)) * inv;
                    color[o + 3] = outAlpha * 255;
                }
            }
        }
    }
}
