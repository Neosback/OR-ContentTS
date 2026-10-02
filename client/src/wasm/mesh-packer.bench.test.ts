import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, it } from "vitest";

import { SceneBuffer, getModelFaces, isModelFaceTransparent } from "../mapviewer/webgl/buffer/SceneBuffer";
import type { Model } from "../rs/model/Model";
import type { TextureLoader } from "../rs/texture/TextureLoader";
import { MeshPacker, buildTextureTables, packModel, packModelOffsets } from "./mesh-packer";
import { initSync } from "./openrune-core/openrune_core";

/** Kernel micro-benchmark: `BENCH=1 npx vitest run src/wasm/mesh-packer.bench.test.ts`. Prints timings, asserts nothing. */
const enabled = !!process.env.BENCH;

function fixtureModels(count: number, faces: number): Model[] {
    let s = 12345;
    const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 0x1_0000_0000;
    const models: Model[] = [];
    for (let m = 0; m < count; m++) {
        const vertexCount = Math.max(4, Math.floor(faces * 0.6));
        const arr = (range: number) => Int32Array.from({ length: vertexCount }, () => Math.floor(random() * range * 2) - range);
        const f = (range: number) => Int32Array.from({ length: faces }, () => Math.floor(random() * range));
        models.push({
            faceCount: faces,
            verticesX: arr(400),
            verticesY: arr(400),
            verticesZ: arr(400),
            indices1: f(vertexCount),
            indices2: f(vertexCount),
            indices3: f(vertexCount),
            faceColors1: f(0x10000),
            faceColors2: f(0x10000),
            faceColors3: f(0x10000),
            faceAlphas: new Int8Array(faces),
            faceRenderPriorities: new Int8Array(faces),
        } as unknown as Model);
    }
    return models;
}

describe.runIf(enabled)("mesh pack kernel benchmark", () => {
    beforeAll(() => {
        const here = path.dirname(fileURLToPath(import.meta.url));
        initSync({ module: fs.readFileSync(path.join(here, "openrune-core/openrune_core_bg.wasm")) });
    });

    for (const [count, faces] of [[3000, 40], [3000, 150], [400, 1200]] as const) {
        it(`${count} models x ${faces} faces`, () => {
            const models = fixtureModels(count, faces);
            const loader = { isTransparent: () => false } as unknown as TextureLoader;
            const map = new Map<number, number>();
            const tables = buildTextureTables(map, () => false);
            const time = (label: string, run: () => void): number => {
                run(); // warm up
                const samples: number[] = [];
                for (let i = 0; i < 7; i++) {
                    const t = performance.now();
                    run();
                    samples.push(performance.now() - t);
                }
                samples.sort((a, b) => a - b);
                console.log(`${count}x${faces} ${label}: median ${samples[3].toFixed(2)} ms`);
                return samples[3];
            };
            const ts = time("TS  ", () => {
                const buffer = new SceneBuffer(loader, map, 2048);
                for (const model of models) {
                    buffer.addModel(model, getModelFaces(model).filter((face) => !isModelFaceTransparent(loader, face)), [10, 0, 10]);
                }
            });
            let outputs = 0;
            const wasm = time("WASM", () => {
                const packer = new MeshPacker(tables.index, tables.transparent, 2048);
                for (const model of models) packModel(packer, model, false, [10, 0, 10]);
                outputs = packer.vertices().length + packer.indices().length; // include copying the result out
                packer.free();
            });
            console.log(`   speed-up x${(ts / wasm).toFixed(2)} (${outputs} output words)`);
        });
    }

    it("repeated cached-model placements", () => {
        const models = fixtureModels(1, 250);
        const model = models[0]!;
        const loader = { isTransparent: () => false } as unknown as TextureLoader;
        const map = new Map<number, number>();
        const tables = buildTextureTables(map, () => false);
        const placements = 400;
        const offsets = Int32Array.from({ length: placements * 3 }, (_, i) => {
            const placement = Math.floor(i / 3);
            if (i % 3 === 0) return placement * 13;
            if (i % 3 === 1) return (placement & 7) * -4;
            return placement * 9;
        });

        const time = (label: string, run: () => void): number => {
            run();
            const samples: number[] = [];
            for (let i = 0; i < 9; i++) {
                const start = performance.now();
                run();
                samples.push(performance.now() - start);
            }
            samples.sort((a, b) => a - b);
            const median = samples[4]!;
            console.log(`400 repeated placements ${label}: median ${median.toFixed(2)} ms`);
            return median;
        };

        const sequential = time("sequential", () => {
            const packer = new MeshPacker(tables.index, tables.transparent, 4096);
            for (let i = 0; i < offsets.length; i += 3) {
                packModel(packer, model, false, [offsets[i]!, offsets[i + 1]!, offsets[i + 2]!]);
            }
            packer.free();
        });
        const batched = time("batched", () => {
            const packer = new MeshPacker(tables.index, tables.transparent, 4096);
            packModelOffsets(packer, model, false, offsets);
            packer.free();
        });
        console.log(`   placement batch speed-up x${(sequential / batched).toFixed(2)}`);
        void loader;
    });
});
