# wgpu / WebGPU renderer adoption plan

This document defines where Rust `wgpu` is most likely to help OpenRune Content Studio, what should be tested first, and how to add it without destabilizing the existing WebGL2 editor.

The key rule is the same one used for Rust/WASM CPU kernels: **measure first, keep stable TypeScript-facing boundaries, and do not replace working systems merely because a newer API exists.**

## Terminology

- **WebGL2** is the current reference renderer.
- **WebGPU** is the browser GPU API.
- **wgpu** is the Rust graphics abstraction that targets WebGPU in the browser and native GPU APIs on native platforms.
- **wgpu/WASM** means Rust `wgpu` compiled to WebAssembly and using the browser's WebGPU implementation.

wgpu/WASM is not a CPU optimization. It still submits work through WebGPU. Its value would come from a better rendering architecture, predictable resource ownership, modern GPU features, or a future shared native/browser renderer.

## Current renderer facts that matter

The current editor already solved one of the largest WebGL2 object-rendering problems.

`EditorObjectMesh` merges the 64 object chunks of one map square into:

- one vertex buffer;
- one index buffer;
- one slot/model-info table;
- a small number of opaque and alpha draw ranges;
- dynamic index ranges for animated locs.

The slot-mesh format is produced from `EditorMapObjectChunkData` and is independent of PicoGL itself.

This is a very useful migration seam. A wgpu prototype can consume the same packed geometry without changing:

- cache decoding;
- `SceneBuilder`;
- object edit semantics;
- Edit Format;
- Undo/Redo;
- project persistence;
- OpenRune integration;
- Svelte UI.

WebGL2 stays the reference renderer until a new backend proves parity and a measurable benefit.

## Priority ranking

| Priority | Area | Why it is a good wgpu target | Risk |
| --- | --- | --- | --- |
| **1** | Editor object slot-mesh pass | Stable packed input, few passes, current draw-submission/memory history is well understood, easy A/B comparison | Low-medium |
| **2** | Object picking / interaction pass | Reuses object geometry and pipeline state, lets us test async GPU readback and integer ID targets | Medium |
| **3** | Animated object updates | Small dynamic buffer updates are a good fit for `Queue::write_buffer` or a ring/staging strategy | Medium |
| **4** | Terrain pass | Stable vertex format and large visible surface, but more tightly coupled to edit-time partial uploads and texture state | Medium-high |
| **5** | Grid, highlights, wireframes, gizmos | Simple pipelines and useful for backend completeness, but little performance payoff | Low |
| **6** | Full map viewer / NPC rendering | Large feature surface with LOD, animation, picking, transparency, and viewer-specific state | High |
| **7** | Compute-driven features | Potential future upside for culling, animation compaction, minimap work, or derived buffers, but only after the graphics backend is proven | High |

## Priority 1: editor object slot-mesh pass

This should be the first real wgpu experiment.

### Existing input

The prototype should consume the same data the WebGL2 editor already uses:

`EditorMapObjectChunkData`
-> merged slot mesh
-> packed vertices
-> packed indices
-> slot info
-> opaque ranges
-> alpha ranges

Important existing files:

- `client/src/mapeditor/webgl/EditorObjectMesh.ts`
- `client/src/mapeditor/webgl/loader/EditorMapObjectChunkData.ts`
- `client/src/mapeditor/webgl/loader/object-slot-mesh.ts`
- `client/src/mapviewer/webgl/buffer/SceneBuffer.ts`

Do **not** make the first prototype decode cache data or build `ModelData` in Rust. The renderer should receive already-built GPU-ready data.

### First prototype scope

Render one object mesh with:

- one camera/view uniform block;
- the current packed slot vertex format;
- a slot-info GPU resource;
- texture/material resources;
- height-map and tile-render-flags resources;
- one opaque pipeline;
- one alpha pipeline;
- depth testing;
- the same roof hiding / slot metadata behavior used today.

The first prototype does not need terrain, editor tools, picking, NPCs, or project integration.

### Why this comes first

The editor object renderer has already reduced thousands of placed-object ranges to only a few ranges per map square. That gives us a clean benchmark question:

> Does wgpu materially improve frame time, GPU memory, upload behavior, or frame consistency when fed the exact same slot mesh?

If it does not, there is no reason to migrate the rest of the renderer just to use wgpu.

### Required benchmark

Use the exact same loaded region and camera path for WebGL2 and wgpu.

Measure at minimum:

