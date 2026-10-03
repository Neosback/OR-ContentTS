/**
 * What the Tile tab's preview draws and how. Two ways of looking at a tile:
 *
 * - **raw**: the tile alone, flat, exactly as its stored values define it: the shape/rotation triangles (which are
 *   underlay and which overlay) in the floor's own colours, no neighbours and no height. For checking the data.
 * - **game**: the tile as the map draws it: the engine's tile mesh with the colours it blends from its neighbours and the
 *   heights it has among them (that is what the map's own view sees), shown large and optionally tilted so the relief shows.
 *   Only the chosen tile is drawn, so it is not tiny.
 */
export type TilePreviewMode = "raw" | "game";

export type TilePreviewSettings = {
    mode: TilePreviewMode;
    /** Outline every triangle the tile is made of. */
    wireframe: boolean;
    /** Colour the triangles by what they belong to: overlay green, underlay red. */
    tintFaces: boolean;
    /** game: the colours the map shows (underlay blended into neighbours). Off: each tile's own flat floor colours. */
    blend: boolean;
    /** game: camera angle above the ground in degrees; 90 looks straight down. */
    tilt: number;
};

export const DEFAULT_TILE_PREVIEW_SETTINGS: TilePreviewSettings = { mode: "game", wireframe: false, tintFaces: false, blend: true, tilt: 90 };

const STORAGE_KEY = "map-editor-tile-preview-v1";

export function sanitizeTilePreviewSettings(value: unknown): TilePreviewSettings {
    const source = (typeof value === "object" && value !== null ? value : {}) as Partial<Record<keyof TilePreviewSettings, unknown>>;
    const fallback = DEFAULT_TILE_PREVIEW_SETTINGS;
    const tilt = typeof source.tilt === "number" && Number.isFinite(source.tilt) ? Math.min(90, Math.max(20, Math.round(source.tilt))) : fallback.tilt;
    return {
        mode: source.mode === "raw" || source.mode === "game" ? source.mode : fallback.mode,
        wireframe: typeof source.wireframe === "boolean" ? source.wireframe : fallback.wireframe,
        tintFaces: typeof source.tintFaces === "boolean" ? source.tintFaces : fallback.tintFaces,
        blend: typeof source.blend === "boolean" ? source.blend : fallback.blend,
        tilt,
    };
}

export function loadTilePreviewSettings(): TilePreviewSettings {
    try {
        return sanitizeTilePreviewSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
    } catch {
        return DEFAULT_TILE_PREVIEW_SETTINGS;
    }
}

export function saveTilePreviewSettings(settings: TilePreviewSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        /* not remembered */
    }
}

/**
 * Orthographic view of a point on the map from the south, `tiltDegrees` above the horizon (90 = straight down).
 * `x` east and `z` north in tile-local units, `height` up. Returns the screen position (y down is the caller's flip,
 * here larger = further up the screen) and a depth where smaller is nearer.
 */
export function projectTilePoint(x: number, z: number, height: number, tiltDegrees: number): { x: number; up: number; depth: number } {
    const e = (Math.min(90, Math.max(0, tiltDegrees)) * Math.PI) / 180;
    return { x, up: z * Math.sin(e) + height * Math.cos(e), depth: z * Math.cos(e) - height * Math.sin(e) };
}
