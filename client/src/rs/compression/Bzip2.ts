import WasmBzip2 from "@foxglove/wasm-bz2";

import bzip2 from "bzip2";

export class Bzip2 {
    static bzip2Header = new Uint8Array("BZh1".split("").map((char) => char.charCodeAt(0)));

    /** WASM decoder; until it loads (or if it fails) the pure-JS decoder is used. */
    static wasmBzip?: WasmBzip2;

    static async initWasm(): Promise<void> {
        if (Bzip2.wasmBzip) return;
        try {
            Bzip2.wasmBzip = await WasmBzip2.init();
        } catch (error) {
            console.warn("[bzip2] WASM decoder unavailable, using the JS fallback", error);
        }
    }

    static decompress(compressed: Uint8Array, actualSize: number): Int8Array {
        const compressedBzip = new Uint8Array(compressed.length + 4);
        compressedBzip.set(Bzip2.bzip2Header, 0);
        compressedBzip.set(compressed, 4);

        if (Bzip2.wasmBzip) {
            const decompressed = Bzip2.wasmBzip.decompress(compressedBzip, actualSize, { small: false });
            // Copy out of the WASM heap; the next call reuses it.
            return new Int8Array(
                decompressed.buffer.slice(decompressed.byteOffset, decompressed.byteOffset + decompressed.byteLength),
            );
        }

        const result = bzip2.simple(bzip2.array(compressedBzip));
        return new Int8Array(result.buffer, result.byteOffset, result.byteLength);
    }
}
