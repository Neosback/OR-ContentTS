import assert from "node:assert/strict";

import { readTerrainTile } from "../game/plugins/editmode/RegionPack";

/** Builds terrain data where every tile is empty except the one given opcode run. */
function terrain(wide: boolean, target: { plane: number; x: number; y: number }, run: number[]): Uint8Array {
    const out: number[] = [];
    const write = (value: number) => (wide ? out.push((value >> 8) & 0xff, value & 0xff) : out.push(value & 0xff));
    for (let plane = 0; plane < 4; plane++) {
        for (let x = 0; x < 64; x++) {
            for (let y = 0; y < 64; y++) {
                if (plane === target.plane && x === target.x && y === target.y) {
                    for (const value of run) write(value);
                } else {
                    write(0);
                }
            }
        }
    }
    return Uint8Array.from(out);
}

for (const wide of [false, true]) {
    const target = { plane: 1, x: 12, y: 40 };
    // overlay 7 with shape 3 rotation 2, flags 0x6, underlay 20, explicit height 33
    const overlayOpcode = 2 + 3 * 4 + 2;
    const run = [overlayOpcode, 7, 49 + 6, 81 + 20, 1];
    const data = terrain(wide, target, run);
    // The height byte follows opcode 1 as a raw byte, not a (wide) value.
    const withHeight = new Uint8Array(data.length + 1);
    const heightAt = (() => {
        let offset = 0;
        const width = wide ? 2 : 1;
        for (let plane = 0; plane < 4; plane++) {
            for (let x = 0; x < 64; x++) {
                for (let y = 0; y < 64; y++) {
                    if (plane === target.plane && x === target.x && y === target.y) return offset + run.length * width;
                    offset += width;
                }
            }
        }
        return -1;
    })();
    withHeight.set(data.subarray(0, heightAt), 0);
    withHeight[heightAt] = 33;
    withHeight.set(data.subarray(heightAt), heightAt + 1);

    assert.deepEqual(readTerrainTile(withHeight, target.plane, target.x, target.y, wide), {
        height: 33,
        overlayId: 7,
        overlayShape: 3,
        overlayRotation: 2,
        underlayId: 20,
        flags: 6,
    });
    assert.deepEqual(readTerrainTile(withHeight, 0, 0, 0, wide), {
        overlayId: 0,
        overlayShape: 0,
        overlayRotation: 0,
        underlayId: 0,
        flags: 0,
    });
    assert.equal(readTerrainTile(withHeight.subarray(0, 10), 3, 63, 63, wide), undefined, "truncated data");
}

console.log("region-pack-terrain-read ok");
