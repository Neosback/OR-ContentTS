# OpenRune map/cache integration: TypeScript-first architecture

## Status and intent

This document defines how OpenRune Content Studio should integrate with an OpenRune Server checkout for map editing, cache work, GameVals/RSCM, and build/publish workflows.

The design priority is:

> If the Studio can perform a capability safely and correctly in TypeScript, it should not require the Kotlin backend.

The Studio backend is optional infrastructure for capabilities that genuinely benefit from or require the JVM/OpenRune execution environment. It must not become a mandatory middle layer between the UI and ordinary cache/project operations.

Research in this document was checked against OpenRune Server `main` at commit:

```text
625fe96abf802bc932d18e66832ed6ce90b60a0a
```

and Content Studio `main` immediately before this document at:

```text
fe928d9adc5026c6e8c2668da8c43619e3bcbde1
```

OpenRune Server remains an external compatibility/reference target. Content Studio must require zero Studio-specific changes to OpenRune Server.

---

## 1. Architectural rule: TypeScript owns portable behavior

Portable domain logic should live in framework-neutral TypeScript whenever practical.

That includes:

- cache decoding;
- map decoding;
- map editing;
- semantic edit transactions;
- project persistence contracts;
- terrain/loc encoding;
- GameVal/RSCM parsing;
- OpenRune map TOML parsing/generation;
- validation that does not require JVM execution;
- region/package export;
- cache-patch generation;
- project metadata/indexing that can be derived from files;
- filesystem-independent source/update planning.

Platform layers should provide capabilities, not reimplement domain rules.

```text
Svelte UI
   |
framework-neutral TypeScript domain services
   |
   +-- storage/filesystem adapters
   |     +-- browser IndexedDB / downloads
   |     +-- browser File System Access when available
   |     +-- Tauri dialog + filesystem
   |
   +-- optional native execution adapter
         +-- Studio backend only for JVM/OpenRune operations that need it
```

The default application must remain useful when the backend is absent.

---

## 2. Three execution environments

Content Studio has three meaningful runtime modes.

### 2.1 Plain web, universal baseline

This is the lowest common denominator and must not assume direct arbitrary filesystem access.

Available today or with normal browser APIs:

- static/range-backed caches;
- cache-folder import through file selection;
- IndexedDB-backed cache profiles;
- local project persistence;
- map decode/render/edit;
- interface decode/render/edit;
- GameVals from the loaded cache;
- pure TypeScript RSCM parsing;
- generated JSON/text/binary downloads;
- ZIP/region/package export;
- importing previously exported Studio/OpenRune files.

This mode should work without:

- Tauri;
- Kotlin backend;
- OpenRune Server process;
- Java;
- Gradle.

### 2.2 Plain web with File System Access API

Supporting browsers can grant a web app direct access to a user-selected directory.

This is a progressive enhancement, not the universal web contract.

A capable browser can potentially:

- select an OpenRune project directory;
- recursively inspect files after permission is granted;
- read RSCM/TOML/raw map source files;
- write updated source files;
- write exported cache/region files.

Important limitations:

- browser support is not universal;
- permission requires explicit user interaction;
- permissions can be revoked;
- secure context requirements apply;
- the product must retain import/download fallbacks.

Therefore do not make `showDirectoryPicker()` the only way to use OpenRune project integration on the web.

### 2.3 Tauri desktop

Tauri should provide the best local project experience without requiring the Kotlin backend for normal filesystem work.

The repository already includes:

- `@tauri-apps/plugin-dialog`;
- `@tauri-apps/plugin-fs`;
- the matching Rust plugins.

The intended Tauri responsibilities are:

- native directory/file selection;
- scoped recursive project reads;
- scoped project writes;
- atomic file replacement helpers;
- optional file watching;
- application lifecycle;
- optional lazy launch of the Studio backend when a backend-only action is requested.

Tauri filesystem permissions/scopes must be configured explicitly. A native picker can add user-selected paths to allowed scopes, but the Studio should still expose a narrow project-filesystem abstraction rather than letting arbitrary Svelte components read paths directly.

The Kotlin backend should **not** be required merely to read or write an OpenRune checkout from Tauri.

---

## 3. OpenRune cache build model

OpenRune's `or-cache` module exposes these relevant Gradle tasks:

