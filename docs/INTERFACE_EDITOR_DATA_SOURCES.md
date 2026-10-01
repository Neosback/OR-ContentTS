# Interface Editor data sources

## Purpose

This document records where the Interface Editor gets its data today, what GameVals are doing, and how the Studio backend can enrich the editor with OpenRune project metadata without making OpenRune Server part of the editor runtime.

The key rule is:

> Interface structure comes from the selected cache. Symbolic names and source provenance may enrich that structure, but must not silently replace cache-authoritative identities.

## Current frontend data path

The Interface Editor currently opens the active Studio cache through:

```text
active cache profile
    -> resolveActiveProfileCache(...)
    -> InterfaceViewer
       -> CacheSystem
       -> cache index 3
       -> ComponentDecoder
       -> decoded interface/component data
```

Primary files:

- `client/src/ui/interface/InterfaceEditorScreen.svelte`
- `client/src/interface/InterfaceViewer.ts`
- `client/src/rs/config/components/ComponentDecoder.ts`
- `client/src/ui/interface/interface-editor-state.svelte.ts`

### Cache index 3: authoritative interface structure

`ComponentDecoder` reads interface groups and component files directly from cache index 3.

That data drives:

- interface/component ids;
- component types;
- position and size;
- parent/layer relationships;
- text;
- sprites and models referenced by components;
- colors and visibility;
- legacy/IF3 detection;
- CS1 instructions;
- IF3 hooks/events;
- component operations.

The Interface Editor does not require GameVals to decode this structure.

### Other cache-backed data

`InterfaceViewer` also prepares:

- sprites from the DAT2 sprite index;
- client scripts from the DAT2 client-script index;
- varbit definitions through the cache varbit loader.

These support preview/runtime behavior independently from GameVals.

## Current GameVal usage

GameVals are read from cache index 24 when that index exists.

Primary files:

- `client/src/rs/config/gameval/GameVals.ts`
- `client/src/rs/config/gameval/GameValGroupType.ts`
- `client/src/rs/config/gameval/impl/Interface.ts`

For interfaces, the relevant GameVal groups are:

- `IFTYPES` (group 13);
- `IFTYPES_V2` (group 14 for newer revisions).

The decoder supports both interface names and component names.

### What the Interface Editor uses today

`InterfaceEditorState.buildEntries()` loads the interface GameVal group and uses it to turn a numeric interface id into a friendly interface name.

Conceptually:

```text
548 -> "some_interface_name"
```

If no GameVal name is available, the editor falls back to:

```text
Interface 548
```

So GameVals currently improve discoverability, but they are not required for decoding or rendering an interface.

### What is available but not used yet

The cache GameVal representation also exposes named child/interface components.

The current component tree does not use those names. It primarily shows:

- numeric component id;
- generic decoded component type such as Container, Text, Sprite, Model, etc.

A useful local-only improvement is therefore already available without the backend:

```text
before:
12  Text

after:
12  logout_button  · Text
```

The numeric id should remain visible because it is the stable cache identity.

### ComponentDecoder cleanup candidate

`ComponentDecoder` currently receives a `GameVals` instance, but its present decode implementation does not use that field.

That constructor dependency is legacy/dead coupling at the moment. It can be removed in a focused cleanup once tests confirm no compatibility behavior relies on it.

It should not be expanded merely to make GameVals responsible for binary interface decoding.

## OpenRune project metadata

Two OpenRune project sources are useful to the Interface Editor. The existing Studio backend already indexes them, but normal web/Tauri integration should also index them in portable TypeScript through the project-filesystem layer:

### 1. Source GameVals

The backend scans:

```text
content/**/src/main/resources/gamevals.toml
```

and records:

- namespace;
- symbolic name;
- numeric id;
- qualified name;
- source path;
- owning content module.

This is valuable because it provides source provenance, not just a display label.

### 2. Generated RSCM mappings

The backend also scans:

```text
.data/gamevals/*.rscm
```

Each RSCM filename becomes the namespace and each entry contributes a symbolic name -> numeric id mapping.

The backend records these as `generated-rscm` entries.

Primary backend files:

- `backend/StudioService/src/main/kotlin/com/openrune/studio/service/openrune/OpenRuneContentIndexer.kt`
- `backend/StudioService/src/main/kotlin/com/openrune/studio/service/openrune/OpenRuneContentResolver.kt`
- `backend/StudioService/src/main/kotlin/com/openrune/studio/service/project/ProjectIndexService.kt`

Existing API capabilities include:

- project content indexing;
- symbolic content resolution;
- source indexing;
- explicit index refresh.

No OpenRune Server modification is required.

## Recommended authority model

The Interface Editor should distinguish four kinds of information.

| Data | Preferred authority | Why |
| --- | --- | --- |
| Interface/component structure | selected cache index 3 | exact data being rendered |
| Interface/component cache labels | selected cache index 24 GameVals | best match for the exact cache revision |
| OpenRune project symbolic identity | RSCM / `gamevals.toml` through TypeScript project index | project-aware symbol mapping |
| Source provenance/navigation | `gamevals.toml` + portable source search; optional JVM analysis | knows module/path/references without making backend mandatory |

### Precedence rule

For labels attached to the currently loaded cache:

1. use cache GameVals when available;
2. enrich with matching OpenRune project symbols/provenance;
3. fall back to numeric ids.

Do not blindly let a connected OpenRune project rename the active cache's interfaces/components unless the mapping is known to refer to the same id/revision/content identity.

