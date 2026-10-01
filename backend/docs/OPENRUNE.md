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

Content Studio requires **zero Studio-specific OpenRune Server modifications**. Do not add Studio endpoints, hooks, accessors, modules, agents, or framework patches to OpenRune Server.

If a capability cannot be implemented externally, report that capability as unavailable rather than modifying OpenRune Server.

## Build execution

Run only bounded, application-defined operations against the imported project's detected Gradle wrapper/tasks.

Capture operation identity, timestamps, exit status, bounded logs, cancellation state, relevant output fingerprints, and post-build verification.

Never expose arbitrary shell execution through the local API.

The OpenRune server `run` task is not part of the normal Studio backend lifecycle.

## Generated caches

`.data/cache/LIVE` and `.data/cache/SERVER` are generated outputs. Studio may inspect them and use them for verification, not treat them as ordinary authoring workspaces.

## Runtime boundary

Static project/content/cache inspection is sufficient for the current Content Studio architecture.

Do not introduce an in-server Studio agent, reflection bridge, bytecode agent, or required OpenRune runtime patch for normal integration.

If a future feature genuinely needs live runtime facts, design it as an optional external compatibility capability that preserves the zero-OpenRune-modification rule and does not make ordinary editing depend on a running game server.

See `OPENRUNE_SERVER_FOUNDATION.md` for the reference-only OpenRune architecture notes.
