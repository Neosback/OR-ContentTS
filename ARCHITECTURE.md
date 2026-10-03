# OpenRune Content Studio Architecture

## Active runtime

The active browser application has one UI entry chain:

```text
client/src/main.ts
  -> client/src/ui/main.ts
     -> client/src/ui/App.svelte
```

Svelte 5 owns the Studio shell and the active routes for cache management, map viewing, map editing, and interface tooling.

## Boundaries

### `client/src/ui/`

This is the active Studio UI layer.

- Svelte 5 is the UI framework.
- It may import framework-neutral TypeScript services, renderers, decoders, editor hosts, and data models.
- New Studio UI belongs here unless there is a strong architectural reason otherwise.

The client-wide CI boundary check rejects JSX/TSX, React-family imports, and React-era direct dependencies anywhere under the active client source tree.

### Framework-neutral TypeScript

The RuneScape/cache/rendering/editor runtime lives outside the Svelte component layer. Important areas include:

- `src/rs/`
- `src/mapviewer/`
- `src/mapeditor/`
- cache/profile/data utilities used by the Studio

These modules should avoid depending on a UI framework when practical. UI components consume these modules, not the other way around.

### React migration status

The active client source tree is now Svelte/TypeScript only. The retained React/TSX migration surface and its direct React-only dependency/tooling stack have been removed. Framework-neutral TypeScript remains outside `src/ui/` for rendering, cache, editor, and game-domain code.

## Rendering

WebGL2 remains the reference renderer. Svelte owns UI orchestration, while rendering and cache-heavy work stay in framework-neutral TypeScript. Future Rust/WASM work should sit behind the same TypeScript-facing runtime boundaries rather than coupling directly to Svelte components.

Any wgpu/WebGPU work is an experimental rendering-backend track, not a replacement for the editor domain model or the measured Rust CPU kernels. The first recommended target is the editor object slot-mesh pass because it already exposes stable packed geometry independent of PicoGL. See `docs/WGPU_RENDERER_PLAN.md` for the ranked migration plan and acceptance gates.

## Editor mutation boundary

Editor behavior now follows a common flow:

```text
command / tool interaction
  -> named edit transaction
     -> typed mutations
        -> undo/redo history
        -> Edit Format v1 / project persistence
```

Transactions are framework-neutral TypeScript. Current mutation kinds cover map tiles and map objects; future content types such as NPC spawns, zones, shops, interfaces, and definitions should extend the mutation union rather than introducing separate save/undo systems.

History entries retain compatibility projections for existing map replay/UI code, but the transaction mutation list is the forward-facing representation for persistence and backend integration.

### Edit Format v1

The persistence/backend contract is defined by:

- `client/src/project/edit-format-v1.schema.json` — machine-readable JSON Schema
- `client/src/project/edit-format-v1.ts` — TypeScript normalization, validation, encoding, and decoding
- `client/src/project/fixtures/edit-format-v1.golden.json` — canonical cross-language parity fixture

Edit Format v1 deliberately does not expose packed runtime ids or renderer-local scene coordinates. Tile mutations use explicit map/local coordinates. Object mutations use semantic loc placements (`id`, `flags`, `worldX`, `worldY`).

Derived metadata such as affected maps and tile counts is validated against the mutation list. Unknown fields and unsupported versions are rejected. New mutation families that cannot be expressed by the v1 schema should be introduced through an explicit schema version rather than silently extending v1 payloads.

## Backend boundary

The frontend is designed to work offline today. Server-backed behavior must sit behind explicit interfaces so local implementations can be replaced without rewriting the UI.

### Studio backend and OpenRune compatibility

The Content Studio backend is a **separate local service**, not OpenRune Server itself.

OpenRune Server (`Neosback/OpenRune-Server`) is an external compatibility/reference target. The backend may use OpenRune libraries and inspect a user's OpenRune project, but normal Content Studio development must not require Studio-specific modifications to OpenRune Server.

The separate backend now lives under `backend/` in this monorepo. It was moved from the temporary `Neosback/rspsi` development repository in PR #34; `backend/` is the canonical source. The backend compiles, passes protocol/API/security/OpenRune-indexing/Gradle-process tests, builds a runnable StudioService distribution, and has a stable launch/discovery contract. The next backend-facing product work is an explicit, narrow build/publish bridge rather than making the backend part of ordinary reads or editing.

