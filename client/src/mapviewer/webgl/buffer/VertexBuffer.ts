import { FloatUtil } from "../../../util/FloatUtil";
import { clamp } from "../../../util/MathUtil";
import { DataBuffer } from "../../buffer/DataBuffer";

export class VertexBuffer extends DataBuffer {
    static readonly STRIDE = 12;

    /**
     * Open-addressing table of vertex index + 1 (0 = empty), keyed by the vertex's three packed words. Matches
     * compare the stored words, so only identical vertices are shared. The previous `Map` keyed by `v0 * v1 * v2`
     * lost precision above 2^53 and treated permutations of the words as equal.
     */
    private table = new Int32Array(1024);
    private tableMask = 1023;
    private tableCount = 0;

    constructor(count: number) {
        super(VertexBuffer.STRIDE, count);
    }

    override clear(): void {
        super.clear();
        this.table = new Int32Array(1024);
        this.tableMask = 1023;
        this.tableCount = 0;
    }

    private static slotHash(v0: number, v1: number, v2: number): number {
        let h = Math.imul(v0, 0x9e3779b1) ^ Math.imul(v1, 0x85ebca6b) ^ Math.imul(v2, 0xc2b2ae35);
        h ^= h >>> 15;
        h = Math.imul(h, 0x2c1b3c6d);
        h ^= h >>> 12;
        return h;
    }

    private growTable(): void {
        const table = new Int32Array(this.table.length * 2);
        const mask = table.length - 1;
        for (const entry of this.table) {
            if (entry === 0) continue;
            const byteOffset = (entry - 1) * VertexBuffer.STRIDE;
            let slot =
                VertexBuffer.slotHash(
                    this.view.getInt32(byteOffset, true),
                    this.view.getInt32(byteOffset + 4, true),
                    this.view.getInt32(byteOffset + 8, true),
                ) & mask;
            while (table[slot] !== 0) slot = (slot + 1) & mask;
            table[slot] = entry;
        }
        this.table = table;
        this.tableMask = mask;
    }

    addVertex(
        x: number,
        y: number,
        z: number,
        hsl: number,
        alpha: number,
        u: number,
        v: number,
        textureId: number,
        priority: number,
        reuseVertex: boolean = true,
    ) {
        if (textureId >= 1024) {
            textureId = -1;
        }
        const isTextured = textureId !== -1;
        if (isTextured) {
            // textureId = 119;
            // only light
            hsl &= 127;
            hsl |= (textureId & 0x1ff) << 7;
        }

        const xPos = clamp(x + 0x4000, 0, 0x8000);
        const yPos = clamp(-y + 0x4000, 0, 0x8000);
        const zPos = clamp(z + 0x4000, 0, 0x8000);

        priority &= 0x7;

        const uPacked = clamp(FloatUtil.packFloat11(u), 0, 0x7ff);
        const vPacked = clamp(FloatUtil.packFloat11(v), 0, 0x7ff);

        const v0 = (xPos << 17) | ((uPacked & 0x3f) << 11) | vPacked;

        const v1 = yPos | (hsl << 15) | (Number(isTextured) << 31);

        const v2 =
            (zPos << 17) |
            (alpha << 9) |
            (priority << 6) |
            (((textureId >> 9) & 0x1) << 5) |
            (uPacked >> 6);

        let slot = 0;
        if (reuseVertex) {
            const w0 = v0 | 0;
            const w1 = v1 | 0;
            const w2 = v2 | 0;
            slot = VertexBuffer.slotHash(w0, w1, w2) & this.tableMask;
            for (let entry = this.table[slot]; entry !== 0; entry = this.table[slot]) {
                const byteOffset = (entry - 1) * VertexBuffer.STRIDE;
                if (
                    this.view.getInt32(byteOffset, true) === w0 &&
                    this.view.getInt32(byteOffset + 4, true) === w1 &&
                    this.view.getInt32(byteOffset + 8, true) === w2
                ) {
                    return entry - 1;
                }
                slot = (slot + 1) & this.tableMask;
            }
        }
        this.ensureSize(1);
        const byteOffset = this.byteOffset();

        this.view.setUint32(byteOffset, v0, true);
        this.view.setUint32(byteOffset + 4, v1, true);
        this.view.setUint32(byteOffset + 8, v2, true);

        const index = this.offset++;
        if (reuseVertex) {
            this.table[slot] = index + 1;
            if (++this.tableCount * 2 > this.table.length) {
                this.growTable();
            }
        }
        return index;
    }
}
