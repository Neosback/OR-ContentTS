# OpenRune Content Studio Developer Handoff

**Repository:** `Neosback/OR-ContentTS`  
**Current baseline:** Svelte 5 frontend + portable ProjectFileSystem/CacheSource/OpenRune source indexes + optional in-repo Kotlin Studio backend; OpenRune Server remains external/reference-only

This document is the current engineering handoff for developers continuing OpenRune Content Studio.

### Current repository status

As of the PR #69 rev-240 core-decoder checkpoint:

- `backend/` is the canonical optional Studio backend source. The temporary `Neosback/rspsi` repository is migration history only.
- OpenRune Server remains an external compatibility/reference target and requires **zero Studio-specific source changes**.
- The active frontend is Svelte 5. React/TSX migration is complete.
- The portable project layer now includes `ProjectFileSystem` plus in-memory, Tauri, and browser File System Access adapters.
- TypeScript OpenRune project discovery is implemented for Gradle modules, pack roots, `gamevals.toml`, RSCM, raw map/server sources, and LIVE/SERVER cache locations.
- Pure TypeScript RSCM, GameVal DAT, and module `gamevals.toml` parsers/indexes are implemented with source provenance and conflict diagnostics.
- A unified TypeScript GameVal registry now applies OpenRune's source phases across base DAT, generated DAT, module TOML, and RSCM while retaining every declaration, effective-source provenance, the base-ID reservation ceiling, and cross-source conflict diagnostics.
- Source-aware OpenRune PackConfig TOML support now discovers config files under indexed pack roots, indexes supported definition blocks with module/source provenance, resolves symbolic `id`/`inherit` through the GameVal registry, diagnoses duplicate cache targets, and provides guarded top-level scalar writes through `ProjectFileSystem`. Nested subtables remain preserved and require explicit adapters rather than generic rewriting.
- OpenRune raw map TOML support now parses, indexes, generates, and safely replaces NPC spawn, ground-Obj spawn, and Area sources. GameVal symbols resolve through the unified registry; CoordGrid strings are validated/decomposed; NPC/Obj records are indexed by map square; Area includes/excludes/polygons retain source provenance. These are OpenRune map files 5/6/7 and remain separate from Studio static loc edits in file 1.
- Raw map source discovery now mirrors OpenRune's current packers exactly: only direct `.toml` children of `.data/raw-cache/map/npcs`, `objs`, and `area` are active because the packers use non-recursive `Files.list()`.
- OpenRune server TOML support now mirrors `PackServerConfig`'s registered table families across both `.data/raw-cache/server/**/*.toml` and pack-owned `pack/configs/**/*.toml`. It preserves raw/nested source, resolves symbolic ids through the GameVal registry, surfaces duplicate resolved targets instead of inventing precedence, and provides a typed inventory/shop stock view plus guarded source writes.
- Interface selection is local-cache-first. The Interface Workbench no longer makes a redundant `/api/cache-proxy/interface/:id` request, so normal interface browsing does not require the old cache proxy or port 8090.
- CS2 object-definition opcodes 4200-4212 are cache-backed through the active `ObjTypeLoader`; membership, actions, price, note/placeholder transforms, and object search no longer require backend/cache-proxy data.
- CS2 social comparator opcodes 3628-3657 model client stack semantics locally; preview execution does not require live friends/ignore/Friends Chat state, while an optional runtime adapter can supply simulated state.
- Runtime-created interface widgets now use fresh client-parity Widget defaults instead of inheriting parent rendering state. The renderer also normalizes missing text defaults and treats `textFont = -1` as the valid unassigned-font sentinel.
- CS2 enum opcodes `ENUM_STRING`, `ENUM`, and `ENUM_GETOUTPUTCOUNT` now load enum definitions directly from the selected cache through `EnumTypeLoader`. The old enum `/api/cache-proxy` lookup path is removed.
- Cache & Project Setup has two explicit user-facing modes:
  - **Basic cache:** cache-only operation; browser imports the selected cache into IndexedDB, while Tauri reads the selected cache directory directly through `ProjectFileSystemCacheSource`;
  - **OpenRune project:** both desktop and Chromium File System Access environments can open one OpenRune Server repository root. Desktop stores the native path; browser mode stores the granted `FileSystemDirectoryHandle` separately in IndexedDB and keeps only serializable access metadata in the profile. Both feed the same `ProjectFileSystem` / `OpenRuneProjectSession` layers.
