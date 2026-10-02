import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { vec3 } from "gl-matrix";
import { beforeAll, describe, expect, it } from "vitest";

import { SceneBuffer, getModelFaces, isModelFaceTransparent } from "../mapviewer/webgl/buffer/SceneBuffer";
import type { Model } from "../rs/model/Model";
import type { TextureLoader } from "../rs/texture/TextureLoader";
import { emitSlotJobsTs, buildSlotMesh } from "../mapeditor/webgl/loader/object-slot-mesh";
import type { DrawCommand } from "../mapviewer/webgl/buffer/SceneBuffer";
import type { LocAnimatedData } from "../mapviewer/webgl/loc/LocAnimatedData";
import { MeshPacker, buildTextureTables, packModel, packModelOffsets, runSlotJobs } from "./mesh-packer";
import { initSync } from "./openrune-core/openrune_core";

const here = path.dirname(fileURLToPath(import.meta.url));

/** xorshift32, so the fixtures are the same on every run. */
function rng(seed: number): () => number {
    let s = seed | 0 || 1;
    return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return (s >>> 0) / 0x1_0000_0000;
    };
}

const TEXTURE_INDEX = new Map<number, number>([
    [5, 3],
    [20, 700],
    [77, 1100], // >= 1024: the vertex format treats this as untextured
    [300, 513], // sets the 10th bit of the texture index
]);
const TRANSLUCENT_TEXTURES = new Set([20, 300]);
const TEXTURE_IDS = [-1, -1, -1, 5, 20, 77, 300, 999];

const textureLoader = { isTransparent: (id: number) => TRANSLUCENT_TEXTURES.has(id) } as unknown as TextureLoader;

function randomModel(random: () => number, options: { textured: boolean; contour: boolean }): Model {
    const vertexCount = 4 + Math.floor(random() * 40);
    const faceCount = 1 + Math.floor(random() * 60);
    const int = (range: number) => Math.floor(random() * range * 2) - range;
    const verticesX = Int32Array.from({ length: vertexCount }, () => int(900));
    const verticesY = Int32Array.from({ length: vertexCount }, () => int(900));
    const verticesZ = Int32Array.from({ length: vertexCount }, () => int(900));
    const colors = () => Int32Array.from({ length: faceCount }, () => Math.floor(random() * 0x10000));
    const faceColors3 = colors();
    for (let i = 0; i < faceCount; i++) {
        const roll = random();
        if (roll < 0.15) faceColors3[i] = -1;
        else if (roll < 0.22) faceColors3[i] = -2;
    }
    const model: Record<string, unknown> = {
        faceCount,
        verticesX,
        verticesY,
        verticesZ,
        indices1: Int32Array.from({ length: faceCount }, () => Math.floor(random() * vertexCount)),
        indices2: Int32Array.from({ length: faceCount }, () => Math.floor(random() * vertexCount)),
        indices3: Int32Array.from({ length: faceCount }, () => Math.floor(random() * vertexCount)),
        faceColors1: colors(),
        faceColors2: colors(),
        faceColors3,
        faceAlphas: Int8Array.from({ length: faceCount }, () => (random() < 0.3 ? int(128) : 0)),
        faceRenderPriorities: Int8Array.from({ length: faceCount }, () => Math.floor(random() * 12)),
    };
    if (options.contour) model.contourVerticesY = Int32Array.from({ length: vertexCount }, () => int(900));
    if (options.textured) {
        model.faceTextures = Int16Array.from({ length: faceCount }, () => TEXTURE_IDS[Math.floor(random() * TEXTURE_IDS.length)]);
        // multiples of 1/128 hit the Math.round tie case of the 11-bit packing
        model.uvs = Float32Array.from({ length: faceCount * 6 }, () => (Math.floor(random() * 300) - 60) / 128);
    }
    return model as unknown as Model;
}

