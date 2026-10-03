# Map editor: Inspector, previews and the 2D tile grid

This note records how the map editor's Inspector tab and its previews work, and keeps the **tile-neighbourhood grid
preview** (an early version of the tile preview) documented because the same idea is the starting point for the future
2D map / minimap view.

## Inspector: the Tile and Object tabs

The old single Inspector is now two dock panels that share one tab group by default and can each be docked, floated or
popped out on their own (right-click the tab):

- **Object** (`editor-object-selector`, `ui/mapeditor/panels/InspectorObjectPanel.svelte`) is the workspace of the
  **Select** tool (`client/src/mapeditor/plugins/builtins/object-selector.plugin.ts`). It keeps the old panel id so the
  panels that anchor to it (Delete objects, Region stamp, History) stay put.
- **Tile** (`editor-inspector-tile`, `InspectorTilePanel.svelte`).

Selecting a tile brings the Tile tab forward, selecting an object the Object tab (only while they share a tab group).
The viewport tab, formerly "Editor", is now **3D** (its id `editor-scene-editor` is unchanged); a 2D view will sit next
to it.

| Panel | Describes | Preview |
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

## Tile painter

The Tile painter is a dock panel, by default a drawer between the viewport and the brush rail (the rail stays the very
bottom row). It follows RSPSi: you choose which parts go into the brush, pick their values in the swatches and palettes,
and tick the parts you want applied. Brush size and shape live in the brush rail below, not in the painter.

- **Bar:** only says **Tile painter** (plus how many parts are ticked) and has a chevron that folds a bottom/top drawer to
  just the bar (state and open height in `map-editor-tile-painter-drawer-v3`, see `tile-painter-drawer.ts`) and a **⋯**
  menu (also on right-click).
- **Moving it:** the ⋯ menu docks it below, above, left or right of the 3D view, floats it, or opens an external window
  (`Workbench.moveTilePainter`, dockview `moveTo`). Its position is remembered and recovered after a layout restore. In a
  side column, or when narrower than 560 px, the parts become a row of chips above the palette and there is no fold.
- **Parts:** Underlay, Overlay, Shape, Rotation, Height, Flags, each with an "apply" checkbox and its current value;
  picking a value ticks the part. A *Preview* shows what one stroke lays down (underlay colour, then the overlay clipped to
  its shape and rotation, with its texture).
- **Shape / Rotation:** 12 shape cards drawn from the real shape tables (`getTileShapeTriangles` in
  `rs/scene/SceneTileModel.ts`) and four quarter turns, painted by `applyShapeChange` in `WebGLMapEditorRenderer.ts` right
  after the overlay with the rules in `mapeditor/tile-shape-paint.ts`: only tiles that have an overlay change, and a
  full-tile overlay (shape 0) has no rotation. One undo step per stroke.
- **Height** in the painter is only a value to stamp (`heightValue`, -2040 to 0, applied with `applyHeightSetRuntime`),
  like a colour. Raising, lowering, slope, blend, smooth, flatten and terrace are the separate **Height** tool (rail icon,
  its own dock panel `editor-height`, opened beside the inspector tabs).
- **Flags:** a card per flag with a checkbox (put it in the brush), its colour, its value (1, 2, 4, 8, 16) and what it does.
  Nothing about display lives here: showing or hiding a flag's colour is in the Rendering panel. Hold Ctrl while painting to
  clear the ticked flags instead.

**Eyedropper:** Alt+left-click in the 3D view (or the `I` key, command `tile-brush.eyedropper`) loads the tile under the
cursor into the brush: underlay, overlay, shape, rotation, height and flags. "Copy tile into brush" in the Tile tab does the
same for the selected tile.

**Brush footprint:** the hover preview and painting both use `mapeditor/brush-footprint.ts`, so what you see is what a
stroke covers. After an underlay edit every tile within the blend range (`SceneBuilder.BLEND_RADIUS`, 5) plus one is rebuilt;
with *Terrain smoothing* on, one painted tile visibly blends over an 11 x 11 area, which is the game's own underlay blending.

How tiles are drawn, and how a 2D view should match them, is in [MAP_EDITOR_TILE_DISPLAY.md](MAP_EDITOR_TILE_DISPLAY.md).

## Rendering panel and Quick controls

What the 3D view draws is controlled from one registry, `mapeditor/view-controls.ts` (id, group, label, description, get/set;
flag controls carry their colour). Two places show it:

- **Rendering** (dock panel `editor-rendering`, `ui/mapeditor/palettes/RenderingPalette.svelte`): a tab beside the
  inspector tabs that can be docked, floated or popped out like the others. Sections: *Plane view* (plane stepper, Hide
  below, Roofs, Bridges), *Scene* (Objects, Terrain smoothing) and *Tile flags* (a colour, value and meaning per flag, Show
  all / Hide all). Each row has a pin.
- **Quick controls** (the sliders button in the 3D view): lists the pinned controls as checkboxes that stay open so several
  can be flipped at once, plus *Customize in Rendering…*. Pins (`mapeditor/quick-controls-model.ts`, saved in
  `map-editor-quick-controls-v1`) default to Hide below, Roofs, Bridges, Objects and Terrain smoothing; pin or unpin any
  control, including individual flags, from the Rendering panel (*Reset pins* restores the defaults).

The brush rail at the bottom keeps only the plane stepper; the plane toggles moved here.

## Object tab details and the Properties window

The Object tab lists the loc id, kind and model type, world tile and plane, region id, rotation, size (and the footprint
once rotated), clipping, model and recolour counts, animation, transforms and actions, with *Copy id* / *Copy position*.
**Properties…** opens a floating window (`ObjectPropertiesWindow.svelte`, `mapeditor/object-properties.ts`) with every
field the cache holds for the object type, grouped (General, Models, Shape and lighting, Colours and textures, Animation,
Actions, Transforms, Sound, Params, Other fields), searchable and copyable. It follows the selected object. It is read-only:
the editor has no config encoder or project-level override for object types yet, so editing them needs that layer first.

Layouts, HUD panels and the brush ghost are described in [MAP_EDITOR_PLUGINS_AND_LAYOUTS.md](MAP_EDITOR_PLUGINS_AND_LAYOUTS.md).