The backend is intentionally narrow. Portable capabilities belong in framework-neutral TypeScript first, while OpenRune-owned source formats remain authoritative for OpenRune project publication.

The backend is useful for:

- bounded Gradle/OpenRune build and test operations;
- a bounded OpenRune-FileStore `PackMaps + PackWorldMap` publication path for terrain/static-loc edits;
- exact OpenRune FileStore/JVM parity and output verification;
- optional `freshCache` / upstream build workflows;
- JVM/compiler-aware analysis when a future feature actually needs it.

The backend should not be required for:

- OpenRune directory inspection;
- cache loading/decoding;
- map viewing/editing;
- portable terrain/static-loc encoding;
- RSCM/GameVal parsing;
- TOML parsing/generation;
- updating OpenRune-owned TOML/RSCM/pack source files;
- normal Tauri filesystem reads/writes;
- Studio project persistence;
- region/package export.

See `docs/OPENRUNE_MAP_CACHE_ARCHITECTURE.md` for the TypeScript-first map/cache/GameVal model and `docs/STUDIO_BACKEND_INTEGRATION.md` for the optional backend lifecycle/security model.

### Cache access

Cache acquisition is framework-neutral and sits behind `CacheSource`:

```text
Cache Repository / map viewer / map editor
              |
     profile source resolution
              |
                         CacheSource
              /              |                 \
StaticRangeCacheSource  IndexedDbProfileCacheSource  ProjectFileSystemCacheSource
                                                    /                         \
                                      TauriProjectFileSystem     browser File System Access
```

`client/src/cache/cache-source.ts` defines the shared loaded-cache contract and load options. `StaticRangeCacheSource` owns the Studio-served `/caches` source and preserves HTTP Range-capable loading through `CacheFiles`. `IndexedDbProfileCacheSource` adapts browser-imported cache files to the same contract. `ProjectFileSystemCacheSource` is implemented for direct filesystem-backed cache access, including Tauri OpenRune/LIVE and Basic-cache paths and capable browser File System Access flows.

Persisted `server:<cache-name>` profile ids remain supported as a compatibility binding, but the prefix is resolved by the cache-source layer rather than by IndexedDB storage. `profile-cache-store.ts` only stores imported cache bytes.

`client/src/mapviewer/Caches.ts` remains a compatibility facade for existing runtime callers; it is no longer the architectural owner of cache acquisition. OpenRune-local access goes through `ProjectFileSystemCacheSource` without adding platform branches to Svelte screens. Prefer browser File System Access or Tauri filesystem adapters when the platform can read the cache directly. A backend-backed cache adapter remains optional diagnostic/parity infrastructure, not the default local path.

### World data

World/content data that is not authoritative cache-map content sits behind `WorldSource`:

```text
Map Viewer
    |
defaultWorldSource
    |
WorldSource
    |
BundledWorldSource (local/offline)
    |
future OpenRuneWorldSource
```

`client/src/world/world-source.ts` owns the semantic world-data contract used by rendering today: NPC spawns and ground-item/object spawns. `BundledWorldSource` loads the existing Studio-bundled snapshots, while `default-world-source.ts` centralizes runtime source selection so Svelte does not choose transports or data files directly.

Spawn map-filtering utilities and spawn types are owned by the world layer. The old `mapviewer/data/npc/NpcSpawn.ts` and `mapviewer/data/obj/ObjSpawn.ts` modules remain compatibility facades only. Render workers consume neutral world types/utilities directly.

Cache-derived map locs are not WorldSource data; they remain decoded from the active cache. Zones/areas are also not modeled yet because there is no active zone domain model or consumer in the current Studio. Add them to `WorldSource` only when a concrete semantic model exists rather than baking backend transport shapes into the frontend contract.

A future OpenRune world adapter should implement `WorldSource` without requiring changes to Svelte viewer code or render-worker world-data contracts. Prefer direct project-file adapters (browser filesystem where available, Tauri filesystem on desktop). Backend delivery is optional when a backend-only operation already has the project open.

### Project persistence

Project persistence is framework-neutral:

```text
ProjectLifecycle
    -> ProjectStore
       -> IndexedDbProjectStore (local/offline)

OpenRune checkout integration is separate:
    -> ProjectFileSystem
       -> browser import/download
       -> browser File System Access (when available)
       -> Tauri filesystem
```

