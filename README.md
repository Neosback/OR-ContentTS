# OpenRune Content Studio

A browser-based content studio for Old School RuneScape private servers, starting with a map editor. It renders the world with the game client's own TypeScript decoders and WebGL2 scene code, so what you edit is what the client draws.

This repository started as a fork of the [xRSPS](https://github.com/xrsps/xrsps-typescript) TypeScript client. The active Studio application is now **Vite 8 + Svelte 5**. Framework-neutral RuneScape/cache/rendering code remains in TypeScript, and the legacy React/TSX application surface has been removed.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the runtime boundary, [ROADMAP.md](ROADMAP.md) for where the project is going, and [DEVELOPER_HANDOFF.md](DEVELOPER_HANDOFF.md) for the current implementation handoff.

## Packages

- [`client/`](client/): the Studio frontend (Vite, Svelte 5, dockview-core, TypeScript, WebGL2 rendering).
- [`backend/`](backend/): the local Kotlin/JVM Studio backend (`Protocol` + `StudioService`) moved from the temporary `Neosback/rspsi` development repository.
- [`Neosback/OpenRune-Server`](https://github.com/Neosback/OpenRune-Server): an external OpenRune compatibility/reference project. Content Studio should work with compatible OpenRune projects without requiring Studio-specific changes to that repository.

## Quick start

Install [Node.js 22.16 or later](https://nodejs.org/en/download). No separate Yarn installation is needed.

```bash
npm run setup
npm run start
```

Open <http://localhost:3000>. The first start downloads the configured OSRS cache from OpenRS2 directly into `client/caches`. The committed `client/cache-target.json` currently tracks revision 240 to match OpenRune Server.

| Route | What it opens |
| --- | --- |
| `/` | Studio home |
| `/cache-test` | Cache Repository |
| `/map` | Map workspace launcher |
| `/map/viewer` | World/map viewer |
| `/map/editor` | Map editor workspace |
| `/interface` | Interface workbench |
| `/__dock` | Dock layout lab in development builds only |

The old React `/play` application is no longer part of the active Studio routing surface.

## Client scripts

Run these from `client/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server on port 3000 |
| `npm run build` | Production build into `client/dist` |
| `npm run preview` | Serve the production build locally |
| `npm run check` | Svelte validation |
| `npm run typecheck` | TypeScript validation |
| `npm run check:ui-boundaries` | Enforce a React-free, JSX/TSX-free active client source/dependency boundary |
| `npm test` | Vitest suite |
| `npm run validate` | Run all blocking client gates: UI boundary, Svelte, TypeScript, tests and production build |
| `npm run validate:types` | Run full-tree Svelte and TypeScript diagnostics |

## Local cache configuration

The committed `client/cache-target.json` controls the local development cache revision. `npm run ensure-cache` resolves that revision against OpenRS2 and writes it to the gitignored `client/caches` directory.

The dev server sends COOP/COEP headers and serves `client/caches` at `/caches` with HTTP Range support. The client streams only the cache ranges it needs and keeps imported/profile caches in browser storage.

## Studio backend and OpenRune compatibility

The legacy TypeScript game server has been removed from this repository. Content Studio uses a **TypeScript-first, backend-minimal architecture**. Normal cache/map editing, GameVal/RSCM work, project persistence, and Tauri filesystem access should work without the Kotlin backend.

OpenRune Server itself is a compatibility/reference target, not the repository where Content Studio should add backend endpoints or Studio-specific server changes. The backend under [`backend/`](backend/) should inspect and operate against an ordinary compatible OpenRune project.

**Content Studio requires zero Studio-specific OpenRune Server modifications.** Unsupported capabilities degrade rather than triggering an OpenRune Server fork, endpoint, hook, accessor, module, or framework patch.

The moved backend is validated independently for compile, protocol, API/security, OpenRune inspection/indexing, Gradle/process boundaries, and runnable distribution packaging. It is retained for explicit JVM/OpenRune capabilities such as bounded Gradle builds/tests and FileStore verification, and should be started lazily when needed.

`ProjectStore`, project lifecycle/replay, `CacheSource`, `WorldSource`, future `ProjectFileSystem`, GameVal/RSCM services, and map codecs remain local-first frontend seams.

See [docs/OPENRUNE_MAP_CACHE_ARCHITECTURE.md](docs/OPENRUNE_MAP_CACHE_ARCHITECTURE.md) for the map/cache/GameVal ownership model and [docs/STUDIO_BACKEND_INTEGRATION.md](docs/STUDIO_BACKEND_INTEGRATION.md) for the optional backend lifecycle/security plan.

## Credits

Thanks to Astrul, Detuks and all contributors to xRSPS, the legacy Java project, the TypeScript continuation, RuneLite, OpenRS2, and the other projects credited throughout the repository.

## Legal

This fan project is not affiliated with Jagex Ltd. Old School RuneScape and related assets and trademarks belong to their respective owners.
