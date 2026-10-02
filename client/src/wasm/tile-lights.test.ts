import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { loadOpenRuneCoreSync } from "./openrune-core-loader";
import {
    calculateTileLightsPlaneTs,
    calculateTileLightsPlaneWasm,
    type TileLightPlaneInput,
} from "./tile-lights";

const here = path.dirname(fileURLToPath(import.meta.url));

beforeAll(() => {
    loadOpenRuneCoreSync(fs.readFileSync(path.join(here, "openrune-core/openrune_core_bg.wasm")));
});

function fixture(seed: number, sizeX: number, sizeY: number, ignoreOcclusion: boolean): TileLightPlaneInput {
    let state = seed | 0;
    const next = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return state >>> 0;
    };

    const heights = Array.from({ length: sizeX }, () => {
        const column = new Int32Array(sizeY);
        for (let y = 0; y < sizeY; y++) {
            column[y] = ((next() % 6000) - 3000) * 8;
        }
        return column;
    });
    const occlusions = Array.from({ length: sizeX }, () => {
        const column = new Uint8Array(sizeY);
        for (let y = 0; y < sizeY; y++) {
            column[y] = next() & 0xff;
        }
        return column;
    });

    return { heights, occlusions, sizeX, sizeY, ignoreOcclusion };
}

function flatten(columns: Int32Array[]): number[] {
    return columns.flatMap((column) => Array.from(column));
}

describe("tile light wasm kernel", () => {
    for (const ignoreOcclusion of [false, true]) {
        it(`matches TypeScript exactly, ignore occlusion=${ignoreOcclusion}`, () => {
            for (const [seed, sizeX, sizeY] of [
                [1, 3, 3],
                [0xc0ffee, 64, 64],
                [0x12345678, 76, 76],
            ] as const) {
                const input = fixture(seed, sizeX, sizeY, ignoreOcclusion);
                expect(flatten(calculateTileLightsPlaneWasm(input))).toEqual(
                    flatten(calculateTileLightsPlaneTs(input)),
                );
            }
        });
    }

    it("keeps boundary lights zero like Scene.calculateTileLights", () => {
        const input = fixture(99, 8, 9, false);
        const lights = calculateTileLightsPlaneWasm(input);
        expect(Array.from(lights[0]!)).toEqual(new Array(9).fill(0));
        expect(Array.from(lights[7]!)).toEqual(new Array(9).fill(0));
        for (let x = 0; x < 8; x++) {
            expect(lights[x]![0]).toBe(0);
            expect(lights[x]![8]).toBe(0);
        }
    });
});
