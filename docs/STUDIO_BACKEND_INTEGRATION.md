# Studio Backend Integration

## Status

OpenRune Content Studio will use a **separate local Studio backend service** for capabilities that a browser alone cannot safely or practically provide.

That backend is currently being developed separately. Its temporary development home is:

- `Neosback/rspsi`
- current modules: `Protocol` and `StudioService`
- the repository/module names are temporary and are **not** the final product name

Do not copy or fork that backend into this repository while its permanent home and packaging are still being decided. When the backend is formally moved, Content Studio should integrate with the moved service rather than maintain a duplicate implementation.

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

The backend may use OpenRune libraries and may inspect an OpenRune Server project, but Content Studio should attempt to work with an ordinary compatible OpenRune project **without requiring modifications to OpenRune Server itself**.

## Current backend baseline

The temporary backend in `Neosback/rspsi` already demonstrates a useful foundation:

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

This is mature enough to guide Content Studio integration design, but it should remain single-source until its permanent repository, name, packaging, and launch contract are settled.

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

The frontend connects to a configured loopback endpoint/token.

### Installed local backend helper

A future installer may provide a small local backend launcher/daemon. The browser can detect and pair with it over loopback.

This helper must remain authenticated and loopback-scoped.

### Manual pairing fallback

If automatic discovery is unavailable, the user may explicitly provide connection information generated by the backend launcher.

Do not create an unauthenticated localhost control endpoint merely to avoid pairing.

## Connection discovery contract

Before desktop integration is implemented, the backend should settle a small startup/discovery contract.

Recommended backend launch inputs:

```text
--host 127.0.0.1
--port 0
--token <ephemeral-secret>
```

Recommended ready handshake, emitted through stdout or another parent-owned channel:

```json
{
  "protocolVersion": 1,
  "endpoint": "http://127.0.0.1:43127",
  "pid": 12345
}
```

The token does not need to be echoed if the parent process supplied it.

The backend should not require the frontend to scrape human-readable log output to discover its port.

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

Until the separate backend is formally moved and its launch contract is stable:

1. keep Content Studio local/offline services working;
2. keep backend-facing TypeScript interfaces transport-neutral;
3. do not modify OpenRune Server for Studio integration;
4. treat `Neosback/rspsi` as the temporary backend development source, not as a dependency to vendor;
5. settle backend packaging, protocol versioning, and startup handshake;
6. add a framework-neutral `StudioBackendClient`;
7. add HTTP transport for browser/development use;
8. add a Tauri transport/process supervisor for desktop;
9. implement `OpenRuneProjectStore`, `OpenRuneCacheSource`, and `OpenRuneWorldSource` against that client as backend capabilities become available;
10. add build/publish workflows only after source authority and output verification are explicit.

## Non-goals

- modifying OpenRune Server to turn it into the Studio backend;
- embedding game-server lifecycle into the Studio UI;
- allowing browser code to execute arbitrary Gradle/shell commands;
- duplicating the backend inside both Kotlin and Rust;
- making Tauri mandatory for the web application;
- requiring the backend for existing offline editing.
