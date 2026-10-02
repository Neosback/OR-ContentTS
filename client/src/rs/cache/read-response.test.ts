import { describe, expect, it } from "vitest";

import { readResponseToBuffer } from "./read-response";

function chunked(chunks: number[][], headers: Record<string, string>): Response {
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
            controller.close();
        },
    });
    return new Response(stream, { headers });
}

describe("readResponseToBuffer", () => {
    it("fills one pre-sized buffer and reports progress", async () => {
        const progress: number[] = [];
        const buffer = await readResponseToBuffer(chunked([[1, 2], [3], [4, 5]], { "Content-Length": "5" }), false, (p) => progress.push(p.current));
        expect(Array.from(new Uint8Array(buffer!))).toEqual([1, 2, 3, 4, 5]);
        expect(progress).toEqual([0, 2, 3, 5]);
    });

    it("can allocate shared memory", async () => {
        const buffer = await readResponseToBuffer(chunked([[9, 9]], { "Content-Length": "2" }), true);
        expect(buffer instanceof SharedArrayBuffer).toBe(true);
    });

    it("declines (without consuming the body) when the length is unknown or the body is encoded", async () => {
        const unknown = chunked([[1]], {});
        expect(await readResponseToBuffer(unknown, false)).toBeUndefined();
        expect(unknown.bodyUsed).toBe(false);
        expect(await readResponseToBuffer(chunked([[1]], { "Content-Length": "1", "Content-Encoding": "gzip" }), false)).toBeUndefined();
    });

    it("rejects a body that does not match Content-Length", async () => {
        await expect(readResponseToBuffer(chunked([[1, 2, 3]], { "Content-Length": "2" }), false)).rejects.toThrow(/longer/);
        await expect(readResponseToBuffer(chunked([[1]], { "Content-Length": "2" }), false)).rejects.toThrow(/ended after/);
    });
});
