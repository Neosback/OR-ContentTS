export type EditPathProfileDetails = Record<string, string | number | boolean | undefined>;

type EditPathPhase = {
    totalMs: number;
    calls: number;
};

export interface EditPathProfile {
    measure<T>(phase: string, run: () => T): T;
    measureAsync<T>(phase: string, run: () => PromiseLike<T>): Promise<T>;
    annotate(details: EditPathProfileDetails): void;
    end(): void;
}

const PROFILE_QUERY_KEY = "profileEdits";
const PROFILE_STORAGE_KEY = "openrune.profileEdits";
const queueMarks = new Map<string, number>();

function now(): number {
    return globalThis.performance?.now?.() ?? Date.now();
}

export function isEditPathProfilingEnabled(): boolean {
    if (typeof window === "undefined") {
        return false;
    }

    try {
        const query = new URLSearchParams(window.location.search).get(PROFILE_QUERY_KEY);
        if (query === "1" || query === "on" || query === "true") {
            return true;
        }
        return window.localStorage.getItem(PROFILE_STORAGE_KEY) === "on";
    } catch {
        return false;
    }
}

function queueKey(kind: string, key: string | number): string {
    return `${kind}:${key}`;
}

export function markEditPathQueue(
    kind: string,
    key: string | number,
    enabled = isEditPathProfilingEnabled(),
): void {
    if (!enabled) {
        return;
    }
    const id = queueKey(kind, key);
    if (!queueMarks.has(id)) {
        queueMarks.set(id, now());
    }
}

export function consumeEditPathQueueDelay(
    kind: string,
    key: string | number,
    enabled = isEditPathProfilingEnabled(),
): number | undefined {
    if (!enabled) {
        return undefined;
    }
    const id = queueKey(kind, key);
    const startedAt = queueMarks.get(id);
    if (startedAt === undefined) {
        return undefined;
    }
    queueMarks.delete(id);
    return now() - startedAt;
}

export function beginEditPathProfile(
    name: string,
    details: EditPathProfileDetails = {},
    enabled = isEditPathProfilingEnabled(),
): EditPathProfile {
    if (!enabled) {
        return {
            measure: (_phase, run) => run(),
            measureAsync: async (_phase, run) => await run(),
            annotate: () => undefined,
            end: () => undefined,
        };
    }

    const startedAt = now();
    const phases = new Map<string, EditPathPhase>();
    const annotations: EditPathProfileDetails = { ...details };
    let ended = false;

    const addPhase = (phase: string, elapsedMs: number) => {
        const current = phases.get(phase);
        if (current) {
            current.totalMs += elapsedMs;
            current.calls++;
        } else {
            phases.set(phase, { totalMs: elapsedMs, calls: 1 });
        }
    };

    return {
        measure<T>(phase: string, run: () => T): T {
            const phaseStartedAt = now();
            try {
                return run();
            } finally {
                addPhase(phase, now() - phaseStartedAt);
            }
        },
        async measureAsync<T>(phase: string, run: () => PromiseLike<T>): Promise<T> {
            const phaseStartedAt = now();
            try {
                return await run();
            } finally {
                addPhase(phase, now() - phaseStartedAt);
            }
        },
        annotate(next: EditPathProfileDetails): void {
            Object.assign(annotations, next);
        },
        end(): void {
            if (ended) {
                return;
            }
            ended = true;

            const phaseMs: Record<string, number> = {};
            const phaseCalls: Record<string, number> = {};
            for (const [phase, sample] of phases) {
                phaseMs[phase] = Number(sample.totalMs.toFixed(3));
                phaseCalls[phase] = sample.calls;
            }

            console.info(`[edit-profile] ${name}`, {
                ...annotations,
                totalMs: Number((now() - startedAt).toFixed(3)),
                phaseMs,
                phaseCalls,
            });
        },
    };
}
