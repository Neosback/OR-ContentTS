import fs from "node:fs";
import path from "node:path";
import sirv from "sirv";
import type { Plugin } from "vite";

const WASM_BZ2_URL_ID = "\0foxglove-wasm-bz2-url";
const WASM_BZ2_OUTPUT = "assets/wasm-bz2.wasm";

/**
 * @foxglove/wasm-bz2's emscripten loader does `require("./module.wasm")` and expects the bundler
 * to hand back the file's URL as a string (webpack did). Answer that require with a CommonJS
 * module exporting the URL. Registered for the dep optimizer (dev), workers and the build.
 */
export function wasmBz2Url(mode: "serve" | "build", appRoot: string): Plugin {
    const binary = path.resolve(appRoot, "node_modules/@foxglove/wasm-bz2/wasm/module.wasm");
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
                return `module.exports = ${JSON.stringify(`/@fs${binary}`)};`;
            }
            this.emitFile({ type: "asset", fileName: WASM_BZ2_OUTPUT, source: fs.readFileSync(binary) });
            return `module.exports = ${JSON.stringify(`/${WASM_BZ2_OUTPUT}`)};`;
        },
    };
}

const GLSL_INCLUDE = /^#include "([./\w_-]+)";?/gim;

/** Inlines `#include "./file.glsl";` recursively, relative to the including file (no de-duplication). */
export function inlineGlslIncludes(source: string, fromFile: string, onInclude: (file: string) => void): string {
    return source.replace(GLSL_INCLUDE, (_match, includePath: string) => {
        const resolved = path.resolve(path.dirname(fromFile), includePath);
        onInclude(resolved);
        return inlineGlslIncludes(fs.readFileSync(resolved, "utf8"), resolved, onInclude);
    });
}

/** GLSL sources are imported as strings with their #includes inlined (same rules as ts-shader-loader). */
export function glslAsString(): Plugin {
    return {
        name: "studio:glsl",
        transform(code, id) {
            const file = id.split("?")[0];
            if (!/\.(glsl|vert|frag|vs|fs)$/.test(file)) return undefined;
            const source = inlineGlslIncludes(code, file, (included) => this.addWatchFile(included));
            return { code: `export default ${JSON.stringify(source)};`, map: null };
        },
    };
}

/**
 * Serves the local OSRS cache at /caches with HTTP Range support (the client resumes partial
 * downloads and streams sparse ranges). `no-store` and no etag: the browser's HTTP disk cache fails
 * writing the ~200 MB main_file_cache.dat2 (ERR_CACHE_WRITE_FAILURE aborts the fetch).
 */
export function serveCaches(cachesDir: string): Plugin {
    const mount = (server: { middlewares: { use: (path: string, handler: any) => void } }) => {
        if (!fs.existsSync(cachesDir)) return;
        server.middlewares.use(
            "/caches",
            sirv(cachesDir, {
                dev: true,
                etag: false,
                setHeaders(res) {
                    res.setHeader("Cache-Control", "no-store");
                    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
                },
            }),
        );
    };
    return { name: "studio:caches", configureServer: mount, configurePreviewServer: mount };
}
