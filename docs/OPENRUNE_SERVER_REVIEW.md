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

This makes OpenRune a useful parity/reference source. Studio terrain/static-loc encoding should remain portable in TypeScript, while OpenRune-project publication should reuse OpenRune-FileStore `PackMaps` rather than making a custom JS5 writer the primary path.

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

### 2. Use OpenRune-owned source first

When OpenRune has an authoritative source representation, Studio should edit it and let OpenRune pack the output.

Examples:

- pack config TOML -> `PackConfig`;
- module `gamevals.toml` / RSCM -> GameVal pipeline;
- server TOML -> `PackServerConfig`;
- map NPC TOML -> file 5;
- map ground-Obj TOML -> file 6;
- map area TOML -> file 7.

Generated LIVE/SERVER caches should not replace those source files as the authoring model.

### 3. Terrain/static-loc editing remains portable

Content Studio still needs portable semantic encoders for map-group file 0 terrain and file 1 static locs so plain web/offline workflows can export useful results.

### 4. OpenRune-FileStore already has the cache publisher

The upstream FileStore tooling includes `PackMaps`.

For revision 237+, it writes:

- terrain/raw tile bytes -> map-group file 0;
- loc bytes -> map-group file 1.

It accepts paired raw `lX_Y/mX_Y` files and RSPSi-style `.pack` files.

Therefore OpenRune-project publication does not need a Studio-owned DAT2 writer as its first implementation.

### 5. OpenRune Server does not currently register PackMaps

The current OpenRune Server LIVE pack-task list does not add `PackMaps`.

Studio should not patch OpenRune Server to fix that.

Instead, the optional Studio backend can run a bounded FileStore map-publication operation against LIVE.

### 6. PackMaps and PackWorldMap should run together

`PackMaps` records changed squares through the in-memory `PackedMapSquares` set.

`PackWorldMap` consumes that set to rebuild affected world-map areas.

Run them in the same operation or deliberately request a full world-map rebuild.

### 7. LIVE and SERVER have a parent/derivative relationship

SERVER is reseeded from LIVE by OpenRune-FileStore and then augmented by server-specific packers. Treat SERVER as generated derivative output, not an independent authoring tree.

## Recommended integration order

The original local-foundation steps are now implemented: ProjectFileSystem/Tauri/browser access, unified GameVal/RSCM indexing, OpenRune source adapters, retained project sessions, Interface metadata, and core rev-240 NPC/Obj/Param parity.

Continue with:

1. The remaining decoder-lossiness/missing-type parity audit after PR #71 DBTable/DBRow/DBColumn decoding.
2. TypeScript terrain file-0 and static-loc file-1 encoders with golden round-trip fixtures.
3. Portable raw/region package export.
4. A narrow `StudioBackendClient` bridge for explicit allowlisted OpenRune build/test/verification operations.
5. Bounded `PackMaps + PackWorldMap` publication into LIVE.
6. Explicit OpenRune cache build when SERVER output is requested.
7. Defer generic writable JS5/DAT2 support until a standalone use case proves it necessary.
8. Keep OpenRune Server unchanged and external/reference-only.

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

OpenRune Server remains a valuable source of truth for project/source/cache behavior, but it is neither the Content Studio backend nor a required runtime dependency.

The preferred model is:

```text
OpenRune-owned source
  -> Studio source-aware edit
  -> OpenRune build
  -> LIVE
  -> SERVER derived from LIVE
```

For terrain/static-loc placement, Studio keeps portable semantic state and TypeScript encoders, then reuses OpenRune-FileStore `PackMaps + PackWorldMap` for OpenRune-project publication.

No Studio-specific OpenRune Server patches are required.

For the active design, use `docs/OPENRUNE_MAP_CACHE_ARCHITECTURE.md` and `docs/STUDIO_BACKEND_INTEGRATION.md`.
