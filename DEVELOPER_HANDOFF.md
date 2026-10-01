# OpenRune Content Studio Developer Handoff

**Repository:** `Neosback/OR-ContentTS`  
**Current baseline:** Svelte frontend seams + in-repo Kotlin Studio backend + split backend CI; OpenRune Server remains external/reference-only

This document is the current engineering handoff for developers continuing OpenRune Content Studio.

### Current repository status

As of PR #34:

- `backend/` is the canonical Studio backend source.
- The temporary `Neosback/rspsi` repository is migration history only.
- Backend compilation, protocol tests, API/security tests, OpenRune inspection/indexing tests, Gradle/process tests, and runnable distribution packaging are all green in CI.
- The inherited monolithic `foundationGate` has been replaced by explicit, diagnosable backend validation stages.
- There are no required Content Studio changes in `Neosback/OpenRune-Server`.
- OpenRune Server must remain an external compatibility/reference target. If a Studio feature would require patching OpenRune Server framework code, that feature must degrade/remain unavailable until it can be implemented externally.
- Backend runtime integration with the frontend is not wired yet. The next backend slice is the launch/connection contract, then transport clients, then domain adapters.


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
    |
ProjectStore / CacheSource / WorldSource / future services
    |
StudioBackendClient
    |
BackendTransport
    |
separate Studio Backend Service
    |
user's compatible OpenRune project
```

Local implementations remain first-class so the Studio stays useful without the backend running. Backend-backed implementations should replace only the relevant service adapters, not rewrite the UI.

For the detailed web/Tauri process model, read `docs/STUDIO_BACKEND_INTEGRATION.md`.

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
                      -> separate Studio backend
                         -> compatible OpenRune project
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

The **backend is the encoder**.

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

A future backend-backed OpenRune adapter should implement the same `CacheSource` contract without changing the map/editor UI. The adapter talks to the separate Studio backend, not directly to a custom OpenRune Server endpoint.

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

The future backend-backed OpenRune adapter should satisfy `WorldSource` without changing Svelte viewer code or render-worker initialization.

### D. Separate Studio backend integration

The backend move is complete and validated.

Current backend source:

- `backend/Protocol`
- `backend/StudioService`
- `backend/docs`
- `backend/gradlew`

Current backend capabilities:

- Ktor loopback HTTP service
- per-session token authentication
- Host/Origin checks
- opaque opened-project sessions
- passive OpenRune project inspection
- OpenRune FileStore LIVE/SERVER cache inspection
- GameVal/RSCM-aware content indexing
- Kotlin source indexing
- bounded Gradle task discovery
- allowlisted asynchronous Gradle operations with status, logs, cancellation, and SSE
- no arbitrary shell-execution API

Current integration findings:

- opening an OpenRune project is passive;
- current source/content/cache inspection paths are read-only;
- the only checkout-modifying behavior today is explicitly requested existing Gradle tasks, which may generate normal build outputs;
- plain-web integration still needs proper CORS/preflight support for authenticated cross-origin localhost requests;
- packaged Tauri should supervise the backend rather than reimplement it;
- the current fixed/default launch assumptions should become an ephemeral-port, parent-supplied-token, machine-readable ready handshake.

Next backend sequence:

1. **Launch/connection contract:** support port `0`, parent-supplied token, stable protocol/backend identity, and one machine-readable ready message.
2. **Web security/transport:** proper loopback-only CORS + OPTIONS/preflight behavior.
3. **StudioBackendClient:** framework-neutral client + transport contract.
4. **HttpBackendTransport:** browser/development connection to an already-running backend.
5. **Tauri supervision:** Rust starts/stops the packaged backend, retains privileged token/process state, and exposes `TauriBackendTransport`.
6. **Domain adapters:** backend-backed `ProjectStore`, `CacheSource`, and `WorldSource`.
7. **Write/build/publish:** only after source authority, Edit Format validation, and output verification are explicit.

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

Tauri should supervise a packaged backend sidecar and keep privileged process/token state in Rust when practical. The Svelte app should use a `TauriBackendTransport`, not spawn processes itself.

Plain web mode cannot self-start a local JVM/native backend. Web uses `HttpBackendTransport` to connect to an already-running authenticated loopback backend or a future installed local helper.

Do not duplicate backend business logic in Rust. Tauri is the lifecycle/transport bridge.

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
4. `docs/STUDIO_BACKEND_INTEGRATION.md`
5. `backend/README.md`
6. `backend/docs/API.md`
7. `client/src/project/README.md`
8. `client/src/project/edit-format-v1.ts`
9. `client/src/project/edit-format-v1.schema.json`
10. `client/src/mapeditor/editor-transaction.ts`
11. `client/src/mapeditor/commands/editor-command-registry.ts`

The project lifecycle/replay, CacheSource, and WorldSource frontend seams are complete.

The backend is now moved, canonical, and fully validated under `backend/`.

The **immediate backend integration PR** should implement the launch/connection contract:

- bind to an ephemeral port when requested (`port=0`);
- accept a parent-supplied per-launch token;
- emit one machine-readable ready handshake containing protocol version, endpoint/port, process/backend instance identity, and capabilities as appropriate;
- never echo the supplied token in the ready payload;
- add proper loopback-only browser CORS/preflight handling;
- expose stable backend/API protocol identity through status;
- retain Host/Origin/token protections;
- remove/reframe inherited research that suggests required OpenRune Server source/runtime changes.

After that, implement `StudioBackendClient` and transports before any backend-backed domain adapters.

Frontend/editor work such as seamless multi-region editing can continue independently in separate PRs after the launch contract is stable.

Keep all local implementations available so the Studio remains usable without the backend or OpenRune Server running.

The key architectural requirement is simple:

> Content Studio owns the UI and stable frontend service interfaces. The separate Studio backend owns local native/JVM capabilities. OpenRune Server is a compatibility/reference target, not the backend we modify.