- median frame CPU time;
- p95 frame CPU time;
- GPU frame time when timestamps are available;
- GPU/resource memory where the platform exposes useful data;
- initial object upload time;
- dirty-chunk re-upload time;
- animated-index update cost;
- number of render passes;
- number of draw calls;
- browser/device/backend.

Run enough frames after warm-up to avoid shader compilation and first-upload noise.

The result should be documented before wgpu is allowed to become an editor runtime option.

## Priority 2: picking and interaction rendering

Once the object pass works, the next useful test is interaction rendering.

The current WebGL2 viewer/editor interaction path renders IDs to an interaction target and uses a pixel-pack buffer plus a fence before reading a small region back to the CPU.

Relevant existing code:

- `client/src/mapviewer/webgl/Interactions.ts`
- object interaction metadata stored in the slot records
- editor tile/object picking pipelines

A WebGPU/wgpu version can use:

- an integer render target where practical;
- a small copy from texture to staging buffer;
- asynchronous buffer mapping;
- a small ring of staging buffers to avoid blocking a frame on the previous readback.

This is a good second target because it exercises an important real editor workflow while reusing the object pipeline from Priority 1.

Success means equal picking results with no synchronous GPU stall introduced into pointer movement.

## Priority 3: animated object updates

`EditorObjectMesh` currently keeps static geometry stable and rewrites only the dynamic index range when an animated loc changes frame.

That architecture should be preserved.

The wgpu version should initially use a simple strategy:

1. keep the static vertex/index buffers immutable;
2. keep a dedicated dynamic index region or dynamic index buffer;
3. update only the changed portion through `Queue::write_buffer`;
4. keep opaque and alpha ranges separate.

Only after that works should we consider a more GPU-driven animation representation, such as storing frame ranges in a storage buffer and selecting them on the GPU.

Do not make GPU-driven animation a requirement for the first renderer.

## Priority 4: terrain

Terrain is the next major rendering pass after objects are proven.

Useful existing properties:

- fixed packed terrain vertex format;
- known per-level draw ranges;
- height-map texture;
- tile-render-flags texture;
- texture/material array resources;
- partial tile-buffer uploads during editing.

Relevant files:

- `client/src/mapeditor/webgl/buffer/TerrainVertexBuffer.ts`
- `client/src/mapeditor/webgl/loader/EditorMapDataLoader.ts`
- `client/src/mapeditor/webgl/EditorMapSquare.ts`
- `client/src/mapeditor/webgl/WebGLMapEditorRenderer.ts`

Terrain should **not** be the first wgpu port because interactive editing makes it more than a static render pass. Height, overlay, underlay, lighting, minimap dirtiness, and partial GPU updates all meet in the terrain flush path.

When terrain is ported, preserve partial updates. Do not fall back to rebuilding and uploading an entire map square after every brush stroke.

## Priority 5: editor overlays and gizmos

After objects and terrain are stable, move the low-risk editor visualization passes:

- tile highlight;
- grid;
- object wireframe;
- selection outline;
- brush preview;
- transform gizmo;
- Region Stamp preview.

These are good parity targets because their rendering logic is comparatively small. They are not a reason by themselves to adopt wgpu.

## Priority 6: full map viewer and NPC rendering

The main viewer should move only after the editor backend has proven itself.

The viewer contains more rendering state:

- visible-map management;
- LOD;
- opaque and transparent ordering;
- animated locs;
- NPC animation;
- interaction rendering;
- texture buffers;
- multiple map squares;
- viewer-specific menus and interaction feedback.

Trying to migrate the viewer first would make it difficult to tell whether failures come from wgpu fundamentals or viewer feature complexity.

The editor object pass is a much better test bed.

## Priority 7: compute and GPU-driven work

Modern GPU features are potentially useful, but they should be treated as a later optimization phase.

Candidates worth measuring later include:

### GPU culling

A storage buffer could hold slot bounds and visibility metadata, with a compute pass compacting visible draw records.

This becomes interesting only if CPU visibility/draw preparation is measured as material after the basic wgpu renderer is running.

### Animation compaction

Animated frame/index selection could eventually be expressed through GPU-visible frame tables instead of rebuilding a CPU scratch index range.

Again, this should follow the simple `Queue::write_buffer` implementation, not precede it.

### Minimap generation

Some minimap composition work may fit a compute or render-to-texture path, especially if it eliminates repeated CPU/GPU transfers.

Measure the existing minimap path first.

### Terrain-derived data

Lighting, normal generation, or derived tile data could theoretically move to compute after the scene data is represented in flat GPU-friendly buffers.

Do not attempt to push the current object-graph `Scene` / `ModelData` structures directly into GPU compute.

## What should stay out of wgpu

