# Studio Backend Integration

## Status

OpenRune Content Studio will use a **separate local Studio backend service** for capabilities that a browser alone cannot safely or practically provide.

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
        | stable frontend service interfaces
        v
Studio Backend Client
        |
        | versioned local protocol
        v
Studio Backend Service
        |
        +-- project/source inspection
        +-- OpenRune FileStore/cache inspection
        +-- bounded Gradle operations
        +-- source/content indexing
        +-- project persistence/publication
        |
        v
User's OpenRune project checkout
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

Svelte components must not call backend URLs directly.

The intended client layering is:

```text
Svelte UI
   |
ProjectLifecycle / CacheSource / WorldSource / future services
   |
framework-neutral StudioBackendClient
   |
BackendTransport
   +-- HttpBackendTransport      (plain web)
   +-- TauriBackendTransport     (desktop)
```

The transport layer owns connection/authentication mechanics. Domain adapters own semantics.

Examples:

- `OpenRuneProjectStore` implements `ProjectStore`
- `OpenRuneCacheSource` implements `CacheSource`
- `OpenRuneWorldSource` implements `WorldSource`
- future source/content/build services consume the same `StudioBackendClient`

This keeps Svelte, map rendering, editor history, and persistence contracts independent from Ktor, Tauri, ports, tokens, or process management.

## Desktop/Tauri model

Tauri is the best place to make the backend feel like part of one desktop application.

Tauri should be a **process supervisor and secure bridge**, not a second backend implementation.

Target desktop startup:

```text
User launches Content Studio
        |
        v
Tauri Rust shell
        |
        +-- locate packaged Studio Backend sidecar
        +-- start backend as a child process
        +-- request ephemeral port
        +-- generate/pass per-launch secret
        +-- wait for ready handshake
        +-- retain process handle and secret
        |
        v
Svelte UI starts
        |
        v
TauriBackendTransport
        |
        v
Studio Backend Service
```

### Recommended Tauri responsibilities

The Rust shell should eventually:

1. start one backend process per Studio desktop application instance;
2. request an ephemeral loopback port rather than assuming a fixed port;
3. create or pass a cryptographically random per-launch token;
4. wait for a bounded startup/health handshake;
5. retain the token in Rust process state when practical;
6. terminate the backend child during clean application shutdown;
7. detect an unexpected backend exit and expose a recoverable disconnected state;
8. optionally restart the backend only through explicit lifecycle policy;
9. never expose arbitrary process execution to the webview.

### Tauri transport

Preferred security model:

```text
Svelte
  -> Tauri invoke
     -> Rust backend bridge
        -> localhost backend HTTP/SSE
```

This allows Rust to retain the backend token instead of handing a privileged secret to arbitrary frontend code.

A direct webview-to-localhost transport can still exist as a development fallback, but the packaged desktop application should prefer the Tauri bridge.

### Packaging

The backend should ultimately be delivered as a Tauri sidecar or equivalent bundled companion executable.

Preferred packaging order:

1. produce a platform-specific backend launcher/binary artifact;
2. bundle that artifact with Tauri;
3. let Tauri own its lifecycle;
4. do not require a separately installed system Java if practical.

A JVM distribution with an embedded runtime is acceptable. A native image is optional and should be chosen only if compatibility and build complexity remain acceptable.

Do not rewrite the Kotlin backend in Rust merely because Tauri uses Rust.

## Plain web model

A normal browser **cannot launch a local native/JVM process**.

Therefore the web build cannot honestly provide the same automatic startup behavior as Tauri without an installed helper.

Target web flow:

```text
Browser Content Studio
        |
        v
HttpBackendTransport
        |
        v
already-running local Studio Backend
        |
        v
OpenRune project
```

Possible launch experiences:

### Development

The developer explicitly runs the backend service and the Vite Studio.

The frontend connects through `HttpBackendTransport` to a configured loopback endpoint/token.

The backend now provides loopback-only CORS and `OPTIONS` preflight handling for authenticated custom-header requests. Normal API calls still require the session token, and non-loopback Host/Origin values remain rejected.

### Installed local backend helper

A future installer may provide a small local backend launcher/daemon. The browser can detect and pair with it over loopback.

This helper must remain authenticated and loopback-scoped.

### Manual pairing fallback

If automatic discovery is unavailable, the user may explicitly provide connection information generated by the backend launcher.

Do not create an unauthenticated localhost control endpoint merely to avoid pairing.

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

Generated OpenRune caches are outputs, not automatically the authoritative source for every edit.

Preferred write lifecycle:

```text
Studio semantic edit
   -> versioned edit/project contract
   -> backend validation
   -> authoritative source/config update when available
   -> explicit build
   -> output verification
   -> explicit publish/deploy
```

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

Now that the backend has moved into the monorepo:

1. keep Content Studio local/offline services working;
2. keep backend-facing TypeScript interfaces transport-neutral;
3. do not modify OpenRune Server for Studio integration;
4. validate `backend/` independently in CI;
5. keep the implemented launch/connection contract stable: port `0`, parent-supplied token, machine-readable ready handshake, stable status/protocol identity, and loopback CORS/preflight;
6. add a framework-neutral `StudioBackendClient` and `BackendTransport` contract;
7. add `HttpBackendTransport` for browser/development use;
8. finalize backend sidecar packaging and add the Tauri process supervisor;
9. add `TauriBackendTransport`;
10. implement `OpenRuneProjectStore`, `OpenRuneCacheSource`, and `OpenRuneWorldSource` against that client as backend capabilities become available;
11. add build/publish workflows only after source authority and output verification are explicit.

## Non-goals

- modifying OpenRune Server to turn it into the Studio backend;
- embedding game-server lifecycle into the Studio UI;
- allowing browser code to execute arbitrary Gradle/shell commands;
- duplicating the backend inside both Kotlin and Rust;
- making Tauri mandatory for the web application;
- requiring the backend for existing offline editing.
