# Project edit contracts

This directory contains framework-neutral project/persistence contracts used by the Studio. They are portable TypeScript contracts; optional backend workflows may consume them but do not own them.

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

## ProjectFileSystem

`project-filesystem.ts` defines the framework-neutral capability boundary for a user-selected project checkout. It is separate from `ProjectStore`: `ProjectStore` persists Studio project/edit documents, while `ProjectFileSystem` reads and writes files inside an external project tree such as an OpenRune checkout.

Path rules are intentionally strict:

- every path is relative to the selected project root;
- the root is represented as `""`;
- separators normalize to `/`;
- `..` traversal is rejected instead of resolved;
- absolute, drive/protocol, UNC/network, NUL-bearing, and colon-bearing paths are rejected;
- platform adapters must preserve root confinement even when their backing filesystem contains symlinks.

The initial contract supports list/stat/exists, text and byte reads, and text and byte writes. `walkProjectDirectory()` provides shared deterministic recursive traversal above `list()`, so adapters do not invent different walking semantics.

`in-memory-project-filesystem.ts` is the deterministic test/development implementation. It is the intended first dependency for portable OpenRune project-index tests. Tauri and browser File System Access adapters should implement the same interface rather than leaking platform APIs into Svelte or source parsers.


### Tauri adapter

`tauri-project-filesystem.ts` implements the same contract for a user-selected native directory. The native picker is opened with recursive project access, and all later operations remain project-relative through `ProjectFileSystem`.

The adapter deliberately grants only the fs write commands it needs in the Tauri capability. Runtime path scope still comes from the directory the user explicitly selected; write command permission alone does not grant access to arbitrary filesystem paths.

Symlink access remains subject to Tauri's filesystem scope checks. The adapter does not turn symlinks into a way to bypass the selected project root.


### Browser File System Access adapter

`browser-project-filesystem.ts` implements `ProjectFileSystem` on top of a user-selected browser directory handle when `showDirectoryPicker()` is available.

The browser picker is opened in `readwrite` mode from an explicit user action. All later file operations remain project-relative beneath that granted root handle, so Svelte and OpenRune source parsers do not depend directly on browser filesystem APIs.

Browser support is optional. `getBrowserProjectAccessMode()` reports either:

- `filesystem` when direct directory access is available;
- `import-download` when it is not.

The `import-download` mode is the compatibility path: existing Studio import/export workflows remain available rather than making direct filesystem access a browser requirement. OpenRune source tooling should check the access mode and only offer in-place project mutation when a writable `ProjectFileSystem` has actually been selected.

Picker cancellation is not an error. Permission/security failures are surfaced as typed `ProjectFileSystemError` values, and binary reads/writes use defensive copies so callers cannot mutate backing file data accidentally.


## OpenRune project index

`openrune-project-index.ts` provides the portable, read-only discovery layer above `ProjectFileSystem`. It indexes paths and provenance only; RSCM, GameVal DAT, and `gamevals.toml` semantics live in separate parser/index layers.

The index discovers:

- OpenRune/Gradle project markers;
- `game.yml` with `game.example.yml` fallback and top-level name/revision/environment/world metadata;
- Gradle modules discovered structurally from build files;
- dedicated content `pack` modules;
- `src/main/resources/pack` roots and known pack subdirectories;
- module/project `gamevals.toml` files;
- `.data/gamevals/*.rscm`;
- `.data/gamevals-binary/*`;
- NPC, ground-Obj, and area raw map TOML roots/files;
- raw server TOML sources;
- generated LIVE and SERVER cache locations.

Generated cache contents are deliberately not traversed. LIVE and SERVER are indexed as generated-output locations, not treated as authoring source.

Module discovery follows the checkout structure rather than a hard-coded plugin list, which matches OpenRune's recursive Gradle subproject convention. Source provenance is retained by path and module association so later GameVal/RSCM/TOML parsers can layer semantic indexes on top without flattening ownership.


## RSCM parser and index

`rscm-index.ts` provides the pure TypeScript semantic layer for RuneScape Config Mapping files discovered by the OpenRune project index.

RSCM rules used by the Studio:

