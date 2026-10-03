# Interface Editor data sources

This document records the **current** Interface Editor data-authority model after PRs #53 and #64-#69.

The central rule is:

> Binary runtime semantics come from the selected cache. OpenRune project GameVals/RSCM add symbolic identity, provenance, and diagnostics; they do not replace the cache as runtime truth.

No OpenRune Server modification and no Kotlin backend are required for ordinary Interface browsing, CS2 preview, or project-aware symbolic metadata.

## 1. Current runtime path

The Interface Editor opens interfaces from the active `LoadedCache`:

```text
selected cache
  -> CacheSystem
     -> index 3 interfaces
     -> client scripts
     -> varbits
     -> ObjType loader
     -> EnumType loader
  -> InterfaceViewer
  -> InterfaceEditorState
  -> Svelte Interface panels
```

Interface selection is local. It must not make a second HTTP request to a cache server or cache proxy.

The old `/api/cache-proxy/interface/:id` selection path was removed in PR #53.

## 2. Binary authority

### Interface/component structure

Cache index 3 is authoritative for:

- interface groups;
- component IDs;
- parent/child relationships;
- widget type;
- geometry/layout;
- text/sprite/model fields;
- scripts/listeners;
- IF3/legacy structure.

GameVals are not needed to decode interface binary structure.

### CS2 preview/runtime support

The current local cache runtime also supplies:

- client scripts;
- varbit definitions;
- object definitions through `ObjTypeLoader`;
- enum definitions through `EnumTypeLoader`.

Recent parity work includes:

- PR #64: object opcodes 4200-4212;
- PR #65: social comparator opcodes 3628-3657;
- PR #66: client-parity runtime-widget defaults;
- PR #67: local cache-backed enum opcodes;
- PR #69: rev-240 core NPC/Obj/Param decoder parity;
- PR #72: stabilized the Svelte preview/render boundary, preserved selected-cache enum/object loaders during redraw, added deterministic mock social queries for 3600-3627, and virtualized the interface list.

Do not reintroduce network/cache-proxy reads for data already available from the selected `CacheSystem`.

## 3. Cache GameVals

When cache index 24 exists, `GameVals` provide cache-matched friendly names for interfaces and components.

Relevant code:

- `client/src/rs/config/gameval/GameVals.ts`
- `client/src/rs/config/gameval/GameValGroupType.ts`
- `client/src/rs/config/gameval/impl/Interface.ts`

Cache GameVals improve discoverability but are not required for rendering or decoding.

If no friendly name exists, numeric IDs remain valid and visible.

## 4. OpenRune project metadata

The active `OpenRuneProjectSession` builds a unified project GameVal registry from:

- base `gamevals.dat`;
- generated `gamevals_generated.dat`;
- module/project `gamevals.toml`;
- `.data/gamevals/*.rscm`.

The registry preserves:

- effective symbol -> ID mappings;
- every contributing declaration;
- source path;
- source line where available;
- Gradle module provenance;
- duplicate/conflict diagnostics;
- base-ID reservation ceilings.

This is portable TypeScript work. It does not require the backend.

## 5. InterfaceMetadataSource

PR #68 added the framework-neutral metadata projection:

`client/src/interface/interface-metadata-source.ts`

It combines:

```text
selected-cache GameVals
        +
active OpenRune GameValRegistry
        |
        v
InterfaceMetadataSource
        |
        +-- interface friendly name
        +-- component symbolic name
        +-- numeric identity
        +-- source provenance
        +-- alternate symbols
        +-- conflict/mismatch diagnostics
```

The Svelte panels consume this projection rather than parsing RSCM/TOML directly.

### Authority rules

1. Numeric interface/component IDs are always retained.
2. Decoded widget type/structure remains cache authoritative.
3. Cache GameVal names are the closest labels to the selected cache.
4. OpenRune project symbols enrich names/provenance.
5. Project metadata may be shown even when it differs from the cache, but the mismatch must be diagnosed instead of silently redefining runtime identity.
6. Alternate/conflicting project symbols are retained rather than discarded.
7. Basic Cache mode works without project metadata.

