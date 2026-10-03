/** Active editing tool (right-click and drag on the map). */
export type MapEditorTool =
    | "underlay"
    | "overlay"
    | "height"
    | "smooth"
    | "object-selector"
    /** Puts copies of an object (the clipboard, or one picked from the catalog) onto tiles; Select keeps picking. */
    | "object-place"
    | "object-delete"
    | "region-stamp"
    | "tile-flags"
    /** The combined Tile painter brush: underlay, overlay, height and flags in one stroke (see tile-brush-model.ts). */
    | "tile-brush";

/** Brush footprint in tile space from center (saved type; flood is temporary while overlay fill mode is active). */
export type MapEditorBrushType = "square" | "circle" | "diamond";