- the `.rscm` filename is the namespace, so `item.rscm` defines `item.*` symbols;
- mappings are line-oriented `key=value`;
- grouped keys containing `:` are preserved as part of the key;
- blank lines and full-line `#`, `//`, and `;` comments are ignored;
- ids must be `-1` or non-negative safe integers;
- `-1` represents an unassigned mapping and is excluded from duplicate-id conflict checks.

The parser retains source path and line number for every mapping. The aggregate index provides symbol and namespace/id lookups while reporting duplicate symbols, conflicting symbol assignments, and namespace-local id collisions as structured issues instead of silently selecting a declaration.

This layer is read-only. RSCM assignment/writes remain OpenRune-owned workflow behavior, and the future unified GameVal registry should merge this provenance with module `gamevals.toml` and generated/base DAT mappings under explicit precedence and validation rules.


## GameVal DAT parser and baseline validation

`gameval-dat-index.ts` decodes OpenRune's binary `GameValDat` format directly in TypeScript. The format is big-endian and consists of an int32 table count, UTF-8 table names prefixed by uint16 byte lengths, int32 entry counts, and UTF-8 `key=id` entry strings prefixed by uint16 lengths.

The parser mirrors OpenRune's current source behavior:

- `gamevals.dat` is the base/cache mapping source and defines the maximum reserved OSRS id per table;
- `gamevals_generated.dat` contributes generated mappings such as components/db columns but does not raise the base id ceiling;
- grouped keys containing `:` are preserved verbatim;
- `-1` is retained as an unassigned value;
- malformed/truncated/invalid UTF-8 data is reported as structured diagnostics rather than producing partial silent corruption;
- count fields are bounded against remaining bytes before iteration so malformed files cannot force enormous attacker-controlled loops.

The aggregate DAT index retains base/generated provenance and provides symbol plus table/id lookups. It also reports duplicate/conflicting DAT mappings.

`validateCustomGameVals()` applies the OpenRune reservation rule to project-owned mappings: assigned custom ids must be strictly greater than the maximum id present in the base `gamevals.dat` table. Generated DAT mappings participate in symbol/id collision checks but not in base-range reservation. Unassigned `-1` declarations remain valid for OpenRune's normal assignment workflow.


## Module gamevals.toml parser and index

`gameval-toml-index.ts` parses the exact `[gamevals.<table>]` subset consumed by OpenRune's current `GameValProvider`.

The Studio recognizes the same table names exposed by OpenRune's `RSCMType`, preserves grouped keys such as `interface:component`, accepts `-1` as an unassigned declaration, and retains source path, line number, and owning Gradle module when the project index can resolve one.

The parser intentionally follows OpenRune loader behavior instead of pretending to be a general TOML parser:

- only exact `[gamevals.<table>]` sections participate;
- unrelated TOML sections are ignored;
- full-line `#` comments are ignored;
- the right-hand side must be an integer as written, so an inline comment after the number is not silently stripped;
- unsupported GameVal namespaces are surfaced as diagnostics;
- malformed entries and invalid ids do not erase other valid declarations in the file.

The aggregate index provides deterministic symbol and table/id lookups and reports duplicate declarations, conflicting symbol assignments, and table-local id collisions with source provenance.

Project discovery also skips generated `build/`, `out/`, and `target/` trees so compiled/copied `gamevals.toml` files are not indexed as additional authoring sources. This matches OpenRune's generated-output exclusion.

This remains a read-only semantic layer. Cross-source precedence between base DAT, generated DAT, module TOML, and RSCM belongs in the unified GameVal registry rather than being hidden inside the individual parsers.

## Unified GameVal registry

`gameval-registry.ts` is the portable project-level lookup layer above the three source indexes. It follows OpenRune's current load phases: base `gamevals.dat`, generated DAT, module `gamevals.toml` under content/API sources, then RSCM.

The registry deliberately separates **all declarations** from the **effective mapping**:

- base DAT establishes the reserved upstream-id ceiling;
- generated DAT fills mappings without raising that ceiling;
- module TOML and RSCM can become the effective source for an identical custom mapping;
- an assigned mapping cannot be silently overridden by a later conflicting source;
- custom ids at or below the base DAT ceiling are diagnosed and not applied;
- table-local id reuse by another symbol is diagnosed;
- `-1` remains an unassigned declaration and cannot mask an already-assigned DAT mapping;
- parser/index diagnostics remain available separately from cross-source registry conflicts.

