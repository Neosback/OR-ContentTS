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
- **Encoding follows authority.** TypeScript may provide portable encoders for Studio-owned/offline formats such as terrain/static-loc packages; OpenRune-owned source should be rebuilt by OpenRune, and JVM/FileStore publication stays behind explicit bounded backend operations.
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

- [x] Formalize `CacheSource`: shared framework-neutral cache acquisition with static/Range-backed Studio caches, browser-imported IndexedDB profiles, and `ProjectFileSystemCacheSource` for direct filesystem-backed caches without requiring the backend.
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

## Phase 4: OpenRune source integration, map publication, and optional backend

OpenRune Server is a compatibility/reference target and should require zero Studio-specific modifications.

The integration policy is **source-first and TypeScript-first**:

- browser/Tauri local capabilities should not be routed through the backend when they can be implemented safely in TypeScript;
- when OpenRune already owns a source format, Studio should update that source and let OpenRune pack it;
- Tauri should read/write user-selected OpenRune project files directly through a scoped filesystem adapter;
- LIVE is the full/base generated cache;
- SERVER is derived from LIVE and then augmented with server-specific sources;
- the backend should be lazy/optional and focused on exact OpenRune/JVM build, map-publication, test, and verification operations.

Backend foundation already completed:

- [x] Move the Kotlin backend foundation into `backend/` with `Protocol`, `StudioService`, tests, Gradle wrapper, and retained research docs.
- [x] Split backend CI across compile, protocol, API/security, OpenRune inspection/indexing, Gradle/process boundaries, and runnable distribution packaging.
- [x] Finalize the backend launch/connection contract: `port=0`, parent-supplied token, machine-readable ready handshake, stable protocol/backend identity, and loopback-only browser CORS/preflight.
- [x] Document OpenRune map/cache/RSCM behavior and establish the TypeScript-first/backend-minimal architecture.
- [x] Document the complete LIVE -> SERVER cache lifecycle and source-first OpenRune publication rules.
- [x] Confirm OpenRune-FileStore `PackMaps` supports raw `l/m` map payloads and RSPSi-style `.pack` files.

Portable/source work next:

- [x] Add a framework-neutral `ProjectFileSystem` capability boundary.
- [x] Add a Tauri `ProjectFileSystem` adapter using native dialog + scoped filesystem access.
- [x] Add optional browser File System Access adapter with import/download fallback.
- [x] Add pure TypeScript RSCM parsing/indexing.
- [x] Add pure TypeScript GameVal DAT parsing, provenance, and OpenRune validation rules.
- [x] Add pure TypeScript module `gamevals.toml` parsing/indexing with source/module provenance.
- [x] Add a unified GameVal registry across base/generated DAT, module `gamevals.toml`, and RSCM with explicit OpenRune loader-order provenance and conflict diagnostics.
- [x] Add TypeScript OpenRune project discovery/indexing for modules, pack roots, GameVals, RSCM, raw map/server sources, LIVE, and SERVER.
- [x] Add a framework-neutral OpenRune project session that owns one `ProjectFileSystem` root and atomically refreshes the project index, GameVal registry, config TOML, raw map TOML, server TOML, capabilities, and diagnostic summary as one runtime snapshot.
- [x] Bind the active OpenRune setup to one retained project session; Basic setups clear it, OpenRune switches replace it safely, LIVE cache resolution reuses it, availability probes stay side-effect free, and Reload project refreshes the shared source graph.
- [x] Add source-aware OpenRune config TOML adapters for definitions, including PackConfig block discovery, GameVal-backed id/inherit resolution, provenance, duplicate-target diagnostics, and guarded top-level scalar writes.
- [x] Add OpenRune NPC/ground-Obj/Area TOML parse/generate adapters with GameVal resolution, map-square indexing, Area relationship/polygon parsing, canonical generation, and guarded whole-file replacement.
- [x] Add server TOML adapters for server-content/shop tooling, including PackServerConfig table indexing, raw-server + pack-config provenance, inventory stock parsing, GameVal resolution, duplicate-target diagnostics, guarded scalar writes, and canonical inventory generation.
- [ ] Implement TypeScript terrain map-file-0 encoder.
- [ ] Implement TypeScript static-loc map-file-1 encoder.
- [ ] Add golden decode/encode round-trip fixtures.
- [ ] Replace placeholder map import/export providers with a versioned region/raw map package.
- [ ] Preserve OpenRune-owned source files as the authoritative project form whenever one exists.

OpenRune publication work:

- [ ] Add a bounded backend map-publication operation that uses OpenRune-FileStore `PackMaps`.
- [ ] Run `PackWorldMap` in the same operation so `PackedMapSquares` changed-region state is preserved.
- [ ] Verify published file 0/1 data by reopening LIVE through FileStore.
- [ ] Run the normal OpenRune build explicitly after map publication when the user wants SERVER/project output.
- [ ] Verify SERVER was reseeded from updated LIVE and map files 5/6/7 were added from OpenRune TOML sources.
- [ ] Keep `StudioBackendClient` narrow around build/test/map-publish/verification capabilities.
- [ ] Add `HttpBackendTransport` for explicit browser pairing to an already-running backend.
- [ ] Add lazy Tauri backend supervision/transport; do not start the sidecar for ordinary editing.
- [ ] Preserve the invariant that no Studio-specific OpenRune Server endpoints, forks, accessors, hooks, modules, or framework patches are required.

Later/standalone cache writing:

- [ ] Add cache-patch output if standalone workflows need it.
- [ ] Add a writable modern cache-store implementation only if browser/standalone requirements justify duplicating JS5/DAT2 writing.
- [ ] Do not make a custom writable cache store the primary OpenRune-project publication path.

## Phase 5: rendering and performance

- [x] Replace the 2D world map's eager blob-URL/image residency with virtualized canvas tiles, on-demand persisted PNG reads, display-resolution ImageBitmap decoding, bounded weighted LRU residency, and explicit bitmap disposal.
- [ ] Profile CPU scene build, draw calls, buffer uploads, cache misses and remaining 3D-map memory first.
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
- [x] Remove the Interface Editor's redundant cache-proxy interface load; selected interfaces now come directly from the active decoded cache.

Next:

- [x] Add a `ProjectFileSystem`-backed `CacheSource`; Tauri basic-cache profiles now read selected disk folders directly without an IndexedDB mirror.
- [x] Split Cache & Project Setup into Basic cache and OpenRune project modes. OpenRune mode stores one repository root and discovers LIVE/SERVER plus OpenRune source trees from that root.
- [x] Enable OpenRune project authoring through Chromium File System Access, persist directory handles separately from serializable profiles, and feed browser/desktop roots through the same ProjectFileSystem/session runtime.
- [x] Distinguish valid fresh OpenRune checkouts that need LIVE bootstrap from invalid/unavailable projects; source editing is allowed before LIVE exists.
- [x] Remove the pinned OpenRS2 startup cache target/bootstrap and the user-facing Studio-local-cache preset path.
- [ ] Bind browser File System Access cache-directory handles to `ProjectFileSystemCacheSource` as an optional no-copy enhancement; IndexedDB import remains the universal browser fallback.
- [x] Move Interface/CS2 enum lookups behind the selected cache: `ENUM_STRING`, `ENUM`, and `ENUM_GETOUTPUTCOUNT` now use a local `EnumTypeLoader`; the old enum cache-proxy path is removed.
- [x] Show cache GameVal and OpenRune project component names in the Interface Editor tree while retaining numeric ids and decoded component types.
- [x] Add a framework-neutral Interface metadata source backed by selected-cache GameVals plus the TypeScript OpenRune GameValRegistry/project index, with provenance/conflict diagnostics.
- [x] Stabilize the Interface preview in PR #72: isolate renderer mutations from Svelte effect tracking, preserve cache-backed enum/object CS2 loaders across redraws, model social queries 3600-3627 against deterministic mock state, and virtualize large interface lists.
- [x] Build a framework-neutral Mock Client State Harness for script-visible varps/varbits, varcs, skills, item containers, social state and core client/player flags; PR #73 also wires the existing 3300 client-state CS2 family to that shared state.
- [x] Dispatch real Interface CS2 hooks from the PR #73 harness. PR #74 adds trigger-aware var/inventory/stat transmits, initial var-transmit behavior, 20 ms timers, hover/repeat, click/hold/release, and scroll-wheel listeners with serialized CS2 execution and widget-relative mouse context.
- [ ] Add explicit Interface Edit vs Simulation modes plus a State Debugger for changing PR #73 mock state and observing PR #74 event reactions without a live game server.
- [ ] Add an optional declarative mock network harness for IF_BUTTON-style round trips; do not require a full game server for ordinary Interface preview.
- [x] Bring core OSRS config decoding to the OpenRune rev-240 baseline for NPC, Obj and Param definitions, including modern entity-op payloads and CacheVarLiteral ids.
- [x] Add DBTable/DBRow/DBColumn decoding using the shared `CacheVarLiteral` mapping, selected-cache archive loaders, and byte-alignment fixtures against OpenRune FileStore.
- [ ] Continue the remaining decoder-lossiness/missing-type audit now that DBTable/DBRow decoding is in place.
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