- `OpenRuneProjectSession` now composes that project root into one framework-neutral runtime snapshot: `ProjectFileSystem`, project discovery, unified GameVals, PackConfig, raw map sources, server TOML, local capabilities, and diagnostic counts. Refresh is atomic, so a failed rescan does not publish a partially updated source graph.
- The active setup runtime now retains one `OpenRuneProjectSession` per active OpenRune profile/root. Actual profile activation binds the runtime, Basic-cache activation clears it, switching roots hides the old session before the replacement finishes, and framework-neutral getters/subscriptions expose the current snapshot to future editors.
- OpenRune LIVE cache resolution reuses the retained session filesystem/project index when that profile is active. Repository availability probes remain side-effect free and cannot silently switch the active project runtime.
- OpenRune setup health distinguishes unavailable access, invalid project roots, valid fresh projects that still need LIVE bootstrap, and fully cache-ready projects. A missing `.data/cache/LIVE` is no longer treated as an invalid OpenRune workspace; source editing can remain available while Map waits for bootstrap.
- Cache Repository's **Reload project** action now refreshes the retained OpenRune session before reloading LIVE, so one user action rescans GameVals/config/map/server sources as a coherent generation.
- The 2D world map now uses virtualized canvas rendering with bounded decoded-bitmap residency. Full-resolution 256×256 region PNGs remain persisted in Cache Storage, but cached tiles are no longer eagerly turned into permanent blob URLs. Visible tiles decode only to the physical pixel size they can actually occupy (capped at the original source resolution), use a weighted LRU budget, and are explicitly closed on eviction/close. This removes the previous runaway decoded-image/GPU residency loop without reducing visible map quality.
- The old pinned OpenRS2 development-cache bootstrap (`cache-target.json` / `ensure-cache`) and user-facing Studio-local-cache preset section have been removed. The range-backed Vite source remains only as an internal development capability.
- Tauri user-approved filesystem scope is persisted across launches through `tauri-plugin-persisted-scope`.
- The current synchronous cache engine still materializes active DAT/DAT2/index bytes into the webview's JS memory through `MemoryStore`. Direct-disk Tauri loading removes persistent duplication, not the runtime memory copy. True lazy/random-access disk decoding is a later cache-engine refactor.
- The Kotlin backend is still intentionally **not** the universal cache/project transport. It should start lazily only for JVM/OpenRune-only operations such as Gradle build/test, FileStore map publication, and parity verification.


## 1. Critical direction

### The backend is separate from OpenRune Server

New Content Studio backend work belongs in a **separate Studio backend service**, not in `Neosback/OpenRune-Server`.

The legacy TypeScript `server/` has been removed from this repository.

OpenRune Server is now an external compatibility/reference target. We may inspect it to understand FileStore, cache/build behavior, GameVals, project structure, and runtime semantics, but normal Content Studio development should not add Studio-specific endpoints or required patches to OpenRune Server.

The separate backend now lives under `backend/` in this repository. It was moved from the temporary `Neosback/rspsi` development repository in PR #34. `backend/` is the canonical source; do not dual-edit or re-import from the old repository. Its current codebase is validated and healthy. Packaging plus the startup/discovery contract are the next backend integration boundary.

The intended direction is:

```text
Svelte Studio UI
    |
framework-neutral TypeScript
    +-- ProjectStore / CacheSource / WorldSource
    +-- ProjectFileSystem
    +-- GameValRegistry / OpenRune project index
    +-- Map codecs / region packages / writable cache target
    |
platform adapters
    +-- browser IndexedDB import/download fallback
    +-- browser File System Access (when supported)
    +-- Tauri direct filesystem/cache access
    +-- optional StudioBackendClient for JVM/OpenRune build + verification
```

The backend is optional. Do not route capabilities through it simply because an endpoint can be written.

For the detailed ownership model, read `docs/OPENRUNE_MAP_CACHE_ARCHITECTURE.md` first, then `docs/STUDIO_BACKEND_INTEGRATION.md`.

## 2. Current architecture

### UI

The active browser application is:

```text
client/src/main.ts
  -> client/src/ui/main.ts
     -> client/src/ui/App.svelte
```

Svelte 5 owns the application UI.

There is no active React UI. The remaining React/TSX migration surface and React-only dependencies were removed in PR #19.

The CI architecture guard scans the full client source tree and package manifest to prevent React/JSX/TSX from returning.

### Runtime

Framework-neutral TypeScript owns:

- cache decoding
- RuneScape config/domain decoding
- map viewer runtime
- map editor runtime
- WebGL2 rendering
- editor services/plugins
- command handling
- edit transactions
- project/edit serialization contracts

Keep rendering/cache/editor runtime code independent of Svelte whenever practical.

### Rendering

WebGL2 is the reference renderer.

