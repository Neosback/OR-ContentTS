import { HSL_RGB_MAP } from "../../../rs/util/ColorUtil";
import { Rasterizer, type RasterTexture, type RasterTriangle, type RasterVertex } from "./raster";

/** The parts of a decoded model the preview reads. `Model` (lit) and `ModelData` (unlit) both satisfy it. */
export interface PreviewModel {
    faceCount: number;
    verticesX: Int32Array;
    verticesY: Int32Array;
    verticesZ: Int32Array;
    indices1: Int32Array;
    indices2: Int32Array;
    indices3: Int32Array;
    /** Lit models: low 16 bits are the face's HSL colour. */
    faceColors1?: Int32Array;
    faceColors2?: Int32Array;
    /** Lit models: -2 marks a hidden face, -1 flat shading. */
    faceColors3?: Int32Array;
    /** Unlit models: the face's HSL colour. */
    faceColors?: Uint16Array;
    /** 0 = opaque, 255 = invisible. */
    faceAlphas?: Int8Array;
    /** Texture id per face, -1 when the face is plain coloured. */
    faceTextures?: Int16Array;
    /** Unlit models: (type & 3) === 2 marks a hidden face (lit models use faceColors3 === -2). */
    faceRenderTypes?: Int8Array;
    /** Draw priority per face; higher draws over lower where faces overlap. */
    faceRenderPriorities?: Int8Array;
    /** Per-face texture coordinates: u0, v0, u1, v1, u2, v2 for every face. */
    uvs?: Float32Array;
}

/** Average colour (0xRRGGBB) of a texture, or undefined when it cannot be sampled. */
export type TextureColor = (textureId: number) => number | undefined;

export interface PreviewPolygon {
    /** Three screen-space points. */
    points: [number, number][];
    rgb: number;
    /** 0..1 */
    opacity: number;
    /** Larger = farther from the viewer; polygons are returned far to near. */
    depth: number;
}

export interface ModelProjection {
    polygons: PreviewPolygon[];
    /** Model size in model units (largest extent), for the caption. */
    extent: { x: number; y: number; z: number };
}

function isHiddenFace(model: PreviewModel, face: number): boolean {
    return (model.faceColors3 !== undefined && model.faceColors3[face] === -2) || (model.faceRenderTypes !== undefined && (model.faceRenderTypes[face] & 3) === 2);
}

function faceRgb(model: PreviewModel, face: number, textureColor?: TextureColor): number | undefined {
    if (isHiddenFace(model, face)) {
        return undefined;
    }
    const hsl = (model.faceColors1 ? model.faceColors1[face] & 0xffff : model.faceColors ? model.faceColors[face] : 0) & 0xffff;
    const textureId = model.faceTextures ? model.faceTextures[face] : -1;
    if (textureId >= 0 && textureColor) {
        const base = textureColor(textureId);
        if (base !== undefined) {
            // Textured faces keep only a lightness value (low 7 bits) in their colour: use it to shade the texture.
            const shade = 0.35 + 0.65 * ((hsl & 127) / 127);
            const r = Math.min(255, Math.round(((base >> 16) & 255) * shade));
            const g = Math.min(255, Math.round(((base >> 8) & 255) * shade));
            const b = Math.min(255, Math.round((base & 255) * shade));
            return (r << 16) | (g << 8) | b;
        }
    }
    return HSL_RGB_MAP[hsl];
}

/**
 * Orthographic projection of a model into a `size` x `size` square, painter-sorted (far to near).
 * Model Y points down, so it is flipped to put the top of the model at the top of the view.
 *
 * @param yaw radians around the vertical axis
 * @param pitch radians the model is tilted towards the viewer (0 = side-on, positive looks down on it)
 */
interface ProjectedVertices {
    sx: Float32Array;
    sy: Float32Array;
    sz: Float32Array;
    extent: { x: number; y: number; z: number };
}

