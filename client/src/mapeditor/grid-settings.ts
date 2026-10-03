/**
 * The overlay grids in the 3D view: map squares (64 x 64 tiles), chunks (8 x 8) and single tiles. They are remembered in the
 * browser; the renderer reads the saved value when it is created and the Rendering panel / Quick controls change it.
 */
const STORAGE_KEY = "map-editor-grids-v1";

export type GridKind = "square" | "chunk" | "tile";

function read(): Partial<Record<GridKind, boolean>> {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
        return typeof parsed === "object" && parsed !== null ? (parsed as Partial<Record<GridKind, boolean>>) : {};
    } catch {
        return {};
    }
}

export function storedGrid(kind: GridKind): boolean {
    return read()[kind] === true;
}

export function storeGrid(kind: GridKind, on: boolean): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...read(), [kind]: on }));
    } catch {
        /* not remembered */
    }
}
