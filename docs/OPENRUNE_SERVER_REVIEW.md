# OpenRune Server review for Content Studio integration

Repository reviewed: `Neosback/OpenRune-Server`

## Executive summary

OpenRune Server is the correct backend target for Content Studio. It already contains the domain pieces the Studio should build on rather than duplicate: a modular RSMod-derived engine, OpenRune FileStore/cache support, map decoding, collision/world construction, content modules, and cache pack/build tooling.

The important gap is that OpenRune Server is currently a game server, not yet a Studio service. There is no dedicated Studio HTTP/API module in the reviewed tree. Integration should therefore add a narrow Studio-facing module instead of coupling the Svelte application directly to game bootstrap internals.

## Relevant architecture

The root Gradle build includes:

- `api`
- `content`
- `engine`
- `server`
- `or-cache`
- `example-plugin`
- developer tools

The server targets Java 21 and currently declares OSRS revision 240.

### Cache/FileStore layer

`or-cache` is the strongest integration point.

It already depends on OpenRune/OpenRS2 FileStore and definition libraries and provides:

- `ServerCacheManager` for decoded definitions
- `dev.openrune.filesystem.Cache`
- JS5/cache providers
- map square decoding
- map NPC/object/area codecs
- cache pack/build tasks
- gameval/RSCM tooling

This matches the Studio rule that the backend should own cache encoding and publishing.

### Map model

Useful existing types include:

- `GameMapDecoder`
- `MapTileDecoder`
- `MapLocDefinition`
- `MapNpcListEncoder`
- `MapObjListEncoder`
- `MapTileByteEncoder`
- `MapSquareKey`

`GameMapDecoder` also contains explicit bridge-plane normalization and feeds collision/spawn state, which makes it a useful source of truth for server-side map validation.

## Gaps to close before direct Studio persistence

### 1. No Studio transport/API surface yet

The reviewed server modules are game-service/engine oriented. I did not find a dedicated Studio HTTP service or project API.

Recommended direction:

```text
Content Studio
  -> OpenRuneStudioClient
     -> OpenRune Studio API/module
        -> Project service
        -> FileStore/cache service
        -> world/content service
```

Do not expose arbitrary server internals or filesystem paths directly.

### 2. Project Format/Edit Format parity does not exist yet

The frontend now has:

- `openrune.project` v1
- `openrune.edit-batch` v1
- strict TypeScript decoders
- golden fixtures

OpenRune should add Kotlin DTO/codec validation and consume the exact same golden fixtures before accepting writes.

### 3. Terrain write path needs a semantic encoder

The current `MapTileByteEncoder` writes raw authored map bytes. Its own comment says it does not decode/re-encode terrain before packing.

That does not yet satisfy the Studio contract, where the browser sends semantic tile mutations and the backend is responsible for encoding them. OpenRune needs a semantic terrain mutation/apply layer before Studio terrain publishing is enabled.

### 4. Loc write path needs completion

The reviewed tree has `MapLocDefinition` and a loc decoder, but no matching `MapLocListEncoder` was present alongside the NPC/object list encoders.

Because Edit Format v1 includes semantic loc placement edits, OpenRune needs an authoritative loc list encoder/apply path before map-object edits can be published to cache.

### 5. Project persistence should be separate from live game state

Studio projects should not mutate the running world/cache on every editor action.

Recommended lifecycle:

1. open/create project
2. bind project to a base cache fingerprint/revision
3. persist versioned edit batches
4. validate edits against OpenRune definitions/map rules
5. build into an isolated output cache/project
6. publish explicitly
7. reload/deploy separately

This preserves Undo/Redo semantics on the frontend and keeps production cache changes explicit.

## Recommended integration order

1. Finish the local frontend `ProjectLifecycle` service.
2. Add Kotlin parity tests for Project Format v1 and Edit Format v1 in OpenRune Server.
3. Add an OpenRune Studio module with loopback-safe project/cache endpoints.
4. Implement an `OpenRuneProjectStore` adapter in the frontend.
5. Add `CacheSource` and `WorldSource` implementations backed by OpenRune.
6. Add semantic terrain + loc application/encoding on the backend.
7. Add validate/build/publish operations.
8. Only then make OpenRune-backed projects the default workflow.

## Security boundary

A Studio backend will eventually read/write projects and build caches, so it should not accept arbitrary filesystem paths from browser requests.

At minimum:

- bind local development service to loopback by default
- validate Host/Origin
- use a per-launch/session token for local privileged operations
- scope every path to an opened project root
- separate read-only cache serving from write/build endpoints
- make build/publish explicit operations

## Conclusion

OpenRune Server already has the right engine and FileStore foundation. The work should focus on a small Studio service layer and missing semantic map encoders, not on porting the removed TypeScript server or duplicating OpenRune's game/content systems inside Content Studio.
