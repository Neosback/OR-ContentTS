# Generated cache handling

OpenRune Content Studio Backend is not a general cache or map editor.

The backend exists to execute bounded OpenRune/JVM operations that are better delegated to the exact OpenRune toolchain.

## Cache authority

OpenRune project's:

```text
.data/cache/LIVE
.data/cache/SERVER
```

are generated outputs.

Studio should edit authoritative OpenRune source when a supported source representation exists, then let OpenRune rebuild the cache.

Examples:

- pack `configs/*.toml` -> `PackConfig`;
- module `gamevals.toml` / RSCM -> GameVal pipeline;
- server TOML -> `PackServerConfig`;
- map NPC TOML -> file 5;
- map ground-Obj TOML -> file 6;
- area TOML -> file 7.

## LIVE and SERVER

LIVE is the full/base cache.

SERVER is not built independently. OpenRune-FileStore reseeds SERVER from LIVE, optionally rebuilding compactly while leaving configured client-heavy indices empty, then runs server-oriented pack tasks.

Therefore:

```text
base/project sources
  -> LIVE
  -> SERVER seed from LIVE
  -> server config + NPC/Obj/Area map overlays
  -> SERVER
```

Studio should never make direct SERVER mutation the normal authoring model.

## Terrain/static-loc publication

OpenRune Server does not currently expose TOML sources for modern map-group file 0 terrain or file 1 static-loc placement.

OpenRune-FileStore already provides `PackMaps`, which accepts raw `lX_Y/mX_Y` files and RSPSi-style `.pack` files and writes file 0/1 for revision 237+.

The current OpenRune Server LIVE build task list does not register `PackMaps`.

The planned backend solution is one bounded publication operation that:

1. receives validated Studio terrain/loc payloads for an opened project;
2. invokes OpenRune-FileStore `PackMaps` against LIVE;
3. invokes `PackWorldMap` in the same JVM/cache-tool operation so changed-square state is preserved;
4. verifies the resulting LIVE map groups;
5. leaves the normal OpenRune `:or-cache:buildCache` operation to derive/update SERVER when explicitly requested.

This reuses OpenRune's cache implementation without requiring OpenRune Server modifications.

## Inspection and verification

The backend may inspect archive/index structure, report revision metadata, fingerprint outputs, compare before/after build state, and verify publication results through OpenRune FileStore.

A generic direct JS5/DAT2 writer is not a near-term backend requirement.

Studio should not silently patch generated caches as a fallback editing strategy.
