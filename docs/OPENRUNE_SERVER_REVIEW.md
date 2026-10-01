# OpenRune Server reference review for Content Studio compatibility

Repository reviewed: `Neosback/OpenRune-Server`

> **Direction update:** this document records useful OpenRune technical findings, but OpenRune Server is no longer the repository where Content Studio backend features should be implemented. The Studio backend is a separate local service. See `STUDIO_BACKEND_INTEGRATION.md`.

## Executive summary

OpenRune Server remains an important **compatibility and reference target** for Content Studio. It contains the project/domain pieces the separate Studio backend needs to understand: a modular RSMod-derived engine, OpenRune FileStore/cache support, map decoding, collision/world construction, content modules, GameVals, and cache pack/build tooling.

Content Studio should attempt to operate against an ordinary compatible OpenRune project without requiring Studio-specific changes to OpenRune Server. The separate Studio backend should adapt to OpenRune project structure, supported libraries, source files, Gradle tasks, and generated outputs rather than adding a Studio HTTP service inside the game server.

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

### 1. Studio transport belongs outside OpenRune Server

The reviewed server modules are game-service/engine oriented. That is now treated as the desired separation, not a gap to fill inside OpenRune Server.

Recommended direction:

```text
Content Studio
  -> StudioBackendClient
     -> separate Studio Backend Service
        -> project/source services
        -> FileStore/cache services
        -> bounded Gradle/build services
        -> compatible OpenRune project
```

Do not expose arbitrary server internals or filesystem paths directly, and do not add Studio-only HTTP endpoints to OpenRune Server as the default integration strategy.

### 2. Project Format/Edit Format parity belongs in the Studio backend

The frontend has:

- `openrune.project` v1
- `openrune.edit-batch` v1
- strict TypeScript decoders
- golden fixtures

The separate Kotlin Studio backend should consume the same golden fixtures and keep protocol parity before accepting writes. This parity should not require OpenRune Server to own the Studio contract.

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

1. Keep the completed local frontend `ProjectLifecycle`, `ProjectStore`, `CacheSource`, and `WorldSource` seams stable.
2. Finalize and move the separate Studio backend currently developed under the temporary `Neosback/rspsi` home.
3. Keep Kotlin parity tests for Project Format v1 and Edit Format v1 in that backend.
4. Add a framework-neutral `StudioBackendClient` plus web/Tauri transports in Content Studio.
5. Implement an `OpenRuneProjectStore` adapter through the Studio backend.
6. Add backend-backed OpenRune `CacheSource` and `WorldSource` adapters.
7. Add semantic terrain + loc application/encoding in the Studio backend using supported OpenRune/FileStore semantics.
8. Add explicit validate/build/publish operations.
9. Keep OpenRune Server changes optional and upstream-friendly rather than required for Studio compatibility.

## Security boundary

The separate Studio backend will read/write projects and run bounded build operations, so it should not expose arbitrary filesystem access after a project session is opened.

At minimum:

- bind local development service to loopback by default
- validate Host/Origin
- use a per-launch/session token for local privileged operations
- scope every path to an opened project root
- separate read-only cache serving from write/build endpoints
- make build/publish explicit operations

## Conclusion

OpenRune Server remains a valuable source of truth for OpenRune project/cache/content behavior, but it is **not** the Content Studio backend implementation target.

Content Studio should integrate through the separate Studio backend, which adapts to ordinary OpenRune projects using supported project files, OpenRune/FileStore libraries, source conventions, and bounded Gradle operations. Avoid requiring Studio-specific OpenRune Server patches.

For the active integration and Tauri/web lifecycle design, use `docs/STUDIO_BACKEND_INTEGRATION.md`.
