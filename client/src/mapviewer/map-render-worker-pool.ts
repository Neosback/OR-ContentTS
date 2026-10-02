import { readWasmPreference } from "../wasm/openrune-core-loader";
import { perf } from "../perf/perf-profile";
import { isWallpaperEngine } from "../util/DeviceUtil";

import { RenderDataWorkerPool } from "./worker/RenderDataWorkerPool";

let pool: RenderDataWorkerPool | undefined;

/** localStorage override for the render worker count (1-8), e.g. `localStorage["openrune.renderWorkers"] = "4"`. */
const WORKER_COUNT_KEY = "openrune.renderWorkers";

/**
 * Each render worker keeps its own decoded models, textures and scene scratch, so memory rather than
 * cores is the limit on typical 8 GB machines. The worker count comes from the performance profile
 * ("safe" = 1, "balanced" = 2, "high" = 4) and is fixed when the pool is created, so changing the profile
 * takes effect after a reload. `localStorage["openrune.renderWorkers"]` overrides it.
 */
function renderWorkerCount(): number {
    if (isWallpaperEngine) {
        return 1;
    }
    try {
        const override = Number(window.localStorage.getItem(WORKER_COUNT_KEY));
        if (Number.isInteger(override) && override >= 1 && override <= 8) {
            return override;
        }
    } catch {
        // Storage unavailable (private window): use the default.
    }
    // The performance profile decides; never more workers than half the cores (the main thread needs room).
    const cores = navigator.hardwareConcurrency || 4;
    return Math.max(1, Math.min(perf.profile.workers, Math.max(1, cores >> 1)));
}

/** Single pool for map viewer and map editor (only one route mounts at a time). */
export function getMapRenderWorkerPool(): RenderDataWorkerPool {
    if (!pool) {
        pool = RenderDataWorkerPool.create(renderWorkerCount());
        // `?wasm=off` (or localStorage "openrune.wasm" = "off") runs the TypeScript reference paths, for A/B timing.
        void pool.setWasmEnabled(readWasmPreference());
    }
    return pool;
}
