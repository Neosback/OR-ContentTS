import { isWallpaperEngine } from "../util/DeviceUtil";

import { RenderDataWorkerPool } from "./worker/RenderDataWorkerPool";

let pool: RenderDataWorkerPool | undefined;

/** localStorage override for the render worker count (1-8), e.g. `localStorage["openrune.renderWorkers"] = "4"`. */
const WORKER_COUNT_KEY = "openrune.renderWorkers";

/**
 * Each render worker keeps its own decoded models, textures and scene scratch, so memory rather than
 * cores is the limit on typical 8 GB machines: two workers load a region nearly as fast as four while
 * using about half the memory. `navigator.deviceMemory` caps at 8 (and is Chromium-only), so larger
 * machines opt in to more workers with the override.
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
    const cores = navigator.hardwareConcurrency || 4;
    const memoryGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    return memoryGb <= 8 ? Math.min(2, cores) : Math.min(4, Math.max(1, cores >> 1));
}

/** Single pool for map viewer and map editor (only one route mounts at a time). */
export function getMapRenderWorkerPool(): RenderDataWorkerPool {
    if (!pool) {
        pool = RenderDataWorkerPool.create(renderWorkerCount());
    }
    return pool;
}
