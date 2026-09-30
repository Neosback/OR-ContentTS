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
