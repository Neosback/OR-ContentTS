/**
 * Estimates live WebGL memory by wrapping the allocation calls on `WebGL2RenderingContext`.
 *
 * Browsers do not expose GPU memory, and on Apple Silicon GPU memory is the same pool as RAM (it shows up as
 * "wired"), so a runaway allocation freezes the whole machine rather than just the tab. The meter keeps a running
 * estimate of buffer, texture and renderbuffer bytes so the performance guard can pause before that happens, and so a
 * misbehaving allocation can be traced (see `describe()`).
 *
 * Install once, before any context is created (importing this module does it).
 */

export type GlMemoryKind = "buffer" | "texture" | "renderbuffer";

const LOG_KEY = "openrune.perfLog";

/** Appends a line to a small localStorage ring so diagnostics survive the page being closed or frozen. */
export function perfLog(line: string): void {
    try {
        const entries: string[] = JSON.parse(window.localStorage.getItem(LOG_KEY) ?? "[]");
        entries.push(`${new Date().toISOString().slice(11, 23)} ${line}`);
        window.localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-60)));
    } catch {
        // Storage unavailable; diagnostics are best-effort.
    }
}

function callSite(): string {
    return (new Error().stack ?? "").split("\n").slice(3, 7).map((l) => l.trim().replace(/^at /, "").slice(0, 90)).join(" < ");
}

interface Tracked {
    kind: GlMemoryKind;
    bytes: number;
}

type AnyObj = object;

const BYTES_PER_PIXEL: Record<number, number> = {
    0x1908: 4, // RGBA
    0x1907: 3, // RGB
    0x1906: 1, // ALPHA
    0x1909: 1, // LUMINANCE
    0x8058: 4, // RGBA8
    0x8051: 3, // RGB8
    0x8229: 1, // R8
    0x822b: 2, // RG8
    0x8d48: 2, // STENCIL_INDEX8 (approx)
    0x8c43: 4, // SRGB8_ALPHA8
    0x8814: 16, // RGBA32F
    0x881a: 8, // RGBA16F
    0x8815: 12, // RGB32F
    0x822e: 4, // R32F
    0x8230: 8, // RG32F
    0x8235: 1, // R8I
    0x8d8e: 3, // RGB8I
    0x8d8f: 4, // RGBA8I (also used by this app for material data)
    0x8d70: 16, // RGBA32UI
    0x8d7c: 4, // RGBA8UI
    0x81a5: 2, // DEPTH_COMPONENT16
    0x81a6: 3, // DEPTH_COMPONENT24
    0x8cac: 4, // DEPTH_COMPONENT32F
    0x88f0: 4, // DEPTH24_STENCIL8
    0x8dad: 5, // DEPTH32F_STENCIL8
};

function bytesPerPixel(internalFormat: number): number {
    return BYTES_PER_PIXEL[internalFormat] ?? 4;
}

function mipChainBytes(width: number, height: number, depth: number, levels: number, bpp: number): number {
    let total = 0;
    let w = width;
    let h = height;
    let d = depth;
    for (let level = 0; level < levels; level++) {
        total += w * h * d * bpp;
        w = Math.max(1, w >> 1);
        h = Math.max(1, h >> 1);
        d = Math.max(1, d >> 1);
    }
    return total;
}

class GlMemoryMeter {
    private liveBytes = 0;
    private readonly tracked = new WeakMap<AnyObj, Tracked>();
    private readonly byKind: Record<GlMemoryKind, number> = { buffer: 0, texture: 0, renderbuffer: 0 };
    private readonly bound = new WeakMap<WebGL2RenderingContext, Map<number, AnyObj | null>>();
    private limitBytes = Infinity;
    private readonly largest: { kind: GlMemoryKind; bytes: number; note: string }[] = [];
    private nextLogAt = 256 * 1048576;

    get bytes(): number {
        return this.liveBytes;
    }

    /** Hard cap: an allocation that would exceed it throws instead of reaching the driver. */
    setLimit(bytes: number): void {
        this.limitBytes = Math.min(bytes, this.overrideBytes);
    }

    private overrideBytes = Infinity;

    /** Diagnostics: a stricter cap that profile changes cannot raise. */
    setOverride(bytes: number): void {
        this.overrideBytes = bytes;
        this.limitBytes = Math.min(this.limitBytes, bytes);
    }

    describe(): string {
        const mb = (n: number): string => `${Math.round(n / 1048576)} MB`;
        const top = this.largest
            .slice(0, 5)
            .map((entry) => `${entry.kind} ${mb(entry.bytes)} ${entry.note}`)
            .join("; ");
        return `GL ~${mb(this.liveBytes)} (buffers ${mb(this.byKind.buffer)}, textures ${mb(this.byKind.texture)}, renderbuffers ${mb(this.byKind.renderbuffer)}). Largest: ${top}`;
    }

