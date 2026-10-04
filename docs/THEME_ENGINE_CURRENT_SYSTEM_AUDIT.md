# Offline Theme Engine & Spatial Intelligence Foundation Audit

**Status:** implementation foundation review  
**Repository state:** OR-ContentTS through draft PR #81  
**Date:** 2026-10-03  
**Purpose:** establish what the Studio can actually extract today, what is currently lossy or unavailable, and the minimum architecture needed for an offline cache-generated theme/spatial reasoning index.

---

## 1. Executive conclusion

The current Studio is already capable of supplying a large part of the **raw evidence layer** needed for a serious OSRS theme engine. It is not yet capable of producing a trustworthy theme model by itself.

The strongest existing foundation is:

- offline/local cache acquisition through `CacheSource`;
- synchronous cache/index access through `CacheSystem`;
- complete map-square terrain and static-loc decoding for the active editor/viewer path;
- typed loc model categories including walls, wall decorations, roofs, normal objects, and floor decorations;
- per-tile heights, underlays, overlays, overlay shapes/rotations, render flags, collision and lighting data;
- rich loc definitions including model ids, footprint, recolors/retextures, collision, actions, morphs, varbit/varp selectors, map-function/map-scene ids and ambient sound ids;
- decoded model geometry, material/texture references, bounds, face colors, texture coordinates, priorities and authored face bias;
- NPC and ground-item spawn datasets behind the framework-neutral `WorldSource`;
- rich NPC and item definition decoders;
- worker infrastructure suitable for long-running offline analysis;
- IndexedDB/local project infrastructure that can be reused for generated semantic artifacts;
- OpenRune project indexing and GameVal/RSCM metadata that can enrich ids with symbols when an OpenRune project is attached.

The biggest missing pieces are **not GPU features**. They are semantic and analytical:

1. no world-semantic index or persisted scan artifact;
2. no whole-cache/world scan orchestrator;
3. no first-class area/zone domain in the frontend world layer;
4. no building, room, road, roof-system, district or settlement model;
5. no asset-family/fingerprint layer;
6. no spatial statistics such as regional IDF, entropy, lift or typed adjacency frequencies;
7. no theme/biome/facet model;
8. no provenance/confidence model for combining cache-derived, derived and external evidence;
9. OSRS world-map archives are known by index id but are not exposed as a general world-map semantic decoder;
10. audio/music indices exist at the cache-index level, but there is no general audio semantic loader;
11. several potentially useful config fields are read and discarded rather than retained;
12. map-element definitions contain useful semantic fields, but the current runtime factory primarily exposes the **sprites**, not the full map-element metadata;
13. current OSRS quest semantics are not available through the existing `QuestTypeLoader` path;
14. no WFC/graph grammar/procedural generation layer exists yet.

The recommended first product is therefore **not “Theme Engine AI.”** It is a versioned **World Semantic Index** generated from the selected cache on the Cache page. The Theme Engine, biome discovery, settlement generator, building generator, path generator and later WFC solver should consume that index.

---

## 2. Architectural fit with the current Studio

The proposed feature fits the existing architecture well if it remains:

- **offline-first**;
- framework-neutral TypeScript;
- generated from the selected `CacheSource`;
- executed in workers;
- persisted as a cache-revision-bound analysis artifact;
- independent of OpenRune Server and the Kotlin backend;
- independent of WebGPU for correctness.

The current architecture already has the right top-level separation:

```text
CacheSource
   -> LoadedCache
      -> CacheSystem
         -> typed loaders / map loader / model loader

WorldSource
   -> NPC spawns
   -> ground-item spawns

OpenRuneProjectSession (optional enrichment)
   -> GameVals
   -> RSCM
   -> OpenRune source indexes
```

The Theme Engine should add a new framework-neutral path rather than attach itself to the editor renderer:

```text
LoadedCache + WorldData + optional project metadata
                    |
                    v
             SemanticScanner
                    |
                    v
          WorldSemanticIndex v1
                    |
       +------------+-------------+
       |            |             |
       v            v             v
 Theme Explorer  Suggestions   Generators
```

This index should be generated on demand from the Cache/analysis workflow and reused by Map Editor tools afterward.

---

## 3. Current capability audit

### 3.1 Cache acquisition and revision identity

**Current files**

- `client/src/cache/cache-source.ts`
- `client/src/rs/cache/CacheSystem.ts`
- `client/src/rs/cache/CacheIndex.ts`
- `client/src/rs/cache/loader/CacheLoaderFactory.ts`

**What exists**

`CacheSource` resolves the selected cache into:

```ts
type LoadedCache = {
    info: CacheInfo;
    type: CacheType;
    files: CacheFiles;
    xteas: XteaMap;
};
```

`CacheSystem` then exposes cache indices, and `CacheIndex` exposes archive ids, file ids, archive counts and files.

This is enough to implement a deterministic whole-cache scanner without going through the Svelte UI or renderer.

**Strengths**

- supports legacy, DAT and DAT2 cache families;
- selected cache has revision/game metadata;
- archive ids can be enumerated directly;
- scanners can bind output to an exact cache identity/revision;
- XTEAs remain available for revisions that require them.

**Limitations**

- current runtime paths generally instantiate a `CacheSystem` for viewer/editor use, not a persistent analysis job;
- there is no scan-manifest format or cache-analysis version;
- there is no invalidation rule such as `cache fingerprint + scanner version -> semantic index`;
- `CacheSystem.fromFiles` materializes synchronous cache access in memory, so a world scan must watch memory pressure on large caches;
- current type loaders cache loaded definitions by default. A full scan should clear caches between phases or use bounded/transient caches rather than retaining every decoded object/model indefinitely.

**Theme-engine readiness:** **strong raw foundation; missing orchestration/persistence.**

---

### 3.2 Map-square enumeration and raw map access

**Current files**

- `client/src/rs/map/MapFileIndex.ts`
- `client/src/rs/map/MapFileLoader.ts`
- `client/src/rs/scene/SceneBuilder.ts`

**What exists**

Map squares are naturally addressed by:

```text
map id = (mapX << 8) + mapY
```

Modern OSRS map groups use the map id as archive id. The existing loader reads:

- file 0: terrain;
- file 1: static loc placements.

Older cache layouts are also handled through named/legacy map indices and XTEA-aware loc reads.

`SceneBuilder.buildScene()` already composes neighboring map squares into a coherent scene and decodes terrain before locs.

**What this means for the scanner**

We do not need to invent a second map decoder. A scanner can enumerate the maps index and use the same terrain/loc decoding rules the editor uses.

**Important limitation**

`ModernMapFileLoader.getNpcSpawnData()` currently returns `undefined`. NPCs in the current OSRS workflow come through `WorldSource`, not modern cache map file 5.

**Theme-engine readiness:** **strong for terrain/static locs.**

---

### 3.3 Terrain data

**Current files**

- `client/src/rs/scene/Scene.ts`
- `client/src/rs/scene/SceneBuilder.ts`
- `client/src/rs/config/floortype/UnderlayFloorType.ts`
- `client/src/rs/config/floortype/OverlayFloorType.ts`

Each built `Scene` already contains:

- 4 planes;
- tile heights;
- render flags;
- underlay ids;
- overlay ids;
- overlay shape ids;
- overlay rotations;
- light occlusion;
- calculated tile lighting;
- blended terrain colors;
- collision maps.

This is a very good basis for derived spatial features such as:

- slope;
- roughness;
- elevation band;
- cliffs;
- water likelihood;
- terrain palette;
- path/road masks;
- indoor/outdoor candidates;
- terrain transition boundaries.

#### Underlay metadata already retained

`UnderlayFloorType` retains:

- RGB;
- derived HSL;
- hue multiplier;
- texture id;
- texture size;
- shadow behavior.

#### Overlay metadata already retained

`OverlayFloorType` retains:

- primary and secondary RGB;
- primary/secondary HSL;
- texture id and secondary texture id;
- hide-underlay behavior;
- texture size;
- shadow behavior;
- texture brightness;
- texture blending;
- underwater color;
- water opacity;
- optional name.

**Limitations**

- there is no terrain semantic classifier;
- roads/paths/grass/water/floors are not categorized;
- no global histogram/IDF of underlays/overlays exists;
- no learned transition model exists;
- water is not represented as a general semantic entity even though the raw signals exist.

**Theme-engine readiness:** **very strong raw data; no semantic layer.**

---

### 3.4 Static loc placement data

**Current files**

- `client/src/rs/scene/SceneBuilder.ts`
- `client/src/mapeditor/webgl/sceneLocData.ts`
- `client/src/mapeditor/webgl/loader/EditorMapDataLoader.ts`

The editor already serializes placed scene locs into explicit structures for:

- floor decoration;
- wall;
- wall decoration;
- general loc placement.

For placed locs it can retain:

- id;
- loc model type;
- rotation;
- plane;
- tile origin;
- footprint start/end;
- scene height;
- animation sequence;
- flags.

This is directly usable by a scanner.

The important point is that the editor is **already past raw packed landscape bytes**. It has an explicit placement model that can be repurposed for analysis.

**Limitation**

`SceneLocData` is editor/render-oriented. It is not a normalized world-analysis record with provenance, world coordinates, canonical family id, structural role or source map id.

We should not make the semantic scanner depend directly on renderer-specific scene entities. A scanner-specific normalized placement record should be introduced.

**Theme-engine readiness:** **strong input, needs a neutral analysis projection.**

---

### 3.5 Loc type grammar is already explicit

**Current file**

- `client/src/rs/config/loctype/LocModelType.ts`

The project already has exact structural categories:

```text
0  WALL
1  WALL_TRI_CORNER
2  WALL_CORNER
3  WALL_RECT_CORNER
4  WALL_DECORATION_INSIDE
5  WALL_DECORATION_OUTSIDE
6  WALL_DECORATION_DIAGONAL_OUTSIDE
7  WALL_DECORATION_DIAGONAL_INSIDE
8  WALL_DECORATION_DIAGONAL_DOUBLE
9  WALL_DIAGONAL
10 NORMAL
11 NORMAL_DIAGIONAL
12-21 roof variants
22 FLOOR_DECORATION
```

This is more useful than object names for a first structural grammar.

It lets the scanner distinguish:

- boundary walls;
- corners;
- wall-mounted decoration;
- free-standing objects;
- roof construction pieces;
- floor decoration.

**Important implication**

A V1 building detector and roof compatibility miner can be built without hand-tagging raw IDs.

**Theme-engine readiness:** **excellent structural seed.**

---

### 3.6 Loc definitions

**Current files**

- `client/src/rs/config/loctype/LocType.ts`
- `client/src/rs/config/loctype/LocTypeLoader.ts`

`LocType` already retains a large amount of high-value metadata:

#### Identity / interaction

- id;
- name;
- description where present;
- actions;
- interactive status;
- support-items behavior.

#### Geometry / placement

- model ids grouped by model type;
- sizeX/sizeY;
- rotation behavior;
- model scaling;
- model offsets;
- contour-ground behavior;
- normal merging;
- clipping/model clipping;
- obstruction/hollow state.

#### Visual style

- recolor-from/to;
- retexture-from/to;
- ambient/contrast.

#### Runtime/dynamic state

- sequence id;
- random sequence ids/delays;
- transforms;
- transform varbit;
- transform varp.

#### Map semantics

- mapFunctionId;
- mapSceneId;
- map-scene sprite flip field exists.

#### Audio

- ambientSoundId;
- ambientSoundDistance;
- ambientSoundChangeTicksMin/Max;
- ambientSoundRetain;
- ambientSoundIds.

#### Params

- params map.

This is already enough to build useful **asset fingerprints**, **morph families**, and **structural compatibility statistics**.

#### Current information loss in `LocType`

A theme scanner must not assume every decoded opcode becomes retained metadata.

Examples in the current decoder include fields that are read into locals or skipped:

