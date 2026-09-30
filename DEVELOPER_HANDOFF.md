# OpenRune Content Studio Developer Handoff

**Repository:** `Neosback/OR-ContentTS`  
**Current baseline:** `main` after PR #23  
**Baseline commit:** `80dc0078088f6cbd05b392e0ad36c403989cb04f`

This document is the current engineering handoff for developers continuing OpenRune Content Studio.

## 1. Critical direction

### The target backend is OpenRune

New Studio backend work must target the **OpenRune server** and its FileStore/domain model.

The repository's current `server/` directory is **legacy/reference infrastructure**. It is not the architecture to extend.

Today it is still useful for two temporary compatibility paths:

- bootstrapping/downloading the cache through `server/scripts/ensure-cache.ts`
- optional legacy `/api/world` spawn/zone data

Do not add new project APIs, Studio persistence, cache encoding, publishing, validation, or build workflows to that legacy server.

The intended direction is:

```text
Svelte Studio UI
    |
framework-neutral TypeScript
    |
local/offline service interfaces
    |
OpenRune Studio backend
    |
OpenRune FileStore + domain/content model
```

Local implementations come first so the Studio remains useful without a running OpenRune server. OpenRune implementations replace those local services later without rewriting the UI.

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
                      -> OpenRune backend
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
- Kotlin/OpenRune backend tests

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

Do not reintroduce systems replaced by these PRs.

## 6. Current validation baseline

At PR #23 the complete client gate was green:

- clean `npm ci`
- Svelte-only client architecture boundary: **524 files scanned**
- Svelte check: **0 errors**
- TypeScript: pass
- Vitest: **8 files / 30 tests**
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

## 7. Recommended next work

### Next PR: local project persistence

The highest-leverage next step is a **ProjectStore abstraction plus local IndexedDB implementation**, built on Edit Format v1.

Do not wire the UI directly to IndexedDB.

Define a framework-neutral interface first, then implement IndexedDB behind it.

Suggested shape:

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
10. The storage implementation is replaceable by an OpenRune-backed implementation later.

Use an IndexedDB test implementation or a focused test dependency if browser IndexedDB is not available in the existing Vitest environment. Do not weaken tests just to avoid a small dev-only dependency.

## 8. Recommended sequence after ProjectStore

After local project persistence, continue in roughly this order:

### A. Project lifecycle API

Formalize application-level operations such as:

- open project
- save project
- close project
- import/export
- validate
- publish
- build OpenRune project

Local implementations should handle operations that can work offline. Publish/build can remain unavailable until the OpenRune backend implementation exists.

The UI should consume this project service rather than IndexedDB directly.

### B. CacheSource

Formalize cache access behind a source interface.

Current static/range-backed cache loading should become the local implementation.

The future OpenRune implementation should be able to serve versioned cache data with Range support without changing map/editor UI code.

### C. WorldSource

Remove world/spawn/zone data from the legacy `/api/world` assumption.

Define a source for:

- NPC spawns
- object/world definitions not coming directly from cache
- zones/areas
- future project-owned world content

Provide a local implementation first, then an OpenRune implementation.

### D. OpenRune Studio backend

Only after the frontend seams are stable:

- implement project APIs on OpenRune
- consume/validate Edit Format batches
- integrate the OpenRune FileStore/domain model
- encode/save project changes
- publish caches
- build OpenRune projects
- run the shared golden fixtures in Kotlin

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

## 10. Legacy server rules

The current `server/` directory is not the long-term Studio backend.

Allowed temporary uses:

- cache bootstrap
- existing compatibility paths while replacements are implemented
- reference when understanding old behavior

Do not:

- add new Studio project persistence there
- add new authoritative validation there
- define the new project protocol around its current endpoints
- send pre-encoded map/cache bytes from the frontend to match it
- couple new panels directly to its socket/API model

If a new feature appears to require the legacy server, first ask whether it should instead be a `ProjectStore`, `CacheSource`, `WorldSource`, or OpenRune service interface.

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

1. `ARCHITECTURE.md`
2. `ROADMAP.md`
3. `client/src/project/README.md`
4. `client/src/project/edit-format-v1.ts`
5. `client/src/project/edit-format-v1.schema.json`
6. `client/src/mapeditor/editor-transaction.ts`
7. `client/src/mapeditor/commands/editor-command-registry.ts`

Then implement the **ProjectStore + IndexedDB persistence** slice.

The key architectural requirement is simple:

> OpenRune is the target backend. Local browser services are temporary implementations of stable interfaces. The legacy TypeScript server is not the architecture to extend.
