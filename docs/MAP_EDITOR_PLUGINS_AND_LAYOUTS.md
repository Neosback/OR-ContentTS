# Map editor: layouts, HUD panels, plugin seams

## Layouts and settings

- **Saved layouts** (`client/src/ui/mapeditor/workspace-layouts.ts`, key `map-editor-layouts-v1`): a named snapshot of the
  dock (`DockviewApi.toJSON()`, popouts left out), the Tile painter's side and folded state, and
  the pinned Quick controls. `Workbench.captureLayout` / `applyLayout`. A layout that cannot be loaded falls back to the
  default layout instead of leaving an empty workspace. Layouts export to / import from a `.layout.json` file.
- **Starting points** (`Workbench.applyPreset`): *Default* and *Minimal* (3D view, tools, painter, brush bar).
- **Settings bundle** (`workspace-settings.ts`): every `map-editor-*` localStorage key in one JSON file (keybinds, plugin
  switches, brush, display, gizmo colours, pins, layouts). Importing replaces them and reloads. Cache profiles and projects
  are never included.
- All of it is in **View → Layouts** and **Settings → Workspace & layouts**.

## Floating panels and menus

Floating dock groups start at z-index 10 (`dockview.css`; dockview adds 2 each time a group is raised) so menus and dialogs
(50) always cover them; floating windows such as Object properties sit at 45. A title-bar-less "HUD" mode was tried and
removed; overlay/HUD support will come back in a different form.

## Brush ghost

With the Tile painter active, the tiles under the cursor are drawn as they would look after a stroke
(`WebGLMapEditorRenderer.renderBrushGhost`, rules in `mapeditor/brush-ghost.ts`): the tile's own vertex lighting
(`scene.tileLights`) applied to the underlay/overlay HSL, the overlay's texture from the terrain texture array, the real
shape and rotation, and a stamped height per corner. It is opaque, drawn without the cursor tint (the cursor is outline
only while the ghost shows), depth-tested with a small lift so walls, roofs and objects cover it like they cover the
ground, and limited to `GHOST_MAX_TILES` tiles per frame. A tile only gets a ghost if the stroke would change it. Not
modelled: underlay smoothing against neighbours (a new underlay shows its flat colour). Objects lying on the ground (floor
models) also cover it, as they would the painted result. Switch it off with *Brush ghost* in the Rendering panel.

## Plugin seams today

The built-in tools, brushes and workbench panels are still declared in code (`builtin-plugin-types.ts`,
`map-editor-panel-config.ts`, `map-editor-floatable-dock-defaults.ts`, `ui/mapeditor/panels.ts`). What a plugin can add
without touching those files:

- **Rendering controls**: `registerViewControl({ id, group, label, description, get, set })` in
  `mapeditor/view-controls.ts` adds a toggle to the Rendering panel; it can be pinned to Quick controls like any other.

## Next steps for a real plugin API (not done)

1. One **panel registry**: a panel is declared once (id, title, component, default placement, size) instead of in four
   places, and `registerDockPanel` lets a plugin add one. `MapEditorDockPanelId` becomes a string.
2. **Tool registry** for plugin tools (palette, cursor, paint policy), including their Tile painter parts.
3. **Commands and keybinds** already have registries; plugins should register through the same calls.
4. A **manifest** (id, version, requires) so the Plugin Hub can list, enable and order third-party plugins, and layouts can
   name the plugins they need.
