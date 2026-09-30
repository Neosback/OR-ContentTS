# Project edit contracts

This directory contains framework-neutral project/persistence contracts used by the Studio and the future OpenRune backend.

## Edit Format v1

- `edit-format-v1.schema.json` is the authoritative machine-readable JSON shape.
- `edit-format-v1.ts` normalizes editor transactions into that shape and provides strict validation/encoding/decoding.
- `fixtures/edit-format-v1.golden.json` is the canonical parity fixture for TypeScript/Kotlin decoder tests.

### Coordinate rules

- Map coordinates are explicit `mapX` / `mapY`; packed map ids never cross the persistence boundary.
- Tile mutations use explicit `localX` / `localY` in the 0–63 map-square range.
- Object snapshots use semantic loc placements: `id`, `flags`, `worldX`, and `worldY`.
- Renderer scene-border coordinates, entity instances, model state, and cache-encoded bytes are runtime details and are not persisted.

### Versioning rules

v1 documents use:

- `format: "openrune.edit-batch"`
- `version: 1`

The v1 decoder is strict: unknown fields, unsupported versions, malformed mutations, and inconsistent derived metadata are rejected. Future mutation families that change the contract should advance the schema version and retain explicit migration/compatibility logic.


## Project Format v1

Project persistence uses a separate portable envelope around Edit Format v1:

- `project-format-v1.schema.json` defines the strict `openrune.project` v1 document.
- `project-format-v1.ts` validates and encodes/decodes portable project JSON.
- `project-store.ts` defines the framework-neutral storage interface.
- `indexeddb-project-store.ts` is the browser-local implementation.
- `fixtures/project-v1.golden.json` is the canonical portable project fixture.

The authoritative project payload contains stable project metadata, portable cache/source identity, and Edit Format v1 data. It does not contain renderer state, dock layout, map-editor history objects, or other UI/runtime state.

A local cache `profileId` may be retained as a binding hint, but it is not sufficient source identity by itself because exported projects must remain meaningful on another installation. Game/revision and an optional stronger fingerprint travel with the project.

Imports are strictly validated before persistence. Importing a project whose stable id already exists fails with a conflict instead of silently overwriting the existing project.

## Local ProjectStore

`IndexedDbProjectStore` currently provides offline:

- create/list/load/save/delete
- portable JSON export/import
- per-record validation during listing
- typed errors for missing, conflicting, invalid, or unavailable storage

Svelte components must not access this IndexedDB database directly. The next layer is the project lifecycle service, which will own open/save/close/dirty-state behavior and feed authoritative project content through `ProjectStore`.