function referencePack(models: Model[], pass: boolean, offsets: (vec3 | undefined)[], reuse: boolean) {
    const buffer = new SceneBuffer(textureLoader, TEXTURE_INDEX, 16);
    const added: number[] = [];
    models.forEach((model, i) => {
        const faces = getModelFaces(model).filter((face) => isModelFaceTransparent(textureLoader, face) === pass);
        const before = buffer.indices.length;
        buffer.addModel(model, faces, offsets[i], reuse);
        added.push(buffer.indices.length - before);
    });
    const vertexBytes = buffer.vertexBuf.byteArray();
    return {
        vertices: new Uint32Array(vertexBytes.slice().buffer),
        indices: Uint32Array.from(buffer.indices),
        added,
        usedTextures: [...buffer.usedTextureIds],
    };
}

function wasmPack(models: Model[], pass: boolean, offsets: (vec3 | undefined)[], reuse: boolean) {
    const tables = buildTextureTables(TEXTURE_INDEX, (id) => TRANSLUCENT_TEXTURES.has(id));
    const packer = new MeshPacker(tables.index, tables.transparent, 16);
    const added = models.map((model, i) => packModel(packer, model, pass, offsets[i], reuse));
    const result = { vertices: packer.vertices(), indices: packer.indices(), added, usedTextures: [...packer.used_texture_ids()] };
    packer.free();
    return result;
}

beforeAll(() => {
    initSync({ module: fs.readFileSync(path.join(here, "openrune-core/openrune_core_bg.wasm")) });
});

