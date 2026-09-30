# OpenRune Content Studio

A browser-based content studio for Old School RuneScape private servers, starting with a map editor. It renders the world with the game client's own TypeScript decoders and WebGL2 scene code, so what you edit is what the client draws.

This repository started as a fork of the [xRSPS](https://github.com/xrsps/xrsps-typescript) TypeScript client. The active Studio application is now **Vite 8 + Svelte 5**. Framework-neutral RuneScape/cache/rendering code remains in TypeScript, while a quarantined set of legacy TSX sources is retained temporarily for reference and staged cleanup. Those TSX sources are not the Studio entrypoint.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the runtime boundary and [ROADMAP.md](ROADMAP.md) for where the project is going.

## Packages

- [`client/`](client/): the Studio frontend (Vite, Svelte 5, dockview-core, TypeScript, WebGL2 rendering).
- [`server/`](server/): the legacy TypeScript game server. The Studio only uses it to download the OSRS cache (`server/scripts/ensure-cache.ts`) and, optionally, for `/api/world` spawn and zone data. It is kept for reference and will be replaced by the OpenRune Studio backend described in the roadmap.

## Quick start

Install [Node.js 22.16 or later](https://nodejs.org/en/download). No separate Yarn installation is needed.

```bash
npm run setup
npm run client
```

Open <http://localhost:3000>. The first start downloads the OSRS cache (about 200 MB) from OpenRS2 into `server/caches`.

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
| `npm run check:ui-boundaries` | Prevent React/TSX from re-entering the active Svelte UI |
| `npm test` | Vitest suite |
| `npm run validate` | Run all blocking client gates: UI boundary, Svelte, TypeScript, tests and production build |
| `npm run validate:types` | Run full-tree Svelte and TypeScript diagnostics |

## Configuration

Client settings live in `client/.env` (see [`client/.env.example`](client/.env.example)). Vite inlines `VITE_*` variables at build time, so never put secrets in them. The most useful one is `VITE_CACHE_BASE_URL`, which points the client at a cache served from somewhere other than `/caches/`.

The dev server sends COOP/COEP headers and serves `server/caches` at `/caches` with HTTP Range support. The client streams only the parts of the cache it needs and keeps them in browser storage.

## Credits

Thanks to Astrul, Detuks and all contributors to xRSPS, the legacy Java project, the TypeScript continuation, RuneLite, OpenRS2, and the other projects credited throughout the repository.

## Legal

This fan project is not affiliated with Jagex Ltd. Old School RuneScape and related assets and trademarks belong to their respective owners.