```text
:or-cache:buildCache
:or-cache:freshCache
:or-cache:mergePluginGamevals
```

### `buildCache`

OpenRune's current build flow:

1. loads GameVal sources;
2. discovers pack modules;
3. validates plugin packs;
4. builds cache pack tasks;
5. builds the LIVE cache;
6. builds the SERVER cache;
7. performs generated GameVal/codegen work.

The important point for Studio architecture is that this is a **whole OpenRune build pipeline**, not a minimal map encoder API.

Content Studio should not need to invoke `buildCache` to perform ordinary local map edits or exports.

It is useful for:

- exact OpenRune output generation;
- integration verification;
- build parity;
- final project build/publish workflows.

### `freshCache`

The fresh-install flow initializes the OpenRune cache, clears incremental state, and dumps base GameVals.

This is project/bootstrap behavior. It is not required for normal Studio cache importing or offline editing.

### `mergePluginGamevals`

This task scans content plugin `gamevals.toml` files and appends missing entries into `.data/gamevals/<namespace>.rscm`.

The behavior is simple enough to reproduce in TypeScript:

- scan source TOML;
- validate namespace;
- read existing RSCM keys;
- append missing `key=id` entries;
- retain existing mappings.

Therefore the Studio does not need the backend merely to understand, preview, validate, or generate this merge.

The backend/Gradle task remains useful as an optional parity check against upstream OpenRune behavior.

---

## 4. OpenRune cache directories

OpenRune currently uses:

```text
.data/cache/LIVE
.data/cache/SERVER
```

### LIVE

The LIVE cache is the client-facing/full cache used by normal cache tooling.

### SERVER

The SERVER cache is a server-oriented cache. OpenRune excludes several client-only pack tasks and adds server-specific packers.

OpenRune's current server build adds:

- server config packing;
- map NPC packing;
- map ground-item packing;
- map area packing.

Generated caches are outputs. They should not automatically become the authoritative Studio project format.

The Studio's semantic project/edit data remains authoritative for Studio work until an explicit apply/build/export action is requested.

---

## 5. OpenRune map-group layout

For modern OpenRune map groups, `GameMapDecoder` reads a map-square group with:

| File | Meaning |
| --- | --- |
| 0 | terrain/map tile data |
| 1 | static loc/object placement data |
| 5 | NPC spawn data |
| 6 | ground-item/Obj spawn data |
| 7 | area data |

The group id is effectively:

```text
(mapX << 8) | mapY
```

This distinction is critical because OpenRune naming differs from what can be casually called an "object" in an editor.

### Static locs are not OpenRune `obj` spawns

The Studio Map Editor's `map.objects` mutations represent static world locs such as:

- walls;
- scenery;
- doors;
- floor decorations;
- wall decorations.

Those belong to map-group **file 1**.

OpenRune's `.data/raw-cache/map/objs/*.toml` represents **ground item/Obj spawns**, which are packed into map-group **file 6**.

Do not map Studio static loc edits to OpenRune `objs` TOML files.

Use explicit terminology in code and docs:

- **loc** = static scene/world location object;
- **obj** = ground item;
- **npc** = NPC spawn;
- **area** = OpenRune area membership.

---

## 6. What OpenRune map source files actually cover

OpenRune currently has these project-owned map source directories:

```text
.data/raw-cache/map/npcs
.data/raw-cache/map/objs
.data/raw-cache/map/area
```

There is currently no corresponding OpenRune raw-source directory for the main terrain and static-loc files edited by the Studio Map Editor.

### NPC source

Example shape:

```toml
[[spawn]]
npc = "npc.some_name"
coords = "0_50_50_38_52"
```

The coordinate format is:

```text
level_mapX_mapY_localX_localY
```

`MapNpcPacker` resolves the RSCM symbol and writes file 5.

### Ground-item source

Example shape:

```toml
[[spawn]]
obj = "obj.some_item"
coords = "0_50_50_10_20"
count = 1
```

`MapObjPacker` resolves the RSCM symbol and writes file 6.

### Area source

Areas use symbolic `area.*` identifiers and polygons expressed in world coordinates.

Example shape:

```toml
[[area]]
name = "Lumbridge"
area_id = "area.lumbridge"
levels = [0, 1, 2, 3]

[[area.polygons]]
vertices = [
    [3136, 3136],
    [3253, 3136],
    ...
]
```