    private bindingMap(gl: WebGL2RenderingContext): Map<number, AnyObj | null> {
        let map = this.bound.get(gl);
        if (!map) {
            map = new Map();
            this.bound.set(gl, map);
        }
        return map;
    }

    bind(gl: WebGL2RenderingContext, target: number, object: AnyObj | null): void {
        this.bindingMap(gl).set(target, object);
    }

    current(gl: WebGL2RenderingContext, target: number): AnyObj | null {
        return this.bindingMap(gl).get(target) ?? null;
    }

    /** Records `bytes` as the (new) size of `object`, replacing any earlier size. */
    set(object: AnyObj | null, kind: GlMemoryKind, bytes: number, note: string): void {
        if (!object) return;
        const previous = this.tracked.get(object);
        const delta = bytes - (previous?.bytes ?? 0);
        if (delta > 0 && this.liveBytes + delta > this.limitBytes) {
            perfLog(`REFUSED ${note} ${Math.round(bytes / 1048576)} MB; ${this.describe()} @ ${callSite()}`);
            throw new Error(`GPU memory budget exceeded: ${note} needs ${Math.round(bytes / 1048576)} MB. ${this.describe()}`);
        }
        this.tracked.set(object, { kind, bytes });
        this.liveBytes += delta;
        this.byKind[kind] += delta;
        if (bytes >= 32 * 1048576) perfLog(`GL ${kind} ${Math.round(bytes / 1048576)} MB ${note} @ ${callSite()}`);
        if (bytes >= 8 * 1048576) {
            this.largest.push({ kind, bytes, note });
            this.largest.sort((a, b) => b.bytes - a.bytes);
            this.largest.length = Math.min(this.largest.length, 8);
        }
        if (this.liveBytes >= this.nextLogAt) {
            this.nextLogAt = Math.ceil((this.liveBytes + 1) / (256 * 1048576)) * 256 * 1048576;
            console.warn(`[gl-memory] ${this.describe()}`);
            perfLog(this.describe());
        }
    }

    add(object: AnyObj | null, kind: GlMemoryKind, extra: number, note: string): void {
        if (!object) return;
        this.set(object, kind, (this.tracked.get(object)?.bytes ?? 0) + extra, note);
    }

    size(object: AnyObj | null): number {
        return (object && this.tracked.get(object)?.bytes) || 0;
    }

    release(object: AnyObj | null): void {
        if (!object) return;
        const previous = this.tracked.get(object);
        if (!previous) return;
        this.tracked.delete(object);
        this.liveBytes -= previous.bytes;
        this.byKind[previous.kind] -= previous.bytes;
    }
}

export const glMemory = new GlMemoryMeter();

/** Triangles a draw of `count` vertices produces for a GL primitive mode (lines and points count as none). */
export function trianglesForDraw(mode: number, count: number): number {
    if (count < 3) return 0;
    if (mode === 0x0004) return Math.floor(count / 3); // TRIANGLES
    if (mode === 0x0005 || mode === 0x0006) return count - 2; // TRIANGLE_STRIP / TRIANGLE_FAN
    return 0;
}

/**
 * Draw calls and triangles per frame, counted by wrapping the draw entry points (including WEBGL_multi_draw, which
 * the terrain and object passes use). `last*` is the finished frame; call `endFrame()` once per frame.
 */
class DrawStatsMeter {
    calls = 0;
    triangles = 0;
    lastCalls = 0;
    lastTriangles = 0;

    record(mode: number, count: number, instances = 1): void {
        this.calls++;
        this.triangles += trianglesForDraw(mode, count) * Math.max(1, instances);
    }

    endFrame(): void {
        this.lastCalls = this.calls;
        this.lastTriangles = this.triangles;
        this.calls = 0;
        this.triangles = 0;
    }
}

export const drawStats = new DrawStatsMeter();

type Fn = (...args: any[]) => any;

function wrap<K extends keyof WebGL2RenderingContext>(
    proto: WebGL2RenderingContext,
    name: K,
    around: (self: WebGL2RenderingContext, args: any[], original: Fn) => any,
): void {
    const original = proto[name] as unknown as Fn;
    (proto as unknown as Record<string, Fn>)[name as string] = function (this: WebGL2RenderingContext, ...args: any[]) {
        return around(this, args, original);
    };
}

function sourceBytes(source: unknown): number {
    if (!source) return 0;
    const view = source as { byteLength?: number };
    return typeof view.byteLength === "number" ? view.byteLength : 0;
}

let installed = false;