/** Orthographic projection of every vertex into a `size` square (see {@link projectModel} for the conventions). */
export function projectVertices(model: PreviewModel, yaw: number, pitch: number, size: number, padding = 10): ProjectedVertices {
    const count = model.verticesX.length;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let v = 0; v < count; v++) {
        minX = Math.min(minX, model.verticesX[v]);
        maxX = Math.max(maxX, model.verticesX[v]);
        minY = Math.min(minY, model.verticesY[v]);
        maxY = Math.max(maxY, model.verticesY[v]);
        minZ = Math.min(minZ, model.verticesZ[v]);
        maxZ = Math.max(maxZ, model.verticesZ[v]);
    }
    const sx = new Float32Array(count);
    const sy = new Float32Array(count);
    const sz = new Float32Array(count);
    if (count === 0) {
        return { sx, sy, sz, extent: { x: 0, y: 0, z: 0 } };
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const radius = Math.max(1, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2);
    const scale = (size / 2 - padding) / radius;

    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);
    for (let v = 0; v < count; v++) {
        const x = model.verticesX[v] - cx;
        const y = -(model.verticesY[v] - cy);
        const z = model.verticesZ[v] - cz;
        // Yaw around the vertical axis, then pitch around the horizontal one.
        const x1 = x * cosYaw + z * sinYaw;
        const z1 = -x * sinYaw + z * cosYaw;
        const y2 = y * cosPitch - z1 * sinPitch;
        const z2 = y * sinPitch + z1 * cosPitch;
        sx[v] = size / 2 + x1 * scale;
        sy[v] = size / 2 - y2 * scale;
        sz[v] = z2;
    }
    return { sx, sy, sz, extent: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ } };
}

export function projectModel(
    model: PreviewModel,
    yaw: number,
    pitch: number,
    size: number,
    padding = 10,
    textureColor?: TextureColor,
): ModelProjection {
    const { sx, sy, sz, extent } = projectVertices(model, yaw, pitch, size, padding);
    if (model.verticesX.length === 0) {
        return { polygons: [], extent };
    }

    const polygons: PreviewPolygon[] = [];
    for (let f = 0; f < model.faceCount; f++) {
        const rgb = faceRgb(model, f, textureColor);
        if (rgb === undefined) continue;
        const opacity = model.faceAlphas ? 1 - (model.faceAlphas[f] & 0xff) / 255 : 1;
        if (opacity <= 0.01) continue;
        const a = model.indices1[f];
        const b = model.indices2[f];
        const c = model.indices3[f];
        polygons.push({
            points: [
                [sx[a], sy[a]],
                [sx[b], sy[b]],
                [sx[c], sy[c]],
            ],
            rgb,
            opacity,
            depth: (sz[a] + sz[b] + sz[c]) / 3,
        });
    }
    polygons.sort((p, q) => q.depth - p.depth);
    return { polygons, extent };
}