The packer:

1. resolves `area.*` through RSCM;
2. clips polygons by map square;
3. creates square/zone/coord area membership;
4. writes file 7.

### Consequence for Content Studio

The existing OpenRune map packers **do not cover the primary terrain/static-loc editing output** of the Studio.

Therefore:

> Core Map Editor save/export must not depend on OpenRune `MapPackers` or the backend.

The Studio needs its own portable terrain and loc encoders.

---

## 7. Studio terrain and loc encoding

The Studio already has the read side:

- cache store decoding;
- modern map group loading;
- terrain decoding;
- loc decoding;
- live editor mutation state;
- Edit Format v1 terrain/loc semantics.

The missing portable piece is the write side.

### Required TypeScript components

Add framework-neutral TypeScript implementations for:

```text
MapTerrainEncoder
MapLocEncoder
WritableCacheStore
MapRegionPackage
```

Exact names may change.

### Terrain encoder

The encoder should produce the exact map-group file-0 payload for a map square.

It should accept semantic editor tile state, not WebGL buffers.

### Loc encoder

The encoder should produce the exact map-group file-1 payload for semantic loc placements.

Input should use the existing semantic loc shape:

- loc id;
- flags/shape/rotation;
- world/map/local coordinate;
- level.

Do not encode renderer instances.

### Golden parity

Encoder work needs fixtures.

At minimum:

```text
known cache region
 -> TS decode
 -> TS encode
 -> byte/semantic parity check
```

Where byte identity is not guaranteed because of equivalent encodings, decode-after-encode must prove semantic equality.

OpenRune/FileStore can be used as an optional backend parity oracle, but the TS implementation remains the product implementation.

---

## 8. Writable cache architecture

The existing client cache system is read-only.

`MemoryStore` reads `main_file_cache.dat/dat2` and index files. It does not currently write JS5 sectors/reference tables.

Introduce a framework-neutral write boundary rather than putting writes into UI code.

Conceptually:

```ts
interface WritableCacheTarget {
    writeMapFile(
        mapX: number,
        mapY: number,
        fileId: number,
        data: Uint8Array,
    ): Promise<void>;

    finalize(): Promise<CacheWriteResult>;
}
```

This can evolve into generic archive/index writes when needed.

Potential targets:

- in-memory/package target;
- downloadable cache-patch target;
- browser File System Access target;
- Tauri filesystem target;
- optional backend/FileStore parity target.

### Do not require full-cache rewriting on day one

A region package or cache patch can be implemented before a complete JS5/dat2 writer.

Recommended progression:

1. encode terrain/loc payloads;
2. export a portable region package;
3. validate re-import;
4. add a cache-patch format;
5. add direct writable cache support;
6. add full-cache rebuild only where needed.

This keeps map editing independent from backend work.

---

## 9. Recommended region/package format

The Studio should have a portable region package separate from raw cache-sector layout.

It should contain:

- format/version;
- source cache identity;
- map square coordinates;
- terrain file-0 payload or semantic representation;
- loc file-1 payload or semantic representation;
- optional NPC file-5 payload;
- optional Obj file-6 payload;
- optional area file-7 payload;
- optional GameVal/RSCM metadata;
- validation hashes;
- Edit Format history or final semantic state as appropriate.

This package can be:

- downloaded by any browser;
- imported by any browser;
- written directly by Tauri;
- applied to a cache by a later cache writer;
- validated by the backend when available.

A portable package avoids making `main_file_cache.dat2` sector layout the project's interchange format.

---

## 10. RSCM and GameVal model

OpenRune's GameVal system currently loads from several sources:

```text
.data/gamevals-binary/gamevals.dat
.data/gamevals-binary/gamevals_generated.dat
content/**/gamevals.toml
api/**/gamevals.toml
.data/gamevals/*.rscm
```

### RSCM files

RSCM files are simple namespace-specific mapping files.

Example:

```text
lumbridge=32764
wilderness=32760
```

The namespace comes from the filename:

```text
.data/gamevals/area.rscm -> area.*
```

OpenRune supports prefixes including:

- area;
- component;
- content;
- dbcol;
- dbrow;
- dbtable;
- interface;
- inv;
- loc;
- npc;
- obj;
- seq;
- sprite/model-related namespaces;
- vars and other server/client symbols.

### `gamevals.toml`

Content/API modules can declare mappings under:

```toml
[gamevals.some_namespace]
some_name = 12345
```

OpenRune's provider tracks the source file of declared GameVals.

### Base GameVal binary

`gamevals.dat` provides base cache mappings and the maximum base id per table.

The file format is simple enough for TypeScript:

```text
int32 tableCount
repeat tableCount:
    int16 tableNameUtf8Length
    bytes tableName
    int32 entryCount
    repeat entryCount:
        int16 entryUtf8Length
        bytes "key=id" (or supported subproperty form)
```

`gamevals_generated.dat` uses the same container format for generated mappings such as components/dbcols.

### Validation rules worth matching in TypeScript

OpenRune's `GameValProvider` currently enforces important rules:

- custom non-placeholder ids must exceed the maximum base id for that namespace;
- one key cannot resolve to conflicting ids;
- one id cannot map to multiple custom keys in the same table;
- `-1` represents unassigned entries;
- namespaces must be recognized RSCM prefixes.

These rules are portable and should be implemented in TypeScript.

The backend is not needed to enforce them.

---

## 11. TypeScript GameVal/RSCM services

Introduce a framework-neutral registry.

Conceptually:

```ts
interface GameValRegistry {
    resolve(symbol: string): number | undefined;
    reverse(namespace: string, id: number): readonly GameValSymbol[];
    sourceOf(symbol: string): GameValSource | undefined;
    diagnostics(): readonly GameValDiagnostic[];
}
```

Inputs can include:

- cache index-24 GameVals;
- base `gamevals.dat`;
- generated GameVals binary;
- RSCM files;
- source `gamevals.toml`.

### Authority/provenance must remain explicit

Never flatten all names into one anonymous map.

Each symbol should retain:

- namespace;
- name;
- id;
- origin;
- source path if known;
- module path if known;
- cache/project identity;
- diagnostic/conflict state.

This supports:

- interface labels;
- loc/npc/obj selection;
- OpenRune source navigation;
- validation;
- generated map TOML;
- conflict reporting.

---

## 12. OpenRune project filesystem abstraction

Do not make OpenRune project integration synonymous with "backend connection."

Add a portable project filesystem seam.

Conceptually:

```ts
interface ProjectFileSystem {
    readonly capabilities: {
        read: boolean;
        write: boolean;
        watch: boolean;
    };

    list(path: string): Promise<ProjectEntry[]>;
    readText(path: string): Promise<string>;
    readBytes(path: string): Promise<Uint8Array>;
    writeText(path: string, text: string): Promise<void>;
    writeBytes(path: string, data: Uint8Array): Promise<void>;
}
```

Security/path rules belong in the adapter.

Potential implementations:

### Web import/export adapter

Read-only/import-oriented:

- selected files;
- selected directory upload;
- ZIP package;
- browser persistence.

Writes become downloadable files/packages.

### Web File System Access adapter

Where supported:

- user grants directory;
- read/write selected tree;
- retain handle where browser policy permits.

Must have fallback behavior.

### Tauri project filesystem adapter

Preferred desktop implementation:

- native directory picker;
- scoped project root;
- direct read/write through Tauri FS;
- optional watch capability.

This should be the normal Tauri OpenRune project path.

### Backend filesystem adapter

Not the default.

Use only if a backend-only operation needs the backend to read its own opened project session.

Do not send ordinary file reads through Ktor just because the backend exists.

---

## 13. OpenRune project inspection can be TypeScript-first

The current Kotlin backend recognizes an OpenRune checkout by inspecting paths such as:

- Gradle settings;
- Gradle wrapper;
- `or-cache/build.gradle.kts`;
- `content/`;
- `engine/`;
- `server/`;
- `.data/gamevals/`;
- `.data/cache/LIVE`;
- `.data/cache/SERVER`.

That check is ordinary filesystem inspection.

It can be implemented in TypeScript on top of `ProjectFileSystem`.

Therefore project recognition should not require the backend.

The backend can retain its own inspection before executing privileged JVM operations, but that is a security boundary for the backend, not the frontend's only project model.

---

