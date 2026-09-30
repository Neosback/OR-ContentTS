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

### Target backend

The target backend is **OpenRune Server** (`Neosback/OpenRune-Server`), using its FileStore/domain and map/content layers for cache and project operations.

The legacy TypeScript game server has been removed from this repository. Local cache bootstrap is owned by the Studio itself, and bundled spawn data keeps the current viewer/editor independent of a game server. Do not recreate a second backend in this repository.

The OpenRune backend will eventually own:

- project persistence and project lifecycle operations
- authoritative validation
- cache encoding and publishing
- world/content sources
- OpenRune project/build integration
- serving versioned cache data with Range support
- accepting versioned Studio edit batches such as Edit Format v1

The frontend should continue to implement local/offline versions of these interfaces first so the UI remains usable without a running OpenRune server.

### Project persistence

Project persistence is framework-neutral:

```text
project lifecycle service
    -> ProjectStore
       -> IndexedDbProjectStore (local/offline)
       -> OpenRuneProjectStore (future)
```

The portable project envelope is `openrune.project` v1. It contains stable project metadata, portable base-cache/source identity, and Edit Format v1 edit data. Renderer state, dock layout, and internal Undo/Redo history are not authoritative project content.

The local cache profile id is only a binding hint. Portable identity must not depend on a browser-specific profile id because project exports need to remain meaningful on another installation.

IndexedDB is an implementation detail of `IndexedDbProjectStore`. Svelte UI must not access the project database directly. The next application layer is the project lifecycle service that will own open/save/close/dirty-state behavior.

## Validation

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
