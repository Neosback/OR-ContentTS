import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { loadOpenRuneCoreSync, setOpenRuneCoreEnabled } from "./openrune-core-loader";
import { addTerrainTile, packTerrainTileBatch } from "../mapeditor/webgl/loader/EditorMapDataLoader";
import { TOTAL_TILE_VERTICES, TerrainVertexBuffer } from "../mapeditor/webgl/buffer/TerrainVertexBuffer";
import type { SceneTile } from "../rs/scene/SceneTile";
import {
    TERRAIN_TILE_SLOT_BYTES,
    packTerrainVertexBatchTs,
    packTerrainVertexBatchWasm,
    type TerrainVertexBatchInput,
} from "./terrain-packer";

const here = path.dirname(fileURLToPath(import.meta.url));

beforeAll(() => {
    loadOpenRuneCoreSync(fs.readFileSync(path.join(here, "openrune-core/openrune_core_bg.wasm")));
});

function fixture(seed: number, tileCount: number): TerrainVertexBatchInput {
    let state = seed | 0;
    const next = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return state >>> 0;
    };

    const counts = Uint32Array.from({ length: tileCount }, () => next() % 37);
    const vertexCount = counts.reduce((sum, count) => sum + count, 0);
    const xs = new Int32Array(vertexCount);
    const zs = new Int32Array(vertexCount);
    const hsls = new Int32Array(vertexCount);
    const textureIndices = new Int32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
        xs[i] = (next() % 20000) - 10000;
        zs[i] = (next() % 20000) - 10000;
        hsls[i] = (next() % 0x20000) - 0x8000;
        textureIndices[i] = next() % 4 === 0 ? -1 : (next() % 1400);
    }

    return { tileCounts: counts, xs, zs, hsls, textureIndices };
}

describe("terrain vertex batch packer", () => {
    it("is byte-identical to the TypeScript reference across random tile batches", () => {
        for (const [seed, tiles] of [[1, 1], [0xc0ffee, 17], [0x12345678, 256]] as const) {
            const input = fixture(seed, tiles);
            const expected = packTerrainVertexBatchTs(input);
            const actual = packTerrainVertexBatchWasm(input);
            expect(actual.byteLength).toBe(tiles * TERRAIN_TILE_SLOT_BYTES);
            expect(Array.from(actual)).toEqual(Array.from(expected));
        }
    });

    it("zero-fills unused vertices in every fixed tile slot", () => {
        const input: TerrainVertexBatchInput = {
            tileCounts: Uint32Array.from([1, 0, 2]),
            xs: Int32Array.from([5, 10, 20]),
            zs: Int32Array.from([6, 11, 21]),
            hsls: Int32Array.from([7, 12, 22]),
            textureIndices: Int32Array.from([-1, -1, 3]),
        };
        const actual = packTerrainVertexBatchWasm(input);
        expect(actual.slice(8, TERRAIN_TILE_SLOT_BYTES).every((value) => value === 0)).toBe(true);
        expect(
            actual
                .slice(TERRAIN_TILE_SLOT_BYTES, TERRAIN_TILE_SLOT_BYTES * 2)
                .every((value) => value === 0),
        ).toBe(true);
        expect(
            actual
                .slice(TERRAIN_TILE_SLOT_BYTES * 2 + 16, TERRAIN_TILE_SLOT_BYTES * 3)
                .every((value) => value === 0),
        ).toBe(true);
    });

    it("matches Uint16 wrapping and textured-light masking semantics", () => {
        const input: TerrainVertexBatchInput = {
            tileCounts: Uint32Array.from([2]),
            xs: Int32Array.from([-1, 0x1_0001]),
            zs: Int32Array.from([-2, 0x1_0002]),
            hsls: Int32Array.from([0x1234, 0x1ff]),
            textureIndices: Int32Array.from([-1, 8]),
        };
        expect(Array.from(packTerrainVertexBatchWasm(input))).toEqual(
            Array.from(packTerrainVertexBatchTs(input)),
        );
    });

    it("matches the existing per-tile renderer packer for flattened SceneTile models", () => {
        const textureIndex = new Map<number, number>([
            [5, 3],
            [20, 11],
        ]);
        const tiles = [
            {
                tileModel: {
                    faces: [
                        {
                            vertices: [
                                { x: 10, z: 20, hsl: 0x1234, textureId: -1 },
                                { x: 30, z: 40, hsl: 0x01ff, textureId: 5 },
                                { x: -50, z: 60, hsl: 0x00aa, textureId: 20 },
                            ],
                        },
                    ],
                },
            },
            { tileModel: undefined },
            {
                tileModel: {
                    faces: [
                        {
                            vertices: [
                                { x: 70, z: -80, hsl: 0x0033, textureId: -1 },
                                { x: 90, z: 100, hsl: 0x00fe, textureId: 999 },
                            ],
                        },
                    ],
                },
            },
        ] as unknown as SceneTile[];

        const reference = new Uint8Array(tiles.length * TERRAIN_TILE_SLOT_BYTES);
        for (let i = 0; i < tiles.length; i++) {
            const buffer = new TerrainVertexBuffer(TOTAL_TILE_VERTICES);
            addTerrainTile(textureIndex, buffer, tiles[i]!, -768, -768);
            reference.set(buffer.bytes, i * TERRAIN_TILE_SLOT_BYTES);
        }

        setOpenRuneCoreEnabled(false);
        const ts = packTerrainTileBatch(textureIndex, tiles, -768, -768);
        setOpenRuneCoreEnabled(true);
        const wasm = packTerrainTileBatch(textureIndex, tiles, -768, -768);

        expect(Array.from(ts)).toEqual(Array.from(reference));
        expect(Array.from(wasm)).toEqual(Array.from(reference));
    });

    it("rejects malformed batches", () => {
        expect(() =>
            packTerrainVertexBatchWasm({
                tileCounts: Uint32Array.from([37]),
                xs: new Int32Array(37),
                zs: new Int32Array(37),
                hsls: new Int32Array(37),
                textureIndices: new Int32Array(37),
            }),
        ).toThrow(/36-vertex/);

        expect(() =>
            packTerrainVertexBatchWasm({
                tileCounts: Uint32Array.from([2]),
                xs: new Int32Array(1),
                zs: new Int32Array(1),
                hsls: new Int32Array(1),
                textureIndices: new Int32Array(1),
            }),
        ).toThrow(/counts/);
    });
});
