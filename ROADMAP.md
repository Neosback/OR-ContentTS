# OpenRune Content Studio Roadmap

This is the plan for turning this repository into the OpenRune Content Studio frontend. It records direction and ordering, not promises. What exists today is whatever the code and passing tests show.

## Target architecture

| Layer | Owns |
| --- | --- |
| Svelte 5 Studio UI | shell, routing, dock layout, panels, workflows, user interaction |
| Framework-neutral TypeScript | cache decoding, scene/rendering, map editor runtime, plugin/editor services, data models |
| RSPSi / OpenRune Studio backend | project files, validation, saving, encoding, publishing, OpenRune builds |

Rules that follow from that split:

- **Svelte owns the active UI.** The active entrypoint is `src/main.ts -> src/ui/main.ts -> App.svelte`.
- **The runtime beneath the UI should stay framework-neutral.** Rendering, cache, scene and editing systems should not depend on Svelte components.
- **The backend is the only encoder.** The frontend sends what changed as versioned edit batches, never pre-encoded region bytes.
- **Decoders exist on both sides.** Shared golden fixtures keep TypeScript and Kotlin implementations from drifting.
- **WebGL2 stays as the reference backend.** WebGPU may be added later as an optional renderer.
- **Rust/WASM is for measured hot paths.** It should sit behind stable TypeScript interfaces rather than owning application UI.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the enforced frontend boundary.

## Phase 0: Vite and Svelte cutover (done)

- [x] Moved the client from CRA/craco/webpack to Vite 8.
- [x] Replaced the runtime application entry with Svelte 5.
- [x] Removed the active React router/runtime entry.
- [x] Cut the map viewer, map editor and interface routes over to the Svelte shell.
- [x] Removed the obsolete React map-editor UI/plugin island.
- [x] Kept rendering/cache/game-side TypeScript systems available beneath the UI.
- [x] Established reproducible clean-install, Vitest and Vite production-build validation; full-tree Svelte/TypeScript debt remains visible as advisory diagnostics.

A quarantined set of legacy TSX files is still present for staged cleanup. It is not the active Studio runtime.

## Phase 1: Studio UI foundation (hardening)

Goal: a stable editor workspace with a strict Svelte UI boundary and framework-neutral runtime.

Done:

- [x] Svelte 5 Studio shell and routing.
- [x] Dockable workspace using `dockview-core`.
- [x] Map viewer and map editor Svelte workspaces.
- [x] Native Svelte editor panels and workbench chrome.
- [x] Interface workbench cut over to Svelte.
- [x] Component editor.
- [x] CS1 simulator.
- [x] CS2 manual runner.
- [x] Inventory/gameval simulator.
- [x] Svelte-only runtime entrypoint.
- [x] CI architecture guard preventing React/TSX imports into `src/ui`.
- [x] Blocking UI-boundary, Vitest and Vite build gates, with full-tree Svelte/TypeScript diagnostics kept visible as migration debt.

Next:

- [ ] Clear the remaining full-tree Svelte/TypeScript diagnostics, including retained legacy TSX references and active engine typing debt.
- [ ] Classify and remove retained legacy TSX and then prune React-only dependencies/tooling.
- [ ] Shops and world map as first-class dock panels.
- [ ] Shared command and keyboard-shortcut registry.
- [ ] Bring remaining editor chrome fully onto Studio theme tokens.
- [ ] Extra 3D views such as model preview and minimap through shared/scissored rendering where appropriate.

## Phase 2: backend-ready seams

Goal: the frontend works fully offline, with every server dependency behind an interface the RSPSi backend can implement later.

- [ ] Formalize `CacheSource`: static/range-backed local cache today, backend-served later.
- [ ] Formalize `WorldSource`: spawn, zone and world definitions independent from the legacy game socket.
- [ ] **Edit format v1**: versioned JSON schema for terrain, locs, NPC spawns, zones and future content edits.
- [ ] Local project persistence with IndexedDB plus import/export.
- [ ] Move cache download ownership fully out of the legacy server path.
- [ ] Define project/open/save/publish APIs against a local implementation first.

## Phase 3: editor depth

- [ ] Shared command registry used by menus, buttons, context menus, plugins and shortcuts.
- [ ] Universal named transactions for undo/redo across all editing tools.
- [ ] Multi-region selection and editing without seams.
- [ ] Brush-based terrain tools for height, overlay, underlay and smoothing.
- [ ] Better object placement: snapping, rotation preview and copy/paste between regions.
- [ ] Validation overlays for clipping, blocked tiles and missing definitions.
- [ ] Consistent selection/inspection model across maps, interfaces and future definition editors.

## Phase 4: RSPSi / OpenRune backend integration

- [ ] Server module on top of the OpenRune FileStore/domain layer.
- [ ] Serve caches with Range support and versioned names.
- [ ] Implement `WorldSource` and project APIs.
- [ ] Accept edit batches, validate and save projects.
- [ ] Explicit **Publish Cache** and **Build OpenRune Project** actions with structured results.
- [ ] Golden-fixture tests running the same content through TypeScript and Kotlin decoders.
- [ ] Delivery path where the backend can serve the built Studio locally.
- [ ] Keep a desktop wrapper such as Tauri optional rather than architectural.

## Phase 5: rendering and performance

- [ ] Profile CPU scene build, draw calls, buffer uploads, cache misses and memory first.
- [ ] Strengthen the render-backend interface above the current WebGL2 implementation.
- [ ] Optional WebGPU backend only where it provides a measurable benefit.
- [ ] Mesh simplification/LOD work only if profiling shows triangle count is a limiting factor.
- [ ] Rust -> WASM for measured hot paths such as region/scene building, model decoding or terrain processing.
- [ ] Keep TypeScript reference implementations and parity fixtures for Rust/WASM paths.

## Phase 6: broader Content Studio

Done:

- [x] Interface workbench.
- [x] Interface component editing.
- [x] CS1 simulation.
- [x] CS2 manual execution.
- [x] Inventory/gameval simulation.

Next:

- [ ] Definitions editor for objects, NPCs, items and configs.
- [ ] Model and animation viewer.
- [ ] NPC/player preview tools.
- [ ] Content-to-world association workflows such as assigning interactions, skills and scripts.
- [ ] Search/indexing across project content.
- [ ] Validation and publish diagnostics suitable for real OpenRune projects.

## Current caveats

- Legacy TSX files remain outside the active Svelte UI and are intentionally quarantined until a dedicated cleanup can safely remove them.
- React-related build/type dependencies therefore remain temporarily even though React is no longer the application entrypoint.
- Without the legacy server, optional `/api/world` data can be unavailable; the editor itself still opens from local cache data.
- The app builds for the site root with Vite. Any old deployment scripts that assume `/play` need to be treated as legacy.