/** Patches the allocation entry points. Safe to call repeatedly; does nothing without WebGL2. */
export function installGlMemoryMeter(): void {
    if (installed || typeof WebGL2RenderingContext === "undefined") return;
    installed = true;
    const proto = WebGL2RenderingContext.prototype;
    const m = glMemory;

    wrap(proto, "bindBuffer", (gl, args, original) => {
        m.bind(gl, args[0], args[1]);
        return original.apply(gl, args);
    });
    wrap(proto, "bufferData", (gl, args, original) => {
        const [target, data, , srcOffset, length] = args;
        let bytes = typeof data === "number" ? data : sourceBytes(data);
        if (typeof data !== "number" && data && ArrayBuffer.isView(data) && length) {
            bytes = length * ((data as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1);
        } else if (srcOffset && typeof data !== "number") {
            bytes = Math.max(0, bytes - srcOffset);
        }
        m.set(m.current(gl, target), "buffer", bytes, `bufferData(${bytes} B)`);
        return original.apply(gl, args);
    });
    wrap(proto, "deleteBuffer", (gl, args, original) => {
        m.release(args[0]);
        return original.apply(gl, args);
    });

    wrap(proto, "bindTexture", (gl, args, original) => {
        m.bind(gl, args[0], args[1]);
        return original.apply(gl, args);
    });
    wrap(proto, "texStorage2D", (gl, args, original) => {
        const [target, levels, internalFormat, width, height] = args;
        const bytes = mipChainBytes(width, height, 1, levels, bytesPerPixel(internalFormat));
        m.set(m.current(gl, target), "texture", bytes, `texStorage2D ${width}x${height} x${levels}`);
        return original.apply(gl, args);
    });
    wrap(proto, "texStorage3D", (gl, args, original) => {
        const [target, levels, internalFormat, width, height, depth] = args;
        const bytes = mipChainBytes(width, height, depth, levels, bytesPerPixel(internalFormat));
        m.set(m.current(gl, target), "texture", bytes, `texStorage3D ${width}x${height}x${depth} x${levels}`);
        return original.apply(gl, args);
    });
    wrap(proto, "texImage2D", (gl, args, original) => {
        const [target, level, internalFormat] = args;
        const dims = args.length >= 9 ? { w: args[3], h: args[4] } : { w: args[5]?.width ?? 0, h: args[5]?.height ?? 0 };
        const bytes = dims.w * dims.h * bytesPerPixel(internalFormat);
        // Cube faces and mip levels add up; replacing level 0 resets the size estimate for that texture.
        const texture = m.current(gl, target);
        if (level === 0) m.set(texture, "texture", bytes, `texImage2D ${dims.w}x${dims.h}`);
        else m.add(texture, "texture", bytes, `texImage2D ${dims.w}x${dims.h} level ${level}`);
        return original.apply(gl, args);
    });
    wrap(proto, "texImage3D", (gl, args, original) => {
        const [target, level, internalFormat, width, height, depth] = args;
        const bytes = width * height * depth * bytesPerPixel(internalFormat);
        const texture = m.current(gl, target);
        if (level === 0) m.set(texture, "texture", bytes, `texImage3D ${width}x${height}x${depth}`);
        else m.add(texture, "texture", bytes, `texImage3D level ${level}`);
        return original.apply(gl, args);
    });
    wrap(proto, "generateMipmap", (gl, args, original) => {
        const texture = m.current(gl, args[0]);
        // A full mip chain adds about a third on top of level 0.
        m.add(texture, "texture", Math.round(m.size(texture) / 3), "generateMipmap");
        return original.apply(gl, args);
    });
    wrap(proto, "deleteTexture", (gl, args, original) => {
        m.release(args[0]);
        return original.apply(gl, args);
    });

    wrap(proto, "bindRenderbuffer", (gl, args, original) => {
        m.bind(gl, args[0], args[1]);
        return original.apply(gl, args);
    });
    wrap(proto, "renderbufferStorage", (gl, args, original) => {
        const [target, internalFormat, width, height] = args;
        m.set(m.current(gl, target), "renderbuffer", width * height * bytesPerPixel(internalFormat), `renderbuffer ${width}x${height}`);
        return original.apply(gl, args);
    });
    wrap(proto, "renderbufferStorageMultisample", (gl, args, original) => {
        const [target, samples, internalFormat, width, height] = args;
        const bytes = width * height * bytesPerPixel(internalFormat) * Math.max(1, samples);
        m.set(m.current(gl, target), "renderbuffer", bytes, `renderbufferMS ${width}x${height} x${samples}`);
        return original.apply(gl, args);
    });
    wrap(proto, "deleteRenderbuffer", (gl, args, original) => {
        m.release(args[0]);
        return original.apply(gl, args);
    });
}

/** Counts draw calls and triangles (see `drawStats`). */
function installDrawCounters(): void {
    if (typeof WebGL2RenderingContext === "undefined") return;
    const proto = WebGL2RenderingContext.prototype;
    wrap(proto, "drawArrays", (gl, args, original) => {
        drawStats.record(args[0], args[2]);
        return original.apply(gl, args);
    });
    wrap(proto, "drawElements", (gl, args, original) => {
        drawStats.record(args[0], args[1]);
        return original.apply(gl, args);
    });
    wrap(proto, "drawArraysInstanced", (gl, args, original) => {
        drawStats.record(args[0], args[2], args[3]);
        return original.apply(gl, args);
    });
    wrap(proto, "drawElementsInstanced", (gl, args, original) => {
        drawStats.record(args[0], args[1], args[4]);
        return original.apply(gl, args);
    });
    // WEBGL_multi_draw lives on an extension object: patch it the first time a context hands it out.
    const patched = new WeakSet<object>();
    wrap(proto, "getExtension", (gl, args, original) => {
        const extension = original.apply(gl, args);
        if (extension && args[0] === "WEBGL_multi_draw" && !patched.has(extension)) {
            patched.add(extension);
            const ext = extension as Record<string, Fn>;
            const sum = (list: ArrayLike<number> | undefined, offset: number, drawCount: number): number => {
                let total = 0;
                for (let i = 0; i < drawCount; i++) total += list?.[offset + i] ?? 0;
                return total;
            };
            const arrays = ext.multiDrawArraysWEBGL;
            if (arrays) {
                ext.multiDrawArraysWEBGL = function (this: unknown, ...a: any[]) {
                    drawStats.record(a[0], sum(a[3], a[4], a[5]));
                    return arrays.apply(this, a);
                };
            }
            // picogl submits geometry through the instanced variants (one instance per range).
            const weighted = (counts: ArrayLike<number> | undefined, countsOffset: number, instances: ArrayLike<number> | undefined, instancesOffset: number, drawCount: number): number => {
                let total = 0;
                for (let i = 0; i < drawCount; i++) total += (counts?.[countsOffset + i] ?? 0) * Math.max(1, instances?.[instancesOffset + i] ?? 1);
                return total;
            };
            const arraysInstanced = ext.multiDrawArraysInstancedWEBGL;
            if (arraysInstanced) {
                ext.multiDrawArraysInstancedWEBGL = function (this: unknown, ...a: any[]) {
                    drawStats.record(a[0], weighted(a[3], a[4], a[5], a[6], a[7]));
                    return arraysInstanced.apply(this, a);
                };
            }
            const elementsInstanced = ext.multiDrawElementsInstancedWEBGL;
            if (elementsInstanced) {
                ext.multiDrawElementsInstancedWEBGL = function (this: unknown, ...a: any[]) {
                    drawStats.record(a[0], weighted(a[1], a[2], a[6], a[7], a[8]));
                    return elementsInstanced.apply(this, a);
                };
            }
            const elements = ext.multiDrawElementsWEBGL;
            if (elements) {
                ext.multiDrawElementsWEBGL = function (this: unknown, ...a: any[]) {
                    drawStats.record(a[0], sum(a[1], a[2], a[6]));
                    return elements.apply(this, a);
                };
            }
        }
        return extension;
    });
}

/** Logs creation of large canvases (a 2D/WebGL canvas is GPU memory too, and is not covered by the GL wrappers). */
function installCanvasMeter(): void {
    if (typeof HTMLCanvasElement === "undefined") return;
    const seen = new WeakSet<object>();
    const originalGetContext = HTMLCanvasElement.prototype.getContext as Fn;
    (HTMLCanvasElement.prototype as unknown as Record<string, Fn>).getContext = function (this: HTMLCanvasElement, ...args: any[]) {
        const context = originalGetContext.apply(this, args);
        if (!seen.has(this)) {
            seen.add(this);
            const pixels = this.width * this.height;
            if (pixels >= 1_000_000) {
                perfLog(`canvas ${args[0]} ${this.width}x${this.height} (~${Math.round((pixels * 4) / 1048576)} MB) @ ${callSite()}`);
            }
        }
        return context;
    };
    if (typeof OffscreenCanvas !== "undefined") {
        const Original = OffscreenCanvas;
        (globalThis as unknown as Record<string, unknown>).OffscreenCanvas = class extends Original {
            constructor(width: number, height: number) {
                super(width, height);
                if (width * height >= 1_000_000) perfLog(`OffscreenCanvas ${width}x${height} (~${Math.round((width * height * 4) / 1048576)} MB) @ ${callSite()}`);
            }
        };
    }
}

try {
    const override = Number(window.localStorage.getItem("openrune.glHardLimitMB"));
    if (override > 0) glMemory.setOverride(override * 1048576);
} catch {
    // ignore
}
installCanvasMeter();
installGlMemoryMeter();
installDrawCounters();

// Dev-only console handle: `__glMemory.describe()`.
if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as { __glMemory?: GlMemoryMeter }).__glMemory = glMemory;
    (window as unknown as { __drawStats?: DrawStatsMeter }).__drawStats = drawStats;
}