## 6. Active-project lifecycle

`active-openrune-project-runtime.ts` owns the retained project session.

Important behavior:

- activating an OpenRune profile publishes its session/snapshot;
- refreshing the project advances the snapshot atomically;
- switching OpenRune roots clears the old visible runtime before the replacement is published;
- switching to Basic Cache clears the active OpenRune runtime;
- Interface metadata subscriptions rebuild from the new snapshot.

This prevents project A metadata from leaking into project B or into Basic Cache mode.

## 7. What the UI shows

The Interface list and component tree retain numeric IDs while showing symbolic names when available.

Component rows may show:

- numeric component ID;
- symbolic component name;
- decoded component type;
- metadata warning indicator;
- source/provenance information on hover.

Runtime-created dynamic widgets are not assigned static source metadata merely because they share a parent interface.

## 8. Backend role

The optional Kotlin backend may eventually add JVM/compiler-aware analysis that the portable project index cannot provide.

It must **not** be required for:

- interface selection;
- binary interface decoding;
- cache GameVal labels;
- project GameVal/RSCM metadata;
- CS2 object/enum lookups;
- ordinary source provenance.

Any future enrichment belongs behind the same framework-neutral metadata/domain seam.

Svelte must not directly call Ktor endpoints or parse arbitrary OpenRune project files.

## 9. Known follow-up work

The immediate cache-definition priority is:

1. continue the remaining lossy/missing-definition parity audit after PR #71 DBTable/DBRow/DBColumn support;
2. only then add optional JVM enrichment where it provides information the portable selected-cache runtime cannot.

For DB support, see the exact takeover notes in `DEVELOPER_HANDOFF.md`.

### Mock client state and CS2 simulation direction

A realistic Interface Editor does not require a full simulated game server for ordinary rendering. The server-originated inputs that affect client layout can be represented as explicit mock client state and events while interface structure, ClientScript2 bytecode, varbits, objects, enums, sprites, fonts and models continue to come from the selected cache.

The next Interface runtime milestone should therefore remain framework-neutral and add:

- one mock client state harness for varps/varbits, varcs, skills, inventories, social state, player/client flags and other script-visible state;
- event dispatch for on-load, var/inventory/stat transmit, timer, mouse-over/leave and other widget listeners;
- broader CS2 opcode coverage driven by real cache scripts, retaining correct int/string stack effects and runtime-created widget semantics;
- explicit Edit and Simulation modes so runtime-created components can be inspected without accidentally treating them as serializable cache definitions;
- a State Debugger panel that can change mock state and immediately retrigger the appropriate client hooks;
- an optional declarative mock network layer for testing button-to-state round trips without requiring OpenRune Server.

Keep this in TypeScript behind stable runtime interfaces first. Rust/WASM is appropriate later for measured hot paths such as large decode/layout/VM workloads, but it should not become a prerequisite for Interface correctness or Basic Cache operation.

Other Interface-specific follow-ups may include:

- provenance badges instead of hover-only provenance;
- Open source / Find references actions;
- source-aware Interface authoring when OpenRune has an authoritative source representation;
- additional CS2 opcode families as real previews encounter them.

## 10. Do not regress these invariants

Do not:

- require RSCM for cache-only Interface use;
- let GameVals own binary interface decoding;
- hide numeric IDs behind symbolic names;
- silently let project metadata override selected-cache runtime identity;
- parse project files directly in Svelte;
- reintroduce cache-proxy HTTP reads for local cache data;
- require the backend for ordinary Interface metadata;
- modify OpenRune Server to expose Studio-specific Interface endpoints.

When Interface editing becomes source-authoring, update authoritative OpenRune source through `ProjectFileSystem` and let OpenRune's existing build/pack workflow produce generated cache output.
