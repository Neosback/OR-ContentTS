import { PerfGovernor } from "../../perf/perf-governor";
import { glMemory, perfLog } from "../../perf/gl-memory";
import { perf } from "../../perf/perf-profile";
import { pixelRatio } from "../../util/DeviceUtil";
import { RenderStats } from "./RenderStats";

/**
 * Matches the drawing buffer to the canvas's CSS size. The size is rounded: canvas.width stores
 * an integer, so an unrounded fractional product (browser zoom, scaled displays) never compared
 * equal and reallocated the WebGL drawing buffer every frame.
 */
/**
 * Optional cap on the render pixel ratio (localStorage `openrune.maxPixelRatio`, e.g. 1 or 1.5).
 * At 2x (Retina) the GPU shades four times the pixels of 1x; capping trades sharpness for load.
 */
function maxPixelRatio(): number {
    try {
        const stored = Number(window.localStorage.getItem("openrune.maxPixelRatio"));
        return stored >= 0.5 && stored <= 4 ? stored : Infinity;
    } catch {
        return Infinity;
    }
}

function resizeCanvas(canvas: HTMLCanvasElement, cssSize?: { width: number; height: number }) {
    // Read live: zooming or moving to another monitor changes it after load, and so does the performance profile.
    const devicePixelRatio = Math.min(window.devicePixelRatio || pixelRatio, maxPixelRatioCap, perf.profile.pixelRatioCap);
    const width = Math.max(1, Math.round((cssSize?.width ?? canvas.offsetWidth) * devicePixelRatio));
    const height = Math.max(1, Math.round((cssSize?.height ?? canvas.offsetHeight) * devicePixelRatio));

    if (width !== canvas.width || height !== canvas.height) {
        canvas.width = width;
        canvas.height = height;
        return true;
    }

    return false;
}

const maxPixelRatioCap = maxPixelRatio();

// Active from the first allocation (init), not just after start(): refuse GL allocations beyond 1.5x the profile budget.
glMemory.setLimit(perf.profile.gpuBudgetMB * 1.5 * 1048576);

export abstract class Renderer {
    canvas: HTMLCanvasElement;
    /** Optional 2D overlay drawn above the WebGL canvas (e.g. CPU wireframes). */
    overlayCanvas?: HTMLCanvasElement;
    animationId: number | undefined;
    running: boolean = false;

    /** Frame limit while active; starts at the performance profile's limit and may be changed by the user. */
    fpsLimit: number = perf.profile.fpsLimit;

    /** No input for this long (and nothing loading) counts as idle and drops to the profile's idle frame rate. */
    private static readonly IDLE_AFTER_MS = 3000;
    private static readonly GUARD_WINDOW_MS = 1000;
    private lastActivityAt = performance.now();
    private guardWindowStart = 0;
    private guardWindowFrames = 0;
    private guardWindowActive = false;
    private readonly governor = new PerfGovernor();
    private unsubscribePerf?: () => void;

    /** CSS size from a ResizeObserver, so frames don't force a layout by reading offsetWidth. */
    private cssSize?: { width: number; height: number };
    private resizeObserver?: ResizeObserver;

    stats: RenderStats = new RenderStats();

    constructor() {
        this.canvas = document.createElement("canvas");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.display = "block";
        this.canvas.tabIndex = 0;
    }

    abstract init(): Promise<void>;

    abstract cleanUp(): void;

    /** Override to keep rendering at full rate while the scene is busy (regions loading, builds pending). */
    protected hasPendingWork(): boolean {
        return false;
    }

    private readonly markActive = (): void => {
        this.lastActivityAt = performance.now();
    };

    private static readonly ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;