describe("MeshPacker (wasm) matches SceneBuffer.addModel (TS)", () => {
    for (const reuse of [true, false]) {
        for (const pass of [false, true]) {
            it(`byte-identical output, ${pass ? "translucent" : "opaque"} pass, vertex reuse ${reuse}`, () => {
                const random = rng(0xc0ffee + (pass ? 1 : 0) + (reuse ? 2 : 0));
                const models: Model[] = [];
                const offsets: (vec3 | undefined)[] = [];
                for (let i = 0; i < 300; i++) {
                    models.push(randomModel(random, { textured: random() < 0.6, contour: random() < 0.4 }));
                    offsets.push(random() < 0.7 ? [Math.floor(random() * 7000) - 1000, Math.floor(random() * 600) - 300, Math.floor(random() * 7000) - 1000] : undefined);
                }
                const expected = referencePack(models, pass, offsets, reuse);
                const actual = wasmPack(models, pass, offsets, reuse);
                expect(actual.added).toEqual(expected.added);
                expect(actual.vertices.length).toBe(expected.vertices.length);
                expect(Array.from(actual.vertices)).toEqual(Array.from(expected.vertices));
                expect(Array.from(actual.indices)).toEqual(Array.from(expected.indices));
                expect(actual.usedTextures).toEqual(expected.usedTextures);
                // the fixtures must actually exercise the interesting paths
                expect(expected.indices.length).toBeGreaterThan(500);
            });
        }
    }

    it("SceneBuffer.addModelPass gives the same geometry with and without the packer, including the instanced path", () => {
        const random = rng(99);
        const models = Array.from({ length: 120 }, () => randomModel(random, { textured: random() < 0.6, contour: false }));
        const build = (withPacker: boolean) => {
            const buffer = new SceneBuffer(textureLoader, TEXTURE_INDEX, 16);
            const tables = buildTextureTables(TEXTURE_INDEX, (id) => TRANSLUCENT_TEXTURES.has(id));
            const packer = withPacker ? new MeshPacker(tables.index, tables.transparent, 16) : undefined;
            if (packer) buffer.useMeshPacker(packer);
            const ranges: number[] = [];
            for (const model of models) {
                // the instanced path of addSceneModels: pre-partitioned faces, no offset
                const faces = getModelFaces(model);
                for (const transparent of [false, true]) {
                    const before = buffer.indexByteOffset();
                    buffer.addModelPass(
                        model,
                        transparent,
                        undefined,
                        faces.filter((face) => isModelFaceTransparent(textureLoader, face) === transparent),
                    );
                    ranges.push(before, buffer.indexByteOffset());
                }
            }
            const geometry = buffer.packedGeometry();
            const result = {
                ranges,
                vertexCount: geometry.vertexCount,
                words: Array.from(new Uint32Array(geometry.view.buffer, geometry.view.byteOffset, geometry.vertexCount * 3)),
                indices: Array.from(geometry.indices),
            };
            packer?.free();
            return result;
        };
        const reference = build(false);
        expect(reference.indices.length).toBeGreaterThan(1000);
        expect(build(true)).toEqual(reference);
    });

    it("batched repeated placements are byte-identical to sequential packModel calls", () => {
        const random = rng(0x51a7);
        const model = randomModel(random, { textured: true, contour: true });
        const offsets = Int32Array.from({ length: 90 }, (_, i) => {
            const placement = Math.floor(i / 3);
            if (i % 3 === 0) return placement * 37 - 400;
            if (i % 3 === 1) return placement % 4 === 0 ? -32 : placement * 3;
            return placement * 23 + 75;
        });
        const tables = buildTextureTables(TEXTURE_INDEX, (id) => TRANSLUCENT_TEXTURES.has(id));

        for (const transparent of [false, true]) {
            const sequential = new MeshPacker(tables.index, tables.transparent, 16);
            const expectedCounts: number[] = [];
            for (let i = 0; i < offsets.length; i += 3) {
                expectedCounts.push(
                    packModel(
                        sequential,
                        model,
                        transparent,
                        [offsets[i]!, offsets[i + 1]!, offsets[i + 2]!],
                    ),
                );
            }

            const batched = new MeshPacker(tables.index, tables.transparent, 16);
            const counts = packModelOffsets(batched, model, transparent, offsets);

            expect(Array.from(counts)).toEqual(expectedCounts);
            expect(Array.from(batched.vertices())).toEqual(Array.from(sequential.vertices()));
            expect(Array.from(batched.indices())).toEqual(Array.from(sequential.indices()));
            expect(Array.from(batched.used_texture_ids())).toEqual(Array.from(sequential.used_texture_ids()));

            sequential.free();
            batched.free();
        }
    });

    it("refuses direct addModel calls once a packer owns the buffer", () => {
        const tables = buildTextureTables(TEXTURE_INDEX, () => false);
        const packer = new MeshPacker(tables.index, tables.transparent, 16);
        const buffer = new SceneBuffer(textureLoader, TEXTURE_INDEX, 16);
        buffer.useMeshPacker(packer);
        expect(() => buffer.addModel(randomModel(rng(3), { textured: false, contour: false }), [])).toThrow(/addModelPass/);
        packer.free();
    });

    it("rejects textured faces without texture coordinates, like the TS version", () => {
        const model = randomModel(rng(7), { textured: true, contour: false });
        (model as unknown as { uvs?: Float32Array }).uvs = undefined;
        const tables = buildTextureTables(TEXTURE_INDEX, () => false);
        const packer = new MeshPacker(tables.index, tables.transparent, 16);
        expect(() => packModel(packer, model, false)).toThrow(/texture coordinates/);
        packer.free();
    });

    describe("slot mesh kernel", () => {
        /** A packer + SceneBuffer pair holding the same models, plus the draw command of every model. */
        function packedScene(withPacker: boolean, random: () => number) {
            const buffer = new SceneBuffer(textureLoader, TEXTURE_INDEX, 16);
            const tables = buildTextureTables(TEXTURE_INDEX, (id) => TRANSLUCENT_TEXTURES.has(id));
            const packer = new MeshPacker(tables.index, tables.transparent, 16);
            if (withPacker) buffer.useMeshPacker(packer);
            const commands: DrawCommand[] = [];
            const alphaCommands: DrawCommand[] = [];
            for (let i = 0; i < 80; i++) {
                const model = randomModel(random, { textured: random() < 0.5, contour: false });
                for (const transparent of [false, true]) {
                    const offset = buffer.indexByteOffset();
                    buffer.addModelPass(model, transparent, [i * 5, 0, i * 3]);
                    const elements = (buffer.indexByteOffset() - offset) / 4;
                    const instance = { sceneX: i & 63, sceneZ: (i * 7) & 63, heightOffset: i % 5 ? 0 : 16, level: i & 3, contourGround: 3, priority: i & 7, interactType: 1, interactId: i + 1, roof: i % 9 === 0 };
                    // every other model is placed twice, like a repeated tree
                    (transparent ? alphaCommands : commands).push({ offset, elements, instances: i % 2 ? [instance, { ...instance, sceneX: 1 }] : [instance] });
                }
            }
            return { buffer, packer, commands, alphaCommands };
        }

        it("matches the TypeScript remap loop for random jobs", () => {
            const { buffer, packer } = packedScene(false, rng(21));
            const geometry = buffer.packedGeometry();
            // feed the same geometry to a packer that only holds it: rebuild through a packer-mode buffer
            const scene = packedScene(true, rng(21));
            const random = rng(5);
            const indexCount = scene.packer.index_count();
            const jobs: number[] = [];
            for (let i = 0; i < 400; i++) {
                const first = Math.floor(random() * indexCount);
                const count = Math.floor(random() * Math.min(60, indexCount - first));
                jobs.push(first, count, Math.floor(random() * 40), random() < 0.25 ? 1 : 0);
            }
            const jobWords = Uint32Array.from(jobs);
            const reference = emitSlotJobsTs(geometry.view, geometry.indices, geometry.vertexCount, jobWords);
            const actual = runSlotJobs(scene.packer, jobWords);
            expect(Array.from(actual.words)).toEqual(Array.from(reference.words));
            expect(Array.from(actual.staticIndices)).toEqual(Array.from(reference.staticIndices));
            expect(Array.from(actual.animIndices)).toEqual(Array.from(reference.animIndices));
            expect(Array.from(actual.jobLengths)).toEqual(Array.from(reference.jobLengths));
            expect(reference.words.length).toBeGreaterThan(400);
            packer.free();
            scene.packer.free();
        });

        it("rejects jobs that read past the index list", () => {
            const scene = packedScene(true, rng(3));
            expect(() => runSlotJobs(scene.packer, Uint32Array.from([scene.packer.index_count(), 5, 0, 0]))).toThrow();
            scene.packer.free();
        });

        it("buildSlotMesh gives an identical slot mesh in wasm and TypeScript mode, animated locs included", () => {
            const build = (withPacker: boolean) => {
                const { buffer, packer, commands, alphaCommands } = packedScene(withPacker, rng(77));
                // animated locs: a placeholder command per loc plus frame ranges over existing geometry
                const animated: LocAnimatedData[] = [];
                for (let loc = 0; loc < 4; loc++) {
                    const placeholder: DrawCommand = { offset: 0, elements: 0, instances: [{ sceneX: loc, sceneZ: 2, heightOffset: 0, level: 0, contourGround: 3, priority: 1, interactType: 2, interactId: 900 + loc }] };
                    const index = commands.push(placeholder) - 1;
                    const frame = (start: number) => [start * 4, 30 + loc];
                    animated.push({
                        drawRangeInteractIndex: index,
                        anim: { frames: [frame(0), frame(40), frame(10)], framesAlpha: loc % 2 ? [frame(5), frame(0)] : undefined },
                        seqId: 100 + loc,
                        randomStart: loc === 1,
                    } as unknown as LocAnimatedData);
                }
                buffer.drawCommandsInteract = commands;
                buffer.drawCommandsInteractAlpha = alphaCommands;
                const mesh = buildSlotMesh(buffer, animated);
                packer.free();
                return mesh;
            };
            const reference = build(false);
            const actual = build(true);
            expect(reference.slotCount).toBeGreaterThan(100);
            expect(reference.locsAnimated.length).toBe(4);
            expect(reference.animIndices.length).toBeGreaterThan(0);
            expect(actual.slotCount).toBe(reference.slotCount);
            expect(actual.staticOpaqueCount).toBe(reference.staticOpaqueCount);
            expect(actual.staticAlphaCount).toBe(reference.staticAlphaCount);
            expect(Array.from(actual.vertices)).toEqual(Array.from(reference.vertices));
            expect(Array.from(actual.indices)).toEqual(Array.from(reference.indices));
            expect(Array.from(actual.animIndices)).toEqual(Array.from(reference.animIndices));
            expect(Array.from(actual.slotInfo)).toEqual(Array.from(reference.slotInfo));
            expect(actual.locsAnimated).toEqual(reference.locsAnimated);
        });
    });
});
