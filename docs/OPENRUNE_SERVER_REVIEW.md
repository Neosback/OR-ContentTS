# OpenRune Server reference review for Content Studio compatibility

Repository reviewed: `Neosback/OpenRune-Server`

> **Direction update:** this document records useful OpenRune technical findings. The active design is now TypeScript-first and backend-minimal. Read `OPENRUNE_MAP_CACHE_ARCHITECTURE.md` for the canonical ownership model and `STUDIO_BACKEND_INTEGRATION.md` for optional JVM/backend operations.

## Executive summary

OpenRune Server remains an important **compatibility and reference target** for Content Studio. It contains project/domain behavior the portable TypeScript layer and optional backend need to understand: a modular RSMod-derived engine, OpenRune FileStore/cache support, map decoding, collision/world construction, content modules, GameVals, and cache pack/build tooling.

Content Studio should operate against an ordinary compatible OpenRune project without requiring Studio-specific changes to OpenRune Server. Ordinary project/cache/source integration should be direct and TypeScript-first; the separate backend should be reserved for explicit OpenRune/JVM build and verification operations rather than becoming a universal file transport.

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

This makes OpenRune a useful parity/reference source, but it does **not** imply that the backend should own portable cache encoding. Studio terrain/static-loc encoding should be implemented in TypeScript.

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

### 1. Keep transport/platform concerns outside OpenRune Server

OpenRune Server should remain unchanged.

Normal integration should be:

```text
Content Studio TypeScript
  -> ProjectFileSystem
     -> browser import/download or File System Access
     -> Tauri filesystem

optional:
Content Studio
  -> StudioBackendClient
     -> exact OpenRune Gradle/FileStore/JVM operation
```

### 2. Keep Project/Edit Format parity portable

The frontend has:

- `openrune.project` v1;
- `openrune.edit-batch` v1;
- strict TypeScript decoders;
- golden fixtures.

TypeScript remains the authoritative implementation for normal editing. Backend tests may consume the same fixtures for parity when backend build/verification actions use these contracts.

### 3. Terrain write path needs a TypeScript semantic encoder

OpenRune's `MapTileByteEncoder` writes raw authored map bytes and explicitly does not decode/re-encode terrain.

Content Studio therefore needs a portable semantic terrain encoder for map-group file 0.

### 4. Static-loc write path needs a TypeScript encoder

The reviewed OpenRune tree exposes loc decoding but no matching `MapLocListEncoder` alongside NPC/ground-Obj encoders.

Content Studio needs its own portable static-loc map-group file-1 encoder.

This is separate from OpenRune `MapObjListEncoder`, which writes **ground item/Obj spawns** to file 6.

### 5. OpenRune raw map source has a narrower scope than the Map Editor

Current `.data/raw-cache/map` source covers:

- NPC spawns -> file 5;
- ground-item Obj spawns -> file 6;
- areas -> file 7.

It does not currently provide first-class raw TOML source for terrain file 0 or static-loc file 1.

Studio project/Edit Format state should remain authoritative for terrain/static-loc edits until an explicit encode/export/apply.

### 6. Project persistence remains separate from live/generated cache state

Recommended lifecycle:

1. open/create Studio project;
2. bind it to a base cache identity;
3. persist versioned edit batches;
4. validate locally;
5. prepare source/cache outputs;
6. apply/export explicitly;
7. optionally run OpenRune build/verification;
8. deploy separately.

## Recommended integration order

1. Keep the completed local frontend `ProjectLifecycle`, `ProjectStore`, `CacheSource`, and `WorldSource` seams stable.
2. Add `ProjectFileSystem` and direct Tauri filesystem integration.
3. Add optional browser File System Access with import/download fallback.
4. Implement TypeScript RSCM/GameVal registry and OpenRune project indexing.
5. Implement OpenRune NPC/ground-Obj/Area TOML adapters.
6. Implement TypeScript terrain file-0 and static-loc file-1 encoders.
7. Add region/package and cache-patch export.
8. Add writable cache support.
9. Narrow `StudioBackendClient` to explicit build/test/FileStore/JVM verification.
10. Keep OpenRune Server changes optional/upstream-friendly and never required for Studio compatibility.

## Security boundary

The separate Studio backend runs privileged JVM/build operations, so its existing filesystem/session security remains important even though ordinary project reads/writes should normally bypass it.

At minimum:

- bind local development service to loopback by default
- validate Host/Origin
- use a per-launch/session token for local privileged operations
- scope every path to an opened project root
- separate read-only cache serving from write/build endpoints
- make build/publish explicit operations

## Conclusion

OpenRune Server remains a valuable source of truth for OpenRune project/cache/content behavior, but it is neither the Content Studio backend nor a required runtime dependency.

Content Studio should implement portable cache/map/GameVal/source behavior in TypeScript and use direct platform filesystem adapters for OpenRune projects. The separate backend remains useful for explicit OpenRune Gradle/JVM build and verification operations.

No Studio-specific OpenRune Server patches are required.

For the active design, use `docs/OPENRUNE_MAP_CACHE_ARCHITECTURE.md` and `docs/STUDIO_BACKEND_INTEGRATION.md`.
