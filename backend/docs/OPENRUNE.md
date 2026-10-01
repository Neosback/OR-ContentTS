# OpenRune Server integration

OpenRune Content Studio Backend should understand an opened OpenRune-compatible project deeply enough to help develop and operate it without taking ownership away from the project.

## Project inspection

Use one structural project model. Inspection may discover:

- checkout root;
- Gradle wrapper/build files;
- source/resource roots;
- content/plugin modules;
- GameVal/RSCM roots;
- generated LIVE/SERVER cache paths;
- supported build/test tasks;
- compatibility diagnostics.

Custom forks should be represented through detected capabilities, not scattered path guesses.

Opening a project is passive. It must not run Gradle, load project code, start OpenRune Server, or mutate files.

## Source authority

For OpenRune-owned resources, preserve provenance and edit the authoritative user-owned source/config form. Generated or merged output should not be edited when a supported source exists.

Examples include pack config TOML, module `gamevals.toml`, RSCM, server TOML, map NPC/ground-Obj/Area TOML, interface/CS2/model/sprite pack sources, and DB-table source definitions.

Terrain/static-loc placement is the main map exception: OpenRune Server has no equivalent TOML source, but OpenRune-FileStore already exposes `PackMaps`. Studio should keep portable semantic state and use a bounded external FileStore publication operation rather than modifying OpenRune Server.

Content Studio requires **zero Studio-specific OpenRune Server modifications**. Do not add Studio endpoints, hooks, accessors, modules, agents, or framework patches to OpenRune Server.

If a capability cannot be implemented externally, report that capability as unavailable rather than modifying OpenRune Server.

## Build execution

Run only bounded, application-defined operations against the imported project's detected Gradle wrapper/tasks or bounded OpenRune-FileStore publication operations.

Capture operation identity, timestamps, exit status, bounded logs, cancellation state, relevant output fingerprints, and post-build verification.

Never expose arbitrary shell execution through the local API.

The OpenRune server `run` task is not part of the normal Studio backend lifecycle.

## Generated caches

`.data/cache/LIVE` and `.data/cache/SERVER` are generated outputs.

LIVE is the full/base generated cache.

SERVER is reseeded from LIVE by OpenRune-FileStore, with configured client-heavy indices omitted/emptied, then augmented with server-specific config and map data. SERVER is therefore a derivative, not a parallel source tree.

Studio may inspect both caches and use them for verification. The one planned write exception is the explicit terrain/static-loc publication operation against LIVE through OpenRune-FileStore `PackMaps + PackWorldMap`; this is a bounded publisher, not a general authoring workspace.

## Runtime boundary

Static project/content/cache inspection is sufficient for the current Content Studio architecture.

Do not introduce an in-server Studio agent, reflection bridge, bytecode agent, or required OpenRune runtime patch for normal integration.

If a future feature genuinely needs live runtime facts, design it as an optional external compatibility capability that preserves the zero-OpenRune-modification rule and does not make ordinary editing depend on a running game server.

See `OPENRUNE_SERVER_FOUNDATION.md` for the reference-only OpenRune architecture notes.


## Map publication

The backend should eventually expose one explicit map-publication capability for terrain/static-loc edits.

It should run OpenRune-FileStore `PackMaps` and `PackWorldMap` in the same process/operation because `PackWorldMap` consumes the in-memory `PackedMapSquares` set produced by `PackMaps`.

After LIVE is updated, the existing allowlisted cache-build operation can run the normal OpenRune pipeline so SERVER is reseeded from the updated LIVE cache and OpenRune's map TOML sources contribute files 5/6/7.

No OpenRune Server patch is required.