A project checkout and a browser-loaded cache can be out of sync.

## Recommended frontend seam

Do not put filesystem, backend, or RSCM parsing logic directly into Svelte panels.

Introduce a framework-neutral metadata seam when implementation begins, for example:

```ts
interface InterfaceMetadataSource {
    getInterface(id: number): Promise<InterfaceMetadata | undefined>;
    getComponent(interfaceId: number, componentId: number): Promise<ComponentMetadata | undefined>;
}
```

A metadata result should be able to carry more than a string:

```ts
interface InterfaceMetadata {
    id: number;
    cacheName?: string;
    projectSymbols?: ProjectSymbol[];
}

interface ProjectSymbol {
    namespace: string;
    name: string;
    qualifiedName: string;
    sourceType: "plugin-toml" | "generated-rscm";
    sourcePath?: string;
    modulePath?: string;
}
```

Exact naming can change. Preserve the separation of concerns.

Potential implementations:

- `CacheGameValInterfaceMetadataSource`
- `OpenRuneProjectInterfaceMetadataSource` backed by the TypeScript GameVal/project index;
- an optional JVM enrichment source if a future feature needs compiler-aware data;
- a small composite source that merges them under the authority rules above.

The Interface Editor should still work when only the cache-backed implementation is available.

## Portable project-index improvements

The main missing piece is a frontend-friendly, id-oriented query shape in the TypeScript GameVal/project index.

### A. Add id-oriented GameVal lookup

The Interface Editor normally starts from numeric cache identities.

The portable registry should support bounded lookup by:

- namespace + id;
- optionally namespace + name;
- source type;
- module.

This avoids requiring a backend connection merely to label one editor panel.

### B. Preserve provenance in lookup results

For each match, retain:

- numeric id;
- namespace;
- symbolic name;
- source type;
- source path;
- module path;
- whether the result came from source TOML, generated RSCM, or loaded-cache GameVals.

This enables:

- symbolic labels;
- source badges;
- Open source;
- Find references;
- alias display;
- conflict diagnostics;
- explanation of why a name was chosen.

### C. Reconcile source TOML and generated RSCM

Do not collapse source TOML and generated RSCM into one anonymous map too early.

Useful states include:

- TOML + RSCM agree;
- source declaration exists but generated RSCM is missing/stale;
- generated RSCM exists without a source declaration;
- multiple symbols map to the same id;
- one symbol maps to conflicting ids.

Those are useful Content Studio diagnostics and can be derived in TypeScript.

### D. Associate metadata with project/cache identity

When a local OpenRune checkout is connected through `ProjectFileSystem`, the Studio can compare:

- project root identity/fingerprint;
- LIVE/SERVER cache identity when available;
- selected frontend cache identity;
- project index generation/fingerprint.

Only then should project symbols be treated as trusted enrichment for the active cache.

The optional backend may provide additional FileStore/JVM verification, but project metadata should not require it.

## Interface Editor improvements enabled by this model

### Near term, frontend-only

1. Show cache GameVal component names in the component tree.
2. Include both symbolic name and numeric id in search.
3. Keep component type visible as secondary information.
4. Remove the unused `ComponentDecoder -> GameVals` constructor dependency if tests confirm it is dead.

### After ProjectFileSystem / GameValRegistry

1. Add an `InterfaceMetadataSource` project adapter.
2. Query project RSCM/TOML symbols for selected interfaces/components.
3. Show provenance badges such as `cache`, `RSCM`, or `source`.
4. Add "Open source" / "Find references" actions when source provenance exists.
5. Surface symbol conflicts/stale generated mappings as diagnostics rather than guessing.
6. Allow search by project symbol as well as numeric id/cache name.
7. Add optional backend/JVM enrichment only if it provides analysis the portable source index cannot.

### Later editing/publish work

If the Interface Editor becomes a source editor rather than only a cache/interface editor, edits should target authoritative OpenRune interface/pack/GameVal sources through `ProjectFileSystem` and let OpenRune's existing packers produce LIVE/SERVER outputs.

Do not directly rewrite generated RSCM as the default source-authoring workflow unless OpenRune defines that generated file as authoritative for the specific operation.

Preferred direction:

```text
Interface Editor semantic change
    -> Studio domain contract
    -> TypeScript validation
    -> authoritative OpenRune interface/pack/GameVal source through ProjectFileSystem
    -> explicit OpenRune build when publication is requested
    -> generated LIVE
    -> derived SERVER when relevant
    -> optional output verification
```

## Non-goals

- making GameVals responsible for decoding interface binary structure;
- requiring RSCM files for offline/browser Interface Editor use;
- making Svelte components parse arbitrary OpenRune project files directly;
- requiring the backend for ordinary RSCM/TOML project metadata;
- modifying OpenRune Server to expose Interface Editor endpoints;
- allowing project metadata from a mismatched checkout to silently override loaded-cache identities.

## Practical next implementation slice

The recommended order is:

1. use existing cache GameVal child names locally in the component tree;
2. implement the shared TypeScript `GameValRegistry` / OpenRune project index;
3. define the framework-neutral `InterfaceMetadataSource` contract;
4. implement `OpenRuneProjectInterfaceMetadataSource` on top of the portable project index;
5. merge cache and project metadata with explicit provenance and conflict handling;
6. add source navigation/reference tooling;
7. add optional JVM/backend enrichment only where it materially improves the result.

This produces immediate UI value while preserving offline behavior and the zero-required-OpenRune-changes invariant.
