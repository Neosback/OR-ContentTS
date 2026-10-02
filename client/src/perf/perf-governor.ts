import { PERF_PROFILES, lowerLevel, type PerfLevel } from "./perf-profile";

/** One observation window (about a second) of renderer health. */
export interface GovernorSample {
    /** Average time between rendered frames in the window, in ms. */
    frameMs: number;
    /** True when the renderer was deliberately throttled (no input, nothing loading): slow frames are expected. */
    idle: boolean;
    /** Used JS heap, when the browser reports it (Chromium only). Does not include ArrayBuffers/WebGL memory. */
    heapBytes?: number;
    heapLimitBytes?: number;
    /** Estimated live WebGL memory and the profile's budget for it. */
    gpuBytes?: number;
    gpuBudgetBytes?: number;
}

export type GovernorAction =
    | { type: "ok" }
    | { type: "downgrade"; to: PerfLevel; reason: string }
    | { type: "pause"; reason: string };

export interface GovernorOptions {
    /** Frames slower than budget * this count as "struggling". */
    slowFactor: number;
    /** Consecutive struggling windows before dropping a level. */
    slowWindowsToDowngrade: number;
    /** Frame time (ms) that is dangerous no matter the level. */
    hardFrameMs: number;
    /** Consecutive dangerous windows before pausing. */
    hardWindowsToPause: number;
    /** Fraction of the JS heap limit at which to intervene. */
    heapFraction: number;
}

export const DEFAULT_GOVERNOR_OPTIONS: GovernorOptions = {
    slowFactor: 2.5,
    slowWindowsToDowngrade: 4,
    hardFrameMs: 500,
    hardWindowsToPause: 3,
    heapFraction: 0.75,
};

/**
 * Decides when the renderer is hurting the machine. It watches frame time and heap use and answers with:
 * keep going, drop a performance level, or pause rendering and ask the user.
 * Pure (no timers or DOM) so the thresholds can be tested.
 */
export class PerfGovernor {
    private slowWindows = 0;
    private hardWindows = 0;

    constructor(private readonly options: GovernorOptions = DEFAULT_GOVERNOR_OPTIONS) {}

    reset(): void {
        this.slowWindows = 0;
        this.hardWindows = 0;
    }

    sample(sample: GovernorSample, level: PerfLevel): GovernorAction {
        const { options } = this;

        // GPU memory is checked first: lowering quality does not free what is already allocated, so this pauses.
        if (sample.gpuBytes !== undefined && sample.gpuBudgetBytes && sample.gpuBytes > sample.gpuBudgetBytes) {
            const used = Math.round(sample.gpuBytes / 1048576);
            const budget = Math.round(sample.gpuBudgetBytes / 1048576);
            return { type: "pause", reason: `GPU memory estimate is ${used} MB (budget ${budget} MB)` };
        }

        if (sample.heapBytes !== undefined && sample.heapLimitBytes) {
            if (sample.heapBytes > sample.heapLimitBytes * options.heapFraction) {
                const lower = lowerLevel(level);
                const used = Math.round(sample.heapBytes / 1048576);
                return lower
                    ? { type: "downgrade", to: lower, reason: `JS memory is high (${used} MB used)` }
                    : { type: "pause", reason: `JS memory is very high (${used} MB used)` };
            }
        }

        // Throttled idle frames are slow on purpose; judge only active ones.
        if (sample.idle) {
            this.slowWindows = 0;
            this.hardWindows = 0;
            return { type: "ok" };
        }

        if (sample.frameMs >= options.hardFrameMs) {
            this.hardWindows++;
            if (this.hardWindows >= options.hardWindowsToPause) {
                this.reset();
                return { type: "pause", reason: `Frames are taking ${Math.round(sample.frameMs)} ms` };
            }
        } else {
            this.hardWindows = 0;
        }

        const budgetMs = 1000 / PERF_PROFILES[level].fpsLimit;
        if (sample.frameMs > budgetMs * options.slowFactor) {
            this.slowWindows++;
            if (this.slowWindows >= options.slowWindowsToDowngrade) {
                this.slowWindows = 0;
                const lower = lowerLevel(level);
                if (lower) {
                    return { type: "downgrade", to: lower, reason: `Rendering is slow (${Math.round(sample.frameMs)} ms per frame)` };
                }
            }
        } else {
            this.slowWindows = 0;
        }
        return { type: "ok" };
    }
}
