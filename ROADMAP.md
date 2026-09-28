# OpenRune Content Studio Roadmap

This is the plan for turning this client into the OpenRune Content Studio frontend. It records direction and ordering, not promises. What exists today is whatever the code and passing tests show.

## Target architecture

The Studio will eventually be a client/server tool:

| Side | Project | Owns |
| --- | --- | --- |
| Frontend | this repository (`client/`) | UI, decoding for display, WebGL2 rendering, interactive editing, preview, undo |
| Backend | [RSPSi / OpenRune Studio](../../RSPSi-master) (Kotlin, OpenRune FileStore) | serving caches, project files, validation, saving, cache encoding and publishing, OpenRune builds |

Rules that follow from that split:

- **The backend is the only encoder.** The frontend sends *what changed* (versioned edit batches), never pre-encoded region bytes. Publishing always goes through RSPSi's encoder.
- **Decoders exist on both sides.** The frontend decodes to render; the backend decodes to validate and encode. Shared golden fixtures (RSPSi already has `tools/tsps` exports) keep them from drifting.
- **WebGL2 stays.** WebGPU may be added as a second render backend, never as a replacement.
- **Game code stays.** Player updating, widgets, CS2 and networking are kept for later tools, even though the Studio does not log in to a live game.

The RSPSi backend has a long way to go, so the frontend is built first. Everything the frontend needs from a server sits behind a small interface with a local implementation today and an RSPSi implementation later.

## Phase 0: Studio shell (done)

- `/` Studio home, `/map-editor` opens the editor directly with no login, `/play` keeps the legacy client.
- The editor runs standalone: Esc and Ctrl+E no longer drop to the login screen.
- Build moved from CRA/craco/webpack to Vite 8. Dev start went from minutes to under a second, and production builds take about 5 seconds.

## Phase 1: Studio UI foundation

Goal: a real workspace for the map editor, with a framework-neutral panel model.

- [ ] Decide the shell framework: **Svelte 5** or keep **React 19**. The choice is cheap either way: only about 19 files use React, and the editor UI (`EditorUi`, toolbar, palette, world map) is plain DOM.
- [ ] Dockable layout with **dockview** (`dockview-core` plus a small Svelte adapter, or `dockview-react`).
- [ ] Panel contract: `mount(element, context) → dispose`. Tools never import the shell framework directly.
- [ ] The scene canvas becomes one dock panel. Keep a **single WebGL2 context**: WebGL2 cannot share GPU resources between contexts, so extra 3D views (model preview, minimap) render into the same canvas with scissored viewports.
- [ ] Move the existing editor UI into panels: tool palette, inspector, search, world map, settings.
- [ ] Shared command and keyboard-shortcut registry instead of per-tool key handlers.
- [ ] Studio visual style (theme tokens, dark and light).

## Phase 2: backend-ready seams

Goal: the frontend works fully offline, with every server dependency behind an interface the RSPSi backend can implement later.

- [ ] `CacheSource`: today, static `/caches` over HTTP Range (already how the client streams). Later, RSPSi serves the same layout. Cache names are versioned so browsers drop stale copies after a publish.
- [ ] `WorldSource`: spawn, zones and world definition. Today this comes from the legacy server's `/api/world` or a local JSON file. It needs a configured Studio API URL instead of being derived from the game socket (`getContentApiBase`).
- [ ] **Edit format v1**: turn today's `EditModeEdit` list and `RegionPack` into a documented, versioned JSON schema (terrain, locs, NPC spawns, zones), shared by frontend and backend.
- [ ] Local project persistence (IndexedDB plus import/export), standing in for the backend's Save Project until it exists.
- [ ] Move cache download out of `server/` into a small script owned by the client, so the legacy server is fully optional.

## Phase 3: map editor depth

- [ ] Multi-region selection and editing without seams.
- [ ] Undo and redo across every tool, with named transactions.
- [ ] Brush-based terrain tools (height, overlay, underlay, smoothing).
- [ ] Better object placement: snapping, rotation preview, copy and paste between regions.
- [ ] Validation overlays (clipping, blocked tiles, missing definitions).

## Phase 4: RSPSi backend integration

Tracked mostly in RSPSi. The frontend side:

- [ ] New RSPSi `Server` module (for example Ktor) on top of the existing `Client` domain module.
- [ ] Serve caches with Range support and versioned names.
- [ ] Implement `WorldSource` and project APIs.
- [ ] Accept edit batches, validate, Save Project.
- [ ] Explicit **Publish Cache** and **Build OpenRune Project** actions, with results shown in the Studio.
- [ ] Golden-fixture tests that run the same regions through the TS and Kotlin decoders.
- [ ] Delivery: the backend serves the built frontend on localhost. A desktop wrapper (for example Tauri) is optional later.

## Phase 5: rendering

- [ ] Profile first: CPU scene build, draw calls, buffer uploads, memory.
- [ ] Render-backend interface above today's picogl code (`DrawBackend` only covers draw calls today). WebGL2 remains the reference backend.
- [ ] Optional **WebGPU** backend: one device for several canvases, compute culling.
- [ ] **meshoptimizer** for simplified distant terrain (zoomed-out world view), only if profiling shows triangle count matters.

## Phase 6: more Studio tools

- [ ] Definitions editor (objects, NPCs, items, configs).
- [ ] Model and animation viewer.
- [ ] Interface and CS2 viewer.
- [ ] Reuse the legacy client's player and NPC systems for previews.

## Known issues

- 11 pre-existing TypeScript errors (`EditorUi`, `LocPlacementPreviewOverlay`, `WebRtcGameSocket`, `PlayerRenderer`).
- 2 of 62 node tests fail, and both failed before the Vite migration: `edit-mode-plugin`, `npc-instance-flush-controller`.
- Without the legacy server, `/api/world` requests fail (harmless: the editor opens without spawn framing).
- The build-time export of browser-host interface definitions was dropped with craco. It only served the legacy WebRTC game.
- The app now builds for the site root (`base: "/"`) instead of `/play`. The old FTP deploy script still targets `/play`.
