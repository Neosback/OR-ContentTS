import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, it } from "vitest";

import { loadOpenRuneCoreSync } from "./openrune-core-loader";
import {
    calculateTileLightsPlaneTs,
    calculateTileLightsPlaneWasm,
    type TileLightPlaneInput,
} from "./tile-lights";

const enabled = !!process.env.BENCH;
const here = path.dirname(fileURLToPath(import.meta.url));

function fixture(sizeX: number, sizeY: number, ignoreOcclusion: boolean): TileLightPlaneInput {
    const heights = Array.from({ length: sizeX }, (_, x) =>
        Int32Array.from({ length: sizeY }, (_, y) => ((x * 97 + y * 53) % 5000) - 2500),
    );
    const occlusions = Array.from({ length: sizeX }, (_, x) =>
        Uint8Array.from({ length: sizeY }, (_, y) => (x * 17 + y * 31) & 0xff),
    );
    return { heights, occlusions, sizeX, sizeY, ignoreOcclusion };
}

describe.runIf(enabled)("tile light benchmark", () => {
    beforeAll(() => {
        loadOpenRuneCoreSync(fs.readFileSync(path.join(here, "openrune-core/openrune_core_bg.wasm")));
    });

    for (const ignoreOcclusion of [false, true]) {
        it(`76x76, ignore occlusion=${ignoreOcclusion}`, () => {
            const input = fixture(76, 76, ignoreOcclusion);
            const time = (label: string, run: () => Int32Array[]) => {
                for (let i = 0; i < 10; i++) run();
                const samples: number[] = [];
                let checksum = 0;
                for (let i = 0; i < 25; i++) {
                    const start = performance.now();
                    const result = run();
                    samples.push(performance.now() - start);
                    checksum += result[32]![32]!;
                }
                samples.sort((a, b) => a - b);
                const median = samples[12]!;
                console.log(`${label}: ${median.toFixed(3)} ms checksum=${checksum}`);
                return median;
            };
            const ts = time("TS", () => calculateTileLightsPlaneTs(input));
            const wasm = time("WASM", () => calculateTileLightsPlaneWasm(input));
            console.log(`speed-up x${(ts / wasm).toFixed(2)}`);
        });
    }
});