wgpu is a rendering backend, not a replacement for the rest of the Studio architecture.

Do not move these into wgpu merely for consolidation:

- cache reading and decoding;
- OpenRune project parsing;
- RSCM/GameVal parsing;
- Edit Format serialization;
- Undo/Redo;
- project persistence;
- object mutation logic;
- `SceneBuilder` object-graph work;
- interface editor data models;
- Svelte UI state;
- backend/FileStore publication.

Measured Rust/WASM CPU kernels remain a separate concern from wgpu.

See `docs/RUST_WASM_KERNELS.md`.

## Backend architecture

Do not let a wgpu experiment leak Rust-specific types into editor domain code.

A future renderer boundary should look conceptually like:

```text
Map editor / viewer
       |
framework-neutral render data
       |
   RenderBackend
    /       \
WebGL2      wgpu
(reference) (experimental)
```

The exact interface should be extracted only when the first prototype needs it. Avoid designing a large theoretical renderer abstraction before we know what both backends actually share.

The canonical input should remain typed arrays and small plain-data descriptors whenever practical.

### Resource ownership

The wgpu backend should explicitly own:

- device and queue;
- surface/canvas configuration;
- pipelines;
- bind-group layouts;
- GPU buffers;
- textures/samplers;
- depth targets;
- picking targets;
- staging/readback buffers.

The TypeScript/editor domain layer should own:

- map/editor state;
- decoded scene content;
- project state;
- edit transactions;
- worker-produced slot meshes;
- dirty-region decisions.

## Shader strategy

The current WebGL2 renderer uses GLSL.

wgpu/WebGPU uses WGSL in the browser, so the prototype will need WGSL equivalents for the selected pass.

Do not attempt an automatic whole-project shader translation first.

For Priority 1, port only the object shader behavior needed by the slot-mesh pass and verify output against WebGL2 screenshots/reference scenes.

Keep shader behavior tests focused on:

- packed vertex decoding;
- texture/material lookup;
- slot-info lookup;
- height placement;
- roof visibility;
- alpha behavior;
- depth behavior.

## Browser and Tauri implications

### Browser

Rust `wgpu` compiled to WASM ultimately targets browser WebGPU.

That means it should be compared against the existing WebGL2 backend on supported browsers. If a future direct-TypeScript WebGPU implementation proves simpler or faster, we should not force Rust into the browser renderer merely because Rust is already used for CPU kernels.

### Tauri / native

wgpu becomes more architecturally interesting if the Studio eventually wants a native render surface owned by Rust, because the same rendering concepts can target Vulkan, Metal, or Direct3D through wgpu.

That would be a larger application architecture decision. It is not required for the browser wgpu experiment.

The initial plan should therefore remain:

**browser canvas + wgpu/WASM experiment first, native renderer decision later.**

## Feature detection and fallback

WebGL2 remains mandatory fallback until the wgpu backend reaches full required parity.

A future selection policy should be capability based:

```text
requested wgpu
  + WebGPU available
  + backend initialized successfully
      -> wgpu

otherwise
      -> WebGL2
```

A renderer failure must not make projects or edits inaccessible.

Do not tie project files to the chosen renderer.

## Suggested implementation phases

### Phase 0: measurement harness

Before integration:

- define one representative slot-mesh fixture;
- render it with existing WebGL2;
- build a standalone wgpu/WASM object-pass harness;
- port only the required object shader behavior to WGSL;
- record frame/upload/memory measurements;
- compare visual output.

**Exit gate:** measurable reason to continue.

### Phase 1: experimental editor object backend

If Phase 0 is positive:

- introduce the smallest practical `RenderBackend` seam;
- let the editor object pass select WebGL2 or wgpu;
- retain WebGL2 terrain and overlays;
- keep project/edit code completely unchanged;
- add runtime selection for development A/B testing.

**Exit gate:** object rendering parity and no editor regression.

### Phase 2: interaction + animation

- add the object picking target/readback path;
- add animated object dynamic-buffer updates;
- verify hover/select behavior;
- measure pointer latency and animation-frame update cost.

**Exit gate:** editor object interaction parity.

### Phase 3: terrain

- port terrain vertex input;
- port terrain shader behavior to WGSL;
- preserve partial tile uploads;
- port height/render-flag texture updates;
- compare brush latency and frame stability.

**Exit gate:** terrain editing parity.

### Phase 4: overlays and full editor

- grid;
- highlights;
- selection;
- wireframes;
- gizmos;
- Region Stamp preview;
- remaining editor render targets.

At this point wgpu may be considered a complete editor renderer candidate.

