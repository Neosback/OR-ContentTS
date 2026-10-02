# Map editor: Inspector, previews and the 2D tile grid

This note records how the map editor's Inspector tab and its previews work, and keeps the **tile-neighbourhood grid
preview** (an early version of the tile preview) documented because the same idea is the starting point for the future
2D map / minimap view.

## Inspector tab

`client/src/ui/mapeditor/panels/InspectorPanel.svelte` is the first tab of the right-hand palette column and the
workspace of the **Select** tool (`object-selector`, `client/src/mapeditor/plugins/builtins/object-selector.plugin.ts`).
It has two collapsible sections:

| Section | Describes | Preview |
| --- | --- | --- |
| **Tile** | the selected tile, or the tile under the cursor when nothing is selected | single-tile preview with a *Blending* switch (`inspector/TilePreview.svelte`) |
| **Object** | the selected object, or the one under the cursor | rotatable 3D preview (`inspector/ObjectPreview.svelte`) |

The Select tool picks both kinds: clicking an object selects it (`host.selectedObject`), clicking bare ground selects a
tile (`host.selectedTile`). The two selections are mutually exclusive, but the Tile section keeps following the cursor
while an object is selected (`editor.hud.hoverTile`, sampled at about 25 Hz).

Data comes from the plugin host (`IEditorPluginHost`):

- `getTileInfo(level, worldX, worldY)` returns the stored tile fields (`h` height, `hl` height stack, `u`/`o`
  underlay/overlay stored as **id + 1**, `s` overlay shape, `r` rotation, `f` render flags).
- `getTileModel(level, worldX, worldY)` returns the tile's mesh (`SceneTileModel`: blended vertex colours, overlay
  shape faces) and its scene coordinates.
- `getHoveredTile()` returns the world tile under the cursor.
- `locTypeLoader` / `locModelLoader` / `underlayTypeLoader` / `overlayTypeLoader` / `textureLoader` provide names,
  models, floor colours and textures.

## Previews run on the CPU

Both previews use `inspector/raster.ts`, a small software triangle rasterizer: depth buffer, Gouraud vertex colours,
textures with alpha cut-outs, and translucent triangles blended over the opaque pass. It writes into an `ImageData`, so
the previews use **no GPU memory** and no extra WebGL context (see `docs/` notes on the GPU draw-call problem; the
editor's GPU budget is better spent on the map itself).

### Object preview

`inspector/model-preview.ts` projects the decoded model (`locModelLoader.getModel`, the same lit model the map draws)
orthographically and rasterizes it.

- Colours: lit models keep one HSL value per corner in `faceColors1/2/3` (low 16 bits); `HSL_RGB_MAP` turns it into RGB.
  `faceColors3 === -2` marks a hidden face and `-1` flat shading.
- Textures: textured faces keep only a lightness (low 7 bits) in their colour; it shades the texture sampled with the
  face's UVs (`model.uvs`, or `computeTextureCoords(model)` for unlit models). Textures are sampled at 64x64
  (`getPixelsArgb` rejects 32).
- Transparency: `faceAlphas` is 0 = opaque, 255 = invisible.
- Drag to rotate (yaw/pitch); the model is centred and scaled to fit.

### Tile preview

`inspector/TilePreview.svelte` draws the **single selected tile**, top-down with north up.

- **Blending on** (default): the tile's own mesh from `getTileModel`, i.e. exactly what the map shows. Tile-model
  vertices are in scene units (128 per tile, `z` north), so they are made tile-local by subtracting
  `sceneX * 128` / `sceneY * 128`. Underlay colours are already blended with neighbours; textured overlay faces use the
  texture.
- **Blending off**: the raw floor colours. The whole tile is filled with the underlay's own colour, then the overlay
  footprint (`getOverlayHighlightUvTriangles`) is drawn in the overlay's own colour. This is what a painted tile would
  look like without neighbour blending, which is useful when choosing colours.

## The tile-neighbourhood grid (kept for the 2D map)

The first tile preview drew the tile **and its neighbours** as a grid, and it is worth keeping as the basis for a 2D
map view:

- A `(2r + 1) x (2r + 1)` grid of square cells (r = 3, 22 px per cell), north at the top: row `y = (r - dy) * cell`,
  column `x = (dx + r) * cell`.
- For every cell call `getTileInfo(level, worldX + dx, worldY + dy)`. Missing map squares draw as near-black.
- Cell colour: underlay colour (`underlayTypeLoader.load(u - 1).getRgb()`), or `#1c1c1c` with no underlay; then the
  overlay colour (`overlayTypeLoader.load(o - 1).getRgb()`) over it, full cell for shape 0, the lower-left diagonal half
  for shaped overlays.
- A 1 px translucent black outline per cell (`rgba(0,0,0,0.28)`) gives the tile-grid look; the centre cell gets a
  2 px teal outline (`#5eead4`).
- Re-draw when the tile or the map snapshot changes (`editor.snapshot`), not every frame.

Ideas for the 2D map built from this: draw the grid per map square into an offscreen canvas (64 x 64 cells), cache it
per square and invalidate only the squares an edit touched, add overlay shape polygons from the tile mesh instead of the
diagonal half, and layer objects (walls, locs) as simple glyphs on top. The minimap renderer
(`client/src/rs/map/MapImageRenderer.ts`) already produces the in-game colours and can supply the base layer.

## Object preview scene (RSPSi-style)

`inspector/object-scene.ts` renders the object preview the way RSPSi's does: a 40° perspective orbit camera fitted to the
model, standing on a ground grid. The grid is one game tile (128 units) per cell, covers the object's footprint (the
loc size, swapped on quarter turns) plus a one-tile margin, and outlines the footprint. It is cast per pixel onto the
ground plane and composited *under* the rasterized model, so the model always occludes it. Colours come from the app
theme (`theme-colors.ts`: `--card` background, `--muted` fill, `--muted-foreground` lines, `--primary` footprint) and are
re-read when the theme changes. Controls: drag orbits, wheel zooms, double-click resets.

Z-fighting is handled in the rasterizer (`raster.ts`): perspective-correct interpolation (`invW`), a small depth
tolerance so later coplanar faces win, face render-priority ordering, and hidden faces skipped (lit `faceColors3 == -2`,
unlit render type 2).

The Tile and Object preview frames in the Inspector are always rendered at a fixed size (placeholders when nothing is
hovered or selected), so the panel never changes height.

## Tile painter drawer

The Tile painter is a drawer between the viewport and the brush rail (the rail stays the very bottom row). Its tab bar
(34 px) has a chevron that folds the drawer to just that bar and back (state and open height are remembered in
`map-editor-tile-painter-drawer-v1`, see `tile-painter-drawer.ts`). Each tab has an "apply" checkbox; the tab name is
not repeated inside the palette. A left column previews the floor the brush will paint (underlay colour with the overlay
colour or texture inset).
