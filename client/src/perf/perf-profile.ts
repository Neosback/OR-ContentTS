/**
 * Performance profiles for the map renderers.
 *
 * The editor streams a ~200 MB cache, decodes regions in workers and renders them with WebGL every frame, which
 * can saturate a laptop's CPU, GPU and RAM. The profile centralises the knobs that decide that cost so the
 * default is conservative ("safe") and the user opts into more.
 */

export type PerfLevel = "safe" | "balanced" | "high";

export interface PerfProfile {
    level: PerfLevel;
    label: string;
    description: string;
    /** Upper bound on the canvas pixel ratio (1 = CSS pixels even on Retina). */
    pixelRatioCap: number;
    /** Frame limit while the user is interacting or the scene is loading. */
    fpsLimit: number;
    /** Frame limit while nothing is happening (no input, nothing loading). */
    idleFps: number;
    /**
     * Canvas multisampling (applied when the WebGL context is created, so a change needs a reload). It keeps a 4x
     * multisampled colour+depth buffer alive, which on a unified-memory machine is system RAM.
     */
    antialias: boolean;
    /** Render worker count. Each worker holds its own decoded models/textures, so this is mostly a memory knob. */
    workers: number;
    /** Largest "regions around target" the launch screen accepts (each region is up to ~64x64 tiles of geometry). */
    maxRegionRadius: number;
    /** Suggested "regions around target" on the launch screen. */
    defaultRegionRadius: number;
    /**
     * Estimated live WebGL memory (MB) before rendering pauses. The hard limit is 1.5x this: an allocation that
     * would exceed it is refused. On unified-memory machines GPU memory is system RAM, so this protects the whole computer.
     */
    gpuBudgetMB: number;
}

export const PERF_PROFILES: Readonly<Record<PerfLevel, PerfProfile>> = {
    safe: {
        level: "safe",
        label: "Safe",
        description: "Lowest memory use: one render worker and no edge smoothing (MSAA). 60 FPS, Retina-sharp, up to 3x3 regions.",
        pixelRatioCap: 2,
        antialias: false,
        fpsLimit: 60,
        idleFps: 20,
        workers: 1,
        maxRegionRadius: 1,
        defaultRegionRadius: 1,
        gpuBudgetMB: 768,
    },
    balanced: {
        level: "balanced",
        label: "Balanced",
        description: "Good for most laptops. Up to 2 workers, edge smoothing, 60 FPS, up to 5x5 regions.",
        pixelRatioCap: 2,
        antialias: true,
        fpsLimit: 60,
        idleFps: 30,
        workers: 2,
        maxRegionRadius: 2,
        defaultRegionRadius: 1,
        gpuBudgetMB: 1536,
    },
    high: {
        level: "high",
        label: "High",
        description: "Full quality for powerful machines. Native pixel ratio, up to 4 workers.",
        pixelRatioCap: Infinity,
        antialias: true,
        fpsLimit: 120,
        idleFps: 30,
        workers: 4,
        maxRegionRadius: 3,
        defaultRegionRadius: 1,
        gpuBudgetMB: 3072,
    },
};

export const PERF_LEVELS: readonly PerfLevel[] = ["safe", "balanced", "high"];
const STORAGE_KEY = "openrune.perf";
const DEFAULT_LEVEL: PerfLevel = "safe";

/** The next lower level, or undefined when already at the lowest. */
export function lowerLevel(level: PerfLevel): PerfLevel | undefined {
    const index = PERF_LEVELS.indexOf(level);
    return index > 0 ? PERF_LEVELS[index - 1] : undefined;
}

export function isPerfLevel(value: unknown): value is PerfLevel {
    return value === "safe" || value === "balanced" || value === "high";
}

export interface PerfSnapshot {
    level: PerfLevel;
    /** Set when the guard intervened; the UI shows it until dismissed or the user acts. */
    notice?: { kind: "downgraded" | "paused"; message: string };
    paused: boolean;
}

type Listener = () => void;

/**
 * Process-wide performance state. Framework-free: renderers read it per frame and the UI subscribes through
 * `subscribe`/`getSnapshot` (the same shape the editor host uses).
 */
class PerfState {
    private levelValue: PerfLevel = DEFAULT_LEVEL;
    private snapshot: PerfSnapshot;
    private readonly listeners = new Set<Listener>();

    constructor() {
        this.levelValue = readStoredLevel();
        this.snapshot = { level: this.levelValue, paused: false };
    }

    get level(): PerfLevel {
        return this.levelValue;
    }

    get profile(): PerfProfile {
        return PERF_PROFILES[this.levelValue];
    }

    readonly subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    readonly getSnapshot = (): PerfSnapshot => this.snapshot;

    /** User choice: persisted, clears any guard notice and resumes rendering. */
    setLevel(level: PerfLevel): void {
        this.levelValue = level;
        writeStoredLevel(level);
        this.publish({ level, paused: false });
    }

    /** Guard intervention: lower the level (persisted, so the next session starts safe too) and tell the user. */
    downgrade(to: PerfLevel, message: string): void {
        this.levelValue = to;
        writeStoredLevel(to);
        this.publish({ level: to, paused: this.snapshot.paused, notice: { kind: "downgraded", message } });
    }

    /** Guard intervention: stop rendering until the user resumes. */
    pause(message: string): void {
        this.publish({ level: this.levelValue, paused: true, notice: { kind: "paused", message } });
    }

    resume(): void {
        this.publish({ level: this.levelValue, paused: false });
    }

    dismissNotice(): void {
        this.publish({ level: this.levelValue, paused: this.snapshot.paused });
    }

    private publish(next: PerfSnapshot): void {
        this.snapshot = next;
        for (const listener of this.listeners) listener();
    }
}

function readStoredLevel(): PerfLevel {
    try {
        // `?perf=safe|balanced|high` forces a level (and remembers it), even if the UI is too slow to reach settings.
        const requested = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("perf") : null;
        if (isPerfLevel(requested)) {
            writeStoredLevel(requested);
            return requested;
        }
        const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        return isPerfLevel(stored) ? stored : DEFAULT_LEVEL;
    } catch {
        return DEFAULT_LEVEL;
    }
}

function writeStoredLevel(level: PerfLevel): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, level);
    } catch {
        // Not remembered; the session still uses it.
    }
}

export const perf = new PerfState();
