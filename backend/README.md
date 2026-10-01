> Moved into the Content Studio monorepo from the temporary `Neosback/rspsi` development repository. Package and API identifiers remain stable during the move.

# OpenRune Content Studio Backend

OpenRune Content Studio Backend is the local JVM/backend service for **OpenRune Content Studio** and compatible **OpenRune Server** projects.

It provides a structured view of an OpenRune project and exposes project-aware tooling through a local Kotlin/JVM service.

## Current capabilities

- Open and validate an OpenRune Server project.
- Detect project structure and available capabilities.
- Discover content modules.
- Index GameVals and generated RSCM data.
- Index Kotlin content source with PSI-backed structural analysis.
- Resolve OpenRune symbols such as `content.rock` to source, handlers, references, modules, and GameVals.
- Inspect generated `.data/cache/LIVE` and `.data/cache/SERVER` caches through OpenRune FileStore.
- Discover the tasks exposed by an opened project's Gradle wrapper on explicit request.
- Run bounded allowlisted Gradle operations for `assemble`, `test`, and `:or-cache:buildCache` asynchronously.
- Stream operation status and bounded log tails over Server-Sent Events and cancel active operations.
- Maintain project-scoped index snapshots and refresh them when project inputs change.
- Expose the functionality through a loopback-only, token-protected HTTP API.
- Launch on an ephemeral port when requested and emit a machine-readable READY handshake for a supervising parent process.
- Support loopback-only browser CORS/preflight without weakening Host, Origin, or token protections.

## Modules

### `:StudioService`

The Kotlin/JVM backend service. It owns project sessions, OpenRune inspection, content/source indexing, Gradle project discovery, cache inspection, API security, and local transport.

### `:Protocol`

Neutral contracts shared by Studio components and runtime integrations.

## Project authority

The opened OpenRune-compatible checkout remains authoritative for its project/source content.

Studio reads project structure and source directly from the checkout. Generated LIVE and SERVER caches are treated as build outputs. Studio does not replace OpenRune's Gradle build, source layout, GameVals, or cache tooling.

**Content Studio requires zero Studio-specific OpenRune Server modifications.** The backend must not add or depend on custom OpenRune HTTP endpoints, forks, accessors, hooks, modules, or framework patches. If a capability cannot be implemented externally, it must degrade/remain unavailable.

Gradle is never executed merely because a project is opened. Task discovery and execution are explicit project-scoped operations. Execution is limited to the `assemble`, `test`, and `cache-build` operation IDs; callers cannot provide arbitrary Gradle tasks or arguments.

## Local API

The current API is versioned under `/api/v1`.

```text
GET  /api/v1/status
POST /api/v1/project/open
GET  /api/v1/project/{projectId}
GET  /api/v1/project/{projectId}/gradle/tasks
GET  /api/v1/project/{projectId}/gradle/operations
POST /api/v1/project/{projectId}/gradle/operations
GET  /api/v1/project/{projectId}/gradle/operations/{operationId}
POST /api/v1/project/{projectId}/gradle/operations/{operationId}/cancel
GET  /api/v1/project/{projectId}/gradle/operations/{operationId}/events

POST /api/v1/project/{projectId}/content/index
POST /api/v1/project/{projectId}/content/resolve
POST /api/v1/project/{projectId}/source/index
POST /api/v1/project/{projectId}/index/refresh

GET  /api/v1/project/{projectId}/cache/live/inspect
GET  /api/v1/project/{projectId}/cache/server/inspect
```

The service binds to loopback and requires an OpenRune Studio session token.

`GET /api/v1/status` exposes stable API/protocol identity, the per-process backend instance ID, backend version/build information, readiness state, and process-level capabilities.

## Launch contract

The packaged backend accepts:

```text
--host 127.0.0.1
--port 0
--token <parent-supplied-secret>
```

`--port 0` requests an available ephemeral port. After the server is successfully bound, stdout receives exactly one machine-readable READY record:

```json
{
  "protocolVersion": 1,
  "backendInstanceId": "generated-instance-id",
  "endpoint": "http://127.0.0.1:43127",
  "pid": 12345
}
```

The token is never included in the READY payload. A parent process such as Tauri should retain the token it supplied and consume this JSON record to discover the actual endpoint.

For manual/development use, the existing `OPENRUNE_STUDIO_HOST`, `OPENRUNE_STUDIO_PORT`, and `OPENRUNE_STUDIO_TOKEN` environment variables remain supported. If no token is supplied, the backend generates one and prints that fallback secret to stderr for the operator.

Browser requests from loopback origins receive CORS support, including authenticated custom-header preflight. Non-loopback Host/Origin values remain rejected.

## Requirements

- Java 21
- Gradle 8.14.3

## Build and test

```bash
./gradlew backendCheck --no-daemon
./gradlew backendDistribution --no-daemon
./gradlew validateBackend --no-daemon
```

GitHub CI additionally splits validation into compile, protocol, API/security, OpenRune inspection/indexing, Gradle/process-boundary, and runnable-distribution stages for faster diagnosis.

Run StudioService directly with:

```bash
./gradlew :StudioService:run --args='--host 127.0.0.1 --port 0 --token development-token-at-least-24-characters'
```

The fixed development default remains `127.0.0.1:8765` when no host/port arguments or environment overrides are supplied.

## Documentation

- `docs/API.md`
- `docs/OPENRUNE.md`
- `docs/CACHE.md`
- `docs/OPENRUNE_SERVER_FOUNDATION.md`