- opcode 61 value is discarded;
- opcode 69 byte is discarded;
- several OSRS sound/easing/cross-world sound values are read but not stored;
- opcode 96 thickness is read but not stored;
- map-scene rotation behavior flags are currently not represented as persistent fields;
- cursor metadata is read and discarded;
- campaigns are read and discarded;
- several later unknown fields are intentionally not modeled;
- newer extended entity sub-ops/conditional ops can be skipped rather than retained.

This does **not** block Theme Engine V1, but it means the scanner needs a **metadata coverage report** and we should promote high-value discarded fields into typed properties as we learn that they matter.

**Theme-engine readiness:** **very strong, with a known decoder-retention audit required.**

---

### 3.7 Model geometry and visual fingerprints

**Current files**

- `client/src/rs/model/ModelLoader.ts`
- `client/src/rs/model/ModelData.ts`
- loc/NPC/object model loaders

The current model decoder exposes enough data for strong visual/structural fingerprints:

- vertices X/Y/Z;
- triangle indices;
- model bounds;
- face colors;
- face textures;
- texture mappings;
- face render types;
- render priorities;
- alpha;
- authored face bias on newer formats;
- vertex/face labels;
- animation skinning metadata;
- normals;
- texture coordinates.

This enables derived features such as:

- geometry hash;
- normalized bounds;
- footprint/aspect class;
- height class;
- color/material histogram;
- texture histogram;
- near-duplicate model detection;
- shared model set detection;
- recolor/retexture family detection.

**Current limitation**

The model loader is on-demand and decodes complete models. A naive scan of every model in the cache would be unnecessarily expensive.

The scanner should:

1. scan placed loc ids first;
2. collect only referenced model ids;
3. fingerprint only used models/families;
4. use compact fingerprints rather than storing full geometry in the semantic index.

**Theme-engine readiness:** **strong, but needs a bounded fingerprint phase.**

---

### 3.8 Textures/materials

**Current files**

- `client/src/rs/texture/TextureLoader.ts`
- current cache-loader factory implementations

The current texture abstraction exposes:

- texture ids;
- average HSL;
- transparency;
- texture material data;
- animation UV;
- decoded RGB/ARGB pixels.

This is enough for:

- palette similarity;
- texture-family similarity;
- material clustering;
- animated-water/lava style signals;
- dominant visual palette fingerprints.

**Limitations**

- no semantic texture labels;
- no global texture-use histogram;
- no texture-family clustering;
- no distinction yet between theme-defining texture and ubiquitous material.

**Theme-engine readiness:** **good raw visual evidence.**

---

### 3.9 Collision and topology

**Current files**

- `client/src/rs/scene/CollisionMap.ts`
- `client/src/rs/scene/SceneBuilder.ts`

Collision is already generated from loc types and placements, including directional wall flags, projectile-blocking flags, blocked floor and blocked floor-decoration state.

This is a major asset for spatial reasoning.

It can support:

- walkable-space flood fills;
- room interior candidates;
- building entrance detection;
- doorway/chokepoint detection;
- accessible/inaccessible structure classification;
- road/path connectivity;
- clearance scoring;
- future generator validation.

**Limitations**

- no neutral navigation graph;
- no room graph;
- no door-edge graph;
- no cross-plane transport graph;
- no settlement street graph;
- no current concept of public/private topology.

**Theme-engine readiness:** **strong low-level topology, missing graph derivations.**

---

### 3.10 Roof data

Roofs are already structurally identifiable because `LocModelType` explicitly distinguishes roof types 12-21.

The current map data therefore lets us mine two separate relationships:

#### Roof compatibility

```text
wall/building family -> roof family frequency
```

This answers:

> Which roof skins/material families are normally used with this architecture?

#### Roof topology

From placement type + rotation + footprint + adjacent roof pieces we can infer:

- ridge direction;
- slope edges;
- inner/outer corners;
- overhangs;
- flat sections;
- roof coverage polygons.

This answers:

> How is this footprint roofed?

These must remain separate. A style transfer may change roof **family** without changing the roof **topology**.

**Current limitation**

No building envelope or roof graph is currently derived, so this relationship is available in raw placements but not represented.

**Theme-engine readiness:** **excellent raw grammar, no derived roof system.**

---

### 3.11 NPC world data

**Current files**

- `client/src/world/world-source.ts`
- `client/src/world/bundled-world-source.ts`
- `client/src/world/bundled-spawn-data.ts`

Current `WorldData` contains:

```ts
npcSpawns: NpcSpawn[];
objSpawns: ObjSpawn[];
```

NPC spawn records currently provide:

- id;
- optional name;
- world x/y;
- level.

The bundled implementation selects an OSRS/2009/2004 NPC snapshot based on cache metadata.

**Strength**

The source is already behind a framework-neutral abstraction, which is exactly what the semantic scanner needs.

**Limitations**

- no wander radius;
- no spawn direction in the spawn record;
- no schedules;
- no transport semantics;
- no spawn provenance/confidence;
- no historical/revision matching beyond the bundled source selection;
- no NPC role classification.

The associated `NpcType` decoder is much richer and can enrich spawns with:

- name;
- size;
- model ids;
- recolors/retextures;
- actions;
- combat stats/level;
- transform varbit/varp and transforms;
- category;
- spawnDirection;
- background/random sound fields;
- conditional actions;
- animation/BAS metadata.

That is enough for a first automatic NPC family/role inference system.

**Theme-engine readiness:** **good anchor data, but current spawn schema is intentionally minimal.**

---

### 3.12 Ground-item world data

Current `ObjSpawn` records provide:

- item id;
- count;
- x/y;
- plane.

`ObjType` then provides rich item metadata such as:

- name;
- model;
- recolor/retexture;
- ground/inventory actions;
- category;
- noted/unnoted relationships;
- placeholder relationships;
- weight;
- trade/member metadata;
- conditional actions/sub-actions;
- params.

This can become a useful **functional semantic anchor** for rooms/areas.

Examples of safe uses:

- repeated tool/material families can increase confidence for a workshop;
- food/cooking item families can increase confidence for a kitchen/market;
- weapon/armor families can increase confidence for an armory.