Do not introduce WebGPU or Rust/WASM simply because they are available. Those remain later optimizations behind stable TypeScript interfaces and should be justified by profiling.

## 3. Editor action and mutation architecture

The editor now follows this flow:

```text
UI / keybinding / tool
    -> shared editor command
       -> named edit transaction
          -> typed mutation
             -> Undo / Redo history
                -> Edit Format v1
                   -> local persistence
                      -> TypeScript encode/source adapter
                         -> browser export or direct Tauri filesystem
                            -> optional backend build/verification
```

### Shared commands

Key file:

- `client/src/mapeditor/commands/editor-command-registry.ts`

Commands currently cover:

- Undo / Redo
- brush size
- object visibility
- terrain smoothing
- paint-tools panel visibility
- primary tool selection
- Height modes and adjustments
- Object Selector actions
- Region Stamp actions
- workbench panel open/restore/reset actions

Built-in keybindings can derive name, description, enabled state, and action from the same command definition.

Held modifier bindings and camera-suppression bindings intentionally remain raw input bindings because they represent input state, not executable editor commands.

### Universal edit transactions

Key files:

- `client/src/mapeditor/editor-transaction.ts`
- `client/src/mapeditor/map-editor-history.ts`
- `client/src/mapeditor/map-editor-history-record.ts`
- `client/src/mapeditor/map-editor-object-history.ts`

Current mutation kinds:

- `map.tile`
- `map.objects`

Normal terrain paint strokes, object edits, Region Stamp paste, and Region Stamp delete now use the transaction layer.

Region Stamp can modify terrain and objects across multiple map squares while remaining one named Undo operation.

The old history-stroke methods still exist only as compatibility wrappers. New editing systems should use transactions directly.

## 4. Edit Format v1

Edit Format v1 is the current persistence/backend contract.

Key files:

- `client/src/project/edit-format-v1.schema.json`
- `client/src/project/edit-format-v1.ts`
- `client/src/project/fixtures/edit-format-v1.golden.json`
- `client/src/project/README.md`

### Format rules

Do not persist renderer/runtime implementation details.

Tile edits serialize as:

- `mapX`
- `mapY`
- `level`
- `localX`
- `localY`
- sparse before/after terrain fields

Object edits serialize as semantic loc placements:

- `id`
- `flags`
- `worldX`
- `worldY`

Do not send:

- packed internal map ids
- packed local tile ids
- renderer scene-border coordinates
- entity/model instances
- cache-encoded region bytes

The portable **TypeScript map layer should encode terrain/static-loc payloads**, but OpenRune-project publication should reuse OpenRune-FileStore `PackMaps` to write those payloads into LIVE. Generic DAT2/JS5 writing is not the primary OpenRune path.

### Strict versioning

v1 uses:

```json
{
  "format": "openrune.edit-batch",
  "version": 1
}
```

The decoder rejects:

- unsupported versions
- unknown fields
- malformed mutations
- invalid coordinates
- inconsistent affected-map metadata
- incorrect derived tile counts

Do not silently add incompatible fields to v1. If a future mutation family cannot fit the existing contract cleanly, advance the format version and add explicit compatibility/migration logic.

### Golden parity

The golden fixture should eventually be consumed by both:

- TypeScript tests
- Kotlin Studio-backend tests

Both implementations should decode the same fixture into equivalent semantic edits.

## 5. Recent completed migration sequence

These PRs establish the current baseline:

| PR | Result |
| --- | --- |
| #17 | Post-Svelte architecture hardening, clean-install CI, Svelte boundary |
| #18 | Cleared Svelte/TypeScript migration debt and restored blocking type gates |
| #19 | Removed the remaining React/TSX surface and React-only dependency stack |
| #20 | Added the shared editor command registry |
| #21 | Expanded commands into tools, keybindings, menus, and layout actions |
| #22 | Added universal named edit transactions |
| #23 | Added Edit Format v1, strict codec/schema, and golden parity fixture |
| #24 | Recorded the then-current OpenRune backend direction and added this developer handoff; the backend direction is now superseded by the separate Studio backend model |
| #25 | Added Project Format v1, framework-neutral `ProjectStore`, and local IndexedDB persistence |
| #26 | Removed the legacy TypeScript server, moved cache bootstrap into Studio, and reviewed OpenRune Server integration |
| #27 | Added framework-neutral `ProjectLifecycle` with dirty-state and applied-history persistence semantics |
| #28 | Wired ProjectLifecycle into the Svelte map-editor workflow and added strict Edit Format v1 replay into live editor history |
| #29 | Added framework-neutral `CacheSource`, static/Range and IndexedDB implementations, profile source resolution, and Cache Repository integration |
| #30 | Added framework-neutral `WorldSource`, bundled/offline world data, viewer integration, and neutral spawn-domain ownership |
| #31 | Reframed OpenRune Server as compatibility/reference only and documented separate backend + Tauri/web integration |
| #33 | Added backend validation workflow |
| #34 | Moved the Kotlin backend into `backend/`, made it canonical, replaced legacy `foundationGate`, split backend CI by subsystem, and validated the runnable distribution |
| #35 | Updated the backend handoff/docs around the monorepo move and zero-required-OpenRune-changes invariant |
| #36 | Added the backend launch/connection contract: ephemeral port, parent token, READY handshake, stable status identity, and loopback browser CORS/preflight |
| #43 | Added edit-path profiling and documented renderer/edit latency hotspots |
| #44 | Added the measured Rust/WASM repeated-placement kernel and retained TS fallback |
| #45 | Documented staged wgpu renderer adoption; WebGL2 remains the reference/fallback |
| #46 | Added the framework-neutral `ProjectFileSystem` foundation |
| #47 | Added the Tauri `ProjectFileSystem` adapter with scoped native filesystem access |
| #48 | Added browser File System Access `ProjectFileSystem` support with import/download fallback |
| #49 | Added TypeScript OpenRune project discovery/indexing |
| #50 | Added pure TypeScript RSCM parsing/indexing with provenance and conflict diagnostics |
| #51 | Added OpenRune-compatible GameVal DAT parsing, base/generated provenance, and validation |
| #52 | Added module `gamevals.toml` parsing/indexing and generated-output exclusion |
| #53 | Removed the Interface Workbench's redundant cache-proxy load; selected interfaces now come from the active decoded cache |
| #54 | Cache Repository platform-source cleanup: direct Tauri disk cache source, one-pick browser import, persisted Tauri scope, and shared cache-store validation |
| #55 | Added the unified GameVal registry across DAT, module TOML, and RSCM with OpenRune loader-order precedence and provenance |
| #56 | Added source-aware OpenRune PackConfig TOML indexing and guarded definition-source writes |
| #57 | Added OpenRune NPC/ground-Obj/Area map-source TOML parse/index/generate/write adapters and aligned source discovery with the packers |
| #58 | Added OpenRune PackServerConfig TOML indexing, shop/inventory stock support, provenance/conflict diagnostics, and guarded source writes |
| #59 | Split Cache & Project Setup into Basic cache vs OpenRune project-root modes and removed the pinned development-cache bootstrap |
| #60 | Added the framework-neutral OpenRune project session with atomic full-project source/index refresh |
| #61 | Bound the active OpenRune setup to one retained project session, reused it for LIVE cache resolution, and made Reload project refresh the shared source graph |
| #62 | Reworked the 2D world map into a virtualized canvas tile renderer with on-demand Cache Storage reads, display-resolution decoding, bounded bitmap residency, and explicit disposal |
| #63 | Enabled capability-based OpenRune project setup in Chromium browsers, persisted directory handles, unified browser/desktop project resolution, and added fresh-checkout bootstrap health states |
| #64 | Added cache-backed CS2 object opcodes 4200-4212 using the active selected-cache `ObjTypeLoader` |
| #65 | Added client-semantic social comparator opcodes 3628-3657 with an optional simulated social-state adapter |
| #66 | Replaced CC_CREATE parent cloning with client-parity runtime widget defaults and normalized no-font/text defaults |
| #67 | Removed CS2 enum cache-proxy reads; enum opcodes now use the active selected-cache `EnumTypeLoader` |
| #68 | Added framework-neutral Interface metadata enrichment from selected-cache GameVals plus active OpenRune GameVal/RSCM provenance, conflicts, and symbolic component names |
| #69 | Brought core NPC/Obj/Param decoding to the current OpenRune rev-240 baseline, added CacheVarLiteral ids, fixed modern entity-op alignment, and added byte-alignment regression fixtures |

Do not reintroduce systems replaced by these PRs.

## 6. Current validation baseline

### Client validation

The complete client gate remains the merge requirement:

- clean `npm ci`
- Svelte-only client architecture boundary: pass
- Svelte check: pass
- TypeScript: pass
- Vitest: pass, including cache-source, project, editor, and UI coverage
- Vite production build: pass

Run from `client/`:

```bash
npm ci
npm run validate
```

Equivalent full blocking steps:

```bash
npm run check:ui-boundaries
npm run check
npm run typecheck
npm test
npm run build
```

A PR is not ready to merge if any blocking gate is red.

### Backend validation

Backend changes are validated independently from `backend/`.

The current GitHub Actions gate proves:

