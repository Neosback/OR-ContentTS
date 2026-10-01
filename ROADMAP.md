# OpenRune Content Studio Roadmap

This is the plan for turning this repository into the OpenRune Content Studio frontend. It records direction and ordering, not promises. What exists today is whatever the code and passing tests show.

## Target architecture

| Layer | Owns |
| --- | --- |
| Svelte 5 Studio UI | shell, routing, dock layout, panels, workflows, user interaction |
| Framework-neutral TypeScript | cache decoding, scene/rendering, map editor runtime, plugin/editor services, data models |
| Studio Backend Service | local project/source inspection, OpenRune FileStore/cache access, validation, bounded build operations, publication workflows, OpenRune project compatibility |

Rules that follow from that split:

- **Svelte owns the active UI.** The active entrypoint is `src/main.ts -> src/ui/main.ts -> App.svelte`.
- **The runtime beneath the UI should stay framework-neutral.** Rendering, cache, scene and editing systems should not depend on Svelte components.
- **The backend is the only encoder.** The frontend sends what changed as versioned edit batches, never pre-encoded region bytes.
- **Decoders exist on both sides.** Shared golden fixtures keep TypeScript and Kotlin implementations from drifting.
- **WebGL2 stays as the reference backend.** WebGPU may be added later as an optional renderer.
- **Rust/WASM is for measured hot paths.** It should sit behind stable TypeScript interfaces rather than owning application UI.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the enforced frontend boundary.

## Phase 0: Vite and Svelte cutover (done)

- [x] Moved the client from CRA/craco/webpack to Vite 8.
- [x] Replaced the runtime application entry with Svelte 5.
- [x] Removed the active React router/runtime entry.
- [x] Cut the map viewer, map editor and interface routes over to the Svelte shell.
- [x] Removed the obsolete React map-editor UI/plugin island.
- [x] Kept rendering/cache/game-side TypeScript systems available beneath the UI.
- [x] Established reproducible clean-install, Svelte, TypeScript, Vitest and Vite production-build validation.

The legacy React/TSX migration surface and direct React-only dependency/tooling stack have been removed.

## Phase 1: Studio UI foundation (hardening)

Goal: a stable editor workspace with a strict Svelte UI boundary and framework-neutral runtime.

Done:

- [x] Svelte 5 Studio shell and routing.
- [x] Dockable workspace using `dockview-core`.
- [x] Map viewer and map editor Svelte workspaces.
- [x] Native Svelte editor panels and workbench chrome.
- [x] Interface workbench cut over to Svelte.
- [x] Component editor.
- [x] CS1 simulator.
- [x] CS2 manual runner.
- [x] Inventory/gameval simulator.
- [x] Svelte-only runtime entrypoint.
- [x] Client-wide CI architecture guard preventing React/TSX and React-era dependencies from re-entering the active source tree.
- [x] Blocking UI-boundary, Svelte, TypeScript, Vitest and Vite build gates.
- [x] Removed retained legacy TSX and pruned direct React-only dependencies/tooling.

Next:
- [ ] Shops and world map as first-class dock panels.
- [x] Shared command and keyboard-shortcut registry.
- [ ] Bring remaining editor chrome fully onto Studio theme tokens.
- [ ] Extra 3D views such as model preview and minimap through shared/scissored rendering where appropriate.

## Phase 2: portable/local-first seams

Goal: the frontend works fully offline, with portable TypeScript services first and platform capabilities behind narrow adapters.

- [x] Formalize `CacheSource`: shared framework-neutral cache acquisition with static/Range-backed Studio caches and browser-imported IndexedDB profiles behind one contract; future filesystem-backed cache sources can implement the same interface without requiring the backend.
- [x] Formalize `WorldSource`: framework-neutral world-data loading with bundled/offline NPC and ground-item/object spawn snapshots behind one contract; zones/areas extend the seam once a concrete domain model exists.
- [x] **Edit Format v1**: versioned JSON schema and strict codec built from the transaction mutation model for terrain and loc edits, with an extensible versioned path for future NPC, zone, shop, interface, and definition mutations.
- [x] Local project persistence behind a framework-neutral `ProjectStore`, with IndexedDB plus strict portable import/export.
- [x] Move cache download ownership into the Studio; local bootstrap now writes directly to `client/caches`.
- [x] Define the framework-neutral project lifecycle API for create/open/save/Save As/close, dirty state, import/export, and applied-history persistence against `ProjectStore`; publish/build remain unavailable until Studio-backend integration.
- [x] Wire project lifecycle into the Svelte map-editor workflow, including local project create/open/import, save/Save As/export/close, dirty-state guards, required-map loading, and safe Edit Format v1 replay into live Undo/Redo history.

## Phase 3: editor depth

- [x] Shared command registry used by workbench actions, tool buttons, menus, plugins and shortcuts.
- [x] Universal named edit transactions for undo/redo across paint, object, and region-stamp editing.
- [ ] Multi-region selection and editing without seams.
- [ ] Brush-based terrain tools for height, overlay, underlay and smoothing.
- [ ] Better object placement: snapping, rotation preview and copy/paste between regions.
- [ ] Validation overlays for clipping, blocked tiles and missing definitions.
- [ ] Consistent selection/inspection model across maps, interfaces and future definition editors.

