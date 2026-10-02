import PicoGL, { App } from "picogl";

import { perfLog } from "../../perf/gl-memory";

/**
 * How object geometry is submitted: one `WEBGL_multi_draw` call per chunk, or one plain instanced draw per range.
 *
 * ANGLE's Metal backend advertises `WEBGL_multi_draw` but emulates it per range, and on Apple GPUs that cost several
 * GB of GPU memory for a region's object ranges (the reference client disables multi-draw on Safari for the same
 * reason). picogl only takes its multi-draw path while the *global* `PicoGL.WEBGL_INFO.MULTI_DRAW_INSTANCED` flag is
 * set, so selecting single draws means clearing that flag and the app's extension handle, not just a local boolean.
 */
export type DrawMode = "multidraw" | "singledraw";

const STORAGE_KEY = "openrune.gl";

function requestedMode(): DrawMode | undefined {
    try {
        const fromUrl = new URLSearchParams(window.location.search).get("gl");
        const value = fromUrl ?? localStorage.getItem(STORAGE_KEY);
        return value === "multidraw" || value === "singledraw" ? value : undefined;
    } catch {
        return undefined;
    }
}

/** Unmasked GPU/driver string (e.g. "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, ...)"), when exposed. */
export function describeRenderer(gl: WebGL2RenderingContext): string {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    return renderer;
}

export function isAppleMetal(renderer: string): boolean {
    return /apple|metal/i.test(renderer);
}

/**
 * Applies the draw mode to picogl and returns whether multi-draw is in use. Call once after `createApp`, before the
 * shader programs are compiled (the `MULTI_DRAW` define depends on the result).
 */
export function applyDrawMode(app: App, gl: WebGL2RenderingContext): boolean {
    const renderer = describeRenderer(gl);
    const ext = gl.getExtension("WEBGL_multi_draw");
    const requested = requestedMode();
    const mode: DrawMode = requested ?? (ext ? "multidraw" : "singledraw");
    const useMultiDraw = mode === "multidraw" && !!ext;

    const state = app.state as unknown as { extensions: { multiDrawInstanced: unknown } };
    (PicoGL.WEBGL_INFO as { MULTI_DRAW_INSTANCED: unknown }).MULTI_DRAW_INSTANCED = useMultiDraw ? ext : null;
    state.extensions.multiDrawInstanced = useMultiDraw ? ext : null;

    perfLog(
        `draw backend: ${useMultiDraw ? "multi-draw" : "single draws"} (requested=${requested ?? "auto"}, ext=${!!ext}, metal=${isAppleMetal(renderer)}, renderer=${renderer})`,
    );
    return useMultiDraw;
}