- backend compile
- `Protocol` tests
- API/security tests
- OpenRune inspection/indexing tests
- Gradle/process-boundary tests
- runnable `StudioService` distribution

Relevant workflow:

- `.github/workflows/backend-validation.yml`

Useful Gradle tasks:

```bash
cd backend
./gradlew backendCheck --no-daemon
./gradlew backendDistribution --no-daemon
./gradlew validateBackend --no-daemon
```

Do **not** use the removed `foundationGate` as the canonical validation command.


## 7. Recommended next work

### Completed: local project persistence

A **ProjectStore abstraction plus local IndexedDB implementation** now sits on top of Edit Format v1.

Do not wire the UI directly to IndexedDB.

Current implementation:

- `client/src/project/project-store.ts` defines the framework-neutral interface.
- `client/src/project/project-format-v1.ts` and its schema define the portable project contract.
- `client/src/project/indexeddb-project-store.ts` provides the local browser implementation.
- `client/src/project/fixtures/project-v1.golden.json` provides the portable golden fixture.

Current interface:

```ts
interface ProjectStore {
    listProjects(): Promise<ProjectSummary[]>;
    createProject(input: CreateProjectInput): Promise<Project>;
    loadProject(id: string): Promise<Project | undefined>;
    saveProject(project: Project): Promise<void>;
    deleteProject(id: string): Promise<void>;

    exportProject(id: string): Promise<string>;
    importProject(serialized: string): Promise<Project>;
}
```

Exact naming can change, but preserve the service boundary.

### Minimal project model

The first version should stay intentionally small. At minimum it needs:

- stable project id
- display name
- created/updated timestamps
- versioned project/schema version
- Edit Format v1 edit data
- enough cache/source identity to know what base content the edits belong to

Do not put renderer state or dock layout into the authoritative content payload.

UI/workspace preferences can remain separate.

### Persistence behavior

Recommended acceptance criteria:

1. Projects survive browser reloads.
2. Multiple projects can be listed/opened independently.
3. Saving does not require the legacy TypeScript server.
4. Project edit data is stored using the versioned project/edit contract, not internal history objects.
5. Export produces portable JSON.
6. Import validates before storing.
7. Unsupported project/edit versions fail with actionable errors.
8. Corrupt project records do not crash project listing.
9. Tests cover create/load/save/delete/import/export.
10. The storage implementation is replaceable by a Studio-backend-backed implementation later.

Use an IndexedDB test implementation or a focused test dependency if browser IndexedDB is not available in the existing Vitest environment. Do not weaken tests just to avoid a small dev-only dependency.

## 8. Recommended sequence after ProjectStore

After local project persistence, continue in roughly this order:

### A. Project lifecycle + replay — completed

`client/src/project/project-lifecycle.ts` owns:

- create/open/save/Save As/close
- current project + working edits
- dirty-state tracking
- import/export orchestration
- explicit dirty-project discard guards
- applied-history cursor -> Edit Format v1 conversion

`client/src/project/edit-format-v1-replay.ts` now owns strict project edit application into the live editor:

- validates Edit Format v1 before replay
- requires all referenced map squares to be loaded
- verifies terrain and semantic loc `before` state against the active base cache
- rebuilds semantic loc placements through the scene builder
- reconstructs persisted transactions into normal Undo/Redo history
- rolls back replayed work on failure

`client/src/ui/mapeditor/project-session.svelte.ts` is intentionally thin. It binds the framework-neutral lifecycle to Svelte reactivity, editor history, and local project operations. The setup screen now supports New/Open/Import and the editor title bar supports Save/Save As/Export/Close. Dirty project transitions and browser exit are guarded.

Undo/Redo entries after the current history cursor are intentionally excluded from persisted project content. Publish/build remain unavailable until the separate Studio backend exposes those capabilities.

### B. CacheSource — completed

Cache acquisition now sits behind `client/src/cache/cache-source.ts`.

Current implementations:

- `StaticRangeCacheSource` for Studio-owned `/caches` data served with Range support
- `IndexedDbProfileCacheSource` for cache folders imported into browser storage
- `profile-cache-source.ts` for profile-to-source resolution and compatibility with existing `server:<cache-name>` profile ids

The Cache Repository and active map/editor cache resolver consume these source seams rather than selecting transport/storage implementations themselves. `profile-cache-store.ts` is storage-only and no longer owns cache loading.

`client/src/mapviewer/Caches.ts` remains a compatibility facade for existing callers, but generic cache acquisition belongs in the cache-source layer.

Current cache acquisition now also includes `ProjectFileSystemCacheSource`, which reads a Jagex cache directory through any `ProjectFileSystem`.

