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

## Editor mutation boundary

Editor behavior now follows a common flow:

```text
command / tool interaction
  -> named edit transaction
     -> typed mutations
        -> undo/redo history
        -> future Edit Format v1 / project persistence
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

The separate backend now lives under `backend/` in this monorepo. It was moved from the temporary `Neosback/rspsi` development repository in PR #34; `backend/` is the canonical source. The backend currently compiles, passes protocol/API/security/OpenRune-indexing/Gradle-process tests, and builds a runnable StudioService distribution. Packaging and startup/discovery contracts are the next integration boundary before the frontend depends on it at runtime.

The backend is expected to own capabilities such as:

- project/source inspection and backend-backed project persistence
- authoritative validation
- OpenRune FileStore/cache inspection
- source/content indexing and GameVal/RSCM resolution
- bounded Gradle/build operations
- later cache encoding, publication, and verification workflows
- OpenRune project compatibility without requiring a custom OpenRune Server fork

The frontend should continue to implement local/offline versions of its stable interfaces so the UI remains usable without the backend.

See `docs/STUDIO_BACKEND_INTEGRATION.md` for the process lifecycle, web transport, Tauri sidecar, and connection-discovery model.

### Cache access

Cache acquisition is framework-neutral and sits behind `CacheSource`:

```text
Cache Repository / map viewer / map editor
              |
     profile source resolution
              |
          CacheSource
          /         \
StaticRangeCacheSource   IndexedDbProfileCacheSource
          |
 future OpenRuneCacheSource
```

`client/src/cache/cache-source.ts` defines the shared loaded-cache contract and load options. `StaticRangeCacheSource` owns the Studio-served `/caches` source and preserves HTTP Range-capable loading through `CacheFiles`. `IndexedDbProfileCacheSource` adapts browser-imported cache files to the same contract.

Persisted `server:<cache-name>` profile ids remain supported as a compatibility binding, but the prefix is resolved by the cache-source layer rather than by IndexedDB storage. `profile-cache-store.ts` only stores imported cache bytes.

`client/src/mapviewer/Caches.ts` remains a compatibility facade for existing runtime callers; it is no longer the architectural owner of cache acquisition. A future backend-backed OpenRune cache adapter should implement `CacheSource` rather than adding transport-aware branches to Svelte screens or map/rendering code. The adapter talks to the separate Studio backend, which in turn inspects a compatible OpenRune project.

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

A future backend-backed OpenRune world adapter should implement `WorldSource` without requiring changes to Svelte viewer code or render-worker world-data contracts.

### Project persistence

Project persistence is framework-neutral:

```text
ProjectLifecycle
    -> ProjectStore
       -> IndexedDbProjectStore (local/offline)
       -> OpenRuneProjectStore (future, via Studio backend)
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

## Backend transport and desktop process boundary

Backend access must remain transport-neutral:

```text
Svelte UI
   |
framework-neutral domain services
   |
StudioBackendClient
   |
BackendTransport
   +-- HttpBackendTransport   (plain web / development)
   +-- TauriBackendTransport  (desktop)
```

The browser build cannot start a local JVM/native service by itself. Web mode therefore connects to an already-running local Studio backend through an authenticated loopback transport.

The Tauri shell may supervise a packaged backend sidecar. In desktop mode, Rust should own backend child-process lifecycle and privileged connection secrets, while the Svelte webview talks through a narrow Tauri transport/bridge. Tauri should not reimplement the Kotlin backend.

The preferred desktop lifecycle is:

```text
Tauri launch
  -> start packaged backend sidecar on an ephemeral loopback port
  -> pass a per-launch token
  -> receive a machine-readable ready handshake
  -> expose backend capabilities through TauriBackendTransport
  -> stop the child during app shutdown
```

The backend must remain optional for local/offline features. Backend connection failure should degrade backend-only capabilities rather than prevent the Studio shell from starting.

### OpenRune compatibility invariant

OpenRune Server is never a required Studio extension point.

The backend may inspect compatible OpenRune checkouts, use separately available OpenRune/FileStore libraries, read source/GameVals/cache outputs, and invoke existing allowlisted Gradle tasks. It must not require Studio-specific OpenRune Server endpoints, forks, hooks, accessors, or framework patches.

If an integration capability would require changing OpenRune Server source, the capability must degrade/remain unavailable until it can be implemented externally.

### Current backend launch gap

The current backend is healthy but not yet packaged as a frontend runtime dependency.

Before `StudioBackendClient` integration:

- support ephemeral-port startup (`port=0`);
- allow Tauri/parent process to supply the per-launch token;
- emit one machine-readable ready handshake instead of requiring human-log parsing;
- add proper loopback-only CORS/OPTIONS behavior for plain-web authenticated requests;
- expose stable API/protocol/backend identity through status;
- retain current Host/Origin/token and bounded-operation protections.

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
