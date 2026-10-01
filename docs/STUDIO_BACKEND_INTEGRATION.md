# Studio Backend Integration

## Status

OpenRune Content Studio has a **separate optional Studio backend service** for capabilities that genuinely require or materially benefit from the OpenRune/JVM execution environment.

The default architecture is TypeScript-first. Normal cache loading, map editing, GameVal/RSCM parsing, project persistence, package export, and Tauri filesystem access must not require the backend.

See `docs/OPENRUNE_MAP_CACHE_ARCHITECTURE.md` for the detailed map/cache/GameVal ownership model.

The backend now lives in this repository under:

- `backend/Protocol`
- `backend/StudioService`

It was moved from the temporary `Neosback/rspsi` development repository. The monorepo `backend/` directory is now the canonical source. Do not dual-edit or re-import from `rspsi`; treat the old repository as historical reference only.

The Gradle root is named `OpenRuneContentStudioBackend`. Kotlin package/API identifiers remain stable during the move so repository relocation is not mixed with a protocol/package rename.

## OpenRune Server relationship

OpenRune Server is **not** the backend we develop from this repository.

OpenRune Server is:

- a compatibility target
- a reference implementation for OpenRune project structure, cache/build behavior, FileStore use, GameVals, content layout, and runtime semantics
- a project that the Studio backend should inspect and operate against through supported project files, build tasks, cache outputs, and stable OpenRune APIs/libraries

OpenRune Server is **not**:

- a repository Content Studio should modify as part of normal Studio development
- a place to add Studio-specific HTTP endpoints
- a required fork that Studio users must run
- the process the browser should directly control

The preferred relationship is:

```text
OpenRune Content Studio
        |
        +-- framework-neutral TypeScript domain services
        |      +-- cache/map codecs
        |      +-- ProjectFileSystem
        |      +-- GameVal/RSCM registry
        |      +-- OpenRune source adapters
        |
        +-- browser storage / downloads
        +-- browser File System Access (when available)
        +-- Tauri dialog + scoped filesystem
        |
        +-- optional StudioBackendClient
               |
               +-- exact OpenRune Gradle/build/test operations
               +-- OpenRune FileStore/JVM parity verification
               +-- JVM/compiler-aware analysis when truly needed
```

The backend may use independently available OpenRune libraries and inspect an OpenRune-compatible project, but Content Studio must work **without requiring Studio-specific modifications to OpenRune Server itself**.

### Hard compatibility invariant

Content Studio requires zero Studio-specific OpenRune Server changes.

The backend may:

- passively inspect a user-selected compatible checkout;
- read source, GameVals/RSCM data, and generated cache outputs;
- use independently available OpenRune/FileStore libraries;
- invoke existing allowlisted Gradle tasks on explicit user action;
- later update explicit user-owned content/config through Studio-owned write/publish workflows.

The backend must not:

- add Studio HTTP/API endpoints to OpenRune Server;
- require a custom OpenRune Server fork;
- require upstream accessors/hooks/modules solely for Studio;
- patch OpenRune framework/source code;
- install an in-server Studio agent;
- expose arbitrary Gradle/shell execution.

If a capability cannot be implemented externally, that capability degrades/remains unavailable until a compatible external approach exists.

## Current backend baseline

The backend under `backend/` already provides a useful foundation:

- neutral `Protocol` module
- Kotlin/JVM service
- Ktor HTTP server bound to loopback
- per-launch token authentication
- loopback Host and Origin validation
- opaque project sessions after an explicit project-open operation
- OpenRune project inspection
- LIVE/SERVER cache inspection through OpenRune FileStore
- Kotlin source/content indexing
- GameVal/RSCM-aware content inspection
- bounded Gradle task discovery
- bounded Gradle operation lifecycle with cancellation/status/events
- no arbitrary shell execution API
- ephemeral-port launch support with parent-supplied token input
- one machine-readable READY handshake after the listener is bound
- stable API/protocol/backend-process identity through `/api/v1/status`
- loopback-only browser CORS and OPTIONS/preflight handling

