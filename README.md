# OpenRune Content Studio

A browser-based content studio for Old School RuneScape private servers, starting with a map editor. It renders the world with the game client's own TypeScript decoders and WebGL2 scene code, so what you edit is what the client draws.

This repository started as a fork of the [xRSPS](https://github.com/xrsps/xrsps-typescript) TypeScript client. The client is no longer used to play a live game, but its game-side systems (player updating, widgets, CS2) are kept for later Studio tools.

See [ROADMAP.md](ROADMAP.md) for where the project is going.

## Packages

- [`client/`](client/): the Studio frontend (Vite, TypeScript, React, WebGL2).
- [`server/`](server/): the legacy TypeScript game server. The Studio only uses it to download the OSRS cache (`server/scripts/ensure-cache.ts`) and, optionally, for `/api/world` spawn and zone data. It is kept for reference and will be replaced by the OpenRune Studio backend (see the roadmap).

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
| `/map-editor` | Map editor, straight into the scene, no login |
| `/play` | Legacy game client (login screen), kept for later tooling |

`yarn start` from the root still starts the legacy game server and the client together, if you need `/api/world` data.

## Client scripts

Run these from `client/`:

| Command | Purpose |
| --- | --- |
| `npm run start` | Ensure the cache is downloaded, then start the Vite dev server on port 3000 |
| `npm run build` | Production build into `client/build` |
| `npm run preview` | Serve the production build locally (also serves `/caches`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Node tests (tsx) |

## Configuration

Client settings live in `client/.env` (see [`client/.env.example`](client/.env.example)). Vite inlines `VITE_*` variables at build time, so never put secrets in them. The most useful one is `VITE_CACHE_BASE_URL`, which points the client at a cache served from somewhere other than `/caches/`.

The dev server sends COOP/COEP headers and serves `server/caches` at `/caches` with HTTP Range support. The client streams only the parts of the cache it needs and keeps them in browser storage.

## Credits

Thanks to Astrul, Detuks and all the contributors of the xRSPS TypeScript client, the legacy Java project, and the TypeScript continuation this fork is based on.

## Legal

This fan project is not affiliated with Jagex Ltd. Old School RuneScape and related assets and trademarks belong to their respective owners.