    start() {
        this.running = true;
        this.lastActivityAt = performance.now();
        for (const type of Renderer.ACTIVITY_EVENTS) window.addEventListener(type, this.markActive, { passive: true, capture: true });
        // Resuming after a guard pause restarts the loop.
        this.unsubscribePerf = perf.subscribe(() => {
            if (this.running && this.animationId === undefined && !perf.getSnapshot().paused) {
                this.governor.reset();
                this.guardWindowStart = 0;
                this.animationId = requestAnimationFrame(this.frameCallback);
            }
        });
        if (typeof ResizeObserver !== "undefined" && !this.resizeObserver) {
            this.resizeObserver = new ResizeObserver(([entry]) => {
                this.cssSize = { width: entry.contentRect.width, height: entry.contentRect.height };
            });
            this.resizeObserver.observe(this.canvas);
        }
        this.animationId = requestAnimationFrame(this.frameCallback);
    }

    stop() {
        this.running = false;
        for (const type of Renderer.ACTIVITY_EVENTS) window.removeEventListener(type, this.markActive, { capture: true });
        this.unsubscribePerf?.();
        this.unsubscribePerf = undefined;
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
        this.cssSize = undefined;
        if (this.animationId !== undefined) {
            cancelAnimationFrame(this.animationId);
            this.animationId = undefined;
        }
        this.cleanUp();
    }

    onResize(width: number, height: number) {}

    /** True when the user is not interacting and nothing is loading: the renderer drops to the idle frame rate. */
    private isIdle(now: number): boolean {
        return now - this.lastActivityAt > Renderer.IDLE_AFTER_MS && !this.hasPendingWork();
    }

    /** Called once per frame; every ~second asks the governor whether rendering is hurting the machine. */
    private observeHealth(now: number, idle: boolean): void {
        if (this.guardWindowStart === 0) {
            this.guardWindowStart = now;
            this.guardWindowFrames = 0;
            this.guardWindowActive = false;
        }
        this.guardWindowFrames++;
        this.guardWindowActive ||= !idle;

        const elapsed = now - this.guardWindowStart;
        if (elapsed < Renderer.GUARD_WINDOW_MS) return;

        const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        const action = this.governor.sample(
            {
                frameMs: elapsed / this.guardWindowFrames,
                idle: !this.guardWindowActive,
                heapBytes: memory?.usedJSHeapSize,
                heapLimitBytes: memory?.jsHeapSizeLimit,
                gpuBytes: glMemory.bytes,
                gpuBudgetBytes: perf.profile.gpuBudgetMB * 1048576,
            },
            perf.level,
        );
        this.guardWindowStart = 0;

        if (action.type === "downgrade") {
            perf.downgrade(action.to, `${action.reason}. Lowered the performance level to ${action.to}.`);
            this.fpsLimit = Math.min(this.fpsLimit, perf.profile.fpsLimit);
        } else if (action.type === "pause") {
            perf.pause(`${action.reason}. Rendering was paused to protect your computer.`);
        }
    }

    frameCallback = (time: DOMHighResTimeStamp) => {
        // Paused by the performance guard: do not render or reschedule until the user resumes (see start()).
        if (perf.getSnapshot().paused) {
            this.animationId = undefined;
            return;
        }
        try {
            const resized = resizeCanvas(this.canvas, this.cssSize);
            if (resized) {
                this.onResize(this.canvas.width, this.canvas.height);
            }

            const deltaTime = this.stats.getDeltaTime(time);
            const now = performance.now();
            const idle = this.isIdle(now);
            const limit = idle ? Math.min(this.fpsLimit || Infinity, perf.profile.idleFps) : this.fpsLimit;

            if (limit && deltaTime > 0) {
                const tolerance = 1;
                if (deltaTime < 1000 / limit - tolerance) {
                    return;
                }
            }

            this.stats.update(time);

            if (this.stats.frameCount === 0) perfLog(`phase: first frame ${this.canvas.width}x${this.canvas.height}`);
            this.render(time, deltaTime, resized);

            this.onFrameEnd();
            this.observeHealth(now, idle);
        } finally {
            if (this.running && !perf.getSnapshot().paused) {
                this.animationId = requestAnimationFrame(this.frameCallback);
            }
        }
    };

    abstract render(
        time: DOMHighResTimeStamp,
        deltaTime: DOMHighResTimeStamp,
        resized: boolean,
    ): void;

    onFrameEnd() {
        this.stats.onFrameEnd();
    }
}