`backend/` is now the single source of truth.

The moved backend is validated in CI across:

- compile;
- Protocol tests;
- API/security tests;
- OpenRune inspection/indexing tests;
- Gradle/process-boundary tests;
- runnable StudioService distribution packaging.

The old monolithic `foundationGate` is retired as the canonical merge gate. The launch/discovery contract is now implemented; frontend client/transport integration is the next runtime boundary.

## Frontend boundary

Svelte components must not call backend URLs, Tauri filesystem APIs, or raw project files directly.

The intended layering is:

```text
Svelte UI
   |
framework-neutral TypeScript domain services
   +-- ProjectLifecycle / ProjectStore
   +-- CacheSource / WorldSource
   +-- ProjectFileSystem
   +-- GameValRegistry
   +-- OpenRune source adapters
   +-- MapCodec / WritableCacheTarget
   |
platform adapters
   +-- browser IndexedDB/download/import
   +-- browser File System Access (progressive enhancement)
   +-- Tauri dialog/filesystem
   +-- optional StudioBackendClient -> BackendTransport
```

The backend client is **not** the universal transport for OpenRune project access.

Use `StudioBackendClient` only for backend-only capabilities such as exact Gradle/OpenRune builds, tests, FileStore parity checks, or JVM-aware analysis. Ordinary Tauri project file reads/writes should go through a scoped `ProjectFileSystem` adapter.

This keeps Svelte, map rendering, editor history, persistence, codecs, and project metadata independent from Ktor, ports, tokens, or process management.

## Desktop/Tauri model

Tauri should provide direct local filesystem integration first.

The repository already includes the Tauri dialog and filesystem plugins. The normal desktop path should therefore be:

```text
User launches Content Studio
        |
        v
Svelte + TypeScript domain services
        |
        v
ProjectFileSystem (Tauri adapter)
        |
        +-- choose OpenRune project directory
        +-- read/write RSCM and TOML
        +-- read/write cache files
        +-- inspect project structure
        +-- optional file watch
```

No Kotlin backend is required for those operations.

### Lazy backend sidecar

A packaged backend may still be supervised by Tauri, but it should be started **on demand**, not as an application-start prerequisite.

Examples that may request the sidecar:

- Build OpenRune Project;
- run allowlisted Gradle tests/assemble;
- exact `:or-cache:buildCache`;
- OpenRune FileStore parity/output verification;
- JVM/compiler-aware analysis.

The existing ephemeral-port, per-launch-token, READY-handshake, and secure Tauri bridge design remains valid for those backend-only actions.

Tauri/Rust should not duplicate cache/map/GameVal domain logic. TypeScript owns portable semantics; Rust provides platform capability and optional backend lifecycle.

## Plain web model

The normal browser experience does **not** require a local backend.

Universal web mode supports:

- static/range cache loading;
- cache-folder import;
- IndexedDB cache profiles;
- local Studio projects;
- map/interface editing;
- GameVal/RSCM parsing implemented in TypeScript;
- region/package/cache-patch downloads.

Supporting browsers may additionally use the File System Access API for user-approved direct project directory reads/writes. This is progressive enhancement because support is not universal.

A backend connection is optional and explicit:

```text
Browser Content Studio
        |
        +-- local/browser capabilities (default)
        |
        +-- optional HttpBackendTransport
                |
                v
        already-running local Studio Backend
                |
                +-- Gradle/OpenRune build/test
                +-- JVM/FileStore verification
```

Do not require backend pairing merely to inspect RSCM/TOML or perform normal editing.

### Development/manual backend pairing

When a backend-only capability is requested, a developer/user may run the backend explicitly and connect through `HttpBackendTransport`.

The existing loopback-only CORS, token, Host, and Origin protections remain required.

## Connection discovery contract