### Phase 5: map viewer

Only after the editor path is stable:

- map viewer objects;
- terrain;
- animated locs;
- NPCs;
- LOD;
- picking;
- transparent ordering;
- viewer-specific passes.

## Acceptance criteria before making wgpu the default

wgpu should not replace WebGL2 as the default merely because it works.

Require all of the following:

1. visual parity on representative regions;
2. correct opaque/alpha ordering;
3. correct roof visibility;
4. correct animation;
5. correct object/tile picking;
6. correct terrain editing and partial updates;
7. no project/edit-format changes required;
8. clean fallback when WebGPU is unavailable;
9. equal or better median frame time;
10. no material p95 frame-time regression;
11. no material GPU-memory regression;
12. equal or better dirty-edit upload behavior;
13. browser coverage acceptable for the Studio's supported targets.

If performance is effectively equal and wgpu significantly increases maintenance complexity, keep WebGL2 as the production renderer and retain the experiment only if it enables a concrete future feature.

## Recommended first PR when implementation begins

The first implementation PR should be deliberately small:

**"Add standalone wgpu object-slot-mesh render harness"**

It should contain:

- Rust `wgpu` module/crate boundary;
- canvas/device initialization;
- upload of one existing slot-mesh fixture;
- WGSL object shader;
- opaque pass;
- alpha pass if small enough to include safely;
- camera/scene uniform upload;
- benchmark instrumentation;
- no editor runtime switch yet.

That PR answers the only question that matters at the start:

> Is wgpu sufficiently better or strategically useful on the Studio's real object data to justify a renderer migration?

## Phase 0 status (TypeScript WebGPU, editor object pass)

Decision: the first experiment is **WebGPU written in TypeScript (WGSL)**, not Rust `wgpu`. Every input is already a
TypeScript typed array, picking and UI are TypeScript, and wgpu/WASM would add a Rust build chain and a per-frame
JS/WASM hop for no extra capability. Rust stays for CPU kernels. wgpu is revisited only if a native render surface is
wanted. WebGPU also gives us compute shaders, which the RuneLite-style per-model face-priority sort needs (WebGL2 has none).

What exists (`client/src/mapeditor/webgpu/`):

| File | What |
| --- | --- |
| `object-pass.wgsl` | Line-for-line port of `main.vert.glsl` + `main.frag.glsl`, `VERTEX_SLOT` variant: vertex decode, HSL to RGB, texture animation, plane visibility, contouring, fog, wall push-back and depth bias. Opaque and alpha fragment entry points. |
| `WebGPUObjectPass.ts` | Device/canvas setup, texture array with CPU mips, per-map vertex/index/slot buffers, height and render-flag textures, opaque then alpha draw per map, CPU and GPU timing (timestamp queries when available). |
| `object-mesh-merge.ts` | The chunk-to-map-square merge `EditorObjectMesh` does, as a pure function (tested). `EditorObjectMesh.chunkData` exposes its input. |
| `texture-mips.ts` | Box-filter mip chain (tested). |
| `object-pass-harness.ts` | Dev-only A/B harness. `await __webgpuHarness()` in the dev console lays a WebGPU canvas over the editor's; `setMode("overlay" \| "only" \| "diff" \| "off")`. |

Result on region 12342 (one map square, about 685k indices): the `diff` mode (CSS difference blend against the WebGL2
canvas with the terrain draw stubbed) is black across all object pixels. Amplified 30x only faint texture-filter noise
and a few edge pixels remain. WebGPU frame cost in the same scene: median CPU 0.025 ms, p95 0.05 ms, GPU about 0.8 ms,
2 draw calls.

Known differences and gaps:

- Texture sampling is trilinear with 16x anisotropy (WebGPU needs all-linear filters for anisotropy); WebGL2 uses
  `LINEAR_MIPMAP_NEAREST` + anisotropy. This is the speckle in the amplified diff.
- Static frame only: animated locs, picking (the interact-id output) and terrain are not ported yet.
- WebGL2 stays the reference renderer and the fallback.

The packed object path now has an explicit face-depth source. `priority` preserves the editor's previous small
clip-space priority bias; `bias` carries the model's authored `faceBias` through model copies/merges, the WASM
packer, render workers and both WebGL2/WebGPU shaders. The bias shader path matches RuneLite's `screenPos.z +=
bias / 128` behavior while retaining the editor's separate model-level wall/decor ordering.

Next: keep authored `faceBias` as the depth input and add true face-priority ordering as a WebGPU compute pass
(port of RuneLite's priority sort), then the picking target and animated index updates (phases 2 and 3 above).
