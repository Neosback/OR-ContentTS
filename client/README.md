# OpenRune Content Studio Client

The client is the active OpenRune Content Studio frontend.

## Runtime

- Vite 8
- Svelte 5
- TypeScript
- dockview-core
- WebGL2

The application boots through `src/main.ts -> src/ui/main.ts -> src/ui/App.svelte`.

Legacy React/TSX files still exist outside the active Svelte UI while migration cleanup is completed. They are not the application entrypoint and must not be imported into `src/ui`.

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

This runs the blocking UI architecture boundary check, Vitest suite and production Vite build.

Full-tree Svelte and TypeScript diagnostics are available separately with `npm run validate:types`. They currently report retained migration/type debt and remain advisory in CI until that debt is cleared.

See the repository [ARCHITECTURE.md](../ARCHITECTURE.md) and [ROADMAP.md](../ROADMAP.md) for the current architecture and planned work.