## Phase 4: OpenRune project integration, cache writing, and optional backend

OpenRune Server is a compatibility/reference target and should require zero Studio-specific modifications.

The integration policy is TypeScript-first:

- browser/Tauri local capabilities should not be routed through the backend when they can be implemented safely in TypeScript;
- Tauri should read/write user-selected OpenRune project files directly through a scoped filesystem adapter;
- the backend should be lazy/optional and focused on exact OpenRune/JVM build, test, and verification operations.

Backend foundation already completed:

- [x] Move the Kotlin backend foundation into `backend/` with `Protocol`, `StudioService`, tests, Gradle wrapper, and retained research docs.
- [x] Split backend CI across compile, protocol, API/security, OpenRune inspection/indexing, Gradle/process boundaries, and runnable distribution packaging.
- [x] Finalize the backend launch/connection contract: `port=0`, parent-supplied token, machine-readable ready handshake, stable protocol/backend identity, and loopback-only browser CORS/preflight.
- [x] Document OpenRune map/cache/RSCM behavior and establish the TypeScript-first/backend-minimal architecture.

Portable/local work next:

- [ ] Add a framework-neutral `ProjectFileSystem` capability boundary.
- [ ] Add a Tauri `ProjectFileSystem` adapter using native dialog + scoped filesystem access.
- [ ] Add optional browser File System Access adapter with import/download fallback.
- [ ] Add pure TypeScript RSCM parsing/indexing.
- [ ] Add pure TypeScript GameVal DAT parsing and OpenRune GameVal validation rules.
- [ ] Add TypeScript OpenRune project discovery/indexing for modules, GameVals, RSCM, raw map sources, and cache paths.
- [ ] Add OpenRune NPC/ground-Obj/Area TOML parse/generate adapters.
- [ ] Implement TypeScript terrain map-file-0 encoder.
- [ ] Implement TypeScript static-loc map-file-1 encoder.
- [ ] Add golden decode/encode round-trip fixtures.
- [ ] Replace placeholder map import/export providers with a versioned region/package format.
- [ ] Add cache-patch output before attempting complete DAT2/JS5 rewrite.
- [ ] Add a writable modern cache-store implementation in TypeScript.
- [ ] Add filesystem-backed cache write targets for File System Access/Tauri.

Optional backend work:

- [ ] Narrow `StudioBackendClient` around native build/test/verification capabilities.
- [ ] Add `HttpBackendTransport` for explicit browser pairing to an already-running backend.
- [ ] Add lazy Tauri backend supervision/transport; do not start the sidecar for ordinary editing.
- [ ] Add explicit **Build OpenRune Project** / verification actions with structured output.
- [ ] Keep golden parity checks between TypeScript codecs and OpenRune/FileStore where useful.
- [ ] Preserve the invariant that no Studio-specific OpenRune Server endpoints, forks, accessors, hooks, modules, or framework patches are required.

## Phase 5: rendering and performance

- [ ] Profile CPU scene build, draw calls, buffer uploads, cache misses and memory first.
- [ ] Strengthen the render-backend interface above the current WebGL2 implementation.
- [ ] Optional WebGPU backend only where it provides a measurable benefit.
- [ ] Mesh simplification/LOD work only if profiling shows triangle count is a limiting factor.
- [ ] Rust -> WASM for measured hot paths such as region/scene building, model decoding or terrain processing.
- [ ] Keep TypeScript reference implementations and parity fixtures for Rust/WASM paths.

## Phase 6: broader Content Studio

Done:

- [x] Interface workbench.
- [x] Interface component editing.
- [x] CS1 simulation.
- [x] CS2 manual execution.
- [x] Inventory/gameval simulation.
- [x] Document Interface Editor cache/GameVal/RSCM data authority and backend enrichment path.

Next:

- [ ] Show cache GameVal child/component names in the Interface Editor tree while retaining numeric ids and decoded component types.
- [ ] Add a framework-neutral Interface metadata source backed first by the TypeScript GameValRegistry/project index.
- [ ] Add optional backend/JVM metadata enrichment only where it provides information the portable index cannot.

- [ ] Definitions editor for objects, NPCs, items and configs.
- [ ] Model and animation viewer.
- [ ] NPC/player preview tools.
- [ ] Content-to-world association workflows such as assigning interactions, skills and scripts.
- [ ] Search/indexing across project content.
- [ ] Validation and publish diagnostics suitable for real OpenRune projects.

## Current caveats

- The legacy TypeScript server has been removed. The intended backend is a separate local Studio service; `Neosback/OpenRune-Server` is an external compatibility/reference target, not the place for Studio-specific backend changes.
- NPC and ground-item/object spawn snapshots are now consumed through `WorldSource`; project-owned OpenRune NPC/Obj/Area source should be added through direct project-file adapters rather than requiring a backend.
- The app builds for the site root with Vite. Any old deployment scripts that assume `/play` need to be treated as legacy.
