import { svelte } from "@sveltejs/vite-plugin-svelte";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sirv from "sirv";
import { defineConfig, type Plugin } from "vite";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
/** Downloaded by server/scripts/ensure-cache.ts; the Studio backend will serve this later. */
const cachesDir = path.resolve(appRoot, "../server/caches");
const wasmBz2Binary = path.resolve(appRoot, "node_modules/@foxglove/wasm-bz2/wasm/module.wasm");
const WASM_BZ2_URL_ID = "\0foxglove-wasm-bz2-url";
const WASM_BZ2_OUTPUT = "assets/wasm-bz2.wasm";

/**
 * @foxglove/wasm-bz2's emscripten loader does `require("./module.wasm")` and
 * expects the bundler to hand back the file's URL as a string (webpack did).
 * Answer that require with a CommonJS module exporting the URL. Registered for
 * both the dep optimizer (dev) and the production build.
 */
function wasmBz2Url(mode: "serve" | "build"): Plugin {
    return {
        name: "studio:wasm-bz2-url",
        enforce: "pre",
        resolveId(source, importer) {
            if (source === "./module.wasm" && importer?.includes("@foxglove/wasm-bz2")) {
                return WASM_BZ2_URL_ID;
            }
            return undefined;
        },
        load(id) {
            if (id !== WASM_BZ2_URL_ID) return undefined;
            if (mode === "serve") {
                return `module.exports = ${JSON.stringify(`/@fs${wasmBz2Binary}`)};`;
            }
            this.emitFile({ type: "asset", fileName: WASM_BZ2_OUTPUT, source: fs.readFileSync(wasmBz2Binary) });
            return `module.exports = ${JSON.stringify(`/${WASM_BZ2_OUTPUT}`)};`;
        },
    };
}

const GLSL_INCLUDE = /^#include "([./\w_-]+)";?/gim;

/**
 * Inlines `#include "./file.glsl";` recursively, relative to the including
 * file. Same rules as the ts-shader-loader webpack used: no de-duplication.
 */
function inlineGlslIncludes(source: string, fromFile: string, onInclude: (file: string) => void): string {
    return source.replace(GLSL_INCLUDE, (_match, includePath: string) => {
        const resolved = path.resolve(path.dirname(fromFile), includePath);
        onInclude(resolved);
        return inlineGlslIncludes(fs.readFileSync(resolved, "utf8"), resolved, onInclude);
    });
}

/** GLSL sources are imported as strings with their #includes inlined. */
function glslAsString(): Plugin {
    return {
        name: "studio:glsl",
        transform(code, id) {
            const file = id.split("?")[0];
            if (!/\.(glsl|vs|fs)$/.test(file)) return undefined;
            const source = inlineGlslIncludes(code, file, (included) => this.addWatchFile(included));
            return { code: `export default ${JSON.stringify(source)};`, map: null };
        },
    };
}

/** Serves the local OSRS cache at /caches with HTTP Range support for sparse streaming. */
function serveCaches(): Plugin {
    const mount = (server: { middlewares: { use: (path: string, handler: any) => void } }) => {
        if (fs.existsSync(cachesDir)) {
            server.middlewares.use("/caches", sirv(cachesDir, { dev: true, etag: true }));
        }
    };
    return { name: "studio:caches", configureServer: mount, configurePreviewServer: mount };
}

// SharedArrayBuffer needs cross-origin isolation, in dev and in `vite preview`.
const isolationHeaders = {
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "cross-origin",
};

export default defineConfig(({ command }) => ({
    root: appRoot,
    base: "/",
    plugins: [
        // Studio UI is Svelte. The legacy client's JSX is compiled by Vite's
        // built-in transform; it has no Fast Refresh boundary, so edits to it
        // full-reload (it holds a WebGL context, workers and the cache).
        svelte(),
        glslAsString(),
        wasmBz2Url(command),
        serveCaches(),
    ],
    resolve: {
        // Browser builds prefer *.web.ts (e.g. the WASM gzip); node tests get the plain file.
        extensions: [".web.ts", ".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"],
    },
    optimizeDeps: {
        // wasm-gzip is loaded with an explicit ?url, so it needs no pre-bundling.
        exclude: ["wasm-gzip"],
        rolldownOptions: { plugins: [wasmBz2Url("serve")] },
    },
    worker: {
        format: "es",
        plugins: () => [glslAsString(), wasmBz2Url(command)],
    },
    server: {
        port: 3000,
        strictPort: true,
        headers: isolationHeaders,
    },
    preview: {
        port: 3000,
        headers: isolationHeaders,
    },
    build: {
        outDir: "build",
        target: "es2022",
        sourcemap: true,
        chunkSizeWarningLimit: 4096,
    },
}));