export function drawModelProjection(ctx: CanvasRenderingContext2D, projection: ModelProjection, size: number): void {
    ctx.clearRect(0, 0, size, size);
    for (const polygon of projection.polygons) {
        const [p0, p1, p2] = polygon.points;
        ctx.globalAlpha = polygon.opacity;
        const rgb = polygon.rgb;
        const fill = `rgb(${(rgb >> 16) & 255}, ${(rgb >> 8) & 255}, ${rgb & 255})`;
        ctx.fillStyle = fill;
        // A hairline stroke in the same colour hides the seams between neighbouring triangles.
        ctx.strokeStyle = fill;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

export type TextureLookup = (textureId: number) => RasterTexture | undefined;

const rgbOf = (hsl: number): [number, number, number] => {
    const rgb = HSL_RGB_MAP[hsl & 0xffff];
    return [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];
};

/**
 * Renders the model into `raster` (a square the size of the preview) with a depth buffer, Gouraud shading and real
 * textures. Opaque faces go first; translucent ones follow, far to near, blended over them.
 */
export function renderModelPreview(
    raster: Rasterizer,
    model: PreviewModel,
    yaw: number,
    pitch: number,
    textures?: TextureLookup,
    uvs: Float32Array | undefined = model.uvs,
): { x: number; y: number; z: number } {
    raster.clear();
    const projected = projectVertices(model, yaw, pitch, raster.width, Math.round(raster.width * 0.06));
    return rasterizeProjectedModel(raster, model, projected, textures, uvs);
}

/** Vertices already projected to screen space (orthographic: `sz` is depth; perspective: `invW` is 1 / depth). */
export interface ScreenVertices {
    sx: Float32Array;
    sy: Float32Array;
    sz: Float32Array;
    invW?: Float32Array;
    extent: { x: number; y: number; z: number };
}

/** Rasterizes every face of `model` using already projected vertices. The raster should be cleared first. */
export function rasterizeProjectedModel(
    raster: Rasterizer,
    model: PreviewModel,
    projected: ScreenVertices,
    textures?: TextureLookup,
    uvs: Float32Array | undefined = model.uvs,
): { x: number; y: number; z: number } {
    const { sx, sy, sz, invW, extent } = projected;
    const translucent: { triangle: RasterTriangle; depth: number }[] = [];

    // Overlapping faces resolve by draw order, so draw low priorities first (stable: ties keep model order).
    const order = Array.from({ length: model.faceCount }, (_, face) => face);
    if (model.faceRenderPriorities) {
        const priorities = model.faceRenderPriorities;
        order.sort((a, b) => priorities[a] - priorities[b] || a - b);
    }
    // Depth is in model units, so scale the tolerance with the model's size.
    raster.depthTolerance = (Math.hypot(extent.x, extent.y, extent.z) / 2) * 0.004;

    for (const f of order) {
        if (isHiddenFace(model, f)) continue;
        const opacity = model.faceAlphas ? 1 - (model.faceAlphas[f] & 0xff) / 255 : 1;
        if (opacity <= 0.01) continue;

        const indices = [model.indices1[f], model.indices2[f], model.indices3[f]] as const;
        // Lit models keep one HSL colour per corner (Gouraud); a corner value of -1 in colour 3 means flat shading.
        const hsl: [number, number, number] = model.faceColors1
            ? model.faceColors3 && model.faceColors3[f] === -1
                ? [model.faceColors1[f], model.faceColors1[f], model.faceColors1[f]]
                : [model.faceColors1[f], model.faceColors2 ? model.faceColors2[f] : model.faceColors1[f], model.faceColors3 ? model.faceColors3[f] : model.faceColors1[f]]
            : [model.faceColors ? model.faceColors[f] : 0, model.faceColors ? model.faceColors[f] : 0, model.faceColors ? model.faceColors[f] : 0];

        const textureId = model.faceTextures ? model.faceTextures[f] : -1;
        const texture = textureId >= 0 && uvs ? textures?.(textureId) : undefined;

        const vertices = indices.map((vertex, corner): RasterVertex => {
            let r: number;
            let g: number;
            let b: number;
            if (texture) {
                // Textured faces keep only a lightness (low 7 bits): it shades the texture.
                const shade = (255 * (0.35 + 0.65 * ((hsl[corner] & 127) / 127)));
                r = g = b = shade;
            } else {
                [r, g, b] = rgbOf(hsl[corner]);
            }
            return {
                x: sx[vertex],
                y: sy[vertex],
                z: sz[vertex],
                invW: invW ? invW[vertex] : undefined,
                r,
                g,
                b,
                u: texture && uvs ? uvs[f * 6 + corner * 2] : undefined,
                v: texture && uvs ? uvs[f * 6 + corner * 2 + 1] : undefined,
            };
        }) as [RasterVertex, RasterVertex, RasterVertex];

        const triangle: RasterTriangle = { vertices, texture, opacity };
        if (opacity >= 1) {
            raster.draw(triangle);
        } else {
            translucent.push({ triangle, depth: (vertices[0].z + vertices[1].z + vertices[2].z) / 3 });
        }
    }

    translucent.sort((p, q) => q.depth - p.depth);
    for (const { triangle } of translucent) raster.draw(triangle);
    return extent;
}