The backend launch/connection contract is now established.

Supported backend launch inputs:

```text
--host 127.0.0.1
--port 0
--token <ephemeral-secret>
```

The ready handshake is emitted once through stdout after the HTTP listener is bound:

```json
{
  "protocolVersion": 1,
  "backendInstanceId": "generated-instance-id",
  "endpoint": "http://127.0.0.1:43127",
  "pid": 12345
}
```

The supplied token must **not** be echoed in the ready payload. The parent already owns it.

The backend does not require the frontend to scrape human-readable log output to discover its port.

For web/manual operation, an owner-readable session descriptor is acceptable, but the browser cannot read arbitrary local files directly. Desktop Tauri should prefer an inherited/stdio handshake.

## OpenRune compatibility

The Studio backend should detect capabilities from the opened project rather than assume one exact OpenRune commit.

Examples:

- Gradle wrapper present
- `:or-cache:buildCache` available
- LIVE/SERVER cache locations detected
- GameVal/RSCM layouts detected
- compatible FileStore/cache format
- supported source/content structure

The browser should consume returned capabilities rather than branch on OpenRune repository versions.

If OpenRune changes, adapt the separate backend compatibility layer first whenever possible. Do not push Studio-specific changes into OpenRune Server merely to preserve Content Studio integration.

## Backend authority

The backend is not the authority for portable Studio semantics.

Generated OpenRune caches are outputs, not automatically the authoritative source for every edit.

Preferred write lifecycle:

```text
Studio semantic edit
   -> versioned TypeScript edit/project contract
   -> local TypeScript validation
   -> authoritative source/config update when available
   -> explicit file apply/export
   -> optional backend OpenRune build
   -> optional output verification
```

Terrain/static-loc edits are special because current OpenRune raw map source covers NPC/Obj/Area data, not map-group terrain/loc files 0/1. For those edits, Studio project/Edit Format data remains authoritative until an explicit cache/package apply.

Direct generated-cache mutation should not silently become the fallback publication model.

## Local/offline behavior

The Studio frontend must continue to work without the backend for workflows that have local implementations.

Current local seams include:

- `IndexedDbProjectStore`
- `StaticRangeCacheSource`
- `IndexedDbProfileCacheSource`
- `BundledWorldSource`

Backend availability should unlock capabilities, not make the entire application fail to start.

## Near-term integration sequence

The next integration work should reduce backend dependence rather than expand it.

1. keep all existing local/offline behavior;
2. implement the TypeScript-first ownership documented in `OPENRUNE_MAP_CACHE_ARCHITECTURE.md`;
3. add `ProjectFileSystem` and a Tauri filesystem adapter;
4. add pure TypeScript RSCM/GameVal registry and OpenRune project metadata indexing;
5. add OpenRune NPC/Obj/Area TOML adapters;
6. add TypeScript terrain and static-loc encoders;
7. add region/package and cache-patch export;
8. add writable cache support when the codecs are stable;
9. narrow `StudioBackendClient` around optional native/JVM build and verification operations;
10. add `HttpBackendTransport` only for explicitly paired web backend use;
11. add lazy Tauri backend supervision only for backend-only actions;
12. keep OpenRune Server unchanged.

Do not prioritize backend-backed `ProjectStore`, `CacheSource`, or `WorldSource` merely because the backend can expose files. Prefer direct local implementations when the platform already has the necessary capability.

## Non-goals

- modifying OpenRune Server to turn it into the Studio backend;
- embedding game-server lifecycle into the Studio UI;
- allowing browser code to execute arbitrary Gradle/shell commands;
- duplicating the backend inside both Kotlin and Rust;
- making Tauri mandatory for the web application;
- requiring the backend for normal editing, cache access, GameVal/RSCM parsing, or Tauri filesystem integration;
- routing ordinary Tauri filesystem operations through Ktor;
- making the backend start automatically when no backend-only capability is requested.
