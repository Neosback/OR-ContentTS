import { perf, type PerfSnapshot } from "../../perf/perf-profile";
import { fromExternal } from "./external.svelte";

/** Reactive view of the performance state (level, guard notice, paused). */
export const perfState: { readonly current: PerfSnapshot } = fromExternal(perf.subscribe, perf.getSnapshot);
