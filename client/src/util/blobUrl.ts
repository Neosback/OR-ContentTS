/**
 * Object URL for a Blob that was created in another context (a worker).
 *
 * `URL.createObjectURL` on a worker-made Blob synchronously waits until the browser has the
 * worker's bytes, which stalled the main thread for over a second per minimap image while the
 * render workers were busy. Reading the bytes first is asynchronous, and a Blob built on the
 * main thread from them registers immediately. Minimap PNGs are small, so the copy is cheap.
 */
export async function mainThreadBlobUrl(blob: Blob): Promise<string> {
    const bytes = await blob.arrayBuffer();
    return URL.createObjectURL(new Blob([bytes], { type: blob.type }));
}