Every effective entry retains the declarations that contributed to that symbol, including source path, line/module provenance where available, and DAT table/entry positions. Consumers such as Interface metadata, definitions tooling, and source-aware TOML adapters should use this registry instead of independently picking one GameVal source.

`indexProjectGameValRegistry()` builds the DAT, TOML, and RSCM indexes through one project-level API while keeping the underlying indexes available for detailed diagnostics.

## OpenRune PackConfig TOML adapter

`openrune-config-toml.ts` is the framework-neutral source adapter for client/config definitions owned by OpenRune pack modules under `src/main/resources/pack/configs`.

It mirrors the current OpenRune-FileStore `PackConfig` block names, recursively discovers TOML under each indexed pack root, and records block type, source path, module/pack provenance, source line range, top-level scalar fields, `isServerOnly`, and both raw and resolved `id`/`inherit` identities. Quoted GameVal identities resolve through the unified `GameValRegistry`; numeric ids remain usable directly.

The adapter deliberately does **not** normalize or regenerate arbitrary TOML. Nested subtables such as `[item.params]`, inline tables, comments, and unknown definition fields remain in the authoritative source text. This avoids a lossy Studio-side TOML rewrite and keeps OpenRune's mapper as the semantic authority.

`updateOpenRuneConfigField()` supports guarded top-level scalar updates, insertions, and removals. Before writing, it re-reads the source and requires the indexed block text to still match. If another editor/process changed the block, the operation fails with `STALE_SOURCE` and requires a re-index instead of overwriting external changes. Nested field paths are rejected so future item/NPC/object-specific editors must add explicit source adapters for those structures.

The aggregate index also reports duplicate resolved cache targets, including the `graphic`/`graphics` alias pair, so source conflicts can be surfaced before an OpenRune build.

## OpenRune raw map-source TOML adapters

`openrune-map-source-toml.ts` is the portable source layer for the authoring formats OpenRune already owns under `.data/raw-cache/map`:

- `npcs/*.toml` → NPC spawn source, packed into modern map file 5;
- `objs/*.toml` → ground-item/Obj spawn source, packed into file 6;
- `area/*.toml` → Area membership/polygon source, packed into file 7.

This layer deliberately does not represent terrain or static loc placements. Studio map-editor `map.objects` remain static locs for map file 1, not OpenRune ground Objs.

NPC and Obj adapters mirror OpenRune's `[[spawn]]` records. Their `level_mapX_mapZ_localX_localZ` CoordGrid strings are validated and decomposed into level, map-square, local, and world coordinates. NPC/Obj GameVal symbols resolve through `GameValRegistry`, resolved ids are checked against the 16-bit packed map-source limit, Obj `count` follows OpenRune's default of 1, and aggregate indexes expose spawns by map-square id.

The Area adapter mirrors `[[area]]` and nested `[[area.polygons]]` sources. It retains area name/id, levels, include/exclude relationships, polygon vertices, resolved GameVal ids, and source provenance. Invalid levels/references/polygons and duplicate area identities are surfaced as structured diagnostics.

Canonical serializers are available for new/generated NPC, Obj, and Area source files. Whole-file replacement uses optimistic concurrency through `replaceOpenRuneMapSourceFile()`: an existing source is only replaced when its current text still matches the indexed text, preventing Studio from silently overwriting an external edit.

One OpenRune behavior is intentionally reflected in project discovery: current `MapNpcPacker`, `MapObjPacker`, and `MapAreaPacker` use non-recursive `Files.list()`. Therefore only direct `.toml` children of each raw map source directory are indexed as active authoring sources; nested TOML files are not treated as pack inputs.

## OpenRune server TOML adapter

`openrune-server-toml.ts` is the portable source layer for OpenRune's SERVER-side config inputs. It mirrors the table families currently registered by `PackServerConfig`, including `object`, `npc`, `item`, `varp`, `health`, `anims`, `mesanim`, `walktrigger`, `varn`, `varnbit`, `varcon`, `varobj`, `varconbit`, `hunt`, `stat`, `projectile`, `bas`, and `inventory`.

The project-level index follows the same two input families that OpenRune's server packer consumes:

- recursive `.data/raw-cache/server/**/*.toml` sources;
- pack-owned `src/main/resources/pack/configs/**/*.toml` overlays.

