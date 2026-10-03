import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

import { cacheProxy } from "./vite/cache-proxy.mts";
import { studioProjectFiles } from "./vite/studio-project-files.mts";
import { glslAsString, serveCaches, wasmBz2Url } from "./vite/plugins.mts";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
/** Local development caches are bootstrapped directly into `client/caches`. */
const cachesDir = path.resolve(appRoot, "caches");

// SharedArrayBuffer needs cross-origin isolation, in dev and in `vite preview`.
// COOP must be `same-origin` for isolation (`same-origin-allow-popups` does not isolate). Same-origin
// popups served with these same headers stay in this browsing context group, so dockview popouts work.
const isolationHeaders = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "cross-origin",
};

export default defineConfig(({ command, mode }) => ({
    root: appRoot,
    base: "/",
    plugins: [
        svelte(),
        tailwindcss(),
        glslAsString(),
        wasmBz2Url(command, appRoot),
        serveCaches(cachesDir),
        cacheProxy(),
        studioProjectFiles(),
    ],
    resolve: {
        alias: { "@": path.resolve(appRoot, "src") },
        // Vitest must load Svelte's browser build or effects never run.
        conditions: mode === "test" ? ["browser"] : undefined,
    },
    optimizeDeps: {
        rolldownOptions: { plugins: [wasmBz2Url("serve", appRoot)] },
    },
    worker: {
        format: "es",
        plugins: () => [glslAsString(), wasmBz2Url(command, appRoot)],
    },
    server: {
        port: 3000,
        strictPort: true,
        headers: {
            ...isolationHeaders,
            // Dev only: lets the JS Self-Profiling API (new Profiler()) sample the editor.
            "Document-Policy": "js-profiling",
        },
    },
    preview: {
        port: 3000,
        headers: isolationHeaders,
    },
    test: {
        include: ["src/**/*.test.ts", "vite/**/*.test.ts"],
        environment: "jsdom",
    },
    build: {
        outDir: "dist",
        target: "es2022",
        sourcemap: true,
        chunkSizeWarningLimit: 4096,
    },
}));