It should not by itself define a theme.

**Theme-engine readiness:** **good secondary evidence.**

---

### 3.13 Varbits, varps and morph families

**Current files**

- `client/src/rs/config/vartype/bit/VarBitType.ts`
- `client/src/rs/config/vartype/VarManager.ts`
- `LocType.transform()`
- NPC transformation support

The Studio already understands:

- varbit base var;
- start/end bits;
- varp storage;
- loc transform varbit/varp;
- loc transform ids;
- NPC transform varbit/varp and transform ids.

This means we can automatically build **canonical morph families** now.

Example:

```text
base loc
  -> transform A
  -> transform B
  -> fallback
```

should become one semantic family with multiple runtime states.

**Important rule**

A varbit/varp-controlled loc is only evidence that it is **stateful**. It is not automatically a quest door, locked door or puzzle object.

Semantic classification must require additional evidence.

**Theme-engine readiness:** **strong for state families.**

---

### 3.14 Quest data

A `QuestType` decoder exists and models:

- names;
- varp/varbit progress/completed values;
- difficulty/type;
- prerequisites;
- skill requirements;
- quest points;
- params.

However, the current `Dat2CacheLoaderFactory.getQuestTypeLoader()` exposes it for the RuneScape cache path when that archive exists. It does **not** currently provide a general OSRS quest definition source.

Therefore, for the OSRS Theme Engine:

- varbit/varp state relationships are available;
- generic loc/NPC/item morph/state data is available;
- a reliable “this state belongs to quest X” mapping is **not currently available from the existing OSRS cache-loader path**.

Do not design V1 around quest labels.

A future external/OpenRune/wiki enrichment source may add quest semantics after the base spatial index exists.

**Theme-engine readiness:** **weak for OSRS quest semantics today.**

---

### 3.15 Map functions, map scenes and POI metadata

This area is more capable than the current rendering API makes obvious.

#### Loc side

`LocType` retains:

- `mapFunctionId`;
- `mapSceneId`.

#### Map element type

`MapElementType` currently decodes useful fields including:

- sprite id;
- hover sprite id;
- name;
- text color;
- text size;
- world-map/minimap visibility;
- randomize-position;
- operations.

It also reads visibility varbit/varp ranges and other metadata.

#### Current exposure problem

`CacheLoaderFactory.getMapFunctions()` currently returns `IndexedSprite[]`, and `MapImageRenderer` consumes those sprites for minimap rendering.

The full `MapElementType` semantic object is therefore **not exposed through the common factory interface used by the viewer/worker**.

This is a high-value improvement for the Theme Engine:

```ts
getMapElementTypeLoader(): MapElementTypeLoader | undefined
```

or another neutral metadata service should expose the definitions themselves, not just their sprites.

#### Information loss inside MapElementType

Several decoded values are currently local/discarded, including:

- primary/secondary visibility varbit/varp ranges;
- polygon/shape metadata;
- group value;
- base op string;
- alignment values;
- params are read into a local rather than assigned to `this.params`.

Those fields are not all required for V1, but the scanner should not claim full map-element semantics until this decoder is tightened.

**Theme-engine readiness:** **promising, currently under-exposed and partially lossy.**

---

### 3.16 World map archives and titles

`IndexType.OSRS` already identifies:

- `worldMapOld = 16`;
- `worldMapGeography = 18`;
- `worldMap = 19`;
- `worldMapGround = 20`.

That means the cache layer knows where these archives live.

However, the current common `CacheLoaderFactory` has **no world-map area/label/geography semantic loader**.

The active Studio architecture also states that zones/areas are not yet modeled as a frontend domain because there is no current consumer.

Therefore the Theme Engine currently **cannot rely on world-map titles, named world-map areas, area polygons or map-label hierarchy through a first-class API**.

This is one of the highest-value missing datasets to add after the initial cache-native scanner.

**Theme-engine readiness:** **archive access exists; semantic decoding/domain model missing.**

---

### 3.17 Audio and music

`IndexType.DAT2` identifies:

- sound effects;
- music tracks;
- music jingles;
- music samples;
- music patches.

Loc definitions already retain ambient sound ids and random ambient sound ids. NPC definitions also contain background/random sound metadata.

This gives us useful **sound identity references** around locs/NPCs today.

What does not exist:

- a general sound-effect semantic decoder/classifier;
- track-name/area association service;
- music-region mapping;
- acoustic family clustering;
- an API from the cache-loader factory for audio analysis.

Therefore V1 can include:

```text
ambientSoundId
ambientSoundIds
NPC sound ids
```

as anonymous categorical fingerprints, but should not pretend that sound id 123 means “swamp” or “forge” without separate evidence.

**Theme-engine readiness:** **IDs available in entity metadata; audio semantics not implemented.**

---

### 3.18 World areas / zones

The current architecture explicitly does **not** have an active first-class zone/area domain in `WorldSource`.

OpenRune source integration can inspect/edit area source where OpenRune already has that source representation, but that is different from a portable frontend `WorldArea` model.

The Theme Engine needs one.

A future neutral model should represent at minimum:

```ts
type WorldArea = {
    id: string;
    source: "cache" | "openrune" | "external" | "derived";
    planes: number[];
    geometry: Polygon | MultiPolygon;
    names?: string[];
    tags?: string[];
};
```

This should not be buried inside Theme Engine-specific code because Map Viewer, validation, pathing and procedural generation can all consume it.

**Theme-engine readiness:** **missing domain model.**

---

### 3.19 GameVals / RSCM / OpenRune project metadata

**Current files**

- `client/src/project/gameval-registry.ts`
- `OpenRuneProjectSession` and project indexers

The project already has a robust GameVal registry with:

- table/key/symbol/id;
- source kind;
- source path/line;
- conflict detection;
- base/generated DAT;
- module TOML;
- RSCM;
- provenance.

This is extremely useful as **optional symbolic enrichment**.

For an OpenRune project, a semantic index can attach:

```text
numeric id -> known project/cache symbol(s)
```

