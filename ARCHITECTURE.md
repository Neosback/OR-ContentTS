# OpenRune Content Studio Architecture

## Active runtime

The active browser application has one UI entry chain:

```text
client/src/main.ts
  -> client/src/ui/main.ts
     -> client/src/ui/App.svelte
```

Svelte 5 owns the Studio shell and the active routes for cache management, map viewing, map editing, and interface tooling.

## Boundaries

### `client/src/ui/`

This is the active Studio UI layer.

- Svelte 5 is the UI framework.
- It may import framework-neutral TypeScript services, renderers, decoders, editor hosts, and data models.
- It must not import React, React DOM, `dockview-react`, or TSX modules.
- New Studio UI belongs here unless there is a strong architectural reason otherwise.

The CI boundary check enforces this rule.

### Framework-neutral TypeScript

The RuneScape/cache/rendering/editor runtime lives outside the Svelte component layer. Important areas include:

- `src/rs/`
- `src/mapviewer/`
- `src/mapeditor/`
- cache/profile/data utilities used by the Studio

These modules should avoid depending on a UI framework when practical. UI components consume these modules, not the other way around.

### Retained legacy TSX

The repository still contains legacy React/TSX sources outside `src/ui/`. They are retained temporarily because the migration removed the active React entrypoint before removing every historical/reference component.

Important rules:

1. Legacy TSX must not be imported back into the active Svelte UI.
2. React build/type dependencies remain temporarily while retained TSX is still included by TypeScript.
3. Removal of legacy TSX and React-only dependencies should happen as a dedicated cleanup after references are classified and validation remains green.
4. Do not add new features to the legacy React surface.

## Rendering

WebGL2 remains the reference renderer. Svelte owns UI orchestration, while rendering and cache-heavy work stay in framework-neutral TypeScript. Future Rust/WASM work should sit behind the same TypeScript-facing runtime boundaries rather than coupling directly to Svelte components.

## Backend boundary

The frontend is designed to work offline today. Server-backed behavior should sit behind explicit interfaces so the future RSPSi/OpenRune Studio backend can replace local/static implementations without rewriting the UI.

The backend will eventually own encoding, validation, project persistence, publishing, and OpenRune build actions.

## Validation

Every pull request that changes the client must pass the clean, reproducible blocking gate:

```bash
npm ci
npm run check:ui-boundaries
npm test
npm run build
```

Full-tree Svelte and TypeScript diagnostics also run in CI, but remain advisory while retained migration code and existing engine typing debt are being removed:

```bash
npm run validate:types
```

The goal is to make those diagnostics blocking once the existing debt is cleared, without allowing new React/TSX coupling back into the active Svelte UI.
