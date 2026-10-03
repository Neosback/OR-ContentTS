# Map editor roadmap (from the reference editors)

What the editor still lacks, ranked, with where to look in the three references. Sources:
**T** = `/Users/tylercovalt/Documents/Java Deob/Terraini-deob/src/com/rspsi/…` (the most complete one),
**R** = `/Users/tylercovalt/Documents/ChatGPT/RSPSi-master/Client/src/main/…/com/rspsi/editor` (the `Editor/` module is only the legacy ImGui shell),
**C** = `reference/tsps-client` (the older TypeScript editor this one grew from; mostly superseded).

Already built: tile painter, height tool (basic), Delete/Move/Place/Replace with ghosts, region stamp, history with jump,
layouts, Rendering panel, status bar, command palette, virtualized object catalog, drag-to-place. See
`MAP_EDITOR_INSPECTOR_AND_PREVIEWS.md` and `MAP_EDITOR_PLUGINS_AND_LAYOUTS.md`.

1. **Object power tools**
   - Typed placement rules with a red reason on the ghost: T `com/jagex/map/SceneGraph.evaluatePlacement` (out of bounds, duplicate, tile capacity 5, occupied, wall/decoration/ground slot rules).
   - Type filters (T `tools/object/ObjectTypeFilter`), multi-select with marquee / lasso / select-by-attribute (R `tool/BoxSelectTool`, `LassoSelectTool`, `selection/SelectionQuery`).
   - Find all + bulk replace with a preview count and scope (map, layer, selection): T `ObjectReplacementPlan`, `ObjectReplaceDialog`.
   - Transform gizmo (integer tile steps, quarter turns).
2. **Height tool upgrade**: falloffs (smooth, linear, gaussian, sharp, hard), Laplacian and slope-limit smoothing, checker brush, apply-to-selection (T `tools/height/HeightBrushEngine`; R `ui/panels/HeightToolPanel`, `brush/BrushMask` = one mask for preview and edit).
3. **Prefab / fragment library**: `.rsmappiece`-style JSON with tags and a thumbnail, rotate / mirror / anchor, paste policies (height mode, conflicts, object type filter), channel-mask copy and delete (T `tools/mappiece`, `tools/stamp/StampPlan`; R `model/WorldFragment*`, `paste/WorldFragmentPastePlanner`).
4. **Spline / road tool with overlay autotiling** (R `terrain/autotile/OverlayAutotiler`, `tool/SplinePathTool`; T `tools/path/RoadShapeGrammar`, `PathPlanner`; quick first version C `PathGenerator.ts`).
5. **Lint panel**: severity-tagged findings that jump to the tile (overlay seam mismatches, corner-only overlay components, objects on blocked tiles, tile capacity). Model after T `IslandWarning` / `PathWarning` and R `validation/WorldValidator`.
6. **Delta layers**: non-destructive named layers with visibility, lock and order (T `layers/*`), plus a history size cap with a `truncated` flag (T `game/save/HistoryManager`).
7. **Export codecs and project format**: terrain and object writers with opcode-fit checks and format probing (T `com/jagex/map/TerrainFormat`, `MapRegion.save_terrain_block`, `SceneGraph.saveObjects`; C `RegionPack.ts`), a validated project file and autosave with recovery.
8. **Terrain generator in a worker**: seeded-noise islands with coast templates, palette and species tables (T `tools/island/*`, `island/coast-templates.json`).
9. **Object definition editor** (R `ObjectPropertyTree`): needs a config encoder / override layer first; the Properties window is read-only today.
10. **Smaller pieces**
    - OSRS 16-bit HSL colour picker with the real 6 / 3 / 7 bit steps.
    - Bitflag matrix for tile flags.
    - Region / plane outliner tree.
    - Sun and light-direction controls (the renderer already has the light vector).
    - Collision and route preview.
    - World-map jump parser (T `ui/worldmap/WorldMapJumpParser`).
    - Object icons on the minimap.

## Library decisions (so they are not re-litigated)

No `tinykeys` / `cmdk-sv` / `@tanstack/svelte-virtual` / Tweakpane: the in-house command registry and keybind system already do rebinding and conflict handling, the palette uses bits-ui `Command`, and virtualization is a ~70-line fixed-row component (`ui/components/VirtualList.svelte`, `ui/lib/virtual-window.ts`). Revisit a worker/OffscreenCanvas pool for thumbnails only if profiling shows the CPU rasterizer stalling.