Platform behavior:

- Tauri profiles with `useSystemFolder/systemCachePath` resolve directly to `ProjectFileSystemCacheSource(new TauriProjectFileSystem(path))`; they do not create an IndexedDB mirror.
- Browser profile creation uses one `webkitdirectory` selection and immediately imports that exact `File[]` into IndexedDB. The old second-picker flow was removed.
- Browsers with File System Access have the underlying `BrowserProjectFileSystem` foundation, but persistent cache-directory handle binding is still a follow-up; IndexedDB remains the universal browser fallback.
- Studio local `/caches` entries continue to use `StaticRangeCacheSource` with browser Cache Storage disabled.

The synchronous `CacheSystem -> MemoryStore` contract means direct filesystem cache sources still load active cache-store bytes into JS memory. Do not confuse this with persistent duplication: Tauri reads from disk and does not store another browser copy.

Backend cache access remains optional parity/diagnostic infrastructure.

### C. WorldSource — completed

World data that is not authoritative cache-map content now sits behind `client/src/world/world-source.ts`.

Current implementation:

- `WorldSource` defines the framework-neutral load contract.
- `BundledWorldSource` provides local/offline NPC and ground-item/object spawn snapshots.
- `default-world-source.ts` centralizes runtime source selection.
- `spawn-utils.ts` owns map-square filtering.
- semantic `NpcSpawn` / `ObjSpawn` types live in the world layer.
- the Map Viewer consumes `WorldSource` and passes the resulting arrays into the existing render-worker contract.
- old `mapviewer/data/*Spawn.ts` modules are compatibility facades only.

Cache-derived map locs are intentionally not part of WorldSource.

Zones/areas are intentionally not modeled yet because there is no concrete active zone model or consumer. Extend WorldSource when that semantic model exists rather than inventing a transport-shaped contract.

Future OpenRune world/source adapters should satisfy `WorldSource` without changing Svelte viewer code or render-worker initialization. Prefer direct project-file adapters; backend delivery is optional.

### D. OpenRune source integration + optional Studio backend

The backend move is complete and validated, but it is not the universal integration layer.

The canonical design is now **source-first**:

- if OpenRune already has an authoritative TOML/GameVal/pack source, Studio edits that source;
- OpenRune's own packers produce LIVE/SERVER output;
- LIVE is the full/base cache;
- SERVER is reseeded from LIVE, strips server-unneeded client indices, then adds server-specific data;
- Studio should not directly author SERVER.

Current backend capabilities remain useful:

- Ktor loopback service/security;
- project inspection;
- OpenRune FileStore inspection;
- GameVal/RSCM/source indexing;
- bounded Gradle task discovery;
- allowlisted asynchronous Gradle operations;
- status/log/cancel/SSE.

Important OpenRune map findings:

- file 0 = terrain;
- file 1 = static loc placements;
- file 5 = NPC spawns from OpenRune map TOML;
- file 6 = ground-item/Obj spawns from OpenRune map TOML;
- file 7 = areas from OpenRune map TOML;
- OpenRune-FileStore already provides `PackMaps` for raw `l/m` map files and RSPSi-style `.pack` files;
- the current OpenRune Server LIVE task list does not register `PackMaps`;
- `PackMaps` records changed squares in memory and `PackWorldMap` consumes them, so Studio map publication should run both in one bounded JVM operation.

The portable filesystem/discovery/parser foundation is now substantially complete. Continue in this order:

1. unified GameVal registry across base DAT, generated DAT, module `gamevals.toml`, and RSCM with explicit provenance/precedence — completed in PR #55;
2. bind browser File System Access cache-directory handles to `ProjectFileSystemCacheSource` as an optional no-copy enhancement;
3. core rev-240 NPC/Obj/Param parity is complete in PR #69; add DBTable/DBRow next, then continue the remaining lossy/missing decoder audit before optional backend enrichment;
4. OpenRune PackConfig definition TOML adapter — completed in PR #56; NPC/ground-Obj/Area map-source TOML adapter — completed in PR #57; PackServerConfig/server-shop TOML adapter — completed in PR #58;
5. add TypeScript terrain file-0 and static-loc file-1 encoders;
6. add portable raw/region package export;
7. add bounded backend `PackMaps + PackWorldMap` publication into LIVE;
8. run the explicit normal OpenRune build when SERVER output is requested;
9. verify LIVE/SERVER outputs.

A deeper optional optimization is an async/random-access cache store so Tauri can avoid materializing the full active DAT2 file in JS memory. Do not block source/editor integration on that refactor.