The portable project envelope is `openrune.project` v1. It contains stable project metadata, portable base-cache/source identity, and Edit Format v1 edit data. Renderer state, dock layout, and internal Undo/Redo history are not authoritative project content.

The local cache profile id is only a binding hint. Portable identity must not depend on a browser-specific profile id because project exports need to remain meaningful on another installation.

IndexedDB is an implementation detail of `IndexedDbProjectStore`. Svelte UI must not access the project database directly. `ProjectLifecycle` now owns current-project state, create/open/save/Save As/close, dirty-state tracking, import/export, and conversion of the applied editor-history cursor into authoritative Edit Format v1 data.

Undo/Redo history beyond the current applied cursor is never project content. The Svelte map-editor workflow uses a thin `ProjectSessionController` adapter that subscribes to `ProjectLifecycle` and editor history; project rules remain outside the components.

### Project replay

Opening a saved project follows a strict replay path:

```text
Project v1
  -> Edit Format v1 validation
  -> required map-square load
  -> base-state preflight
  -> live terrain / semantic loc application
  -> runtime transaction reconstruction
  -> normal Undo/Redo history
```

`client/src/project/edit-format-v1-replay.ts` owns this framework-neutral application boundary. It rejects unsupported renderers, non-empty history, missing required maps, terrain base mismatches, and semantic object mismatches. Replayed transactions preserve their persisted ids, labels, sources, and timestamps. If replay fails, applied work is rolled back before control returns to the UI.

The Svelte launch workflow only orchestrates project selection, required-map loading, progress, and user-facing errors. It does not implement terrain/object mutation rules.

## Platform filesystem and optional backend boundary

Portable TypeScript services should depend on capability interfaces, not directly on Tauri or Ktor.

```text
Svelte UI
   |
framework-neutral domain services
   +-- CacheSource / WorldSource
   +-- ProjectStore
   +-- ProjectFileSystem
   +-- GameValRegistry
   +-- MapCodec / WritableCacheTarget
   |
platform adapters
   +-- browser storage/import/download
   +-- browser File System Access (progressive)
   +-- Tauri dialog/filesystem
   +-- optional StudioBackendClient
```

Tauri should read/write a user-selected OpenRune checkout directly through a scoped filesystem adapter. It should not start the Kotlin backend merely to open files.

`StudioBackendClient` remains transport-neutral for backend-only operations:

```text
StudioBackendClient
   |
BackendTransport
   +-- HttpBackendTransport   (explicit web pairing)
   +-- TauriBackendTransport  (lazy sidecar bridge)
```

The backend sidecar should be lazy. Normal desktop startup, cache access, map editing, GameVal/RSCM inspection, and file saving do not require it.

Backend connection failure should disable only backend-only actions such as exact OpenRune Gradle builds or JVM/FileStore verification.

### OpenRune compatibility invariant

OpenRune Server is never a required Studio extension point.

The backend may inspect compatible OpenRune checkouts, use separately available OpenRune/FileStore libraries, read source/GameVals/cache outputs, and invoke existing allowlisted Gradle tasks. It must not require Studio-specific OpenRune Server endpoints, forks, hooks, accessors, or framework patches.

If an integration capability would require changing OpenRune Server source, the capability must degrade/remain unavailable until it can be implemented externally.

### Backend launch contract

The launch contract is implemented and remains valid for lazy backend use:

- ephemeral-port startup (`port=0`);
- parent-supplied per-launch token;
- one machine-readable READY handshake;
- loopback-only CORS/OPTIONS for explicit web pairing;
- stable API/protocol/backend identity;
- retained Host/Origin/token and bounded-operation protections.

This contract no longer implies that the backend should start with the application.

## Validation

### Client

Every pull request that changes the client must pass the clean, reproducible blocking gate:

```bash
npm ci
npm run check:ui-boundaries
npm run check
npm run typecheck
npm test
npm run build
```

The architecture gate scans the full active client source tree and package manifest so JSX/TSX and React-era dependencies cannot silently re-enter the Studio.


### Backend

Backend changes use `.github/workflows/backend-validation.yml`.

The gate validates compile, Protocol tests, API/security tests, OpenRune inspection/indexing tests, Gradle/process-boundary tests, and the runnable StudioService distribution. The old monolithic `foundationGate` is no longer the canonical merge gate.

From `backend/`:

```bash
./gradlew backendCheck --no-daemon
./gradlew backendDistribution --no-daemon
./gradlew validateBackend --no-daemon
```


