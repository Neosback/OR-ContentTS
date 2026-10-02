import init, { initSync, MeshPacker } from "./openrune-core/openrune_core";
import { buildTextureTables, type TextureTables } from "./mesh-packer";

/**
 * Loads the OpenRune WebAssembly kernels. Every kernel has a TypeScript reference path, so a failed load or an
 * explicit switch-off (`?wasm=off`, or `localStorage["openrune.wasm"] = "off"`) just means the TS path runs.
 */
type State = "idle" | "loading" | "ready" | "failed";

let state: State = "idle";
let pending: Promise<boolean> | undefined;
let enabled = true;

export function loadOpenRuneCore(): Promise<boolean> {
    if (state === "ready") return Promise.resolve(true);
    if (state === "failed") return Promise.resolve(false);
    if (!pending) {
        state = "loading";
        pending = init()
            .then(() => {
                state = "ready";
                return true;
            })
            .catch((error: unknown) => {
                state = "failed";
                console.warn("OpenRune wasm kernels unavailable, using the TypeScript paths", error);
                return false;
            });
    }
    return pending;
}

/** Synchronous load from bytes (Node tests). */
export function loadOpenRuneCoreSync(bytes: BufferSource): void {
    initSync({ module: bytes });
    state = "ready";
}

export function setOpenRuneCoreEnabled(value: boolean): void {
    enabled = value;
}

/** True when the kernels are loaded and not switched off. */
export function isOpenRuneCoreActive(): boolean {
    return enabled && state === "ready";
}

/** The page-level preference: `?wasm=off` / `?wasm=on`, else `localStorage["openrune.wasm"]`, default on. */
export function readWasmPreference(): boolean {
    try {
        const fromUrl = new URLSearchParams(globalThis.location?.search ?? "").get("wasm");
        const value = fromUrl ?? globalThis.localStorage?.getItem("openrune.wasm") ?? "on";
        return value !== "off" && value !== "0" && value !== "false";
    } catch {
        return true;
    }
}

const tablesByMap = new WeakMap<Map<number, number>, TextureTables>();

/** Creates a mesh packer for a buffer, or undefined when the kernels are not active (callers fall back to TS). */
export function createMeshPacker(
    textureIndexMap: Map<number, number>,
    isTransparent: (textureId: number) => boolean,
    vertexCapacity: number,
): MeshPacker | undefined {
    if (!isOpenRuneCoreActive()) return undefined;
    let tables = tablesByMap.get(textureIndexMap);
    if (!tables) {
        tables = buildTextureTables(textureIndexMap, isTransparent);
        tablesByMap.set(textureIndexMap, tables);
    }
    return new MeshPacker(tables.index, tables.transparent, vertexCapacity);
}
