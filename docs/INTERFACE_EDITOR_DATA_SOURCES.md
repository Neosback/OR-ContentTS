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

## OpenRune backend metadata

The Studio backend already indexes two useful OpenRune project sources:

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
| OpenRune project symbolic identity | RSCM / `gamevals.toml` through Studio backend | project-aware symbol mapping |
| Source provenance/navigation | `gamevals.toml` + Kotlin source index | knows module/path/handlers/references |

### Precedence rule

For labels attached to the currently loaded cache:

1. use cache GameVals when available;
2. enrich with matching backend project symbols/provenance;
3. fall back to numeric ids.

Do not blindly let a connected OpenRune project rename the active cache's interfaces/components unless the mapping is known to refer to the same id/revision/content identity.

A project checkout and a browser-loaded cache can be out of sync.

## Recommended frontend seam

Do not put backend/RSCM logic directly into Svelte panels.

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
- `OpenRuneProjectInterfaceMetadataSource`
- a small composite source that merges them under the authority rules above.

The Interface Editor should still work when only the cache-backed implementation is available.

## Backend improvements that would help the Interface Editor

The backend already has most of the raw information. The missing piece is a frontend-friendly query shape.

### A. Add id-oriented GameVal lookup

Today the backend's strongest resolver starts from a qualified symbol such as:

```text
content.rock
```

The Interface Editor normally starts from numeric cache identities.

A useful backend capability would support bounded lookup by:

- namespace + id;
- optionally namespace + name;
- source type;
- module.

That avoids transferring/re-indexing the complete project GameVal set merely to label one editor panel.

This should remain a neutral Studio-backend endpoint/service and must not require an OpenRune Server endpoint.

### B. Preserve provenance in lookup results

For each match, return:

- numeric id;
- namespace;
- symbolic name;
- source type;
- source path;
- module path;
- whether the result came from source TOML or generated RSCM.

This enables UI actions such as:

- show symbolic name;
- show source badge;
- jump to source;
- show all aliases for one id;
- detect conflicting symbols;
- explain why a name was chosen.

### C. Reconcile source TOML and generated RSCM

The backend currently retains both forms as separate entries, which is good.

Future resolution should not collapse them too early.

Useful states include:

- TOML + RSCM agree;
- source declaration exists but generated RSCM is missing/stale;
- generated RSCM exists without a source declaration;
- multiple symbols map to the same id;
- one symbol maps to conflicting ids.

Those states are valuable diagnostics for a content studio.

### D. Associate metadata with the opened project/cache identity

When backend-backed cache access is implemented, the Studio can compare:

- opened project identity;
- LIVE/SERVER cache identity;
- selected frontend cache identity;
- project index fingerprint/generation.

Only then should project symbols be treated as trusted enrichment for the active cache.

Until that relationship exists, project metadata should be presented as project metadata, not silently treated as cache truth.

## Interface Editor improvements enabled by this model

### Near term, frontend-only

1. Show cache GameVal component names in the component tree.
2. Include both symbolic name and numeric id in search.
3. Keep component type visible as secondary information.
4. Remove the unused `ComponentDecoder -> GameVals` constructor dependency if tests confirm it is dead.

### After StudioBackendClient / BackendTransport

1. Add an `InterfaceMetadataSource` backend adapter.
2. Query project RSCM/TOML symbols for selected interfaces/components.
3. Show provenance badges such as `cache`, `RSCM`, or `source`.
4. Add "Open source" / "Find references" actions when source provenance exists.
5. Surface symbol conflicts/stale generated mappings as diagnostics rather than guessing.
6. Allow search by project symbol as well as numeric id/cache name.

### Later editing/publish work

If the Interface Editor becomes a source editor rather than only a cache/interface editor, edits should target authoritative project sources through the Studio backend.

Do not directly rewrite generated RSCM as the default source-authoring workflow unless OpenRune defines that generated file as authoritative for the specific operation.

Preferred direction:

```text
Interface Editor semantic change
    -> Studio domain contract
    -> backend validation
    -> authoritative project source/config
    -> explicit OpenRune cache build
    -> output verification
```

## Non-goals

- making GameVals responsible for decoding interface binary structure;
- requiring RSCM files for offline/browser Interface Editor use;
- making the frontend parse arbitrary OpenRune project files directly;
- modifying OpenRune Server to expose Interface Editor endpoints;
- allowing project metadata from a mismatched checkout to silently override loaded-cache identities.

## Practical next implementation slice

After the backend transport/client boundary exists, the recommended order is:

1. use existing cache GameVal child names locally in the component tree;
2. define the framework-neutral `InterfaceMetadataSource` contract;
3. add backend id-oriented GameVal lookup with provenance;
4. implement `OpenRuneProjectInterfaceMetadataSource`;
5. merge cache and project metadata with explicit provenance and conflict handling;
6. add source navigation/reference tooling.

This produces immediate UI value while preserving offline behavior and the zero-required-OpenRune-changes invariant.
