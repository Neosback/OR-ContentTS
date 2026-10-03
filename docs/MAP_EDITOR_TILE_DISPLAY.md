# How map tiles are displayed, and what a 2D view must match

The 3D view, the Inspector tile preview, the minimap and the world map all draw the same tile data. This note records
how each does it, so the planned **2D view** can look the same instead of reinventing it. Nothing here is a 2D
implementation; it is the spec to build one from. (The older neighbourhood-grid sketch is in
[MAP_EDITOR_INSPECTOR_AND_PREVIEWS.md](MAP_EDITOR_INSPECTOR_AND_PREVIEWS.md).)

## The data

A tile is a handful of typed-array cells per plane (`Scene.tile*[level][x][y]`, read through
`host.getTileInfo(level, worldX, worldY)`):

| Field | Meaning |
| --- | --- |
| `u` / `o` | underlay / overlay id **+ 1** (0 = none) |
| `s` / `r` | overlay shape 0-11 and rotation 0-3 (only meaningful with an overlay; shape 0 is a full tile) |
| `h` / `hl` | height, and the height stack of upper planes |
| `f` | render flags: 1 blocked, 2 bridge, 4 remove roof, 8 render on lower plane, 16 no map draw |

`SceneBuilder.blendUnderlays` blends each underlay colour with its neighbours (`BLEND_RADIUS` 5) into
`scene.tileBlendedColors`; `SceneBuilder.addTileModel` turns a tile into a `SceneTileModel` (`rs/scene/SceneTileModel.ts`)
using `tileShapeVertexIndices` / `tileShapeFaces` (13 entries: index 0 is a plain underlay tile, index `shape + 1` is
overlay shape `shape`).

## Colours

- **Blended (what the map shows):** the tile model's vertex colours, `HSL_RGB_MAP[hsl & 0xffff]`, Gouraud-shaded across
  each face. Used by the 3D terrain and by the Inspector's tile preview with *Blending* on (`inspector/TilePreview.svelte`).
- **Unblended:** the raw floor colours: `underlayTypeLoader.load(u - 1).getRgb()` for the base, then the overlay colour
  (`overlayTypeLoader.load(o - 1).getRgb()`) in the overlay's footprint. `#1c1c1c` stands in for a tile with no underlay.
- **Textures:** `textureLoader.getPixelsArgb(id, 64, true, 1.0)` gives a 64x64 ARGB image (size 32 is invalid).
  A textured face is the texel times a grey shade `255 * (0.35 + 0.65 * ((hsl & 127) / 127))`.
- `mapeditor/overlaySwatchTexture.ts` rasterizes overlay textures to data URLs for palette swatches (cached per
  `TextureLoader`, brightness 1.0).

## Shapes

`getTileShapeTriangles(shape, rotation)` (`rs/scene/SceneTileModel.ts`) returns the underlay and overlay triangles of a
shape in 0..1 tile units (x east, y north), built from the same tables as the real tile model; tests check every shape
and rotation partitions the tile exactly. `getOverlayHighlightUvTriangles(model, sceneX, sceneY)` returns the overlay
footprint of an actual tile model (textured faces first, then the shape table). Flip y for a north-up canvas:
`canvasY = (1 - y) * size`. The Tile painter's Shape palette and its Preview use `getTileShapeTriangles`.

## Flags and highlights (3D today, a 2D view must reuse the colours)

Flag overlays use `TILE_RENDER_FLAG_DESCRIPTORS` in `rs/map/TileRenderFlags.ts` (RGBA 0-1; the outline alpha is
`min(a + 0.35, 1)`, thickness 0.06):

| Flag | RGBA |
| --- | --- |
| 1 Blocked | 0.92, 0.22, 0.22, 0.42 |
| 2 Bridge | 0.25, 0.55, 0.95, 0.42 |
| 4 Remove roof | 0.95, 0.82, 0.20, 0.42 |
| 8 Render Z-1 | 0.20, 0.85, 0.85, 0.42 |
| 16 No map draw | 0.82, 0.35, 0.92, 0.42 |

Which flags are visible for the current plane goes through `isTileRenderFlagActiveForView` (bridge and render-Z bits on
lower planes are re-mapped to the plane being edited). Brush, hover and selection colours come from
`mapeditor/map-editor-gizmo-settings.ts`: brush fill `[0, 0, 0, .52]`, outline cyan `[0, 1, 1, 1]`, object hover
`[1, .55, .1, 1]`, selected `[.2, .55, 1, 1]`, map-square grid red, chunk grid green. In 3D the hover/selection outline of a
tile with an overlay follows the overlay footprint (`overlayMeshBoundary.ts`, `highlight-tile.frag.glsl`), not the
square. The 3D view draws no per-tile grid lines; only map-square and chunk lines.

## The minimap and world map (already 2D)

- `rs/map/MapImageRenderer.ts` renders a map square to an image in two ways: the classic minimap (4x4 px per tile, shape
  and rotation through the `tileShape2D` / `tileRotation2D` bit tables) and the HD one (Gouraud-rasterizes the real
  tile-model triangles with `minimapFaceColorsA/B/C`). Locs are drawn in wall colour `0xeeeeee` (`0xee0000` when
  interactive). Render flags decide tile visibility per level (`&0x18` skip, `&0x2` bridge, `&0x8` lower plane).
- `mapeditor/liveMinimapWorkerPayload.ts` sends the terrain arrays to a worker for squares that are not loaded;
  `MapEditor.ts` keeps `minimapImageUrls`, a pixel cache and a debounced, dirty-bounds refresh so edits show up. Loaded
  squares render from the live scene so unsaved edits are visible.
- `ui/mapeditor/panels/MinimapPanel.svelte` shows a 3x3 grid of 256 px images, cross-faded and rotated by camera yaw.
  `ui/components/rs/WorldMap.svelte` is the zoomable world map built on the same minimap blobs.

## What the 2D view must match (checklist)

1. **Same colours:** underlay and overlay from the blended tile model (or the unblended pair when blending is off), with
   overlay textures sampled the same way.
2. **Same shapes:** overlays clipped to `getTileShapeTriangles` / the tile model's overlay faces, with rotation.
3. **Same flags:** the descriptor colours above, drawn as fill + outline.
4. **Same hover and selection:** brush footprint from `mapeditor/brush-footprint.ts`; overlay-footprint outline for shaped
   tiles; selected tile outlined distinctly (the Inspector grid uses a 2 px `#5eead4` ring, 1 px `rgba(0,0,0,.28)` cell lines).
5. **Same edits:** redraw on `editor.snapshot` changes and edit-dirty bounds, never every frame.
6. **Same planes:** the render-flag rules for bridges and lower planes.

## Plan for the 2D view

- One offscreen canvas per map square (64x64 tiles at 8-16 px per tile), cached in an LRU and invalidated per edited
  tile range (reuse the minimap dirty tracking `accumulateMinimapDirtyFromEditedTiles`).
- Render with the CPU `Rasterizer` (`ui/mapeditor/inspector/raster.ts`, Gouraud + textures, no extra GL context) from the
  tile models, or reuse `MapImageRenderer`'s HD path, then draw flags, grid lines and hover on top as 2D vector overlays.
- Objects as glyphs on top, using the same `EditorObjectRef` data as the Select tool.
- Dock tab named **2D**, next to **3D** (`editor-scene-2d` is already reserved in `MapEditorDockPanelId`).
