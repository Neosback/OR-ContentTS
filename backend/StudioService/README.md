# StudioService

`StudioService` is the Kotlin/JVM application service for OpenRune Content Studio Backend.

It provides optional local JVM/OpenRune capabilities for Content Studio. Ordinary project filesystem access, cache editing, and GameVal/RSCM parsing should remain available without this service.

## Runtime policy

StudioService is not an application-start dependency.

Web users connect to it only when they explicitly want a backend-only capability. Tauri may package/supervise it, but should launch it lazily for operations such as exact OpenRune Gradle builds, tests, or FileStore/JVM verification.

Direct Tauri filesystem access and portable TypeScript domain logic remain the preferred path for normal project work.

## Responsibilities

- OpenRune project validation and capability detection.
- Project-scoped sessions and filesystem boundaries.
- Content module and GameVal/RSCM indexing.
- Kotlin structural source indexing.
- Symbol-to-source resolution.
- Gradle wrapper task discovery through a bounded fixed command.
- Allowlisted asynchronous Gradle operations for assemble, test, and cache build.
- Live operation snapshots, SSE status/log events, and cancellation.
- LIVE/SERVER generated cache inspection through OpenRune FileStore.
- Loopback HTTP API, authentication, and stable API errors.
- Project index caching and explicit refresh.

## Current API

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

Opening a project is passive. It validates and inspects the checkout without executing Gradle or loading server code.

Gradle task discovery and execution happen only through explicit project-scoped endpoints. Execution accepts only the `assemble`, `test`, and `cache-build` operation IDs and never arbitrary Gradle arguments. Starts return immediately with a `RUNNING` snapshot; clients can query the latest snapshot, stream updates over SSE, or request cancellation.

## Run

```bash
./gradlew :StudioService:run
```
