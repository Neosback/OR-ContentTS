# OpenRune map/cache integration: source-first, TypeScript-first architecture

> **Implementation checkpoint (through PR #69):** ProjectFileSystem/session/runtime, unified GameVal DAT/TOML/RSCM indexing, source-aware PackConfig/map/server TOML adapters, direct filesystem-backed cache access, Interface metadata, local CS2 object/enum data, and core rev-240 NPC/Obj/Param decoder parity are implemented. The immediate next cache-definition milestone is DBTable/DBRow/DBColumn. Terrain/static-loc encoders, Build Cache UI/client integration, and bounded PackMaps publication remain future work.

## Status and intent

This document defines how OpenRune Content Studio should integrate with an ordinary compatible OpenRune Server checkout for cache editing, map editing, GameVals/RSCM, source authoring, and build/publish workflows.

The architecture has two complementary rules:

> **Portable editing and inspection should work without the Kotlin backend whenever practical.**

> **When OpenRune already owns an authoritative source format and packer, Studio should edit that source and let OpenRune produce the cache output.**

The second rule is critical. TypeScript-first does **not** mean reimplementing every OpenRune packer. It means Studio owns portable editor semantics, project/file access, parsing, validation, and offline export. OpenRune remains the preferred publisher for OpenRune-owned source formats.

Research for this model was checked against OpenRune Server `main` at commit:

```text
625fe96abf802bc932d18e66832ed6ce90b60a0a
```

and OpenRune-FileStore `main` at commit:

```text
46e2be195489a288a0607b565e20811f26e81f62
```

Content Studio documentation work in this revision started from `main` at:

```text
4d116f2b41f3301bcfb11209cff3364659799c6c
```

OpenRune Server remains an external compatibility target. Content Studio must require **zero Studio-specific OpenRune Server changes**.

---

## 1. Source-of-truth rule

Content Studio has three classes of data.

### 1.1 OpenRune-owned source

Examples:

- content/plugin `gamevals.toml`;
- `.data/gamevals/*.rscm`;
- pack `configs/*.toml`;
- pack interfaces;
- pack CS2;
- pack models and sprites;
- DB-table DSL sources;
- `.data/raw-cache/server/**/*.toml`;
- `.data/raw-cache/map/npcs/*.toml`;
- `.data/raw-cache/map/objs/*.toml`;
- `.data/raw-cache/map/area/*.toml`.

When Studio edits one of these concepts in an OpenRune project, the **source file is authoritative**.

Preferred lifecycle:

```text
Studio semantic edit
  -> update the authoritative OpenRune source
  -> explicit OpenRune build/publish
  -> LIVE cache
  -> derived SERVER cache
```

Studio should not silently bypass the source file by patching the generated cache.

### 1.2 Studio-owned portable semantic state

Examples:

- Edit Format;
- Studio project metadata;
- unsaved/undoable map edits;
- offline region packages;
- terrain/static-loc edits when no OpenRune source representation exists.

This state must remain usable in plain web mode with no Java, Gradle, Tauri, or backend.

### 1.3 Generated cache outputs

Examples:

- `.data/cache/LIVE`;
- `.data/cache/SERVER`;
- generated cache GameVals;
- generated world-map data.

Generated cache output is not normally the authoring source.

---

## 2. Runtime environments

### 2.1 Plain web baseline

Must work without a backend:

- static/range cache loading;
- cache-folder import;
- IndexedDB cache profiles;
- map/interface decode and editing;
- Studio project persistence;
- cache GameVal reads;
- RSCM/`gamevals.toml` parsing;
- TOML source editing after import;
- region/package export;
- portable terrain/static-loc encoding;
- downloads/ZIP exports.

### 2.2 Web File System Access

Where supported, a user-approved project directory can provide direct read/write access.

Use this only as progressive enhancement. Import/download remains the universal fallback. Cache Repository's universal browser path imports a selected cache folder once into IndexedDB; the folder chosen while creating a profile is the same selection used for that initial import and must not be requested a second time.

The shared `ProjectFileSystemCacheSource` can also consume a browser File System Access handle. Persisting/binding those cache-directory handles is an optional enhancement, not a requirement for browsers without `showDirectoryPicker`.

### 2.3 Tauri desktop

Tauri should be the best direct-filesystem experience.

Tauri responsibilities:

- native project/cache selection;
- scoped `ProjectFileSystem` reads/writes;
- direct cache loading through `ProjectFileSystemCacheSource`;
- persisted user-approved filesystem scopes across launches;
- atomic source-file updates;
- optional file watching;
- optional lazy Studio backend launch.

A Tauri cache profile must not copy its cache into browser IndexedDB. The selected cache directory is the source of truth. The current synchronous cache decoder still materializes cache-store bytes into the webview's memory while the cache is open; eliminating that runtime memory copy would require an async/random-access cache-store refactor and is separate from persistence.

Do not start Ktor merely to read cache files or write TOML/RSCM/project files.

### 2.4 Optional Studio backend

The backend is justified for capabilities that materially benefit from the exact OpenRune/JVM toolchain:

- exact OpenRune Gradle builds/tests;
- OpenRune-FileStore `PackMaps` publication into LIVE;
- `PackWorldMap` regeneration in the same map-publish operation;
- FileStore parity/output verification;
- compiler/classpath-aware analysis where genuinely useful.

The backend remains lazy and optional.

---

## 3. OpenRune cache lifecycle

OpenRune Server uses:

```text
.data/cache/LIVE
.data/cache/SERVER
```

The relationship is not two independent builds.

### 3.1 LIVE is the base/full cache

The normal BUILD pass modifies the LIVE cache in place from OpenRune project sources.

Conceptually:

```text
base OSRS cache
      |
      v
.data/cache/LIVE
      |
      +-- PackConfig
      +-- PackModels
      +-- PackSprites
      +-- PackIfType
      +-- PackCs2
      +-- PackDBTables
      +-- plugin extra tasks
      +-- PackGameVals
      +-- PackWorldMap when changed map squares are recorded
      |
      v
completed LIVE
```

### 3.2 SERVER is derived from completed LIVE

For `SERVER_CACHE_BUILD`, OpenRune-FileStore seeds SERVER from LIVE.

The default compact path rebuilds LIVE into SERVER while leaving configured client-only indices empty. OpenRune then runs server-oriented pack tasks over that seed.

Conceptually:

```text
completed LIVE
      |
      | seed/rebuild, stripping server-unneeded indices
      v
SERVER base
      |
      +-- PackServerConfig
      +-- MapNpcPacker
      +-- MapObjPacker
      +-- MapAreaPacker
      +-- other server-safe/shared pack tasks
      |
      v
completed SERVER
```

OpenRune preserves recorded server-only outputs across reseeding when incremental state allows it.

### 3.3 Client-heavy indices stripped from SERVER

The current server-cache minification set includes indices such as:

- animations;
- skeletons;
- sound effects;
- music tracks/patches/jingles;
- models;
- textures;
- Vorbis;
- defaults;
- world-map geography/areas/ground;
- Animaya data.

Therefore:

> **Studio should treat SERVER as a generated, compact server derivative of LIVE, not as a separate authoring target.**

---

## 4. Gradle cache tasks

OpenRune Server exposes:

```text
:or-cache:buildCache
:or-cache:freshCache
:or-cache:mergePluginGamevals
```

### 4.1 `buildCache`

Current high-level flow:

1. load GameVal sources;
2. discover plugin packs;
3. validate packs;
4. build LIVE pack tasks;
5. update LIVE;
6. seed SERVER from LIVE;
7. apply server-oriented tasks;
8. dump/generate server-derived GameVal/codegen outputs.

Studio should invoke this when the user explicitly wants an OpenRune project build/publish, not for ordinary editor interaction.

### 4.2 `freshCache`

OpenRune-FileStore's fresh path:

1. resolves the configured OSRS revision/environment;
2. downloads/uses an OpenRS2 cache archive;
3. installs it into LIVE;
4. handles XTEAs for older revisions;
5. clears stale incremental state;
6. OpenRune dumps base GameVals from the fresh cache;
7. OpenRune then performs its normal BUILD flow.

This is bootstrap/update behavior, not normal Studio save behavior.

### 4.3 `mergePluginGamevals`

Release tooling merges plugin/module `gamevals.toml` mappings into `.data/gamevals/*.rscm`.

Normal OpenRune builds already load module `gamevals.toml` directly, so Studio should not require a merge before every edit/build.

The source-aware rule is:

- edit the declaration where OpenRune owns it;
- preserve provenance;
- let OpenRune's own merge/release workflow produce central mappings when appropriate.

---

## 5. OpenRune pack-source system

OpenRune's `or-cache` runtime classpath includes dedicated content `pack` modules without requiring game-script modules to be part of cache packing.

A `PluginPack` can contribute:

```text
src/main/resources/pack/
  configs/
  models/
  sprites/
  cs2/
  interfaces/
```

and Kotlin pack code can additionally contribute DB tables, interface DSL definitions, or extra cache tasks.

This is an important Content Studio integration point.

### Studio policy

When an editor is modifying a concept represented by one of these sources:

```text
Studio editor
  -> semantic TypeScript model
  -> deterministic update to the correct OpenRune pack source
  -> OpenRune build
```

Do not invent a parallel Studio JSON format as the OpenRune project's authoritative copy.

Studio's own project format remains useful for unsaved history, offline work, portability, and content not represented by OpenRune source.

---

## 6. Client/cache TOML via PackConfig

OpenRune-FileStore `PackConfig` scans TOML blocks and packs recognized definitions into the cache.

Current supported concepts include categories such as:

- item / `obj`;
- object definition / `loc`;
- NPC definition;
- enum;
- sequence/animation;
- spotanim/graphics;
- varbit;
- varp;
- inventory;
- overlay;
- underlay;
- texture;
- map element;
- health bar;
- hitsplat;
- params;
- identity kit;
- other registered config definitions.

OpenRune supports symbolic values through ConstantProvider/GameVals and supports inheritance from existing definitions.

Example:

```toml
[[object]]
id = "loc.farming_shed_poordoor"
inherit = "loc.farming_shed_poordoor"
contentGroup = "content.closed_single_door"
```

For an OpenRune project, a future Definitions Editor should update this source rather than directly changing only the compiled cache.

---

## 7. Server TOML via PackServerConfig

OpenRune owns a separate server-source family under:

```text
.data/raw-cache/server/
```

Current source includes areas such as:

- NPC server definitions;
- loc/object server definitions;
- items;
- varp/varbit and other vars;
- movement/hunt/projectile/server config;
- inventories/shops;
- Slayer data;
- other server-specific metadata.

`PackServerConfig` supports multiple models:

1. merge a server TOML overlay onto the corresponding client/base cache definition;
2. build a server representation from cache-backed base definitions;
3. pack server-only TOML definitions.

Example shop inventory:

```toml
[[inventory]]
isServerOnly = true
id = "inv.generalshop1"
name = "Al Kharid General Store"
...
```

### Studio policy

The portable implementation is `client/src/project/openrune-server-toml.ts`. It indexes the same two TOML source families consumed by `PackServerConfig`: recursive `.data/raw-cache/server/**/*.toml` plus pack-owned `pack/configs/**/*.toml` overlays.

It retains block/nested-source provenance, resolves `id` and `inherit` through the unified GameVal registry, reports duplicate resolved server targets instead of inventing precedence, and exposes a typed inventory/shop view for `[[inventory.stock]]` entries. Guarded top-level scalar writes and optimistic whole-file replacement remain behind `ProjectFileSystem`.

Slayer-specific files under the server tree are still separate domain sources. The generic adapter intentionally indexes only the root tables actually registered by `PackServerConfig`; dedicated Slayer tooling can be layered on later without conflating its schema with server config definitions.

A Shop Editor, server-NPC editor, or other server-content editor should edit these existing TOML sources and let OpenRune build SERVER.

Do not create a second Studio-only shop/config database.

---

## 8. GameVal/RSCM system

OpenRune loads GameVals from:

```text
.data/gamevals-binary/gamevals.dat
.data/gamevals-binary/gamevals_generated.dat
content/**/gamevals.toml
api/**/gamevals.toml
.data/gamevals/*.rscm
```

### 8.1 Base binary GameVals

`gamevals.dat` is dumped from the base/fresh OSRS cache. It provides official symbols and base-ID ceilings.

`gamevals_generated.dat` contains generated mappings such as generated component/column identities.

### 8.2 Module `gamevals.toml`

Module-local declarations look like:

```toml
[gamevals.varp]
lumbridge_tutor_claim = 63630
lumbridge_advisor_state = 63631
```

These are first-class OpenRune project sources.

### 8.3 RSCM

Namespace-specific files under `.data/gamevals` use forms such as:

```text
lumbridge=32764
wilderness=32760
```

The filename supplies the namespace.

### 8.4 Assignment and provenance

OpenRune's `GameValProvider` remembers which TOML/RSCM file declared a mapping.

An unassigned mapping can use:

```text
-1
```

OpenRune-FileStore's `GameValAssigner` can choose free custom IDs above the base OSRS range and write assignments back through the mutable mapping provider. OpenRune Server's BUILD configuration enables auto-cert, which causes the assignment path to run for unassigned project mappings while also handling cert IDs.

Therefore the normal OpenRune-project policy is:

> **Do not invent a competing Studio ID allocator. Preserve the OpenRune source declaration and let OpenRune assign/write IDs during its supported build workflow when assignment is needed.**

TypeScript may still:

- parse all source formats;
- show unassigned symbols;
- validate conflicts;
- preview available ranges;
- provide offline diagnostics;
- preserve provenance.

### 8.5 Cache GameVals

During a cache build:

1. `CollectGameVals` seeds ConstantProvider from existing cache GameVals without overwriting declared project mappings;
2. source-driven packers register newly packed GameVals;
3. `PackGameVals` encodes the collected mappings into the cache;
4. CS2 runs after GameVals are encoded so symbol generation/compilation can see final IDs.

That ordering should be treated as OpenRune-owned build behavior.

---

## 9. Modern map-group layout

For revision 237+ map groups:

| File | Meaning |
| ---: | --- |
| 0 | terrain/tile data |
| 1 | static loc placements |
| 5 | NPC spawns |
| 6 | ground-item/Obj spawns |
| 7 | areas |

Group id:

```text
(mapX << 8) | mapY
```

Terminology must remain explicit:

- **loc** = static scene/world object placement;
- **obj** = ground item;
- **npc** = NPC spawn;
- **area** = OpenRune area membership.

Studio `map.objects` are loc placements in file 1. They are **not** OpenRune ground-item `obj` spawns in file 6.

---

## 10. OpenRune map TOML sources

OpenRune Server currently owns source TOML for:

```text
.data/raw-cache/map/npcs/
.data/raw-cache/map/objs/
.data/raw-cache/map/area/
```

### NPC spawns -> file 5

Source shape:

```toml
[[spawn]]
npc = "npc.some_name"
coords = "0_50_50_38_52"
```

The packer resolves symbols through ConstantProvider/GameVals, groups by map square, and encodes NPC spawn lists.

### Ground-item spawns -> file 6

Source shape:

```toml
[[spawn]]
obj = "obj.some_item"
coords = "0_50_50_10_20"
count = 1
```

This is ground-item data, not static loc placement.

### Areas -> file 7

Area source contains symbolic area IDs and polygons. OpenRune clips polygons across map squares and encodes the resulting square/zone/coordinate membership.

### Studio policy

For OpenRune-connected projects:

- NPC placement editor -> update NPC map TOML;
- ground-item editor -> update Obj map TOML;
- area editor -> update Area TOML;
- then let OpenRune's existing SERVER build pack files 5/6/7.

Studio should not manually write files 5/6/7 in the normal OpenRune source workflow.

Offline/browser package export may still encode equivalent portable data.

---

## 11. Terrain/static locs and OpenRune-FileStore PackMaps

OpenRune Server does **not** currently expose an equivalent TOML source directory for map-group files 0 and 1.

However, OpenRune-FileStore already provides `PackMaps`.

### 11.1 Inputs accepted by PackMaps

Regular map files:

```text
lX_Y.dat / lX_Y.gz
mX_Y.dat / mX_Y.gz
```

In `PackMaps` naming:

- `lX_Y` is the terrain/tile payload;
- matching `mX_Y` is the static-loc payload.

It also accepts RSPSi-style:

```text
*.pack
```

packages.

### 11.2 Modern output

For revision 237+:

```text
terrain bytes -> map group file 0
loc bytes     -> map group file 1
```

For older revisions it uses named map/land archives and optional XTEAs.

### 11.3 Changed-map tracking

`PackMaps` records changed squares through `PackedMapSquares`.

`PackWorldMap` uses that in-memory set to regenerate only affected world-map areas.

Therefore a Studio OpenRune map-publish operation should run:

```text
PackMaps
  -> PackWorldMap
```

inside the same JVM/cache-tool operation, or explicitly rebuild all world-map areas if that shared changed-square state cannot be preserved.

### 11.4 Important OpenRune Server integration gap

OpenRune Server's current `PluginPacks.buildPackTasks()` does not register `PackMaps` in the normal LIVE build task list.

It does register `PackWorldMap`, but without `PackMaps` there are no Studio-produced changed squares for that task to consume.

Therefore merely placing `l/m` files in the OpenRune checkout does not currently make `:or-cache:buildCache` pack them.

### 11.5 Studio solution without OpenRune Server changes

Do **not** patch OpenRune Server.

Instead, the optional Studio backend can use the same OpenRune-FileStore library already used by OpenRune and expose one bounded map-publish operation:

```text
Studio semantic terrain/loc edits
  -> TypeScript encode raw terrain/loc payloads
  -> backend bounded map-publish request
  -> OpenRune-FileStore PackMaps
  -> OpenRune-FileStore PackWorldMap (same operation)
  -> updated LIVE
  -> normal OpenRune build/server pass
  -> SERVER reseeded from updated LIVE
  -> OpenRune map TOML packs files 5/6/7
```

This reuses OpenRune's cache writing instead of implementing a duplicate DAT2/JS5 writer as the primary OpenRune publication path.

---

## 12. Portable terrain/static-loc encoding still matters

Source-first OpenRune publication does not remove the need for TypeScript encoders.

TypeScript still needs to produce correct semantic/raw terrain and loc payloads for:

- plain-web export;
- offline projects;
- region packages;
- round-trip testing;
- Tauri without backend;
- input to the bounded `PackMaps` publication operation.

Required portable pieces remain conceptually:

```text
MapTerrainEncoder
MapLocEncoder
MapRegionPackage
```

But a full custom `WritableCacheStore` is no longer a near-term requirement for OpenRune project publishing.

### Priority change

Prefer:

1. semantic terrain/loc encoders;
2. portable region/raw map package;
3. exact `PackMaps + PackWorldMap` OpenRune publish operation;
4. source-first OpenRune build;
5. only later, generic direct JS5/DAT2 writing if standalone use cases justify it.

---

## 13. OpenRune source-first publishing matrix

| Studio concept | Authoritative OpenRune input | OpenRune packer/build owner |
| --- | --- | --- |
| item definition | pack `configs/*.toml` | `PackConfig` |
| loc definition | pack `configs/*.toml` | `PackConfig` |
| NPC definition | pack `configs/*.toml` | `PackConfig` |
| client vars/configs | pack `configs/*.toml` | `PackConfig` |
| interfaces | pack interface source/DSL | `PackIfType` |
| CS2 | pack CS2 source | `PackCs2` / Neptune |
| models | pack model resources | `PackModels` |
| sprites | pack sprite resources/manifest | `PackSprites` |
| DB tables | OpenRune DB-table DSL | `PackDBTables` |
| GameVal declarations | module `gamevals.toml` / existing RSCM source | GameVal provider/assigner + `PackGameVals` |
| server NPC/item/loc metadata | `.data/raw-cache/server/**/*.toml` / pack configs | `PackServerConfig` |
| shops/inventories | server TOML | `PackServerConfig` |
| NPC placement | `.data/raw-cache/map/npcs/*.toml` | `MapNpcPacker` |
| ground-item placement | `.data/raw-cache/map/objs/*.toml` | `MapObjPacker` |
| areas | `.data/raw-cache/map/area/*.toml` | `MapAreaPacker` |
| terrain | Studio semantic/raw map source | `PackMaps` via bounded Studio publish operation |
| static loc placement | Studio semantic/raw map source | `PackMaps` via bounded Studio publish operation |
| LIVE | generated | OpenRune/OpenRune-FileStore build |
| SERVER | generated from LIVE + server overlays | OpenRune SERVER pass |

---

## 14. ProjectFileSystem

OpenRune project access must remain separate from backend connection.

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

Implementations:

- browser import/export;
- browser File System Access where supported;
- Tauri scoped filesystem.

Svelte should never contain raw filesystem/Tauri/Ktor logic.

---

## 15. TypeScript OpenRune project index

Portable indexing should discover:

- `game.yml` revision/environment;
- Gradle/OpenRune project markers;
- content modules;
- pack modules;
- pack resource roots;
- `gamevals.toml`;
- `.data/gamevals/*.rscm`;
- `.data/gamevals-binary/*`;
- `.data/raw-cache/map/*`;
- `.data/raw-cache/server/*`;
- `.data/cache/LIVE`;
- `.data/cache/SERVER`.

The index should preserve provenance rather than flatten all symbols/files into one map.

A backend/compiler index is optional enrichment, not the required project model.

---

## 16. Editing workflow by content type

### Source-backed OpenRune content

```text
OpenRune source
   -> TypeScript parse
   -> Studio semantic editor
   -> Edit Format/history
   -> deterministic source update
   -> explicit OpenRune build
   -> generated LIVE/SERVER
```

### Terrain/static-loc content

```text
LIVE/base cache
   -> TypeScript decode
   -> Studio semantic editor
   -> Edit Format/history
   -> TypeScript terrain/loc encode
   -> portable raw/region package
   -> optional backend PackMaps + PackWorldMap
   -> updated LIVE
   -> OpenRune SERVER derivation
```

### Offline/browser-only

```text
cache/import
   -> semantic editor
   -> Studio project/Edit Format
   -> region/raw/package download
```

No backend required.

---

## 17. Backend capability boundary

The backend should not become a generic filesystem proxy.

Appropriate bounded operations:

- build OpenRune project;
- run allowlisted tests/assemble;
- pack Studio terrain/loc outputs into LIVE with OpenRune-FileStore;
- regenerate affected world map in the same operation;
- verify LIVE/SERVER outputs;
- optional JVM/compiler-aware source analysis.

Not appropriate as backend requirements:

- read/write TOML;
- read/write RSCM;
- ordinary project browsing;
- parse GameVals;
- edit definitions;
- edit NPC/Obj/Area source;
- normal Tauri file access;
- local Studio project persistence.

---

## 18. Build and publication safety

All publication must be explicit.

Opening an OpenRune project must remain passive:

- no Gradle;
- no cache build;
- no server process;
- no source writes;
- no map packing.

Before source writes:

1. validate project root;
2. show planned files;
3. preserve unknown TOML data/format where practical;
4. write atomically;
5. keep recoverable backups or transactional save behavior where practical.

Before backend build/map publication:

1. validate the opened project/session;
2. bound input paths to project/session roots;
3. use fixed operation IDs;
4. do not accept arbitrary shell/Gradle arguments;
5. stream structured progress/logs;
6. support cancellation where practical;
7. verify expected outputs.

---

## 19. Testing strategy

### TypeScript

Test:

- RSCM parsing;
- `gamevals.toml` parsing;
- GameVal DAT parsing;
- source provenance/conflicts;
- OpenRune map TOML round trips;
- server/config TOML adapters as they are added;
- terrain encoding;
- static-loc encoding;
- region/raw package round trips;
- source update planning.

### OpenRune parity fixtures

Keep representative fixtures for:

- GameVal mappings;
- config TOML;
- map NPC/Obj/Area TOML;
- terrain/loc raw payloads;
- modern map-group output.

### Backend

Test the bounded map-publish operation using OpenRune-FileStore:

```text
known LIVE fixture
 + terrain/loc input
 -> PackMaps
 -> PackWorldMap
 -> reopen cache
 -> verify group file 0/1
 -> verify expected changed world-map output
```

Also verify a subsequent OpenRune build carries those LIVE map files into SERVER while adding files 5/6/7 from source TOML.

---

## 20. Implementation sequence

### Phase A: portable project/source foundation

1. `ProjectFileSystem`;
2. Tauri filesystem adapter;
3. optional browser File System Access adapter;
4. TypeScript OpenRune project index;
5. TypeScript GameVal/RSCM registry;
6. source-aware TOML adapters.

### Phase B: use OpenRune-owned sources

7. config definition editing -> pack TOML;
8. GameVal declaration/source updates;
9. NPC spawn editing -> map NPC TOML;
10. ground-item editing -> map Obj TOML;
11. area editing -> area TOML;
12. server/shop editing -> server TOML.

### Phase C: terrain/static-loc publishing

13. TypeScript terrain encoder;
14. TypeScript static-loc encoder;
15. raw `l/m` or compatible region-package output;
16. backend bounded `PackMaps + PackWorldMap` operation;
17. explicit OpenRune build;
18. LIVE/SERVER output verification.

### Phase D: optional generic cache writing

Only after the source-first OpenRune workflow is solid:

19. standalone cache-patch target;
20. generic writable JS5/DAT2 target if offline/standalone requirements justify the complexity.

---

## 21. Non-negotiable invariants

1. OpenRune Server requires zero Studio-specific modifications.
2. Svelte owns UI, not filesystem/cache/build rules.
3. TypeScript owns portable semantic editor behavior.
4. Existing OpenRune source formats remain authoritative when present.
5. Studio does not maintain a duplicate source database for OpenRune-owned content.
6. LIVE is the full/base generated cache.
7. SERVER is derived from LIVE and augmented with server-specific data.
8. Studio does not normally author SERVER directly.
9. NPC map TOML -> file 5.
10. ground-item Obj map TOML -> file 6.
11. area TOML -> file 7.
12. static locs are file 1 and are not ground Obj spawns.
13. OpenRune-FileStore `PackMaps` should be reused for OpenRune terrain/loc publication.
14. `PackMaps` and `PackWorldMap` should run in one bounded operation when using changed-square tracking.
15. Backend execution is explicit and lazy.
16. Opening a project never executes Gradle or changes files.
17. Generated caches are outputs, not the default authoring source.
18. Offline/browser editing remains first-class.
