import { rasterizeProjectedModel, type PreviewModel, type ScreenVertices, type TextureLookup } from "./model-preview";
import type { Rasterizer } from "./raster";

/**
 * The object preview "scene": a perspective orbit camera around the model plus a ground grid under it, composited on
 * the CPU. Modelled on RSPSi's object preview: a 40 degree camera that fits the model's bounding sphere, and a grid of
 * game tiles (128 units) that covers the object's footprint plus a one-tile margin, with the footprint outlined.
 */

export interface SceneTheme {
    /** 0xRRGGBB. All four come from the app theme so the preview matches light/dark and custom themes. */
    background: number;
    gridFill: number;
    gridLine: number;
    footprint: number;
}

export interface SceneView {
    /** Orbit around the model, radians. */
    yaw: number;
    /** Angle above the ground, radians. */
    elevation: number;
    /** Distance multiplier: smaller is closer. */
    zoom: number;
}

export const DEFAULT_SCENE_VIEW: SceneView = { yaw: 0.3, elevation: 0.38, zoom: 1 };
export const MIN_ELEVATION = -0.25;
export const MAX_ELEVATION = 1.45;
export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 4;

const FOV = (40 * Math.PI) / 180;
const FIT_HEADROOM = 1.08;
const TILE = 128;
type Vec3 = [number, number, number];

export interface SceneCamera {
    eye: Vec3;
    right: Vec3;
    up: Vec3;
    forward: Vec3;
    /** Focal length in pixels. */
    focal: number;
    /** Model bounds centre, in world (Y up) coordinates. */
    center: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec3): Vec3 => {
    const length = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / length, a[1] / length, a[2] / length];
};

export function clampView(view: SceneView): SceneView {
    return { yaw: view.yaw, elevation: Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, view.elevation)), zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom)) };
}

/** Builds the orbit camera for a model. Model Y points down; the scene is Y up, so Y is flipped. */
export function buildCamera(model: PreviewModel, view: SceneView, size: number, minRadius = 48): SceneCamera {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let v = 0; v < model.verticesX.length; v++) {
        minX = Math.min(minX, model.verticesX[v]);
        maxX = Math.max(maxX, model.verticesX[v]);
        minY = Math.min(minY, -model.verticesY[v]);
        maxY = Math.max(maxY, -model.verticesY[v]);
        minZ = Math.min(minZ, model.verticesZ[v]);
        maxZ = Math.max(maxZ, model.verticesZ[v]);
    }
    if (!Number.isFinite(minX)) {
        minX = maxX = minY = maxY = minZ = maxZ = 0;
    }
    const center: Vec3 = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    const radius = Math.max(minRadius, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2);
    const distance = (radius / Math.sin(FOV / 2)) * FIT_HEADROOM * view.zoom;
    const cosEl = Math.cos(view.elevation);
    const eye: Vec3 = [
        center[0] + distance * cosEl * Math.sin(view.yaw),
        center[1] + distance * Math.sin(view.elevation),
        center[2] + distance * cosEl * Math.cos(view.yaw),
    ];
    const forward = normalize(sub(center, eye));
    const right = normalize(cross(forward, [0, 1, 0]));
    const up = cross(right, forward);
    return { eye, right, up, forward, focal: size / 2 / Math.tan(FOV / 2), center };
}

/** Perspective projection of every vertex; `invW` carries 1 / depth for perspective-correct rasterizing. */
export function projectPerspective(model: PreviewModel, camera: SceneCamera, size: number): ScreenVertices {
    const count = model.verticesX.length;
    const sx = new Float32Array(count);
    const sy = new Float32Array(count);
    const sz = new Float32Array(count);
    const invW = new Float32Array(count);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let v = 0; v < count; v++) {
        const world: Vec3 = [model.verticesX[v], -model.verticesY[v], model.verticesZ[v]];
        const rel = sub(world, camera.eye);
        const depth = Math.max(1, dot(rel, camera.forward));
        sx[v] = size / 2 + (camera.focal * dot(rel, camera.right)) / depth;
        sy[v] = size / 2 - (camera.focal * dot(rel, camera.up)) / depth;
        sz[v] = depth;
        invW[v] = 1 / depth;
        minX = Math.min(minX, model.verticesX[v]);
        maxX = Math.max(maxX, model.verticesX[v]);
        minY = Math.min(minY, model.verticesY[v]);
        maxY = Math.max(maxY, model.verticesY[v]);
        minZ = Math.min(minZ, model.verticesZ[v]);
        maxZ = Math.max(maxZ, model.verticesZ[v]);
    }
    const extent = count === 0 ? { x: 0, y: 0, z: 0 } : { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
    return { sx, sy, sz, invW, extent };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const coverage = (v: number, min: number, max: number, span: number): number => clamp01(Math.min(v - min, max - v) / span + 0.5);
const lineCoverage = (v: number, span: number): number => clamp01(1 - Math.abs(v - Math.round(v / TILE) * TILE) / span);
const edgeCoverage = (v: number, at: number, span: number): number => clamp01(1.5 - Math.abs(v - at) / span);

const channel = (rgb: number, shift: number): number => (rgb >> shift) & 255;
const mix = (base: [number, number, number], rgb: number, amount: number): void => {
    base[0] += (channel(rgb, 16) - base[0]) * amount;
    base[1] += (channel(rgb, 8) - base[1]) * amount;
    base[2] += (channel(rgb, 0) - base[2]) * amount;
};

export interface Footprint {
    /** Object size in tiles along X and Z (already swapped for rotated objects). */
    tilesX: number;
    tilesZ: number;
}

/**
 * Paints the background and ground grid into `out` (RGBA), then composites the rasterized model over it. The grid is
 * cast per pixel onto the ground plane (world Y = 0, where models stand), so the model always occludes it.
 */
export function composeObjectScene(out: Uint8ClampedArray, model: Rasterizer, camera: SceneCamera, footprint: Footprint, theme: SceneTheme): void {
    const size = model.width;
    const half = size / 2;
    const tilesX = Math.max(1, Math.min(16, footprint.tilesX));
    const tilesZ = Math.max(1, Math.min(16, footprint.tilesZ));
    const maxX = (tilesX + 2) * TILE;
    const maxZ = (tilesZ + 2) * TILE;
    // The grid is centred on the model's footprint: one extra tile on every side.
    const originX = -maxX / 2;
    const originZ = -maxZ / 2;
    const footMinX = TILE;
    const footMaxX = maxX - TILE;
    const footMinZ = TILE;
    const footMaxZ = maxZ - TILE;

    const hit = (px: number, py: number): [number, number] | undefined => {
        const nx = (px - half) / camera.focal;
        const ny = (half - py) / camera.focal;
        const dx = camera.forward[0] + camera.right[0] * nx + camera.up[0] * ny;
        const dy = camera.forward[1] + camera.right[1] * nx + camera.up[1] * ny;
        const dz = camera.forward[2] + camera.right[2] * nx + camera.up[2] * ny;
        if (dy >= -1e-6) return undefined;
        const t = -camera.eye[1] / dy;
        if (t <= 0) return undefined;
        return [camera.eye[0] + t * dx - originX, camera.eye[2] + t * dz - originZ];
    };

    const color: [number, number, number] = [0, 0, 0];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const index = (y * size + x) * 4;
            const alpha = model.color[index + 3];
            color[0] = channel(theme.background, 16);
            color[1] = channel(theme.background, 8);
            color[2] = channel(theme.background, 0);

            if (alpha < 255) {
                const here = hit(x + 0.5, y + 0.5);
                const right = hit(x + 1.5, y + 0.5);
                const below = hit(x + 0.5, y + 1.5);
                if (here && right && below) {
                    const [u, w] = here;
                    const spanU = Math.max(Math.abs(right[0] - u) + Math.abs(below[0] - u), 1e-3);
                    const spanW = Math.max(Math.abs(right[1] - w) + Math.abs(below[1] - w), 1e-3);
                    const inside = Math.min(coverage(u, 0, maxX, spanU), coverage(w, 0, maxZ, spanW));
                    if (inside > 0) {
                        const foot = Math.min(coverage(u, footMinX, footMaxX, spanU), coverage(w, footMinZ, footMaxZ, spanW));
                        const line = Math.max(lineCoverage(u, spanU), lineCoverage(w, spanW));
                        const outline =
                            foot > 0
                                ? Math.max(edgeCoverage(u, footMinX, spanU), edgeCoverage(u, footMaxX, spanU), edgeCoverage(w, footMinZ, spanW), edgeCoverage(w, footMaxZ, spanW))
                                : 0;
                        // Fade towards the outer edge of the grid.
                        const fade = clamp01(0.35 + Math.min(Math.min(u, maxX - u) / (TILE * 0.6), Math.min(w, maxZ - w) / (TILE * 0.6)));
                        mix(color, theme.gridFill, 0.5 * inside * fade);
                        mix(color, theme.footprint, 0.3 * foot);
                        mix(color, theme.gridLine, 0.6 * line * inside * fade);
                        mix(color, theme.footprint, 0.85 * outline * foot);
                    }
                }
            }

            const a = alpha / 255;
            out[index] = color[0] * (1 - a) + model.color[index] * a;
            out[index + 1] = color[1] * (1 - a) + model.color[index + 1] * a;
            out[index + 2] = color[2] * (1 - a) + model.color[index + 2] * a;
            out[index + 3] = 255;
        }
    }
}

/** Renders the whole preview (model + grid) into `out`; returns the model's extent for the caption. */
export function renderObjectScene(
    raster: Rasterizer,
    out: Uint8ClampedArray,
    model: PreviewModel,
    view: SceneView,
    footprint: Footprint,
    theme: SceneTheme,
    textures?: TextureLookup,
    uvs?: Float32Array,
): { x: number; y: number; z: number } {
    raster.clear();
    // Frame at least the footprint (the whole grid when there is no model), so small objects and the empty state look right.
    const tiles = Math.hypot(footprint.tilesX + (model.verticesX.length === 0 ? 2 : 0), footprint.tilesZ + (model.verticesX.length === 0 ? 2 : 0));
    const camera = buildCamera(model, view, raster.width, Math.max(48, 0.5 * TILE * tiles));
    const projected = projectPerspective(model, camera, raster.width);
    const extent = rasterizeProjectedModel(raster, model, projected, textures, uvs ?? model.uvs);
    composeObjectScene(out, raster, camera, footprint, theme);
    return extent;
}