Do not prioritize a general writable JS5/DAT2 cache implementation for OpenRune publication. Reuse OpenRune-FileStore first.

Do not modify OpenRune Server merely to satisfy Studio integration.

## 9. Broader editor work

These remain important, but should not derail the backend-ready seams:

- Shops as a first-class dock panel
- World Map as a first-class dock panel
- multi-region editing without seams
- validation overlays
- improved object placement/snapping/preview
- model and animation viewer
- NPC/player preview
- definitions editor
- project-wide search/indexing
- Studio theme-token cleanup

When these editors begin modifying content, route their edits through:

```text
command -> transaction -> typed mutation -> Edit Format
```

Do not create isolated per-panel save systems.

## 10. Backend rules

There is no game server in this repository anymore.

Do not recreate one here, and do not treat OpenRune Server as the Content Studio backend.

### Absolute OpenRune compatibility rule

Content Studio must require **zero Studio-specific changes to OpenRune Server**.

Allowed:

- passively inspect a user-selected compatible OpenRune checkout;
- use independently available OpenRune/FileStore libraries;
- read source, GameVals/RSCM data, and generated cache outputs;
- invoke existing allowlisted Gradle tasks on explicit user action;
- later update explicit user-owned content/config through Studio-owned write/publish workflows.

Not allowed:

- adding Studio HTTP/API endpoints to OpenRune Server;
- requiring a custom OpenRune Server fork;
- adding required accessors/hooks/modules to OpenRune Server for Studio;
- silently patching OpenRune framework/source code;
- exposing arbitrary Gradle/shell execution;
- treating generated cache mutation as a silent substitute for authoritative source updates.

If a capability cannot be supported without an OpenRune Server source change, degrade or disable that capability until it can be implemented externally.

The backend is canonical under `backend/`. Do not keep a second active backend implementation in the old `rspsi` repository.

The Studio must continue to start and support local editing without either the backend or OpenRune Server running.

### Tauri and web

Tauri uses native dialog/filesystem plugins for ordinary OpenRune project and cache access. A scoped `ProjectFileSystem` adapter reads/writes the selected project directly, and `ProjectFileSystemCacheSource` reads a selected cache directory directly. Tauri cache profiles must not be mirrored into IndexedDB.

Filesystem scope selected by the user is persisted across desktop launches through `tauri-plugin-persisted-scope`. The persisted-scope plugin must remain registered after `tauri-plugin-fs`.

Tauri may supervise a packaged backend sidecar **lazily** for explicit backend-only actions such as OpenRune build/test or FileStore/JVM verification.

Plain web mode remains fully usable without a backend. The universal cache flow is one folder selection followed by IndexedDB import. Supporting browsers may later bind a retained File System Access directory handle directly to `ProjectFileSystemCacheSource`; all browsers retain import/download/IndexedDB workflows. `HttpBackendTransport` is only for explicit pairing when the user requests backend-only capabilities.

Do not duplicate TypeScript cache/map/GameVal domain logic in Rust or Kotlin.

## 11. Development conventions

### Pull requests

Keep work to **one active PR normally**, two only when genuinely independent.

A good sequence is:

1. create one focused branch from current `main`
2. implement one architectural slice
3. add/adjust tests
4. run the complete blocking client gate
5. merge only when green
6. start the next slice from the new `main`

Avoid long stacked PR chains.

### Preserve contracts

When replacing an implementation:

- keep persisted shortcut ids stable unless migration is intentional
- preserve Edit Format compatibility for its declared version
- add explicit migrations for persistent data changes
- do not silently alter cross-language contracts
- update `ARCHITECTURE.md`, `ROADMAP.md`, and this handoff when architectural direction changes

## 12. Immediate starting point for the next developer

Start by reading:

1. `DEVELOPER_HANDOFF.md`
2. `ARCHITECTURE.md`
3. `ROADMAP.md`
4. `docs/OPENRUNE_MAP_CACHE_ARCHITECTURE.md`
5. `docs/STUDIO_BACKEND_INTEGRATION.md`
6. `docs/INTERFACE_EDITOR_DATA_SOURCES.md`
7. `backend/README.md`
8. `backend/docs/API.md`
9. `client/src/project/README.md`
10. `client/src/project/edit-format-v1.ts`
11. `client/src/project/edit-format-v1.schema.json`
12. `client/src/mapeditor/editor-transaction.ts`
13. `client/src/mapeditor/commands/editor-command-registry.ts`

The project lifecycle/replay, CacheSource, and WorldSource frontend seams are complete.

The backend is now moved, canonical, and fully validated under `backend/`.

The backend launch/connection contract is implemented:

- ephemeral `port=0` launch;
- parent-supplied per-launch token;
- one machine-readable READY handshake with protocol version, endpoint, PID, and backend instance identity;
- no token in the READY payload;
- loopback-only browser CORS/preflight;
- stable backend/API protocol identity through status;
- retained Host/Origin/token protections.

The portable filesystem/discovery layer, unified GameVal registry, PackConfig definition adapter, OpenRune NPC/ground-Obj/Area map-source adapters, PackServerConfig/server-shop TOML adapter, framework-neutral OpenRune project session, and active retained runtime binding are now in place. The next major source/publication work is the TypeScript terrain file-0 encoder, followed by static-loc file-1 encoding and golden round-trip fixtures.

For Interface work, keep reads local-first: decoded interfaces, client scripts, varbits, object definitions, and enum definitions come from the selected cache; symbolic names/provenance now come from the selected cache plus the retained OpenRune project metadata layer. The next Interface/cache priority is DBTable/DBRow decoding, followed by the remaining lossy/missing decoder audit before optional backend enrichment.

For cache access, preserve the platform split:
- browser universal fallback = one-time folder import into IndexedDB;
- browser progressive enhancement = File System Access handle bound to `ProjectFileSystemCacheSource`;
- Tauri = native direct-disk `ProjectFileSystemCacheSource`, no IndexedDB mirror;
- backend = no role in normal cache reads.

After the remaining portable seams exist, add the first narrow backend publication feature: an explicit `PackMaps + PackWorldMap` operation against LIVE, followed by the existing allowlisted OpenRune cache build when SERVER output is requested.

Do not make `StudioBackendClient` a dependency for ordinary editing or source-file updates.

Keep all local implementations available so the Studio remains usable without the backend or OpenRune Server running.

The key architectural requirement is simple:

> Content Studio owns the UI and stable frontend service interfaces. The separate Studio backend owns local native/JVM capabilities. OpenRune Server is a compatibility/reference target, not the backend we modify.


### Interface Editor metadata note

The Interface Editor's current GameVal/RSCM direction is documented in
`docs/INTERFACE_EDITOR_DATA_SOURCES.md`.

Important points:

- decoded interface structure remains cache-index-3 authoritative;
- interface selection now consumes the already-decoded `InterfaceViewer` entry locally and no longer calls `/api/cache-proxy/interface/:id`;
- cache index 24 GameVals supply friendly interface/component names, and PR #68 now exposes those names in the Interface Editor while retaining numeric ids and decoded types;
- portable TypeScript GameVal/RSCM indexing is implemented; PR #68 projects that metadata into the Interface Editor with source provenance, alternates, and conflict diagnostics without making it runtime authority;
- project metadata should enrich cache metadata with symbolic identity, module/source provenance, references, and diagnostics regardless of whether it came from TypeScript or optional JVM analysis;
- do not parse arbitrary OpenRune project files directly in Svelte and do not require OpenRune Server changes;
- do not let a mismatched project checkout silently override names/ids from the selected cache.


### OpenRune map/cache integration note

The canonical map/cache/RSCM design is `docs/OPENRUNE_MAP_CACHE_ARCHITECTURE.md`.

Critical distinctions:

- map-group file 0 = terrain;
- map-group file 1 = static locs;
- OpenRune raw map NPCs -> file 5;
- OpenRune raw map ground Objs -> file 6;
- OpenRune raw map areas -> file 7;
- Studio `map.objects` mutations are static locs, not OpenRune ground `obj` spawns;
- OpenRune currently has no raw TOML source layer for terrain/static-loc map files;
- Studio Edit Format/project state remains authoritative for those edits until explicit encode/export/apply;
- terrain/loc encoders, RSCM/GameVal parsing, and project-file integration should be TypeScript-first.


### Source-first publication rule

When OpenRune already owns a source representation, update it and let OpenRune pack the cache:

- definitions -> pack `configs/*.toml`;
- GameVals -> module `gamevals.toml` / existing RSCM source;
- server metadata and shops -> `.data/raw-cache/server/**/*.toml`;
- NPC spawns -> `.data/raw-cache/map/npcs/*.toml`;
- ground-item spawns -> `.data/raw-cache/map/objs/*.toml`;
- areas -> `.data/raw-cache/map/area/*.toml`.

Terrain/static locs are the special case. OpenRune Server does not currently provide matching TOML source, but OpenRune-FileStore already has `PackMaps`. Keep Studio semantic/Edit Format state authoritative for those edits, encode raw terrain/loc payloads in TypeScript, then use the bounded FileStore publication operation when publishing into an OpenRune checkout.

SERVER is always treated as generated output derived from LIVE plus server-specific packers.
