# Rust/WASM kernels

Rust is used for **measured** hot paths only, behind stable TypeScript interfaces. Every kernel keeps a TypeScript
reference implementation, a parity test, and a runtime fallback.

## Layout

| Path | What |
| --- | --- |
| `client/native/openrune-core/` | The Rust crate (`wasm-bindgen`), one module per kernel |
| `client/src/wasm/openrune-core/` | The **committed** build output (`.wasm` + JS glue). CI/Vercel have no Rust toolchain |
| `client/src/wasm/openrune-core-loader.ts` | Async load, on/off switch, factory helpers |
| `client/src/wasm/mesh-packer.ts` | Typed wrapper for the `MeshPacker` kernel |
| `client/scripts/build-wasm.sh` | `npm run wasm:build` (wasm-pack + wasm-opt) |

Rebuild after changing Rust code (needs `rustc`, the `wasm32-unknown-unknown` target, `wasm-pack`, `wasm-opt`):

```bash
cd client && npm run wasm:build
```

Switch it off for A/B timing or debugging: `?wasm=off` on the URL, or `localStorage["openrune.wasm"] = "off"`.
If the module fails to load the TypeScript paths run automatically.

## Kernel 1: `MeshPacker` (model faces -> packed vertices + indices)

Port of `SceneBuffer.addModel` + `VertexBuffer.addVertex` + `getModelFaces`. Used by the editor's per-chunk object
buffers (`EditorMapDataLoader.buildObjectChunkMesh`); the viewer and terrain keep the TS packer.

Rules that keep it safe:

- A `SceneBuffer` with a packer holds only models. Call `addModelPass`, never `addModel` (it throws), and read
  geometry through `packedGeometry()`. The four call sites that used `addModel` directly (the instanced path of
  `addSceneModels` in the viewer and editor loaders) were moved to `addModelPass`; missing them silently drops models.
- Wasm memory is not garbage collected: `packer.free()` after `buildSlotMesh`.
- Output is byte-identical to TS. `src/wasm/mesh-packer.test.ts` proves it on 300 random models x 4 option
  combinations plus the `SceneBuffer` integration; real data was checked by hashing every chunk mesh of a 3x3 region
  with wasm on and off (all 9 identical).

### Measured (Apple Silicon, Chrome/V8)

- Kernel micro-benchmark (`BENCH=1 npx vitest run src/wasm/mesh-packer.bench.test.ts`): **3.1x - 3.5x** faster
  than the TS packer, including copying the result out.
- Real region load (3x3 maps around region 12342, summed worker time): about **1.6 s -> 1.3 s** (-19%). Of the
  object-chunk stages `addSceneModels` fell about 39% and the chunk total about 28%. Wall time is lower still because
  the maps load on a worker pool. A region already loaded in well under a second, so this is a modest, real gain,
  not a transformation.

### Repeated cached-model placements

The same cached `Model` is often placed several times in one merge group. `MeshPacker.add_model_offsets` batches
those placements so the model arrays cross the JS/WASM boundary once and only the xyz offsets vary. The TypeScript
path and ordinary `add_model` path remain unchanged.

Parity coverage proves the batched output is byte-identical to sequential `packModel` calls for both opaque and
transparent passes.

The dispatch is intentionally conservative. Current CI micro-benchmarks showed:

- 40-face models: about **1.06x-1.35x** faster across 2-400 repeated placements;
- 250-face models: 2-4 placements were slightly slower (**0.92x-0.96x**), while 16+ placements were faster
  (**1.04x-1.17x**).

Studio therefore batches when the model has at most 64 faces, or when a repeated run has at least 16 placements.
This avoids trading a small number of heavy placements for extra WASM-call overhead.

## Kernel 2: slot-mesh emit (`MeshPacker.build_slot_mesh`)

`buildSlotMesh` (object-slot-mesh.ts) is now three phases: build a flat list of emit jobs
(`[first element, count, slot, target]`) and the slot records in TS, run the jobs, assemble the result. Running the
jobs is the per-slot vertex remap loop: `emitSlotJobsTs` is the TypeScript reference, `MeshPacker.build_slot_mesh`
the wasm version. When the chunk buffer was packed in wasm the jobs run against the vertices and indices that are
already in wasm memory, so the packed geometry is never copied out and back in. Job lists use plain typed arrays, so
the phases stay testable on their own.

Verified like kernel 1: unit parity on random jobs, an end-to-end `buildSlotMesh` run in both modes (animated locs and
their frame ranges included), and a hash of every chunk mesh (vertices, indices, animation indices, slot records,
frame ranges) of the real 3x3 region with wasm on and off: all 9 identical.

Measured on the real region (summed over the 9 map squares): the `pack` stage 130 ms -> 60 ms (-54%), the whole
object-chunk build 672 ms -> 412 ms (-39%) and the worker load 1428 ms -> 1171 ms (-18%), with both kernels on.

### Where the rest of the load time goes: no kernel left worth porting

Profiled inside `buildScene` (summed over the 9 map squares of the 3x3 test region, about 630 ms of the ~1.2 s
worker load, TypeScript paths):

| Piece | ms | Notes |
| --- | --- | --- |
| `decodeLocs` | ~330 | model decode from cache ~97, per-loc copy/rotate/recolor ~67, everything else in `addLoc` (collision, entities, parsing) ~157 |
| `Scene.light` | ~129 | cross-model normal merging ~73, `ModelData.light` ~47 |
| tile models | ~98 | |
| terrain decode | ~79 | |

Every piece is 3-7% of the worker load. There is no single numeric hot loop like the two kernels above: the time is
spread over a 3,000-line object-graph `ModelData`, the scene tile objects and per-loc bookkeeping. Porting
`Scene.light` (the original next candidate) would move about 120 ms of ~1,200 and needs exact Java-integer semantics
over that object graph, for a saving of roughly 6% of worker time (about 20 ms of wall time on a 4-worker pool).
Not worth the risk. Revisit only if the data model is first flattened into typed arrays (which would help the TS path
too).

Next measurements should target what users feel: the **edit path** (object-edit rebuilds, paint flushes) and GPU
submission, not the load path.

## wgpu

`wgpu` compiled to wasm *is* WebGPU: it brings no CPU advantage over TS calling WebGPU, and the editor's cost is
GPU draw submission, which the per-map merged slot mesh already fixed on WebGL2. wgpu is therefore a rendering-backend
decision, not a CPU one. Plan: a standalone WebGPU/wgpu objects-pass harness fed by one chunk's slot mesh
(`EditorMapObjectChunkData`), compared on this Mac for frame time and memory, before any editor change.
