# Edit path profiling

The editor has an opt-in main-thread profiler for interactive edit latency. It is disabled by default and does not change edit behavior.

Enable it with either:

- `?profileEdits=1` in the Studio URL, then reload; or
- `localStorage["openrune.profileEdits"] = "on"`, then reload.

Filter the browser console for `[edit-profile]`.

## Metrics

### `object.edit.sync`

Measures the synchronous object edit transaction before the deferred chunk rebuild.

Phases:

- `snapshot.before`: read the object state used for Undo/Redo.
- `mutate`: apply the scene mutation.
- `snapshot.after`: read the post-edit object state.
- `history.record`: clone and record the object mutation.
- unassigned time inside `totalMs` includes transaction commit and small call overhead.

The record also reports map id, level, edit label/source, whether anything changed, and before/after entry counts.

### `object.chunk-reload`

Measures the deferred object-chunk rebuild after an object edit.

Fields:

- `queueDelayMs`: time from the first chunk-reload schedule for that map until the rebuild actually starts. This includes the editor's 100 ms object batching cadence and normal frame scheduling.
- `requestedChunks` / `uniqueChunks`: requested rebuild scope.
- `returnedChunks`: chunks returned by the worker.

Phases:

- `scene.serialize`: serialize live scene locs.
- `payload.clone-terrain`: clone terrain data for the worker payload.
- `payload.clone-locs`: clone serialized loc data.
- `worker.roundtrip`: worker queue + rebuild + response.
- `gpu.apply`: replace rebuilt chunk data in the live map.

This separation is important: a 150 ms perceived rebuild with a 95 ms queue delay is not a 150 ms CPU bottleneck.

### `terrain.flush`

Measures the synchronous paint flush performed by `updateAffectedTiles()`.

Fields:

- `maps`: affected map-square count.
- `affectedTiles`: unique affected tiles across those maps.

Phases:

- `height.prepare`: height texture update, tile-light recalculation, height-driven object sync, and selected/hovered object refresh.
- `underlay.blend`: underlay blending/smoothing.
- `flags.update`: tile-min-level and render-flag texture update.
- `tiles.rebuild`: rebuild edited tile models, repack one tile at a time, and upload their terrain vertex slices.
- `minimap.dirty`: accumulate edited areas for minimap refresh.

Repeated phase names are accumulated across affected map squares.

## Profiling workflow

Use a representative loaded region and perform each operation several times after one warm-up action:

1. place, move, rotate, and delete a normal object;
2. repeat an object edit that touches multiple chunks;
3. paint underlay/overlay with small and large brushes;
4. perform a height stroke;
5. test a Region Stamp that combines terrain and objects.

Compare medians, not a single sample. First separate queue delay from worker/runtime cost, then optimize only a phase that is consistently material.

The profiler is intentionally main-thread/browser instrumentation. Synthetic Vitest micro-benchmarks remain useful for isolated kernels, but they cannot measure worker queueing, WebGL uploads, or the editor's batching cadence accurately.
