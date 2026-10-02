export interface DownloadProgress {
    total: number;
    current: number;
    part: Uint8Array;
}

/**
 * Reads a response body straight into one pre-sized buffer.
 *
 * The chunk-collecting path holds every chunk and then copies them into the final buffer, so a 200 MB file
 * briefly needs ~400 MB. When the server states an exact `Content-Length` (and nothing re-encodes the body)
 * the buffer can be allocated up front and filled as chunks arrive, so peak memory stays at ~200 MB.
 *
 * Returns `undefined`, without touching the body, when the length is unknown; the caller falls back to
 * collecting chunks.
 */
export async function readResponseToBuffer(
    response: Response,
    shared: boolean,
    onProgress?: (progress: DownloadProgress) => void,
): Promise<ArrayBuffer | undefined> {
    const length = Number(response.headers.get("Content-Length"));
    const encoding = response.headers.get("Content-Encoding");
    if (!response.body || !Number.isFinite(length) || length <= 0 || (encoding && encoding !== "identity")) {
        return undefined;
    }

    const buffer = shared ? new SharedArrayBuffer(length) : new ArrayBuffer(length);
    const bytes = new Uint8Array(buffer);
    const reader = response.body.getReader();
    let position = 0;

    onProgress?.({ total: length, current: 0, part: new Uint8Array(0) });
    for (let result = await reader.read(); !result.done; result = await reader.read()) {
        const chunk = result.value;
        if (position + chunk.byteLength > length) {
            await reader.cancel();
            throw new Error(`Response is longer than its Content-Length (${length} bytes).`);
        }
        bytes.set(chunk, position);
        position += chunk.byteLength;
        onProgress?.({ total: length, current: position, part: chunk });
    }
    if (position !== length) {
        throw new Error(`Response ended after ${position} of ${length} bytes.`);
    }
    return buffer as ArrayBuffer;
}
