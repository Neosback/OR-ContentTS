# OpenRune Server Foundation Reference

This document records verified OpenRune Server architecture that is useful for **compatibility and inspection only**.

It is not an implementation plan for modifying OpenRune Server.

Baseline originally inspected:

- upstream repository: `OpenRune/OpenRune-Server`
- upstream branch: `main`
- baseline commit: `6f7bd42d2cd613c01a351f25c227f6333c24cd62`
- original verification date: 2026-09-28

OpenRune changes over time. The Studio backend must detect capabilities from the user's checkout instead of assuming this exact baseline.

## Non-negotiable integration rule

OpenRune Content Studio requires **zero Studio-specific OpenRune Server source changes**.

Do not:

- add Studio HTTP/API endpoints to OpenRune Server;
- require a custom OpenRune Server fork;
- add required Studio accessors, hooks, modules, agents, or framework patches;
- depend on private runtime internals as a required integration contract;
- inject a Studio service into the OpenRune Server JVM;
- make OpenRune Server source modification a prerequisite for editor functionality.

If a capability cannot be supported through external inspection, independently available libraries, project files, generated outputs, or existing project build interfaces, that capability must degrade/remain unavailable.

## Why OpenRune is still important

OpenRune Server remains an important compatibility/reference target because its project structure establishes useful authorities for:

1. project/source layout;
2. GameVals and RSCM identities;
3. content and pack modules;
4. LIVE and SERVER cache outputs;
5. FileStore/cache semantics;
6. existing Gradle/cache build tasks;
7. source-vs-generated-output authority.

The Studio backend should adapt to these structures without requiring a patched OpenRune runtime.

## Verified project/build model

A compatible OpenRune checkout is a Gradle multi-project Kotlin/JVM project.

Important areas commonly include:

```text
content/
engine/
server/
or-cache/
.data/
```

The backend should detect these rather than hard-coding one repository revision.

Useful capability evidence includes:

- Gradle wrapper present;
- `:or-cache:buildCache` available;
- content modules present;
- GameVal/RSCM resources present;
- LIVE/SERVER cache outputs present;
- supported OpenRune/FileStore formats available.

## Cache authority

OpenRune distinguishes generated cache roles.

### LIVE

Typical path:

```text
.data/cache/LIVE
```

LIVE is generally the client/render/export cache output.

### SERVER

Typical path:

```text
.data/cache/SERVER
```

SERVER contains server-oriented generated definitions/data.

Studio must not treat LIVE and SERVER as interchangeable.

Generated caches are outputs, not automatically authoritative editable source.

## Source and publication authority

Where an authoritative project source exists, Studio should preserve that authority.

Examples include:

- Kotlin content source;
- GameVal TOML/source declarations;
- RSCM-generated identities;
- dedicated content pack modules;
- project configuration used by existing build tasks.

Preferred lifecycle:

```text
Studio semantic edit
  -> versioned Studio edit/project contract
  -> backend validation
  -> explicit user-owned source/config update
  -> existing OpenRune build task
  -> output verification
  -> explicit publish/deploy
```

Do not silently mutate generated cache outputs as a substitute for source publication.

## GameVals and RSCM

GameVals form an important identity layer.

Examples:

```text
content.rock
loc.some_location
npc.king_dragon
dbtable.mining_rocks
stat.mining
```

The backend should preserve provenance between:

- symbolic name;
- namespace;
- numeric id;
- authoritative source declaration;
- generated RSCM output;
- cache/runtime representation when available.

The current backend already indexes GameVal/RSCM-aware content without changing the checkout.

## Content/pack isolation

OpenRune's cache/build design separates content pack inputs from the entire runtime dependency graph.

That is useful for Studio because it means publication can target project-owned content/config/build inputs rather than embedding the game server inside Studio.

The backend may discover and invoke existing explicitly allowlisted build tasks, but must not expose arbitrary Gradle or shell execution.

## Existing build interface

Known useful Gradle tasks may include:

```text
assemble
test
:or-cache:buildCache
```

The current Studio backend intentionally exposes only bounded operation IDs mapped to allowlisted tasks.

Opening a project never runs Gradle automatically.

Build/task discovery and execution must remain explicit user actions.

## Separate tooling precedent

OpenRune already demonstrates that developer tooling can be a **separate local process** consuming project/cache outputs without becoming part of the game server.

That design pattern aligns with Content Studio's architecture:

```text
Content Studio frontend
        |
StudioBackendClient
        |
local Studio Backend
        |
compatible OpenRune checkout
```

No in-server Studio agent is required.

## Current backend behavior

The in-repo backend under `backend/` currently supports:

- passive project inspection;
- opaque project sessions;
- source/content indexing;
- GameVal/RSCM-aware inspection;
- LIVE/SERVER FileStore inspection;
- bounded Gradle task discovery;
- allowlisted asynchronous Gradle operations;
- operation status/log/cancellation events;
- loopback Host/Origin/token security.

Current file-facing inspection paths are read-only.

The only checkout-modifying behavior today is explicit invocation of existing Gradle tasks, which may create normal generated/build outputs.

## Capability degradation

OpenRune versions and project layouts can differ.

The backend should therefore return capabilities based on evidence from the opened project.

Examples:

```text
project.inspect
content.index
content.resolve
source.index
cache.read
gradle.tasks
gradle.operations
```

The frontend must consume capabilities instead of assuming every OpenRune checkout supports every feature.

Missing capability is not a reason to patch OpenRune Server.

## Runtime introspection

Deep live-server introspection is **not** part of the current required architecture.

Do not add an in-server agent, reflection bridge, bytecode agent, or OpenRune source patch merely to expose runtime state.

If future product requirements genuinely need live runtime facts, first design an external, optional, versioned compatibility mechanism that preserves the zero-OpenRune-modification rule.

Static project inspection and editor functionality must remain useful without a running OpenRune Server process.

## Current integration priorities

The next backend work is not OpenRune runtime modification.

Priorities are:

1. backend launch contract with ephemeral port support;
2. parent-supplied per-launch token;
3. machine-readable ready handshake;
4. stable backend/protocol identity;
5. loopback-only CORS/preflight for browser transport;
6. `StudioBackendClient`;
7. web and Tauri transports;
8. backend-backed domain adapters;
9. explicit source-authority/write/build/publish workflows.

## Confidence boundary

We have enough verified OpenRune architectural knowledge to:

- recognize compatible project structures;
- inspect source and generated outputs;
- use FileStore/cache semantics;
- index GameVals/content;
- discover existing build capabilities;
- invoke bounded existing build operations.

We do **not** need complete OpenRune runtime internals to proceed with Content Studio.

When compatibility uncertainty appears, prefer capability detection and graceful degradation over upstream modification.