without using symbols as structural truth.

**Important limitation**

The Theme Engine must remain valid for a Basic Cache with no OpenRune checkout.

Therefore:

- cache numeric/structural evidence remains authoritative;
- GameVals enrich names and provenance;
- a missing GameVal must never make an asset unclassifiable.

**Theme-engine readiness:** **strong optional enrichment seam.**

---

### 3.20 DB tables/rows

The selected-cache DBTable/DBRow/DBColumn work is already implemented elsewhere in the Studio architecture.

This could eventually expose useful game-authored lookup tables, but there is not yet a Theme Engine-specific interpretation layer.

Treat DB content as an optional future semantic source, not a V1 dependency.

**Theme-engine readiness:** **decoder foundation exists; no theme interpretation.**

---

### 3.21 Workers

**Current file**

- `client/src/mapviewer/worker/RenderDataWorker.ts`

The current worker already initializes:

- CacheSystem;
- loc/npc/item type loaders;
- floor loaders;
- model loader;
- texture loader;
- animation loaders;
- map loader;
- VarManager;
- SceneBuilder;
- map renderer;
- world spawn snapshots.

This is almost the exact dependency set an offline scanner needs.

**Do not put a whole-world scan on the UI thread.**

Recommended implementation:

```text
SemanticScanWorker
  -> same loader factory foundation
  -> bounded scan phases
  -> progress events
  -> cancellation
  -> partial checkpoints
```

The render worker should not become the permanent analysis worker; extract/share initialization helpers where useful.

**Theme-engine readiness:** **strong execution infrastructure.**

---

### 3.22 Current WASM support

**Current file**

- `client/src/wasm/openrune-core-loader.ts`

The current WASM path is deliberately narrow and optional. It exposes a mesh packer and retains a TypeScript fallback.

There is no existing semantic-analysis/WFC/graph kernel in WASM.

That is fine.

For V1, TypeScript workers are the correct implementation because the difficult problem is correctness and data modeling, not arithmetic throughput.

Only move measured hot loops later, for example:

- global pair histograms;
- model fingerprint hashing;
- distance transforms;
- large candidate scoring;
- WFC propagation if profiling shows a need.

**Theme-engine readiness:** **no blocker; WASM not required.**

---

### 3.23 Current WebGPU support

PR #81 is adding a WebGPU object-rendering/priority-sort path.

That work is useful for future live editor visualization but should not become a Theme Engine dependency.

Potential later uses:

- full-map affordance heatmaps;
- distance fields;
- live scatter previews;
- large dense candidate scoring;
- preview-time theme transposition.

Not appropriate as the source of truth for:

- asset-family discovery;
- building detection;
- theme classification;
- semantic graph construction;
- persisted scan data.

**Theme-engine readiness:** **future accelerator only.**

---

### 3.24 Cache page / UI

**Current file**

- `client/src/ui/screens/cache/CacheRepositoryScreen.svelte`

The current Cache Repository screen focuses on:

- cache/profile creation;
- cache folder import;
- profile switching;
- OpenRune setup;
- cache loading/readiness.

It does **not** currently provide:

- analysis jobs;
- scan progress;
- semantic index status;
- index version/fingerprint;
- theme explorer;
- data coverage report;
- scan diagnostics.

This is the natural product surface for V1.

Recommended addition:

```text
Cache profile
  └── Intelligence / Analysis
       ├── Scan cache
       ├── scanner version
       ├── cache fingerprint
       ├── coverage
       ├── warnings
       ├── generated index size
       └── Open Theme Explorer
```

Do not force the user to open the Map Editor to build the index.

---

## 4. Capability matrix

| Dataset / capability | Current availability | Current quality | Missing for Theme Engine |
|---|---|---:|---|
| Cache revision / type | Yes | Strong | stable scan fingerprint |
| Map-square enumeration | Yes | Strong | scan orchestrator |
| Terrain height | Yes | Strong | derived slope/roughness |
| Underlay ids + color | Yes | Strong | semantic families / IDF |
| Overlay ids + shapes + rotation | Yes | Strong | path/water/floor classification |
| Static loc placements | Yes | Strong | neutral analysis projection |
| Loc model types 0-22 | Yes | Strong | semantic slot layer |
| Loc footprint/collision | Yes | Strong | building/room graph |
| Roof structural types | Yes | Strong | roof topology derivation |
| Loc models/recolors/retextures | Yes | Strong | asset fingerprints/families |
| Model geometry/materials | Yes | Strong | bounded fingerprint pipeline |
| Texture pixels/HSL/material | Yes | Strong | palette/material clustering |
| Collision map | Yes | Strong | navigation/topology graph |
| Loc morphs + varbit/varp | Yes | Strong | canonical entity family index |
| NPC spawns | Yes, bundled WorldSource | Medium | richer spawn/provenance fields |
| NPC definitions | Yes | Strong | role/family inference |
| Ground-item spawns | Yes | Medium | item-family semantic anchors |
| Item definitions | Yes | Strong | item-family normalization |
| Map function loc ids | Yes | Strong | semantic map-element access |
| Map element names/config | Decoder exists | Partial | expose loader + retain discarded fields |
| World-map archives | Index ids known | Weak | area/label/geography decoder |
| Areas/zones | OpenRune source can exist | Weak | portable first-class WorldArea |
| Ambient sound ids | Yes on loc/NPC | Medium | sound-family semantics |
| Music tracks/area music | Index ids known | Weak | decoder + coordinate association |
| Quest definitions for OSRS | No general current source | Weak | external/project semantic source |
| GameVal symbols | Optional OpenRune/project path | Strong when present | general world enrichment adapter |
| DB rows/tables | Yes | Strong decoder | interpretation layer |
| Spatial statistics | No | Missing | scanner |
| Asset families | No | Missing | fingerprint + clustering |
| Buildings/rooms | No | Missing | topology derivation |
| Roads/streets | No | Missing | terrain/connectivity derivation |
| Settlements/districts | No | Missing | clustering/morphology |
| Biomes/themes | No | Missing | semantic inference |
| Transitions | No | Missing | spatial field model |
| WFC/generators | No | Missing | later consumer layer |