## 14. OpenRune content indexing can be mostly TypeScript

The existing backend currently scans:

- content modules;
- `gamevals.toml`;
- generated RSCM;
- Kotlin source facts.

The first three are straightforward portable file indexing.

Implement TypeScript project metadata indexing for:

- content module discovery;
- GameVal source discovery;
- RSCM discovery;
- raw map source discovery;
- cache directory discovery;
- simple source text/reference search.

A JVM/backend source index is justified only when the feature requires semantics that are materially better than portable text/structural indexing.

For example:

- exact Kotlin compiler/PSI semantics;
- Gradle model resolution;
- classpath-aware symbol resolution.

Do not require that level of analysis for basic "find files that reference `area.lumbridge`" behavior.

---

## 15. Raw OpenRune map source adapter

Create a TypeScript OpenRune source adapter for the map sources OpenRune actually owns.

Conceptually:

```text
OpenRuneRawMapSource
  +-- npcs/*.toml
  +-- objs/*.toml
  +-- area/*.toml
```

Responsibilities:

- parse source TOML;
- resolve RSCM symbols through `GameValRegistry`;
- expose semantic NPC/Obj/Area models;
- validate coordinates and ids;
- generate deterministic TOML;
- preserve source provenance where practical.

### TOML implementation note

The client currently does not include a TOML parser dependency.

Options:

1. add a small maintained TOML parser;
2. implement a constrained parser/formatter for the exact OpenRune map and GameVal schemas.

Avoid a hand-written general TOML implementation unless necessary.

The domain model should not expose parser-specific objects.

---

## 16. Terrain/static-loc authority

OpenRune currently does not expose `.data/raw-cache/map` source files for map-group files 0/1.

That means Content Studio needs an explicit authority policy.

### Recommended policy

For terrain/static-loc work:

1. the selected base cache is the immutable base;
2. Studio Edit Format/project state is the authoritative edit layer;
3. TypeScript encoders create region/cache output on demand;
4. direct mutation of OpenRune LIVE/SERVER caches is an explicit export/apply action;
5. optional OpenRune build/verification happens after that when useful.

Do not silently treat a generated cache as the only saved copy of a Studio project.

### Future OpenRune source format

If OpenRune later gains first-class terrain/loc project source files, add an adapter for that format.

Do not require upstream changes today.

---

## 17. Cache packing should be layered

"Cache packing" is several different capabilities and should not be one backend operation.

### Layer A: semantic encoder

Pure TypeScript.

Examples:

- terrain semantic state -> map file 0;
- loc placements -> map file 1;
- NPC spawns -> file 5;
- ground objs -> file 6;
- area definitions -> file 7.

### Layer B: region/package assembly

Pure TypeScript.

Creates portable packages, patches, previews, validation metadata.

### Layer C: cache archive/store writer

Prefer TypeScript.

Writes group/file payloads into a cloned/in-memory/cache target.

This requires proper JS5/cache store reference/sector writing but is not inherently JVM-specific.

### Layer D: OpenRune project build

Optional backend.

Runs the exact project's Gradle/OpenRune build pipeline.

This is where the backend adds the most value.

Do not collapse A-D into one backend-only "publish" endpoint.

---

## 18. Web capability matrix

Legend:

- ✅ expected capability;
- ◐ possible with progressive enhancement or additional TS work;
- ❌ unavailable by browser design;
- O optional backend can add it.

| Capability | Universal web | FS Access web | Backend |
| --- | ---: | ---: | ---: |
| Load static/range cache | ✅ | ✅ | not needed |
| Import cache folder | ✅ | ✅ | not needed |
| Persist cache in IndexedDB | ✅ | ✅ | not needed |
| Decode/render maps | ✅ | ✅ | not needed |
| Edit terrain/locs | ✅ | ✅ | not needed |
| Edit/save Studio projects | ✅ | ✅ | not needed |
| Parse cache GameVals | ✅ | ✅ | not needed |
| Parse RSCM/GameVal DAT | ◐ | ◐ | not needed |
| Parse/generate OpenRune TOML | ◐ | ◐ | not needed |
| Export region/package download | ✅ | ✅ | not needed |
| Write user-selected OpenRune files directly | ❌ baseline | ✅ where supported | optional |
| Watch project files | ❌ baseline | browser-dependent | optional |
| Direct full cache write | ◐ after TS writer | ◐ after TS writer | optional parity |
| Run Gradle/OpenRune build | ❌ | ❌ | ✅ |
| Run OpenRune tests | ❌ | ❌ | ✅ |
| JVM/FileStore parity validation | ❌ | ❌ | ✅ |
| Exact Kotlin/Gradle semantic analysis | ❌ | ❌ | ✅ when needed |