## Interface Editor metadata authority

The Interface Editor has an explicit data-authority model. Full details live in
`docs/INTERFACE_EDITOR_DATA_SOURCES.md`.

Current implementation through PR #72:

- cache index 3 is authoritative for decoded interface/component structure;
- client scripts, varbits, objects, and enums used by CS2 preview come from the selected cache;
- cache index 24 GameVals provide cache-matched interface/component names when available;
- the retained `OpenRuneProjectSession` supplies the portable unified GameVal registry built from base/generated DAT, module `gamevals.toml`, and RSCM;
- `InterfaceMetadataSource` merges cache labels with project symbols/provenance without replacing numeric ids or decoded component types;
- the UI keeps alternate/conflicting symbols and mismatch diagnostics visible instead of silently choosing project metadata as runtime truth;
- switching to Basic Cache clears retained OpenRune project metadata, and switching OpenRune roots replaces the active snapshot atomically;
- no Kotlin backend is required for ordinary Interface metadata.

Interface simulation follows the same local-first boundary. Ordinary preview does not require a full game server: selected-cache interface and ClientScript2 data plus an explicit mock client state harness should model varps/varbits, varcs, inventories, skills, social state, client/player flags, and widget event dispatch. Runtime-created widgets belong to simulation state and must remain distinguishable from serializable cache definitions. A declarative mock packet layer may later model button-to-state round trips without making OpenRune Server a preview dependency.

Keep this runtime framework-neutral in TypeScript first. Rust/WASM remains appropriate for measured hot paths behind stable TypeScript interfaces, but it should not become a prerequisite for Interface correctness or Basic Cache operation.

Optional backend/JVM enrichment is permitted only if it adds information the portable project index cannot provide. It belongs behind the same framework-neutral metadata seam, not directly in Svelte.

DBTable/DBRow/DBColumn decoding now comes directly from the selected `CacheSystem` in PR #71. The next Interface/cache decoder work is the remaining lossy/missing-definition audit. Do not reintroduce cache-proxy reads for data already available from the selected `CacheSystem`.

## OpenRune map/cache ownership

The detailed map/cache/RSCM design is defined in `docs/OPENRUNE_MAP_CACHE_ARCHITECTURE.md`.

Key rules:

- LIVE is the full/base generated cache;
- SERVER is reseeded from LIVE, stripped of configured client-heavy indices, then augmented with server-specific data;
- existing OpenRune TOML/GameVal/pack sources remain authoritative when present;
- modern map-group file 0 is terrain and file 1 is static locs;
- OpenRune map TOML covers NPC file 5, ground-Obj file 6, and area file 7;
- Studio `map.objects` are static locs, not OpenRune ground `obj` spawns;
- OpenRune-FileStore already provides `PackMaps` for raw terrain/loc payloads and RSPSi-style `.pack` files;
- the current OpenRune Server build does not register `PackMaps`, so Studio should use a bounded external `PackMaps + PackWorldMap` publication operation rather than patching OpenRune Server;
- terrain/static-loc codecs remain portable TypeScript so web/offline export still works;
- RSCM/GameVal DAT/TOML parsing and validation should be pure TypeScript;
- Tauri should access OpenRune source files directly through `ProjectFileSystem`;
- backend OpenRune/Gradle execution is optional, explicit, and publication-focused.


## Source-first OpenRune publication

When an OpenRune project already has an authoritative source form, Studio writes that source instead of directly patching the generated cache.

Examples:

- definitions -> pack `configs/*.toml` -> `PackConfig`;
- server metadata/shops -> `.data/raw-cache/server/**/*.toml` -> `PackServerConfig`;
- GameVals -> module `gamevals.toml` / RSCM -> OpenRune GameVal pipeline;
- NPC placement -> `.data/raw-cache/map/npcs/*.toml` -> map file 5;
- ground-item placement -> `.data/raw-cache/map/objs/*.toml` -> map file 6;
- areas -> `.data/raw-cache/map/area/*.toml` -> map file 7.

Terrain/static-loc placement is the exception because OpenRune Server does not currently expose matching TOML source. Studio keeps portable semantic state, encodes raw map payloads in TypeScript, and may publish them through OpenRune-FileStore `PackMaps + PackWorldMap`. A subsequent normal OpenRune build carries the updated LIVE map data into SERVER.

Do not make generic JS5/DAT2 writing the primary OpenRune publication path.