Each supported root definition retains source kind, path, module/pack provenance, top-level scalar fields, nested section text, `id`/`inherit`, resolved GameVal identities, `isServerOnly`, and the untouched raw block. Unknown server/slayer root tables remain outside the generic PackServerConfig model rather than being misclassified.

The aggregate index exposes lookups by server table, symbol, and resolved table/id target. Duplicate resolved targets are reported as diagnostics. Studio intentionally does not invent a winner because `PackServerConfig` reads all matching TOML inputs and later `associateBy(id)` behavior should not become an undocumented Studio precedence rule.

Inventory definitions additionally expose `[[inventory.stock]]` records with Obj GameVal resolution, count/restock-cycle validation against the cache codec's unsigned-short payload width, and the one-byte 255-entry stock-list ceiling. `serializeOpenRuneInventoryToml()` provides canonical inventory/shop generation for new sources.

`updateOpenRuneServerField()` performs guarded top-level scalar edits while preserving nested tables such as `[npc.params]`, `[[npc.waypoints]]`, and `[[inventory.stock]]`. `replaceOpenRuneServerSourceFile()` provides optimistic-concurrency whole-file replacement for structured editors. These source operations remain local `ProjectFileSystem` work; OpenRune remains responsible for packing SERVER.

## Local ProjectStore

`IndexedDbProjectStore` currently provides offline:

- create/list/load/save/delete
- portable JSON export/import
- per-record validation during listing
- typed errors for missing, conflicting, invalid, or unavailable storage

Svelte components must not access this IndexedDB database directly. `ProjectLifecycle` owns open/save/close/dirty-state behavior and feeds authoritative project content through `ProjectStore`. The map-editor UI consumes it through the thin `ProjectSessionController` adapter.


### Validation baseline

The ProjectStore slice is covered by the normal client gate. The current green baseline includes 11 Vitest files / 42 tests, including real IndexedDB API behavior through `fake-indexeddb`. Run `npm run validate` from `client/` before merging project-contract changes.


## ProjectLifecycle

`project-lifecycle.ts` is the application-level project service above `ProjectStore`.

It owns:

- current open project state
- working Edit Format v1 data
- dirty-state tracking
- create/open/save/Save As/close
- import/export orchestration
- project renaming
- safe dirty-project transition guards

The lifecycle deliberately persists only the **applied** portion of map-editor history. If the history contains A, B, C and C is currently undone, `syncFromHistory()` serializes A + B. Redo entries remain editor history and are not authoritative project content.

Export includes current unsaved working edits without implicitly saving them to `ProjectStore`. Closing, creating, importing, or switching away from a dirty project requires an explicit discard decision.

The lifecycle remains framework-neutral. Svelte should consume it through a thin reactive adapter rather than implementing project rules in components.


## Edit replay and Svelte integration

`edit-format-v1-replay.ts` applies persisted Edit Format v1 data back into a live map editor without making Svelte responsible for mutation semantics.

The replay contract is intentionally strict:

- the editor history must be clean before replay
- every affected map square must be loaded first
- sparse terrain `before` snapshots must match the active base cache
- semantic loc/object `before` state must match before replacement
- object placements are rebuilt through the real scene builder
- replayed transactions are reconstructed into the existing Undo/Redo history with stable metadata
- failures roll back the current transaction and any earlier replayed project transactions

`ui/mapeditor/project-session.svelte.ts` is the reactive UI adapter. It binds editor-history changes back into `ProjectLifecycle`, provides local project list/create/open/save/Save As/import/export operations, enforces cache game/revision compatibility, and resets the live editor back to its base scene when switching or closing projects.

The setup screen owns New/Open/Import orchestration and required-map loading. The editor title bar owns Save/Save As/Export/Close. Dirty project transitions and browser exit are guarded explicitly.


## OpenRune source application

Studio project/Edit Format state is authoritative for local editing, undo/redo, offline work, and unapplied changes.

When a user applies changes into an OpenRune project:

- use `ProjectFileSystem` to update an authoritative OpenRune source file when one exists;
- do not replace pack/config/server/map TOML with a parallel Studio-only authoring database;
- preserve GameVal/source provenance;
- treat LIVE/SERVER caches as generated outputs.

Terrain/static-loc placement has no current OpenRune TOML source. Those mutations remain represented by Studio semantic state and can be encoded into raw map payloads for portable export or explicit OpenRune-FileStore publication.