The application must not degrade ordinary editing because an optional backend connection is absent.

---

## 19. Tauri capability matrix

| Capability | Tauri without backend | Backend needed? |
| --- | ---: | ---: |
| Native project folder picker | ✅ | no |
| Read OpenRune project tree | ✅ | no |
| Write RSCM/TOML files | ✅ | no |
| Read/write cache files | ✅ | no |
| Watch files | ◐ enable FS watch feature | no |
| Decode/render/edit maps | ✅ TypeScript | no |
| Terrain/loc encode | ◐ implement TS codecs | no |
| Region/package export | ✅ | no |
| Full cache write | ◐ implement TS cache writer | no |
| Project metadata index | ✅ TypeScript | no |
| RSCM/GameVal validation | ✅ TypeScript | no |
| Run exact `:or-cache:buildCache` | technically native-process capable | backend preferred |
| Run project tests/Gradle operations | technically native-process capable | backend preferred |
| OpenRune FileStore parity check | possible to port | backend useful |
| Compiler/classpath-aware Kotlin analysis | not desirable in webview | backend useful |

### Why retain any backend on Tauri?

Tauri/Rust could technically launch Gradle directly.

However the repository already has a bounded, authenticated backend implementation for:

- Gradle operation allowlisting;
- process cancellation;
- log/event streaming;
- OpenRune FileStore parity;
- JVM-side project checks.

Keeping that existing service for **explicit OpenRune/JVM operations** is preferable to duplicating those rules in Rust.

The important change is lifecycle:

> Do not start or require the backend for ordinary Tauri editing.

Launch/connect to it lazily when the user requests a backend-only action such as an exact OpenRune build.

---

## 20. Backend responsibilities after this architecture

The backend should be intentionally narrow.

### Backend should own

Capabilities that genuinely benefit from the OpenRune/JVM environment:

- run allowlisted Gradle/OpenRune operations;
- exact `:or-cache:buildCache`;
- exact project test/assemble operations;
- optional `freshCache`;
- optional upstream `mergePluginGamevals` parity run;
- OpenRune FileStore verification;
- output CRC/structure verification through OpenRune libraries;
- JVM/compiler-aware source analysis when a future feature truly needs it.

### Backend should not be required for

- application startup;
- map viewing;
- map editing;
- cache decoding;
- cache profile loading;
- project JSON persistence;
- terrain/loc encoding;
- RSCM parsing;
- GameVal DAT parsing;
- TOML parsing/generation;
- OpenRune directory inspection;
- Tauri file reads/writes;
- region package import/export;
- normal source search;
- basic GameVal validation;
- direct source-file updates in Tauri.

### Existing backend capabilities

Existing backend endpoints can remain useful, but frontend architecture should stop treating them as the default path for capabilities that can be local.

For example, backend cache inspection may remain a diagnostic/parity feature even if Tauri directly reads the same cache.

---

## 21. Backend lifecycle policy

Backend availability should be modeled as a capability, not a prerequisite.

Recommended states:

```text
unavailable
available-not-running
starting
ready
failed
```

### Web

Web does not automatically start a backend.

A user may explicitly pair/connect to an already-running backend to unlock:

- Gradle build;
- tests;
- JVM verification;
- native project operations that the browser cannot do.

### Tauri

Tauri may package the backend but should start it lazily.

Examples that should **not** start the backend:

- open cache;
- open map;
- edit region;
- save project;
- open OpenRune folder;
- inspect RSCM;
- update map TOML;
- export package.

Examples that may start it:

- Build OpenRune Project;
- Publish/verify via upstream OpenRune cache build;
- Run tests;
- JVM/FileStore parity validation.

---

## 22. Proposed service boundaries

### `CacheSource`

Keep it read-oriented and portable.

Current implementations remain valid:

- static/range;
- IndexedDB profile.

Potential additions:

- File System Access cache source;
- Tauri filesystem cache source.

Do not require a backend-backed cache source for local OpenRune caches when direct filesystem access is available.

### `ProjectStore`

Keep local browser persistence independent.

A separate OpenRune project/source adapter should not replace `ProjectStore`.

A Studio project and an OpenRune checkout are related but not identical concepts.

### `ProjectFileSystem`

New platform boundary for direct project files.

Implement:

- web import/download;
- web File System Access;
- Tauri filesystem.

### `GameValRegistry`

Pure TS metadata and resolution service.

### `OpenRuneProjectIndex`

Pure TS project discovery/index for:

- modules;
- GameVals;
- RSCM;
- raw map sources;
- cache paths;
- simple references.

### `MapCodec`

Pure TS decode/encode boundary for files 0/1/5/6/7.

### `WritableCacheTarget`

Pure TS domain interface with platform-specific byte persistence.

### `OpenRuneBuildService`

Optional native/JVM service.

This is the main place where `StudioBackendClient` belongs.

---

## 23. Saving to an OpenRune checkout

Different map data must save differently.

### NPC / Obj / Area

When a writable OpenRune project is connected:

```text
Studio semantic changes
 -> validate symbols through GameValRegistry
 -> update .data/raw-cache/map/*.toml
 -> save via ProjectFileSystem
 -> optional OpenRune build
```

This is source-authoritative.

### Terrain / static loc

Because OpenRune currently has no raw source format for these:

```text
Studio semantic changes
 -> Edit Format / Studio project
 -> TS map encoder
 -> region package / cache patch
 -> optional explicit apply to cache copy or OpenRune LIVE cache
 -> optional OpenRune verification/build
```

The UI must make an in-place generated-cache write explicit.

### GameVals

For project-owned custom symbols:

```text
source gamevals.toml
     + .data/gamevals/*.rscm
     + base/generated GameVal binary metadata
     -> GameValRegistry
```

Prefer editing the authoritative source declaration when one exists.

RSCM updates should follow OpenRune's current merge/validation rules.

---

## 24. Publish/build workflow

Publish must remain explicit and staged.

Recommended UX:

```text
1. Save Studio project
2. Validate edits locally
3. Prepare source/cache changes
4. Show proposed file changes
5. Apply files
6. Optional: Build OpenRune Project
7. Verify outputs
8. Report exact changed outputs
```

Do not combine "Save" with "run Gradle and overwrite caches."

Offline users should still be able to complete steps 1-4 and export the result.

Tauri users can normally complete steps 1-5 without the backend.

Backend users can add steps 6-7.

---

## 25. Conflict and identity rules

A loaded cache and an OpenRune checkout can be different revisions or states.

Track identities explicitly:

- cache name;
- game/revision;
- cache fingerprint when practical;
- project root identity;
- project index fingerprint;
- LIVE/SERVER cache fingerprints;
- GameVal source generation/fingerprint.

When identities do not match:

- allow viewing;
- show provenance;
- warn before applying project symbols/source changes;
- do not silently rename or rewrite based on assumed equality.

---

## 26. XTEA handling

Content Studio already recognizes that OSRS map XTEAs are obsolete from revision 237 onward.

For older caches:

- keep XTEA metadata in `CacheSource`;
- decrypt/encode through portable TS crypto;
- keep key import/export independent from backend.

Do not make pre-237 support a backend dependency.

---

## 27. Performance rules

Backend avoidance should not mean main-thread work.

Portable heavy work can use:

- Web Workers;
- transferable/shared buffers;
- streaming parsing;
- incremental indexes;
- WASM only for measured hotspots.

Examples suitable for workers:

- cache packing;
- region encoding;
- RSCM/GameVal indexing;
- project text indexing;
- ZIP/package assembly.

Keep Svelte on orchestration/UI only.

---

## 28. Security model

### Web

The browser sandbox is the security boundary.

Only access user-selected files/directories.

### Tauri

Use narrow project scopes.

Do not grant unrestricted filesystem access merely because the app is desktop.

A project picker should establish the selected root and adapters should reject path traversal outside it.

### Backend

Retain:

- loopback-only binding;
- per-launch token;
- Host/Origin checks;
- opaque sessions;
- project-root confinement;
- allowlisted Gradle operations;
- no arbitrary shell API.

