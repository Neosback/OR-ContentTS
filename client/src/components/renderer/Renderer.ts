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
    // Read live: zooming or moving to another monitor changes it after load.
    const devicePixelRatio = Math.min(window.devicePixelRatio || pixelRatio, maxPixelRatioCap);
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

export abstract class Renderer {
    canvas: HTMLCanvasElement;
    /** Optional 2D overlay drawn above the WebGL canvas (e.g. CPU wireframes). */
    overlayCanvas?: HTMLCanvasElement;
    animationId: number | undefined;
    running: boolean = false;

    fpsLimit: number = 999;

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

    start() {
        this.running = true;
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

    frameCallback = (time: DOMHighResTimeStamp) => {
        try {
            const resized = resizeCanvas(this.canvas, this.cssSize);
            if (resized) {
                this.onResize(this.canvas.width, this.canvas.height);
            }

            const deltaTime = this.stats.getDeltaTime(time);

            if (this.fpsLimit && deltaTime > 0) {
                const tolerance = 1;
                if (deltaTime < 1000 / this.fpsLimit - tolerance) {
                    return;
                }
            }

            this.stats.update(time);

            this.render(time, deltaTime, resized);

            this.onFrameEnd();
        } finally {
            if (this.running) {
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
