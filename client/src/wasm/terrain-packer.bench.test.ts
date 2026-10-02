import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, it } from "vitest";

import { loadOpenRuneCoreSync } from "./openrune-core-loader";
import {
    packTerrainVertexBatchTs,
    packTerrainVertexBatchWasm,
    type TerrainVertexBatchInput,
} from "./terrain-packer";

const enabled = !!process.env.BENCH;
const here = path.dirname(fileURLToPath(import.meta.url));

function fullBatch(tileCount: number): TerrainVertexBatchInput {
    const vertexCount = tileCount * 36;
    return {
        tileCounts: new Uint32Array(tileCount).fill(36),
        xs: Int32Array.from({ length: vertexCount }, (_, i) => i & 0xffff),
        zs: Int32Array.from({ length: vertexCount }, (_, i) => (i * 7) & 0xffff),
        hsls: Int32Array.from({ length: vertexCount }, (_, i) => i & 0xffff),
        textureIndices: Int32Array.from({ length: vertexCount }, (_, i) => (i % 5 === 0 ? -1 : i & 1023)),
    };
}

describe.runIf(enabled)("terrain batch packer benchmark", () => {
    beforeAll(() => {
        loadOpenRuneCoreSync(fs.readFileSync(path.join(here, "openrune-core/openrune_core_bg.wasm")));
    });

    for (const tileCount of [64, 512, 4096]) {
        it(`${tileCount} full tile slots`, () => {
            const input = fullBatch(tileCount);
            const time = (label: string, run: () => Uint8Array) => {
                run();
                const samples: number[] = [];
                let bytes = 0;
                for (let i = 0; i < 9; i++) {
                    const start = performance.now();
                    bytes = run().byteLength;
                    samples.push(performance.now() - start);
                }
                samples.sort((a, b) => a - b);
                const median = samples[4]!;
                console.log(`${tileCount} tiles ${label}: ${median.toFixed(3)} ms (${bytes} bytes)`);
                return median;
            };

            const ts = time("TS", () => packTerrainVertexBatchTs(input));
            const wasm = time("WASM", () => packTerrainVertexBatchWasm(input));
            console.log(`speed-up x${(ts / wasm).toFixed(2)}`);
        });
    }
});
