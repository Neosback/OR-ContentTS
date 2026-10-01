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

- [ ] Show cache GameVal child/component names in the Interface Editor tree while retaining numeric ids and decoded component types.
- [ ] Add a framework-neutral Interface metadata source and backend adapter after StudioBackendClient/BackendTransport exist.
- [ ] Add backend id-oriented GameVal/RSCM lookup with provenance and conflict diagnostics for interface/project metadata.
- [ ] Shops and world map as first-class dock panels.
- [x] Shared command and keyboard-shortcut registry.
- [ ] Bring remaining editor chrome fully onto Studio theme tokens.
- [ ] Extra 3D views such as model preview and minimap through shared/scissored rendering where appropriate.

## Phase 2: backend-ready seams

Goal: the frontend works fully offline, with every backend dependency behind an interface the separate Studio backend can implement later.

- [x] Formalize `CacheSource`: shared framework-neutral cache acquisition with static/Range-backed Studio caches and browser-imported IndexedDB profiles behind one contract; future backend-backed OpenRune cache delivery implements the same interface.
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

## Phase 4: Studio backend integration and OpenRune compatibility

The backend is a separate local service. OpenRune Server is a compatibility/reference target and should not require Studio-specific modifications.

The backend now lives under `backend/` in this monorepo; the temporary `Neosback/rspsi` repository is no longer the active source.

- [x] Move the Kotlin backend foundation into `backend/` with `Protocol`, `StudioService`, tests, Gradle wrapper, and retained research docs.
- [x] Replace the inherited monolithic `foundationGate` with split backend CI covering compile, protocol, API/security, OpenRune inspection/indexing, Gradle/process boundaries, and runnable distribution packaging.
- [x] Finalize the backend launch/connection contract: `port=0`, parent-supplied token, machine-readable ready handshake, stable protocol/backend identity, and loopback-only browser CORS/preflight.
- [ ] Add a framework-neutral `StudioBackendClient` and transport abstraction.
- [ ] Finalize sidecar packaging after the launch contract remains stable through client integration.
- [ ] Add `HttpBackendTransport` for browser/development connections to an already-running local backend.
- [ ] Add Tauri backend supervision and `TauriBackendTransport` so the desktop app can self-start a packaged backend sidecar.
- [x] Define an ephemeral-port/per-launch-token ready handshake that Tauri can consume without scraping logs.
- [ ] Add an OpenRune-project `ProjectStore` adapter through the Studio backend.
- [ ] Add backend-backed OpenRune `CacheSource` and `WorldSource` adapters.
- [ ] Accept edit batches, validate and save/publish through the separate backend.
- [ ] Add explicit **Publish Cache** and **Build OpenRune Project** actions with structured results and output verification.
- [ ] Keep golden-fixture parity between TypeScript and the backend Kotlin protocol.
- [ ] Keep local/offline implementations available when the backend is not connected.
- [x] Establish the invariant that Content Studio requires no Studio-specific OpenRune Server endpoints, forks, accessors, hooks, modules, or framework patches.
- [ ] Keep that invariant enforced as backend write/build/publish support expands.

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

- [ ] Definitions editor for objects, NPCs, items and configs.
- [ ] Model and animation viewer.
- [ ] NPC/player preview tools.
- [ ] Content-to-world association workflows such as assigning interactions, skills and scripts.
- [ ] Search/indexing across project content.
- [ ] Validation and publish diagnostics suitable for real OpenRune projects.

## Current caveats

- The legacy TypeScript server has been removed. The intended backend is a separate local Studio service; `Neosback/OpenRune-Server` is an external compatibility/reference target, not the place for Studio-specific backend changes.
- NPC and ground-item/object spawn snapshots are now consumed through `WorldSource`; authoritative/project-owned world content still needs an OpenRune-backed implementation.
- The app builds for the site root with Vite. Any old deployment scripts that assume `/play` need to be treated as legacy.
