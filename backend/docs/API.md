# Local application API

The API exposes OpenRune Content Studio Backend's JVM/local capabilities to its UI or CLI without leaking internal OpenRune, Gradle, PSI, or filesystem objects.

The API is versioned under `/api/v1`.

## Security

- bind `127.0.0.1` by default;
- require a per-launch token;
- reject non-loopback Host headers and browser Origins;
- answer browser CORS/OPTIONS preflight only for accepted loopback Origins and the bounded Studio token header;
- accept an arbitrary filesystem path only when explicitly opening a project;
- use an opaque project ID for later operations;
- reject resolved paths that escape the opened project root;
- never expose arbitrary shell execution.


## Process launch and discovery

The backend accepts bounded launch inputs:

```text
--host 127.0.0.1
--port 0
--token <parent-supplied-secret>
```

Only loopback bind hosts are accepted. Port `0` requests an available ephemeral port.

After the HTTP listener is bound, stdout receives one JSON READY record:

```json
{
  "protocolVersion": 1,
  "backendInstanceId": "generated-instance-id",
  "endpoint": "http://127.0.0.1:43127",
  "pid": 12345
}
```

The token is intentionally omitted. A supervising process already owns the supplied secret and must not recover it by scraping logs.

When no explicit token is supplied, the development fallback still generates one. That fallback secret is written to stderr, not to the READY payload.

## Status identity

Authenticated `GET /api/v1/status` returns stable connection identity suitable for compatibility checks:

```json
{
  "name": "OpenRune Content Studio Backend",
  "apiVersion": 1,
  "protocolVersion": 1,
  "backendInstanceId": "generated-instance-id",
  "backendVersion": "0.1.0",
  "backendBuild": "0.1.0",
  "status": "ready",
  "capabilities": ["project.open"]
}
```

`backendInstanceId` remains stable for the life of one backend process. Packaged distributions expose the Gradle project version; development/test classpaths may report `dev` unless a build identifier is supplied.

## Browser CORS

Loopback browser origins such as `http://localhost:<port>` and `http://127.0.0.1:<port>` are accepted.

Preflight permits the methods used by the API plus:

```text
Content-Type
X-OpenRune-Studio-Token
```

Preflight does not require the session token because the browser is asking permission to send it. Host and Origin validation still apply before preflight is answered, and every normal `/api/v1/*` request still requires the token.

## Current resources

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

## Gradle task discovery

A project with a detected Gradle wrapper advertises the `gradle.tasks` capability.

`GET /api/v1/project/{projectId}/gradle/tasks` explicitly invokes the opened project's wrapper with the fixed discovery command:

```text
tasks --all --console=plain --no-daemon
```

The caller cannot supply tasks or command-line arguments. Execution is scoped to the opened project root, has a fixed timeout, captures bounded stdout/stderr, and returns structured task paths, groups, and descriptions.

Opening a project remains passive and never executes Gradle.

Clients query capabilities instead of assuming features from paths or product version.

Externally consumed contracts are neutral, versioned DTOs. Do not serialize PSI nodes, Gradle model objects, OpenRune FileStore objects, Java `Path`, or server/plugin implementation instances.


## Bounded Gradle operations

Projects with a detected Gradle wrapper advertise the `gradle.operations` capability.

The operation catalog exposes exactly three finite operations:

| Operation ID | Gradle task |
| --- | --- |
| `assemble` | `assemble` |
| `test` | `test` |
| `cache-build` | `:or-cache:buildCache` |

`POST /api/v1/project/{projectId}/gradle/operations` accepts only an operation ID and returns `202 Accepted` with a `RUNNING` snapshot and opaque operation ID. The caller cannot submit an arbitrary task, option, shell command, environment override, or working directory.

Operation snapshots expose lifecycle state, elapsed duration, exit status when available, bounded stdout/stderr tails, truncation flags, cancellation state, and stable error information. Terminal states are `SUCCEEDED`, `FAILED`, `TIMED_OUT`, and `CANCELLED`.

`GET /api/v1/project/{projectId}/gradle/operations/{operationId}` returns the latest project-scoped snapshot.

`POST /api/v1/project/{projectId}/gradle/operations/{operationId}/cancel` requests cancellation. The process runner polls the cancellation signal and terminates the Gradle wrapper plus descendant processes.

`GET /api/v1/project/{projectId}/gradle/operations/{operationId}/events` is a Server-Sent Events stream. It sends `snapshot` events containing the current operation snapshot whenever status or bounded log tails change, then closes after a terminal state.

Only one Gradle operation may run against the same canonical checkout at a time, even when that checkout is opened through multiple Studio sessions. Recent snapshots remain session-scoped for lookup.

The OpenRune server `run` task is intentionally excluded from the allowlist. Content Studio does not own OpenRune game-server lifecycle and does not need to launch or modify OpenRune Server for normal backend integration.


## Planned bounded map-publication operation

The next cache-writing capability should not be arbitrary archive/file mutation.

It should be a versioned, project-scoped operation dedicated to publishing validated terrain/static-loc payloads through OpenRune-FileStore:

```text
validated Studio map payload
  -> PackMaps against opened project's LIVE cache
  -> PackWorldMap in the same operation
  -> verify affected map groups/world-map output
```

The API contract must:

- accept only project-scoped, validated map publication inputs;
- reject arbitrary filesystem/cache targets;
- reject arbitrary FileStore operations;
- retain the existing opaque project/session boundary;
- expose structured status/log/cancel behavior consistent with Gradle operations;
- never mutate SERVER directly.

A subsequent explicit `cache-build` operation is responsible for the normal OpenRune LIVE/SERVER build flow.

The endpoint/DTO shape is intentionally not documented as current API until implementation exists.