Backend security remains valuable precisely because its operations are the privileged ones.

---

## 29. Implementation order

### Phase A: document and stabilize contracts

- [x] Document OpenRune map/cache/RSCM behavior.
- [x] Define TypeScript-first/backend-minimal ownership.
- [ ] Add capability types for filesystem/native build availability.

### Phase B: GameVals and project files

1. implement pure TS RSCM parser/index;
2. implement GameVal DAT reader;
3. add constrained OpenRune GameVal/TOML parsing;
4. create `GameValRegistry`;
5. create `ProjectFileSystem`;
6. implement Tauri project filesystem adapter;
7. optionally implement File System Access adapter.

### Phase C: map source integration

1. parse OpenRune NPC/Obj/Area TOML;
2. expose semantic source models;
3. generate deterministic TOML;
4. connect source provenance to map/world tooling.

### Phase D: terrain/loc export

1. implement `MapTerrainEncoder`;
2. implement `MapLocEncoder`;
3. add golden round-trip tests;
4. implement region package;
5. replace placeholder map import/export providers.

### Phase E: cache writing

1. implement a cache-patch target;
2. implement writable modern cache store;
3. add File System Access/Tauri persistence targets;
4. verify against known caches and optional OpenRune FileStore.

### Phase F: optional backend build

1. narrow `StudioBackendClient` around native build/verification capabilities;
2. use HTTP transport for explicitly paired web backend;
3. use lazy Tauri sidecar supervision;
4. run build/test/verification only on explicit user actions.

---

## 30. Decisions

The architecture should follow these decisions unless a future measured/technical constraint requires changing them.

1. **The backend is optional.**
2. **TypeScript owns cache/map/GameVal semantics whenever practical.**
3. **Tauri reads/writes OpenRune projects directly through a scoped filesystem adapter.**
4. **Web remains fully usable without native services.**
5. **File System Access is progressive enhancement, not a requirement.**
6. **OpenRune Gradle/JVM execution is the backend's primary responsibility.**
7. **Terrain/static-loc editing does not depend on OpenRune's NPC/Obj/Area map packers.**
8. **OpenRune `obj` means ground item; Studio static map objects are locs.**
9. **Studio projects/Edit Format remain authoritative for terrain/loc edits until an explicit export/apply.**
10. **RSCM/GameVal parsing and validation should be portable TypeScript.**
11. **Generated caches are outputs, not silent project persistence.**
12. **OpenRune Server requires zero Studio-specific changes.**

---

## 31. OpenRune reference files

Primary OpenRune Server files used to derive this architecture:

- `or-cache/build.gradle.kts`
- `or-cache/src/main/kotlin/dev/openrune/CacheTools.kt`
- `or-cache/src/main/kotlin/dev/openrune/map/GameMapDecoder.kt`
- `or-cache/src/main/kotlin/dev/openrune/map/packing/MapPackers.kt`
- `or-cache/src/main/kotlin/dev/openrune/map/packing/MapNpcPacker.kt`
- `or-cache/src/main/kotlin/dev/openrune/map/packing/MapObjPacker.kt`
- `or-cache/src/main/kotlin/dev/openrune/map/packing/MapAreaPacker.kt`
- `or-cache/src/main/kotlin/dev/openrune/map/tile/MapTileByteEncoder.kt`
- `or-cache/src/main/kotlin/dev/openrune/gamevals/GameValProvider.kt`
- `or-cache/src/main/kotlin/dev/openrune/gamevals/GamevalDumper.kt`
- `or-cache/src/main/kotlin/dev/openrune/gamevals/PluginGamevalMerger.kt`
- `or-cache/src/main/kotlin/dev/openrune/gamevals/GameValDat.kt`
- `or-cache/src/main/kotlin/dev/openrune/rscm/RSCM.kt`
- `.data/raw-cache/map/npcs/*.toml`
- `.data/raw-cache/map/objs/*.toml`
- `.data/raw-cache/map/area/*.toml`
- `.data/gamevals/*.rscm`

Platform references:

- Tauri v2 filesystem plugin: https://v2.tauri.app/plugin/file-system/
- Tauri v2 dialog plugin: https://v2.tauri.app/plugin/dialog/
- File System Access API: https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker

