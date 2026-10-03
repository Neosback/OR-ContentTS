# OpenRune Server Foundation Reference

This document records verified OpenRune Server architecture that is useful for **compatibility and inspection only**.

It is not an implementation plan for modifying OpenRune Server.

Baseline originally inspected:

- upstream repository: `OpenRune/OpenRune-Server`
- upstream branch: `main`
- baseline commit: `6f7bd42d2cd613c01a351f25c227f6333c24cd62`
- original verification date: 2026-09-28

OpenRune changes over time. The Studio backend must detect capabilities from the user's checkout instead of assuming this exact baseline.

## Non-negotiable integration rule

OpenRune Content Studio requires **zero Studio-specific OpenRune Server source changes**.

Do not:

- add Studio HTTP/API endpoints to OpenRune Server;
- require a custom OpenRune Server fork;
- add required Studio accessors, hooks, modules, agents, or framework patches;
- depend on private runtime internals as a required integration contract;
- inject a Studio service into the OpenRune Server JVM;
- make OpenRune Server source modification a prerequisite for editor functionality.

If a capability cannot be supported through external inspection, independently available libraries, project files, generated outputs, or existing project build interfaces, that capability must degrade/remain unavailable.

## Why OpenRune is still important

OpenRune Server remains an important compatibility/reference target because its project structure establishes useful authorities for:

1. project/source layout;
2. GameVals and RSCM identities;
3. content and pack modules;
4. LIVE and SERVER cache outputs;
5. FileStore/cache semantics;
6. existing Gradle/cache build tasks;
7. source-vs-generated-output authority.

Content Studio should adapt to these structures without requiring a patched OpenRune runtime. Portable inspection and file-based integration should be implemented in TypeScript first; existing OpenRune source formats should remain authoritative; and the backend remains available for JVM/OpenRune build, FileStore map publication, and verification operations.

## Verified project/build model

A compatible OpenRune checkout is a Gradle multi-project Kotlin/JVM project.

Important areas commonly include:

```text
content/
engine/
server/
or-cache/
.data/
```

The backend should detect these rather than hard-coding one repository revision.

Useful capability evidence includes:

- Gradle wrapper present;
- `:or-cache:buildCache` available;
- content modules present;
- GameVal/RSCM resources present;
- LIVE/SERVER cache outputs present;
- supported OpenRune/FileStore formats available.

## Cache authority

OpenRune distinguishes generated cache roles.

### LIVE

Typical path:

```text
.data/cache/LIVE
```

LIVE is the full/base generated cache used by the normal build and client-facing tooling.

### SERVER

Typical path:

```text
.data/cache/SERVER
```

SERVER is reseeded from LIVE, with configured client-heavy indices omitted/emptied, then augmented with server-specific config and map data.

Studio must not treat LIVE and SERVER as interchangeable or independent authoring targets.

Generated caches are outputs, not automatically authoritative editable source.

## Source and publication authority

Where an authoritative project source exists, Studio should preserve that authority.

Examples include:

- GameVal TOML/source declarations;
- existing RSCM source where appropriate;
- dedicated content pack modules;
- pack config/interface/CS2/model/sprite resources;
- `.data/raw-cache/server/**/*.toml`;
- `.data/raw-cache/map/{npcs,objs,area}/**/*.toml`;
- project configuration used by existing build tasks.

Preferred lifecycle:

```text
Studio semantic edit
  -> versioned Studio edit/project contract
  -> portable TypeScript validation
  -> update authoritative OpenRune source
  -> explicit OpenRune build
  -> LIVE
  -> SERVER derivation when relevant
  -> optional output verification
```

Do not silently mutate generated cache outputs as a substitute for source publication.

Terrain/static-loc placement is the main exception because OpenRune Server has no matching TOML source. Studio keeps semantic state/portable encoders and may publish through OpenRune-FileStore `PackMaps + PackWorldMap` into LIVE.

## GameVals and RSCM

GameVals form an important identity layer.

Examples:

```text
content.rock
loc.some_location
npc.king_dragon
dbtable.mining_rocks
stat.mining
```

The Studio's portable GameVal registry/project index should preserve provenance between:

- symbolic name;
- namespace;
- numeric id;
- authoritative source declaration;
- generated RSCM output;
- cache/runtime representation when available.

The backend proves that GameVal/RSCM-aware indexing can be done without changing the checkout. Equivalent normal project indexing now lives in TypeScript and is the default web/Tauri path; the backend is not required for this metadata.

## Content/pack isolation

OpenRune's cache/build design separates content pack inputs from the entire runtime dependency graph.

That is useful for Studio because project-owned content/config/build inputs can be read and written directly through the platform filesystem layer rather than embedding the game server inside Studio.

The backend may discover and invoke existing explicitly allowlisted build tasks for explicit build/verification actions, but must not expose arbitrary Gradle or shell execution.

## Existing build interface

Known useful Gradle tasks may include:

```text
assemble
test
:or-cache:buildCache
```

The current Studio backend intentionally exposes only bounded operation IDs mapped to allowlisted tasks.

Opening a project never runs Gradle automatically.

Build/task discovery and execution must remain explicit user actions.

## Separate tooling precedent

OpenRune already demonstrates that developer tooling can consume project/cache outputs without becoming part of the game server.

Content Studio takes that one step further:

```text
Content Studio TypeScript
        |
        +-- browser/Tauri project filesystem
        +-- cache/map/GameVal codecs
        |
        +-- optional Studio backend
                -> bounded OpenRune Gradle/JVM operations
```

No in-server Studio agent is required, and no backend process is required for ordinary file/cache editing.

## Current backend behavior

The in-repo backend under `backend/` currently supports:

- passive project inspection;
- opaque project sessions;
- source/content indexing;
- GameVal/RSCM-aware inspection;
- LIVE/SERVER FileStore inspection;
- bounded Gradle task discovery;
- allowlisted asynchronous Gradle operations;
- operation status/log/cancellation events;
- loopback Host/Origin/token security.

Current file-facing inspection paths are read-only.

The only checkout-modifying behavior today is explicit invocation of existing Gradle tasks, which may create normal generated/build outputs.

## Capability degradation

OpenRune versions and project layouts can differ.

The backend should therefore return capabilities based on evidence from the opened project.

Examples:

```text
project.inspect
content.index
content.resolve
source.index
cache.read
gradle.tasks
gradle.operations
```

The frontend must consume capabilities instead of assuming every OpenRune checkout supports every feature.

Missing capability is not a reason to patch OpenRune Server.

## Runtime introspection

Deep live-server introspection is **not** part of the current required architecture.

Do not add an in-server agent, reflection bridge, bytecode agent, or OpenRune source patch merely to expose runtime state.

If future product requirements genuinely need live runtime facts, first design an external, optional, versioned compatibility mechanism that preserves the zero-OpenRune-modification rule.

Static project inspection and editor functionality must remain useful without a running OpenRune Server process.

## Current integration priorities

The local-first foundation that this document originally proposed is now largely implemented.

Completed:

- framework-neutral `ProjectFileSystem`;
- Tauri and browser File System Access adapters;
- TypeScript RSCM/GameVal registry and project index;
- source-aware config/server/map TOML adapters;
- retained OpenRune project session/runtime;
- local Interface metadata;
- core rev-240 NPC/Obj/Param decoder parity.

Current order:

1. DBTable/DBRow/DBColumn decoding and remaining decoder parity;
2. TypeScript terrain/static-loc encoders plus portable package export;
3. explicit `StudioBackendClient` build bridge for allowlisted OpenRune build/test/verification actions;
4. bounded OpenRune-FileStore `PackMaps + PackWorldMap` publication into LIVE;
5. normal OpenRune cache build to derive/update SERVER;
6. lazy web/Tauri backend transports only for backend-only actions.

OpenRune runtime modification remains out of scope.

## Confidence boundary

We have enough verified OpenRune architectural knowledge to:

- recognize compatible project structures;
- inspect source and generated outputs;
- use FileStore/cache semantics;
- index GameVals/content;
- discover existing build capabilities;
- invoke bounded existing build operations.

We do **not** need complete OpenRune runtime internals to proceed with Content Studio.

When compatibility uncertainty appears, prefer capability detection and graceful degradation over upstream modification.


## Verified map publication behavior

OpenRune-FileStore `PackMaps` accepts paired raw `lX_Y/mX_Y` files and RSPSi-style `.pack` files.

For revision 237+ it writes terrain to map-group file 0 and static loc placements to file 1.

OpenRune Server's current normal LIVE task list does not register `PackMaps`, so Studio should invoke it externally through the optional backend rather than changing OpenRune Server.

`PackMaps` records changed map squares in `PackedMapSquares`; `PackWorldMap` consumes that same in-memory state. They should run in one bounded publication operation.

After LIVE is updated, OpenRune's normal SERVER pass reseeds SERVER from LIVE and then applies map NPC file 5, ground-Obj file 6, and area file 7 from OpenRune TOML sources.