---

## 5. The most important current correctness gaps

These should be addressed before treating the semantic index as authoritative.

### 5.1 Decoder retention is not the same as decoder compatibility

Several decoders successfully advance across an opcode but intentionally throw away the value.

For rendering, this is often fine.

For semantic mining, discarded metadata can become useful later.

The semantic scanner therefore needs a **coverage manifest** such as:

```ts
type DecoderCoverage = {
    type: "loc" | "npc" | "map-element" | ...;
    decodedCount: number;
    decodeFailures: number;
    partiallyRetainedFields: string[];
    unknownOpcodes: number[];
};
```

Do not silently label a definition “fully analyzed” because rendering succeeds.

### 5.2 MapElement metadata is under-exposed

The Studio already knows how to decode map-element names and sprites, but the common loader interface gives rendering only sprite arrays.

This should be fixed before using map icons as semantic anchors.

### 5.3 OSRS world-map semantic data is not first class

The archive ids are known. The actual area/title/geography domain is not.

### 5.4 Areas are not first class

We need a portable polygon/multipolygon model independent of OpenRune transport/source format.

### 5.5 World spawn provenance is absent

Bundled NPC/item snapshots work for rendering, but a semantic index should record:

- source id;
- source revision/date if known;
- confidence;
- whether the dataset is cache-matched.

### 5.6 No analysis persistence schema

Do not dump a giant unversioned JSON blob into IndexedDB.

Create an explicit format version.

---

## 6. What we can build immediately without new external data

A useful V1 scanner can be built from existing code alone.

### Phase A: map inventory

For every map square:

- terrain present?;
- loc data present?;
- placement count by plane/type;
- underlay histogram;
- overlay histogram;
- height/elevation summary;
- collision/walkable summary.

### Phase B: loc occurrence index

For every placed loc id/family:

- count;
- map-square count;
- 8x8 chunk count;
- plane distribution;
- loc-type distribution;
- orientation distribution;
- terrain association;
- neighbor family histogram.

### Phase C: asset fingerprint

For every **used** loc id:

```ts
type AssetFingerprint = {
    locId: number;
    modelTypes: number[];
    modelIds: number[];
    sizeX: number;
    sizeY: number;
    clipType: number;
    blocksProjectile: boolean;
    actions: string[];
    recolorSignature: string;
    retextureSignature: string;
    geometrySignature: string;
    materialSignature: string;
    mapFunctionId: number;
    mapSceneId: number;
    morphFamilyId?: number;
    soundSignature?: string;
};
```

### Phase D: automatic morph families

Collapse transform chains into canonical entity families.

### Phase E: automatic visual families

Cluster obvious variants using exact/near-exact evidence first:

1. identical model sets;
2. same model geometry + different recolor;
3. same model geometry + different retexture;
4. same footprint/model type + high geometry similarity.

Do not begin with ML embeddings.

### Phase F: spatial specificity

Calculate at several spatial scales:

- global frequency;
- map-square document frequency;
- chunk document frequency;
- contiguous-area frequency later;
- Shannon entropy;
- IDF.

This immediately identifies:

- ubiquitous filler;
- region-specific signatures;
- rare one-offs.

---

## 7. How to avoid the “everything relates to everything” failure mode

A flat graph is specifically **not recommended**.

### 7.1 Separate evidence dimensions

An asset should have independent scores/facets:

```text
STRUCTURAL
FUNCTIONAL
VISUAL/THEME
ENVIRONMENTAL
DYNAMIC/STATEFUL
```

A generic ladder may be:

```text
structural importance  0.85
functional importance  0.55
theme importance       0.02
```

A unique regional banner may be the opposite.

### 7.2 Typed edges only

Allowed relationships should have explicit meaning, for example:

```text
ATTACHED_TO
ADJACENT_TO
INSIDE_BUILDING
SHARES_MODEL
MORPHS_TO
ROOF_OF
ENTRANCE_OF
SPAWNS_NEAR
USES_TERRAIN
TRANSITIONS_TO
```

Never store a generic `RELATED_TO` edge.

### 7.3 No automatic transitive semantic relationship

If:

```text
crate -> dock
dock -> coastal town
```

do **not** infer:

```text
crate -> coastal theme
```

unless the crate itself has sufficient independent evidence.

### 7.4 Automatic stop-assets

Use spatial IDF + entropy.

High-world-frequency/high-entropy assets become non-voting for theme classification automatically.

They can still participate in structural or functional grammars.

### 7.5 Minimum support

Do not create a learned rule from one occurrence.

Every statistical relationship should retain:

- observations;
- expected baseline;
- lift/PMI;
- geographic spread;
- confidence.

### 7.6 Conditional relationships

Prefer:

```text
wall-decor A is common next to wall family B
WHEN locType = wall decoration
```

over raw object pair counts.

### 7.7 Negative evidence

Record meaningful absences:

- enclosed structure with no horizontal door;
- wall family normally roofed but currently open;
- settlement district with no residential interiors;
- road terminating without transition.

Negative evidence is useful for both classification and generator validation.

---

## 8. Recommended data separation

The generated index should have four layers.

### Layer 1: authoritative observations

Only facts read directly from the selected cache/world source.

Examples:

- tile underlay;
- loc 123 at coordinate;
- loc definition sizeX=2;
- model id;
- NPC spawn coordinate.

### Layer 2: derived spatial facts

Deterministic calculations.

Examples:

- slope;
- room polygon;
- building envelope;
- adjacency;
- distance to road;
- roof coverage.

### Layer 3: inferred semantics

Probabilistic classifications.

Examples:

- building likely bank;
- asset likely defensive wall;
- area likely agricultural;
- theme cluster membership.

Every inference stores:

```ts
{
    confidence: number;
    evidence: EvidenceRef[];
    algorithmVersion: string;
}
```

### Layer 4: labels/enrichment

Human or external names:

- “Yanille”;
- “Morytania”;
- “bank”;
- “zombie/necrotic”;
- GameVal symbol;
- wiki label.

These labels must never overwrite the lower evidence layers.

---

## 9. Building intelligence: what current data already supports

A first building detector is feasible now.

### Step 1: boundary graph

Use wall loc types + rotations to generate tile-edge boundaries.

### Step 2: interior flood fill

Use collision/boundaries to identify enclosed walkable polygons.

### Step 3: entrances

Find openings/door locs connecting inside to outside.

### Step 4: contents

Attach:

- normal locs;
- floor decoration;
- wall decoration;
- NPC spawns;
- item spawns;
- floor overlays.

### Step 5: roofs

Associate roof placements over the building footprint by plane and overlap.

### Step 6: vertical connectivity

Later include stairs/ladders/trapdoors/teleports when a transport/vertical-link classifier exists.

A building should become a first-class derived entity:

```ts
type Building = {
    id: number;
    footprint: Polygon;
    planes: number[];
    rooms: number[];
    entrances: Entrance[];
    wallFamilies: number[];
    roofFamilies: number[];
    interiorAssetFamilies: number[];
    npcFamilies: number[];
    itemFamilies: number[];
    functionCandidates: ScoredFacet[];
};
```

This is the required foundation for meaningful building generation and style transfer.

---

## 10. Roof intelligence

Do not collapse roof knowledge into one relationship.

### Compatibility model

Learns:

```text
wall/building family -> roof family
```

Used for style suggestions.

### Construction grammar

Learns:

```text
footprint/topology -> roof piece arrangement
```

Used for generation.

The existing loc model types already distinguish sloped, flat, inner/outer corner and overhang roof pieces, so V1 can mine roof grammars from placements without manually naming roof ids.

---

## 11. Settlement and biome intelligence

These should be derived **after** buildings/roads, not before.

### Settlement morphology features

- building density;
- building size distribution;
- spacing distribution;
- setback from roads;
- street width;
- block dimensions;
- wall/gate presence;
- landmark sizes;
- courtyard frequency;
- open-space ratio;
- agricultural field ratio;
- water/coast adjacency.

### Biome/environment features

- terrain palette;
- terrain texture distribution;
- elevation;
- water density;
- tree/vegetation family density;
- rock/cliff family density;
- weathered/dead vegetation signals;
- ambient sound family distribution later.

### Transition profiles

Do not assume `city -> farmland -> wilderness`.

Learn rings around detected settlement boundaries and compare how features change.

Examples of possible learned transitions:

```text
urban -> agriculture -> temperate forest
urban -> desert
urban -> swamp
port -> coastline
fortification -> devastated/hostile land
```

A map square is only a storage boundary. It must not become a theme boundary.

---

## 12. Theme representation

Avoid one-label themes.

Use composable facets, for example:

```text
environment
culture
function
architecture
condition
threat
density
wealth/power
magic
naturalness
```

An existing area can then keep structural facets while changing stylistic facets.

Example transformation:

```text
Yanille source
  environment: temperate
  architecture: fortified
  function: city
  condition: maintained
  magic: elevated

Target
  environment: blighted
  architecture: fortified      <- retained
  function: citadel            <- strengthened
  condition: ruined/infested
  magic: necrotic
  threat: extreme
```

This makes “powerful zombie Yanille” a constrained transformation rather than a global asset replacement.

---

## 13. First-class semantic index proposal

A reasonable V1 artifact:

```text
WorldSemanticIndexV1
├── manifest
│   ├── formatVersion
│   ├── scannerVersion
│   ├── cache identity
│   ├── world-source identity
│   └── generatedAt
├── mapSquares
├── terrainProfiles
├── locDefinitions
├── assetFingerprints
├── assetFamilies
├── morphFamilies
├── occurrenceStats
├── spatialRelations
├── buildings
└── diagnostics
```

Theme clusters can be added in a later format-compatible section or V2 after the evidence model is stable.

### Persistence

Prefer IndexedDB for the browser/Tauri local analysis cache, behind a dedicated store interface.

Do not put this into `ProjectStore`: the semantic index is generated cache metadata, not user-authored project content.

Suggested interface:

```ts
interface SemanticIndexStore {
    get(cacheFingerprint: string, scannerVersion: string): Promise<WorldSemanticIndex | undefined>;
    put(index: WorldSemanticIndex): Promise<void>;
    deleteForCache(cacheFingerprint: string): Promise<void>;
}
```

---

## 14. Cache page product workflow

Add a dedicated analysis section to the existing Cache Repository profile.

Example:

```text
World Intelligence
────────────────────────────────

Cache: LIVE / rev xxx
Scanner: v1

Status: Not generated

[ Generate Index ]

Phase
  ✓ map inventory
  ✓ terrain
  ✓ loc occurrences
  → model fingerprints
  ○ asset families
  ○ buildings

Coverage
  maps scanned          ...
  loc definitions       ...
  model decode failures ...
  unknown opcodes       ...
  maps without loc data ...
```

After completion:

```text
[ Open Semantic Explorer ]
[ Rebuild ]
[ Export Diagnostics ]
```

The first UI should emphasize **coverage and explainability**, not fancy AI-generated labels.

---

## 15. External data: useful later, but not a dependency

Current Studio-integrated external/project sources are primarily:

- bundled NPC spawn snapshots;
- bundled ground-item spawn snapshot;
- optional OpenRune project source indexes;
- optional GameVal/RSCM metadata.

Potential future enrichments include:

- world-map/POI datasets;
- transport/path datasets;
- external NPC spawn metadata;
- wiki area/function labels;
- historical cache data.

The architecture should allow these, but V1 should succeed without them.

Every external source must have:

```text
source id
version/date
provenance
confidence
coordinate system
cache revision compatibility
```

No external source should silently override cache-native observations.

---

## 16. WFC and procedural generation

WFC is a **consumer of learned constraints**, not the discovery engine.

Recommended eventual generation stack:

```text
Macro planner / graph grammar
   -> roads, districts, footprints, gates

Meso socket/WFC solver
   -> walls, corners, doors, windows, roofs, floor transitions

Micro scatter
   -> vegetation, clutter, debris, decoration
```

The semantic index supplies:

- allowed asset families;
- observed adjacency;
- topology templates;
- theme facets;
- density distributions;
- transition distributions.

V1 should not add a generic WFC dependency yet. OSRS-specific multi-tile locs, rotations, planes and wall-edge semantics will require a custom constraint layer regardless.

---

## 17. WebGPU's actual role

For the offline scanner: **none required**.

Later WebGPU can improve interactive editor tools:

- affordance heatmaps;
- distance-field visualization;
- mass candidate scoring;
- large scatter previews;
- live theme-transposition preview.

The semantic index remains CPU/worker generated and serializable.

This keeps the intelligence model usable in:

- browser without WebGPU;
- Tauri;
- tests;
- future CLI tooling.

---

## 18. Recommended implementation sequence

### Milestone 0: semantic-readiness fixes

Before theme clustering:

1. add a neutral semantic scanner package;
2. add scan manifest/fingerprint/versioning;
3. expose map-element definitions, not only sprites;
4. retain the highest-value currently discarded map-element fields;
5. add decoder coverage diagnostics;
6. define evidence/provenance types.

### Milestone 1: World Semantic Scanner V1

Generate:

- map inventory;
- terrain summaries;
- loc placement index;
- loc occurrence statistics;
- morph families;
- spatial IDF/entropy.

No ML. No WFC. No external network data.

### Milestone 2: Asset intelligence

Add:

- model fingerprints for referenced models;
- recolor/retexture signatures;
- material/palette signatures;
- asset families;
- generic/ubiquitous asset suppression.

### Milestone 3: structural intelligence

Add:

- wall-edge graph;
- rooms;
- buildings;
- entrances;
- roof systems;
- roads/path candidates;
- interior/exterior classification.

### Milestone 4: semantic anchors

Integrate:

- NPC family/role inference;
- ground-item family inference;
- map-element/POI metadata;
- optional GameVal symbols;
- first-class areas when available.

### Milestone 5: theme discovery

Calculate:

- building style profiles;
- settlement morphology;
- environment/biome profiles;
- theme clusters;
- transition fields.

Start with unnamed automatically discovered clusters. Human labeling should name/merge/split clusters rather than hand-tag thousands of locs.

### Milestone 6: editor suggestions

Use the index for:

- “objects that fit here”;
- “matching wall decoration”;
- “matching roof family”;
- “similar building families”;
- “current area profile”.

### Milestone 7: generators

Only after the learned rules are trustworthy:

- building generator;
- path/street generator;
- biome scatter;
- settlement generator;
- WFC/socket solver;
- theme/style transfer.

---

## 19. Concrete technical risks

### Memory

Whole-world scanning with normal cached type/model loaders can retain too much decoded state.

**Mitigation:** staged scans, referenced-model-only fingerprints, bounded caches, explicit `clearCache()`, typed-array summaries.

### Revision mismatch

Bundled world data may not be exact for every selected cache.

**Mitigation:** provenance + source identity in the index; cache-native facts always separate.

### False thematic relationships

Universal objects connect unrelated areas.

**Mitigation:** spatial IDF, entropy, typed edges, minimum support, no semantic transitive closure.

### Map-square boundary artifacts

Buildings/roads can cross 64x64 squares.

**Mitigation:** scan world coordinates and derive structures with border context; never treat map squares as semantic boundaries.

### Dynamic loc ambiguity

Morph state can radically change visuals/collision.

**Mitigation:** canonical morph family + state variants; preserve base and transformed definitions separately.

### Missing semantic labels

Many correct clusters will initially be unnamed.

**Mitigation:** allow unnamed families/clusters; naming is enrichment, not correctness.

### Decoder gaps

Rendering can work while semantic fields are discarded.

**Mitigation:** coverage diagnostics and incremental decoder promotion.

### Overfitting named OSRS cities

Hand-building rules for Yanille/Falador/Morytania would create a brittle system.

**Mitigation:** derive generic morphology/facets first, apply names afterward.

---

## 20. What not to build first

Do **not** begin with:

- a giant generic knowledge graph;
- vector embeddings for every object;
- an LLM-dependent runtime;
- WebGPU compute as the semantic core;
- Rust-only scanner logic;
- manually tagging thousands of loc ids;
- manually defining all OSRS city themes;
- WFC generation before structural extraction;
- external wiki scraping as a correctness dependency.

Those can all obscure whether the underlying spatial model is actually correct.

---

## 21. First PR after this design

The best first implementation slice is:

### **Semantic scanner foundation**

Add framework-neutral types and a worker-safe scanner that can:

1. enumerate the active cache's map squares;
2. decode terrain/static locs using existing loaders;
3. produce per-map counts/histograms;
4. produce per-loc occurrence/document-frequency statistics;
5. collapse loc morph families;
6. calculate global/map/chunk IDF + entropy;
7. report decoder/scan coverage;
8. persist a versioned index keyed by cache fingerprint;
9. expose progress/cancel through a service;
10. add a small Cache-page “Generate World Index” UI.

This slice is useful on its own and creates the foundation for every more complex feature described above.

---

## 22. Final assessment

The current system is **much closer to being able to mine the world than it is to being able to reason about themes**.

That is good.

We do not need to replace the cache architecture or renderer. We need to add the missing middle layer:

```text
raw cache/world data
        |
        v
spatial + structural evidence
        |
        v
semantic index
        |
        v
theme/biome/settlement reasoning
        |
        v
generation and editor assistance
```

The raw data needed for a credible first version is already largely present.

The highest-value improvements are:

1. build the versioned offline semantic scanner;
2. expose currently hidden map-element semantics;
3. add a first-class area model;
4. add coverage/provenance;
5. derive asset families and spatial specificity;
6. derive buildings/roofs/roads;
7. only then discover themes and add generators.

That sequence gives OR-ContentTS a reusable **world understanding layer**, rather than a one-off theme replacement feature.
