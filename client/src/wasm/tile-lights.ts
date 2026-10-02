import { isOpenRuneCoreActive } from "./openrune-core-loader";
import { calculate_tile_lights } from "./openrune-core/openrune_core";

const EMPTY_OCCLUSIONS = new Uint8Array(0);

export interface TileLightPlaneInput {
    heights: Int32Array[];
    occlusions: Uint8Array[];
    sizeX: number;
    sizeY: number;
    ignoreOcclusion: boolean;
}

function validatePlane(input: TileLightPlaneInput): void {
    if (input.heights.length < input.sizeX) {
        throw new Error("tile light height plane has too few columns");
    }
    if (!input.ignoreOcclusion && input.occlusions.length < input.sizeX) {
        throw new Error("tile light occlusion plane has too few columns");
    }
    for (let x = 0; x < input.sizeX; x++) {
        if (input.heights[x]!.length < input.sizeY) {
            throw new Error("tile light height plane has a short column");
        }
        if (!input.ignoreOcclusion && input.occlusions[x]!.length < input.sizeY) {
            throw new Error("tile light occlusion plane has a short column");
        }
    }
}

/** TypeScript reference implementation of Scene.calculateTileLights for one plane. */
export function calculateTileLightsPlaneTs(input: TileLightPlaneInput): Int32Array[] {
    validatePlane(input);

    const lights: Int32Array[] = new Array(input.sizeX);
    for (let i = 0; i < input.sizeX; i++) {
        lights[i] = new Int32Array(input.sizeY);
    }

    const LIGHT_DIR_X = -50;
    const LIGHT_DIR_Y = -10;
    const LIGHT_DIR_Z = -50;
    const LIGHT_INTENSITY_BASE = 96;
    const LIGHT_INTENSITY_FACTOR = 768;
    const HEIGHT_SCALE = 65536;

    const lightMagnitude =
        Math.sqrt(
            LIGHT_DIR_X * LIGHT_DIR_X + LIGHT_DIR_Y * LIGHT_DIR_Y + LIGHT_DIR_Z * LIGHT_DIR_Z,
        ) | 0;
    const lightIntensity = (lightMagnitude * LIGHT_INTENSITY_FACTOR) >> 8;

    for (let x = 1; x < input.sizeX - 1; x++) {
        for (let y = 1; y < input.sizeY - 1; y++) {
            const heightDeltaX = input.heights[x + 1]![y]! - input.heights[x - 1]![y]!;
            const heightDeltaY = input.heights[x]![y + 1]! - input.heights[x]![y - 1]!;

            const tileNormalLength =
                Math.sqrt(
                    heightDeltaY * heightDeltaY + heightDeltaX * heightDeltaX + HEIGHT_SCALE,
                ) | 0;

            const normalizedTileNormalX = ((heightDeltaX << 8) / tileNormalLength) | 0;
            const normalizedTileNormalY = (HEIGHT_SCALE / tileNormalLength) | 0;
            const normalizedTileNormalZ = ((heightDeltaY << 8) / tileNormalLength) | 0;

            const dot =
                normalizedTileNormalX * LIGHT_DIR_X +
                normalizedTileNormalY * LIGHT_DIR_Y +
                normalizedTileNormalZ * LIGHT_DIR_Z;
            const sunLight = (dot / lightIntensity + LIGHT_INTENSITY_BASE) | 0;

            const lightOcclusion = input.ignoreOcclusion
                ? 0
                : (input.occlusions[x - 1]![y]! >> 2) +
                  (input.occlusions[x]![y - 1]! >> 2) +
                  (input.occlusions[x + 1]![y]! >> 3) +
                  (input.occlusions[x]![y + 1]! >> 3) +
                  (input.occlusions[x]![y]! >> 1);

            lights[x]![y] = sunLight - lightOcclusion;
        }
    }

    return lights;
}

function flattenHeights(input: TileLightPlaneInput): Int32Array {
    const flat = new Int32Array(input.sizeX * input.sizeY);
    for (let x = 0; x < input.sizeX; x++) {
        flat.set(input.heights[x]!.subarray(0, input.sizeY), x * input.sizeY);
    }
    return flat;
}

function flattenOcclusions(input: TileLightPlaneInput): Uint8Array {
    if (input.ignoreOcclusion) {
        return EMPTY_OCCLUSIONS;
    }
    const flat = new Uint8Array(input.sizeX * input.sizeY);
    for (let x = 0; x < input.sizeX; x++) {
        flat.set(input.occlusions[x]!.subarray(0, input.sizeY), x * input.sizeY);
    }
    return flat;
}

function columnsFromFlat(flat: Int32Array, sizeX: number, sizeY: number): Int32Array[] {
    const columns: Int32Array[] = new Array(sizeX);
    for (let x = 0; x < sizeX; x++) {
        columns[x] = flat.slice(x * sizeY, (x + 1) * sizeY);
    }
    return columns;
}

/** Direct end-to-end WASM path including flatten/unflatten copies. */
export function calculateTileLightsPlaneWasm(input: TileLightPlaneInput): Int32Array[] {
    validatePlane(input);
    const flat = calculate_tile_lights(
        input.sizeX,
        input.sizeY,
        flattenHeights(input),
        flattenOcclusions(input),
        input.ignoreOcclusion,
    );
    return columnsFromFlat(flat, input.sizeX, input.sizeY);
}

export function calculateTileLightsPlane(input: TileLightPlaneInput): Int32Array[] {
    return isOpenRuneCoreActive()
        ? calculateTileLightsPlaneWasm(input)
        : calculateTileLightsPlaneTs(input);
}
