# OpenRune Content Studio Client

The client is the active OpenRune Content Studio frontend.

## Runtime

- Vite 8
- Svelte 5
- TypeScript
- dockview-core
- WebGL2

The application boots through `src/main.ts -> src/ui/main.ts -> src/ui/App.svelte`.

The active client source tree is Svelte/TypeScript only. Legacy React/TSX sources and direct React-only tooling/dependencies have been removed.

## Development

From the repository root:

```bash
npm run setup
npm run client
```

Or from this directory:

```bash
npm ci
npm run dev
```

## Validation

```bash
npm run validate
```

This runs the complete blocking client gate: client architecture boundary, Svelte check, TypeScript, Vitest and the production Vite build.

The architecture boundary scans the active source tree and package manifest to reject JSX/TSX and React-era dependencies.

See the repository [ARCHITECTURE.md](../ARCHITECTURE.md) and [ROADMAP.md](../ROADMAP.md) for the current architecture and planned work.


## OpenRune project integration

The frontend is source-first when connected to an OpenRune checkout:

- update authoritative OpenRune TOML/GameVal/pack sources when they exist;
- keep ordinary project filesystem access behind `ProjectFileSystem`;
- treat LIVE/SERVER as generated outputs;
- keep terrain/static-loc editing portable in TypeScript;
- use the optional backend only for explicit OpenRune/JVM operations such as build/test, FileStore `PackMaps + PackWorldMap` publication, and output verification.

See [OPENRUNE_MAP_CACHE_ARCHITECTURE.md](../docs/OPENRUNE_MAP_CACHE_ARCHITECTURE.md) for the complete cache/source ownership model.
