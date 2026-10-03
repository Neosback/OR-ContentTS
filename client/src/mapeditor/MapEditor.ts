import { clampBrushRadius } from "./brush-footprint";
import { vec3 } from "gl-matrix";
import type { AddPanelOptions } from "dockview-core";



import { CacheList, LoadedCache } from "../mapviewer/Caches";
import { Camera, ProjectionType } from "../mapviewer/Camera";
import { InputManager } from "../mapviewer/InputManager";
import { CacheSystem } from "../rs/cache/CacheSystem";
import { CacheLoaderFactory, getCacheLoaderFactory } from "../rs/cache/loader/CacheLoaderFactory";
import { BasTypeLoader } from "../rs/config/bastype/BasTypeLoader";
import { FloorTypeLoader, OverlayFloorTypeLoader } from "../rs/config/floortype/FloorTypeLoader";
import { LocModelLoader } from "../rs/config/loctype/LocModelLoader";
import { LocTypeLoader } from "../rs/config/loctype/LocTypeLoader";
import { NpcTypeLoader } from "../rs/config/npctype/NpcTypeLoader";
import { ObjTypeLoader } from "../rs/config/objtype/ObjTypeLoader";
import { SeqTypeLoader } from "../rs/config/seqtype/SeqTypeLoader";
import { VarManager } from "../rs/config/vartype/VarManager";
import { MapFileIndex, getMapSquareId } from "../rs/map/MapFileIndex";
import { MapManager } from "../mapviewer/MapManager";
import { ModelLoader } from "../rs/model/ModelLoader";
import { SeqFrameLoader } from "../rs/model/seq/SeqFrameLoader";
import { Scene } from "../rs/scene/Scene";
import { SceneBuilder } from "../rs/scene/SceneBuilder";
import { TextureLoader } from "../rs/texture/TextureLoader";
import {
    cloneSceneTerrainData,
    transferLiveMinimapWorkerRequest,
    type LiveMinimapWorkerRequest,
} from "./liveMinimapWorkerPayload";
import { RenderDataWorkerPool } from "../mapviewer/worker/RenderDataWorkerPool";
import { clamp } from "../util/MathUtil";
import { MapEditorRenderer } from "./MapEditorRenderer";
import type { MapEditorGizmoAppearance } from "./map-editor-gizmo-settings";
import { saveGizmoAppearanceToStorage } from "./map-editor-gizmo-settings";
import { EditorPluginHost } from "./plugins/editor-plugin-host";
import {
    BUILTIN_BRUSH_TYPE_PLUGINS,
    BUILTIN_EDITOR_TOOL_PLUGINS,
    BUILTIN_WORKBENCH_UI_PLUGINS,
    getBuiltinEditorToolPlugin,
} from "./plugins/builtins/current-plugin-layout.builtin";
import { bootstrapHeightToolModel, getHeightToolWorkbenchSnapshot } from "./plugins/builtins/height-tool-model";
import {
    bootstrapTileBrushModel,
    getTileBrushFocus,
    getTileBrushModel,
    getTileBrushWorkbenchSnapshot,
    type TileBrushComponent,
} from "./plugins/builtins/tile-brush-model";
import {
    bootstrapEditorBottomBarModel,
    getEditorBottomBarWorkbenchSnapshot,
} from "./plugins/builtins/editor-bottom-bar-model";
import { TOOL_RAIL, VIEWPORT_BAR } from "./bar-kinds";
import { barSnapshot } from "./bar-model";
import { getStatusBarWorkbenchSnapshot } from "./status-bar-model";
import { getViewportMinimapWorkbenchSnapshot } from "./viewport-minimap-model";
import { getObjectActionModel, getObjectActionWorkbenchSnapshot } from "./plugins/builtins/object-action-model";
import { getObjectDeleteWorkbenchSnapshot } from "./plugins/builtins/object-delete-model";
import { getMapEditorPanelDisplaySnapshot } from "./map-editor-panel-display";
import { getQuickControlsWorkbenchSnapshot } from "./quick-controls-model";
import {
    bootstrapPaintToolsStripModel,
    getPaintToolsStripWorkbenchSnapshot,
} from "./plugins/builtins/paint-tools-strip-model";
import {
    bootstrapTileFlagsToolModel,
    getTileFlagsToolWorkbenchSnapshot,
} from "./plugins/builtins/tile-flags-tool-model";
import { bootstrapUnderlayGradient, getUnderlayGradientWorkbenchSnapshot } from "./plugins/builtins/underlay-gradient-model";
import { bootstrapOverlayGradient, getOverlayGradientWorkbenchSnapshot } from "./plugins/builtins/overlay-gradient-model";
import { rotateSelectedObject as rotateSelectedObjectRuntime } from "./plugins/builtins/object-transform-runtime";
import { deleteObjectRef as deleteObjectRefRuntime } from "./plugins/builtins/object-delete-runtime";
import { captureRegionStamp } from "./plugins/builtins/region-stamp-capture";
import { deleteRegionBounds, pasteRegionStampAt as pasteRegionStampAtRuntime } from "./plugins/builtins/region-stamp-apply";
import {
    DEFAULT_REGION_STAMP_COPY_OPTIONS,
    resolveRegionStampCopyOptions,
    type RegionStampCopyOptions,
} from "./plugins/builtins/region-stamp-copy-options";
import { clearRegionStampLivePreview } from "./plugins/builtins/region-stamp-live-preview";
import type { RegionStamp, WorldTileBounds } from "./plugins/builtins/region-stamp-types";
import { normalizeWorldTileBounds } from "./plugins/builtins/region-stamp-types";
import { isCopyableObjectKind } from "./plugins/builtins/object-copy-placement";
import type { EditorToolKeyChord } from "./plugins/builtins/builtin-plugin-types";
import {
    clampViewerControlSettings,
    loadViewerControlSettingsFromStorage,
    type MapEditorViewerControlSettings,
    saveViewerControlSettingsToStorage,
} from "./map-editor-viewer-control-settings";
import type { MapEditorWorkbenchUiPluginId } from "./map-editor-workbench-layout";
import type { EditorMutation, EditorTransactionSource } from "./editor-transaction";
import type { EditorMapSquare } from "./webgl/EditorMapSquare";
import { WebGLMapEditorRenderer } from "./webgl/WebGLMapEditorRenderer";
import type { MapEditorBrushType, MapEditorTool } from "./map-editor-kinds";
import {
    MapEditHistory,
    type MapEditorHistorySnapshot,
    type MapEditorHistoryTool,
    type TileFieldSnapshot,
} from "./map-editor-history";
import {
    applyHistoryRedo,
    applyHistoryJump,
    applyHistoryUndo,
} from "./map-editor-history-apply";
import { recordHistoryTileMutation } from "./map-editor-history-record";
import { mainThreadBlobUrl } from "../util/blobUrl";
import type { PlaneViewOptions } from "./planeVisibility";
import { inspectViewportTile, type ViewportHoverInspectInfo } from "./viewportInspect";

export type { MapEditorBrushType, MapEditorTool } from "./map-editor-kinds";
export type { UnderlayGradientPattern, UnderlayPanelTab } from "./map-editor-underlay-gradient";
export type {
    EditorCacheServices,
    EditorRsConfigServices,
    EditorRuntimeServices,
    EditorTerrainPaintServices,
    IEditorPluginHost,
} from "./plugins/editor-plugin-host";
export { EditorPluginHost } from "./plugins/editor-plugin-host";

export type MapEditorViewMode = "editor" | "2d" | "live";

export type SandboxTerrainPreset = "flat" | "hills" | "mountains";

export interface SandboxTerrainSettings {
    preset: SandboxTerrainPreset;
    landform: "normal" | "island";
    seed: string;
    amplitude: number;
    scale: number;
    roughness: number;
    cliffiness: number;
    valleyDepth: number;
    waterLevel: number;
    waterDepth: number;
    beachWidth: number;
    inlandness: number;
}

/** @deprecated Use `MapEditorBrushType`. */
export type MapEditorBrushShape = MapEditorBrushType;

interface MapEditorCameraSnapshot {
    projectionType: ProjectionType;
    pitch: number;
    yaw: number;
    fov: number;
    orthoZoom: number;
    pos: vec3;
}

const DEFAULT_RENDER_DISTANCE = 128;

/** Minimap texture refresh after painting; debounced so rapid strokes don’t queue dozens of renders. */
const MINIMAP_REFRESH_DEBOUNCE_MS = 450;
const MAX_MINIMAP_PIXEL_CACHE_ENTRIES = 16;
const MAX_MINIMAP_IMAGE_CACHE_ENTRIES = 64;

const WORKBENCH_PLUGINS_STORAGE_KEY = "map-editor-workbench-plugins-v2";
const MAP_EDITOR_DOCK_PANEL_RESTORE_KEY = "map-editor-dock-panel-restore-v1";
const MAP_EDITOR_KEYBINDS_STORAGE_KEY = "map-editor-keybinds-v1";

interface PersistedWorkbenchPluginsV2 {
    tools: MapEditorTool[];
    ui: MapEditorWorkbenchUiPluginId[];
    brushShapes: MapEditorBrushType[];
}

type PersistedKeybindOverrides = Record<string, EditorToolKeyChord | null>;

/** Tool ids that now resolve to the Tile painter, with the drawer tab each one opens. */
const LEGACY_PAINT_TOOL_TABS: Partial<Record<MapEditorTool, TileBrushComponent>> = {
    underlay: "underlay",
    overlay: "overlay",
    "tile-flags": "flags",
};

/** Retired tool ids that resolve to another tool. */
const TOOL_ALIASES: Partial<Record<MapEditorTool, MapEditorTool>> = {
    smooth: "height",
};

export class MapEditor {
    inputManager: InputManager = new InputManager();
    camera: Camera = new Camera(3242, -26, 3202, -245, 1862);

    renderer: MapEditorRenderer;
    readonly ready: Promise<void>;

    /**
     * RuneLite-style injectable API: loaders, cache, scene, camera, map manager.
     * New terrain/paint code should take `IEditorPluginHost` (or a narrowed interface) instead of `MapEditor`.
     */
    readonly pluginHost: EditorPluginHost;

    // Cache
    loadedCache!: LoadedCache;
    cacheSystem!: CacheSystem;
    loaderFactory!: CacheLoaderFactory;

    textureLoader!: TextureLoader;
    seqTypeLoader!: SeqTypeLoader;
    seqFrameLoader!: SeqFrameLoader;

    locTypeLoader!: LocTypeLoader;
    objTypeLoader!: ObjTypeLoader;
    npcTypeLoader!: NpcTypeLoader;

    basTypeLoader!: BasTypeLoader;

    varManager!: VarManager;

    mapFileIndex!: MapFileIndex;

    underlayTypeLoader!: FloorTypeLoader;
    overlayTypeLoader!: OverlayFloorTypeLoader;

    modelLoader!: ModelLoader;
    locModelLoader!: LocModelLoader;

    sceneBuilder!: SceneBuilder;

    // Settings

    // Tile distance
    renderDistance: number = DEFAULT_RENDER_DISTANCE;
    // Map square distance
    unloadDistance: number = 2;
    // Map square distance
    lodDistance: number = 3;

    // State
    needsSearchParamUpdate: boolean = false;
    lastTimeSearchParamsUpdated: number = 0;

    debugText?: string;

    /** Blob URLs for classic-style minimap tiles (live scene when map is loaded, else worker). */
    private minimapImageUrls = new Map<number, string>();
    private loadingMinimapImageIds = new Set<number>();
    private minimapEditRefreshTimer: number | null = null;

    /** Full HD minimap raster per map square for incremental patches (scene-sized Int32 buffer). */
    private minimapPixelCache = new Map<number, Int32Array>();
    /** Pending dirty scene-tile bounds (from brush edits), merged before debounced minimap refresh. */
    private minimapDirtyByMapId = new Map<
        number,
        { minX: number; minY: number; maxX: number; maxY: number }
    >();

    selectedLevel: number = 0;

    /** Viewport plane filter: show planes up to this level (0–3) unless {@link hideBelowViewPlane}. */
    viewPlaneMax: number = 0;

    /** When true, hide planes below {@link viewPlaneMax}. */
    hideBelowViewPlane: boolean = false;

    /** Draw planes above {@link viewPlaneMax} like RS with roofs shown; off matches "Hide roofs". */
    showRoofs: boolean = true;

    /** Plane-1 bridge flags lower their column one plane, as the RS client renders bridges. */
    bridgeLinkBelow: boolean = true;

    private selectedUnderlayIdValue = 0;
    /** The underlay the Tile painter paints (id, not id + 1). Changing it refreshes the panels that show it. */
    get selectedUnderlayId(): number {
        return this.selectedUnderlayIdValue;
    }
    set selectedUnderlayId(value: number) {
        if (value === this.selectedUnderlayIdValue) return;
        this.selectedUnderlayIdValue = value;
        this.notifyWorkbenchStateChanged();
    }

    /** Overlay floor id; **-1** = clear overlay (stored as **0** in scene). */
    private selectedOverlayIdValue = -1;
    /** The overlay the Tile painter paints (id, or -1 for none). Changing it refreshes the panels that show it. */
    get selectedOverlayId(): number {
        return this.selectedOverlayIdValue;
    }
    set selectedOverlayId(value: number) {
        if (value === this.selectedOverlayIdValue) return;
        this.selectedOverlayIdValue = value;
        this.notifyWorkbenchStateChanged();
    }

    /** Tile radius from center (0 = single tile). Max 16. */
    private brushSizeValue = 2;
    /** Brush radius in tiles (0-16). Setting it re-renders the panels that show it and is clamped like the footprint. */
    get brushSize(): number {
        return this.brushSizeValue;
    }
    set brushSize(value: number) {
        const next = clampBrushRadius(value);
        if (next === this.brushSizeValue) return;
        this.brushSizeValue = next;
        this.notifyWorkbenchStateChanged();
    }

    brushType: MapEditorBrushType = "square";

    /** Opens on the object selector; the Tile tools (underlay, overlay, ...) are one click away. */
    editorTool: MapEditorTool = "object-selector";

    private editorToolListeners = new Set<() => void>();

    /** Paint tools shown in the sidebar / available via `setEditorTool` (persisted). */
    private enabledEditorToolPlugins = new Set<MapEditorTool>(BUILTIN_EDITOR_TOOL_PLUGINS.map((p) => p.id));

    /** Workbench regions (tools strip, brush row, history, etc.). */
    private enabledWorkbenchUiPlugins = new Set<MapEditorWorkbenchUiPluginId>(BUILTIN_WORKBENCH_UI_PLUGINS.map((p) => p.id));

    /** Brush footprint shapes offered in the brush bar (persisted). */
    private enabledBrushShapePlugins = new Set<MapEditorBrushType>(BUILTIN_BRUSH_TYPE_PLUGINS.map((p) => p.id));

    private workbenchStateListeners = new Set<() => void>();
    private historyListeners = new Set<() => void>();
    readonly mapEditHistory = new MapEditHistory();

    /** Last known dock `addPanel` options when a plugin panel was closed (for layout restore). */
    private dockPanelRestoreById = new Map<string, AddPanelOptions>();
    /** User keybind remaps; null means intentionally unbound. */
    private keybindOverrides = new Map<string, EditorToolKeyChord | null>();

    /** Height delta per step while painting in height mode (hold Alt to invert direction). */
    heightAdjustStep: number = 8;
    /** Sticky overlay same-id flood toggle (plugin keybind driven). */
    overlayFloodModeToggled: boolean = false;
    /** Sticky overlay target-mode toggle (plugin keybind driven). */
    overlayTargetModeToggled: boolean = false;
    /** Which mouse button is used for painting. */
    paintMouseButton: "left" | "right" = "right";
    /** Whether world objects (locs) are visible in editor viewport. */
    objectsVisible: boolean = true;
    hoveredObject?: import("./webgl/sceneLocPicker").EditorObjectRef;
    /** Object the viewport context menu is open on; outlined until the menu closes. */
    contextMenuObject?: import("./webgl/sceneLocPicker").EditorObjectRef;
    selectedObject?: import("./webgl/sceneLocPicker").EditorObjectRef;
    /** Ground tile picked by the Select tool (click on empty ground); mutually exclusive with `selectedObject`. */
    selectedTile?: { worldX: number; worldY: number; level: number };
    /** Source object for stamp-style copy placement (wireframe preview until click). */
    objectCopyTemplate?: import("./webgl/sceneLocPicker").EditorObjectRef;
    objectCopyPlacementActive: boolean = false;
    regionStampSelectBounds?: WorldTileBounds;
    regionStampDraftBounds?: WorldTileBounds;
    regionStampClipboard?: RegionStamp;
    regionStampPlacementActive: boolean = false;
    regionStampRotation: number = 0;
    regionStampCopyDialogOpen: boolean = false;
    regionStampCopyOptions: RegionStampCopyOptions = DEFAULT_REGION_STAMP_COPY_OPTIONS;
    regionStampPendingCopyBounds?: WorldTileBounds;
    /** Whether terrain shading uses underlay smoothing/blending across neighbors. */
    terrainSmoothingEnabled: boolean = false;

    viewMode: MapEditorViewMode = "editor";
    sandboxModeActive: boolean = false;
    sandboxBounds?: { minX: number; minY: number; maxX: number; maxY: number };
    sandboxTerrainSettings: SandboxTerrainSettings = {
        preset: "flat",
        landform: "normal",
        seed: "10353",
        amplitude: 96,
        scale: 24,
        roughness: 0.6,
        cliffiness: 0.55,
        valleyDepth: 0.45,
        waterLevel: 0.28,
        waterDepth: 0.55,
        beachWidth: 0.14,
        inlandness: 0.55,
    };

    private cameraSnapshotByMode: Partial<Record<MapEditorViewMode, MapEditorCameraSnapshot>> = {};

    /** When true, map/camera/paint/plugin key handling is skipped (e.g. settings dialog open). */
    private editorInputSuspended = false;
    /** Source-based suspend flags so multiple dialogs can coexist safely. */
    private editorInputSuspendSources = new Set<string>();

    private viewerControlSettings: MapEditorViewerControlSettings = loadViewerControlSettingsFromStorage();

    getViewerControlSettings(): MapEditorViewerControlSettings {
        return this.viewerControlSettings;
    }

    setViewerControlSettings(partial: Partial<MapEditorViewerControlSettings>): MapEditorViewerControlSettings {
        this.viewerControlSettings = clampViewerControlSettings({ ...this.viewerControlSettings, ...partial });
        saveViewerControlSettingsToStorage(this.viewerControlSettings);
        this.notifyWorkbenchStateChanged();
        return this.viewerControlSettings;
    }

    setEditorInputSuspended(suspended: boolean): void {
        this.editorInputSuspended = suspended;
        this.syncEditorInputSuspendedState();
    }

    setEditorInputSuspendedBySource(source: string, suspended: boolean): void {
        if (!source) {
            return;
        }
        if (suspended) {
            this.editorInputSuspendSources.add(source);
        } else {
            this.editorInputSuspendSources.delete(source);
        }
        this.syncEditorInputSuspendedState();
    }

    isEditorInputSuspended(): boolean {
        return this.editorInputSuspended || this.editorInputSuspendSources.size > 0;
    }

    private syncEditorInputSuspendedState(): void {
        this.inputManager.setInputBlockedForUi(this.isEditorInputSuspended());
    }

    setEditorTool(requestedTool: MapEditorTool): void {
        const requested = TOOL_ALIASES[requestedTool] ?? requestedTool;
        // The floor tools (underlay, overlay, flags) live in the Tile painter: selecting one opens that drawer tab.
        // Height is its own tool.
        const legacyTab = LEGACY_PAINT_TOOL_TABS[requested];
        let tool = requested;
        if (legacyTab) {
            const brush = getTileBrushModel(this.pluginHost);
            brush.setTab(legacyTab);
            brush.setEnabled(legacyTab, true);
            tool = "tile-brush";
            // Re-selecting the tool while it is already active still has to bring the right tab forward.
            this.notifyEditorToolListeners();
        }
        if (!this.enabledEditorToolPlugins.has(tool)) {
            return;
        }
        if (this.editorTool === tool) {
            return;
        }
        const inObjectFamily = (name: MapEditorTool): boolean => name === "object-selector" || name === "object-place";
        if (inObjectFamily(this.editorTool) && !inObjectFamily(tool)) {
            // Leaving for a paint/delete/stamp tool ends the placement in progress; the clipboard stays for next time.
            this.cancelObjectCopyPlacement();
            this.clearSelectedObject();
            this.clearSelectedTile();
        } else if (this.editorTool === "object-place" && tool === "object-selector") {
            // Back to Select: stop putting things down, keep the clipboard (V pastes it again).
            this.cancelObjectCopyPlacement();
        }
        if (tool === "object-delete" || this.editorTool === "object-delete") {
            this.hoveredObject = undefined;
        }
        if (tool === "object-delete") {
            this.cancelObjectCopyPlacement();
            this.clearSelectedObject();
        }
        if (tool === "region-stamp") {
            this.hoveredObject = undefined;
            this.cancelObjectCopyPlacement();
            this.clearSelectedObject();
        }
        if (this.editorTool === "region-stamp" && tool !== "region-stamp") {
            this.cancelRegionStampCopyDialog();
            this.cancelRegionStampPlacement();
            this.clearRegionStampSelection();
        }
        this.editorTool = tool;
        if (tool === "object-place" && this.objectCopyTemplate && !this.objectCopyPlacementActive) {
            // Opening Place with something on the clipboard puts it in hand straight away.
            this.objectCopyPlacementActive = true;
        }
        this.notifyEditorToolListeners();
    }

    private notifyEditorToolListeners(): void {
        for (const listener of this.editorToolListeners) {
            listener();
        }
    }

    /** Select and Place share one engine (picking, ghosts, placement clicks); Place just never picks on click. */
    isObjectSelectorToolActive(): boolean {
        return (
            (this.editorTool === "object-selector" && this.isEditorToolPluginEnabled("object-selector")) ||
            this.isObjectPlaceToolActive()
        );
    }

    isObjectPlaceToolActive(): boolean {
        return this.editorTool === "object-place" && this.isEditorToolPluginEnabled("object-place");
    }

    isObjectDeleteToolActive(): boolean {
        return this.editorTool === "object-delete" && this.isEditorToolPluginEnabled("object-delete");
    }

    isRegionStampToolActive(): boolean {
        return this.editorTool === "region-stamp" && this.isEditorToolPluginEnabled("region-stamp");
    }

    getRegionStampSelectBounds(): WorldTileBounds | undefined {
        return this.regionStampSelectBounds;
    }

    getRegionStampDraftBounds(): WorldTileBounds | undefined {
        return this.regionStampDraftBounds;
    }

    isRegionStampPlacementActive(): boolean {
        return this.regionStampPlacementActive && this.regionStampClipboard != null;
    }

    getRegionStampRotation(): number {
        return this.regionStampRotation;
    }

    getRegionStampClipboard(): RegionStamp | undefined {
        return this.regionStampClipboard;
    }

    isRegionStampCopyDialogOpen(): boolean {
        return this.regionStampCopyDialogOpen;
    }

    getRegionStampCopyOptions(): RegionStampCopyOptions {
        return this.regionStampCopyOptions;
    }

    private clearRegionStampLivePreviewIfNeeded(): void {
        if (this.renderer instanceof WebGLMapEditorRenderer) {
            clearRegionStampLivePreview(this.renderer);
        }
    }

    openRegionStampCopyDialog(): void {
        if (!this.regionStampSelectBounds) {
            if (this.regionStampClipboard) {
                this.regionStampPlacementActive = true;
                this.notifyWorkbenchStateChanged();
            }
            return;
        }
        this.regionStampCopyDialogOpen = true;
        this.regionStampPendingCopyBounds = this.regionStampSelectBounds;
        this.setEditorInputSuspendedBySource("region-stamp-copy", true);
        this.notifyWorkbenchStateChanged();
    }

    cancelRegionStampCopyDialog(): void {
        if (!this.regionStampCopyDialogOpen && this.regionStampPendingCopyBounds == null) {
            return;
        }
        this.regionStampCopyDialogOpen = false;
        this.regionStampPendingCopyBounds = undefined;
        this.setEditorInputSuspendedBySource("region-stamp-copy", false);
        this.notifyWorkbenchStateChanged();
    }

    confirmRegionStampCopy(options: RegionStampCopyOptions): void {
        if (!(this.renderer instanceof WebGLMapEditorRenderer)) {
            this.cancelRegionStampCopyDialog();
            return;
        }
        const bounds = this.regionStampPendingCopyBounds ?? this.regionStampSelectBounds;
        this.regionStampCopyOptions = resolveRegionStampCopyOptions(options);
        this.regionStampCopyDialogOpen = false;
        this.regionStampPendingCopyBounds = undefined;
        this.setEditorInputSuspendedBySource("region-stamp-copy", false);
        if (!bounds) {
            this.notifyWorkbenchStateChanged();
            return;
        }
        this.regionStampClipboard = captureRegionStamp(this.renderer, bounds, this.regionStampCopyOptions);
        this.regionStampPlacementActive = true;
        this.regionStampRotation = 0;
        this.notifyWorkbenchStateChanged();
    }

    updateRegionStampDrag(anchorWorldX: number, anchorWorldY: number, worldX: number, worldY: number): void {
        this.regionStampDraftBounds = normalizeWorldTileBounds(anchorWorldX, anchorWorldY, worldX, worldY);
        this.notifyWorkbenchStateChanged();
    }

    finishRegionStampDrag(anchorWorldX: number, anchorWorldY: number, worldX: number, worldY: number): void {
        this.regionStampSelectBounds = normalizeWorldTileBounds(anchorWorldX, anchorWorldY, worldX, worldY);
        this.regionStampDraftBounds = undefined;
        this.regionStampPlacementActive = false;
        this.notifyWorkbenchStateChanged();
    }

    clearRegionStampSelection(): void {
        this.regionStampSelectBounds = undefined;
        this.regionStampDraftBounds = undefined;
        this.notifyWorkbenchStateChanged();
    }

    copyRegionStampSelection(): void {
        this.openRegionStampCopyDialog();
    }

    cancelRegionStampPlacement(): void {
        if (!this.regionStampPlacementActive && this.regionStampRotation === 0) {
            return;
        }
        this.clearRegionStampLivePreviewIfNeeded();
        this.regionStampPlacementActive = false;
        this.regionStampRotation = 0;
        this.notifyWorkbenchStateChanged();
    }

    rotateRegionStamp(): void {
        if (!this.isRegionStampPlacementActive()) {
            return;
        }
        this.regionStampRotation = (this.regionStampRotation + 1) & 3;
        this.notifyWorkbenchStateChanged();
    }

    deleteRegionStampSelection(): boolean {
        const bounds = this.regionStampSelectBounds;
        if (!bounds || !(this.renderer instanceof WebGLMapEditorRenderer)) {
            return false;
        }
        const ok = deleteRegionBounds(this.pluginHost, this.renderer, bounds);
        if (ok) {
            this.clearRegionStampSelection();
            this.notifyWorkbenchStateChanged();
        }
        return ok;
    }

    pasteRegionStampAt(worldX: number, worldY: number): boolean {
        const stamp = this.regionStampClipboard;
        if (!stamp || !this.isRegionStampPlacementActive() || !(this.renderer instanceof WebGLMapEditorRenderer)) {
            return false;
        }
        this.clearRegionStampLivePreviewIfNeeded();
        const ok = pasteRegionStampAtRuntime(
            this.pluginHost,
            this.renderer,
            stamp,
            worldX,
            worldY,
            this.regionStampRotation,
        );
        if (ok) {
            this.regionStampPlacementActive = false;
            this.notifyWorkbenchStateChanged();
        }
        return ok;
    }

    /** Plane used for tile picking (hover cursor); follows the viewport plane filter in object tools. */
    getTilePickLevel(): number {
        if (this.isObjectSelectorToolActive() || this.isObjectDeleteToolActive()) {
            return Math.max(0, Math.min(Scene.MAX_LEVELS - 1, this.viewPlaneMax | 0));
        }
        return this.selectedLevel;
    }

    subscribeEditorTool = (listener: () => void): (() => void) => {
        this.editorToolListeners.add(listener);
        return () => {
            this.editorToolListeners.delete(listener);
        };
    };

    getEditorTool = (): MapEditorTool => this.editorTool;

    /**
     * Underlay floor type id for painting at integer world tile coordinates
     * (same convention as `selectedUnderlayId`; scene stores **id + 1**).
     * Delegates to the active tool plugin paint policy when set.
     */
    getUnderlayPaintTypeId(worldX: number, worldY: number): number {
        const plugin = getBuiltinEditorToolPlugin(this.editorTool);
        const ctx = { host: this.pluginHost, input: this.inputManager, worldX, worldY };
        const resolved =
            plugin.paintPolicy?.resolveUnderlayPaintTypeId?.(ctx) ?? plugin.resolveUnderlayPaintTypeId?.(ctx);
        if (resolved !== undefined) {
            return resolved;
        }
        return this.selectedUnderlayId;
    }

    getOverlayPaintTypeId(worldX: number, worldY: number): number {
        const plugin = getBuiltinEditorToolPlugin(this.editorTool);
        const ctx = { host: this.pluginHost, input: this.inputManager, worldX, worldY };
        const resolved = plugin.paintPolicy?.resolveOverlayPaintTypeId?.(ctx);
        if (resolved !== undefined) {
            return resolved;
        }
        return this.selectedOverlayId;
    }

    setBrushType(type: MapEditorBrushType): void {
        if (!this.enabledBrushShapePlugins.has(type)) {
            return;
        }
        this.brushType = type;
        this.notifyWorkbenchStateChanged();
    }

    cycleBrushType(): void {
        const enabled = BUILTIN_BRUSH_TYPE_PLUGINS.filter((p) => this.enabledBrushShapePlugins.has(p.id)).map((p) => p.id);
        if (enabled.length === 0) {
            return;
        }
        const idx = enabled.indexOf(this.brushType);
        const next = enabled[(idx + 1 + enabled.length) % enabled.length]!;
        this.brushType = next;
        this.notifyWorkbenchStateChanged();
    }

    adjustBrushSize(delta: number): void {
        this.brushSize = this.brushSize + delta;
    }

    toggleOverlayFloodMode(): void {
        this.overlayFloodModeToggled = !this.overlayFloodModeToggled;
        this.notifyWorkbenchStateChanged();
    }

    toggleOverlayTargetMode(): void {
        this.overlayTargetModeToggled = !this.overlayTargetModeToggled;
        this.notifyWorkbenchStateChanged();
    }

    cyclePaintMouseButton(): void {
        this.paintMouseButton = this.paintMouseButton === "right" ? "left" : "right";
        this.notifyWorkbenchStateChanged();
    }

    setObjectsVisible(visible: boolean): void {
        if (this.objectsVisible === visible) {
            return;
        }
        this.objectsVisible = visible;
        this.notifyWorkbenchStateChanged();
    }

    toggleObjectsVisible(): void {
        this.setObjectsVisible(!this.objectsVisible);
    }

    setTerrainSmoothingEnabled(enabled: boolean): void {
        if (this.terrainSmoothingEnabled === enabled) {
            return;
        }
        this.terrainSmoothingEnabled = enabled;
        this.notifyWorkbenchStateChanged();
    }

    toggleTerrainSmoothingEnabled(): void {
        this.setTerrainSmoothingEnabled(!this.terrainSmoothingEnabled);
    }

    isEditorToolPluginEnabled(tool: MapEditorTool): boolean {
        return this.enabledEditorToolPlugins.has(tool);
    }

    /**
     * Enable or disable a paint tool in the sidebar.
     * Returns true when state changed/applied.
     */
    setEditorToolPluginEnabled(tool: MapEditorTool, enabled: boolean): boolean {
        if (enabled) {
            this.enabledEditorToolPlugins.add(tool);
            this.persistWorkbenchPluginState();
            this.notifyWorkbenchStateChanged();
            return true;
        }
        this.enabledEditorToolPlugins.delete(tool);
        if (tool === "object-selector" || tool === "object-place") {
            this.cancelObjectCopyPlacement();
            this.clearSelectedObject();
        }
        if (tool === "object-delete") {
            this.hoveredObject = undefined;
        }
        if (tool === "region-stamp") {
            this.cancelRegionStampCopyDialog();
            this.cancelRegionStampPlacement();
            this.clearRegionStampSelection();
            this.cancelObjectCopyPlacement();
            this.clearSelectedObject();
        }
        if (this.editorTool === tool) {
            const fallback = BUILTIN_EDITOR_TOOL_PLUGINS.find((p) => this.enabledEditorToolPlugins.has(p.id))?.id;
            if (fallback) {
                this.editorTool = fallback;
                for (const listener of this.editorToolListeners) {
                    listener();
                }
            }
        }
        this.persistWorkbenchPluginState();
        this.notifyWorkbenchStateChanged();
        return true;
    }

    isWorkbenchUiPluginEnabled(id: MapEditorWorkbenchUiPluginId): boolean {
        return this.enabledWorkbenchUiPlugins.has(id);
    }

    setWorkbenchUiPluginEnabled(id: MapEditorWorkbenchUiPluginId, enabled: boolean): void {
        if (enabled) {
            this.enabledWorkbenchUiPlugins.add(id);
        } else {
            this.enabledWorkbenchUiPlugins.delete(id);
        }
        this.persistWorkbenchPluginState();
        this.notifyWorkbenchStateChanged();
    }

    isBrushShapePluginEnabled(shape: MapEditorBrushType): boolean {
        return this.enabledBrushShapePlugins.has(shape);
    }

    /**
     * Show or hide a brush footprint shape in the brush bar. At least one shape stays enabled.
     * Returns false if disabling was rejected.
     */
    setBrushShapePluginEnabled(shape: MapEditorBrushType, enabled: boolean): boolean {
        if (enabled) {
            this.enabledBrushShapePlugins.add(shape);
            this.persistWorkbenchPluginState();
            this.notifyWorkbenchStateChanged();
            return true;
        }
        if (this.enabledBrushShapePlugins.size <= 1 && this.enabledBrushShapePlugins.has(shape)) {
            return false;
        }
        this.enabledBrushShapePlugins.delete(shape);
        this.ensureBrushTypePluginEnabled();
        this.persistWorkbenchPluginState();
        this.notifyWorkbenchStateChanged();
        return true;
    }

    subscribeWorkbenchPlugins = (listener: () => void): (() => void) => {
        this.workbenchStateListeners.add(listener);
        return () => {
            this.workbenchStateListeners.delete(listener);
        };
    };

    subscribeHistory = (listener: () => void): (() => void) => {
        this.historyListeners.add(listener);
        return () => {
            this.historyListeners.delete(listener);
        };
    };

    private notifyHistoryChanged(): void {
        for (const listener of this.historyListeners) {
            listener();
        }
    }

    getHistorySnapshot = (): MapEditorHistorySnapshot => {
        return this.mapEditHistory.getSnapshot();
    };

    beginEditTransaction = (source: EditorTransactionSource, label?: string): void => {
        this.mapEditHistory.beginTransaction(source, label);
    };

    commitEditTransaction = (): void => {
        this.mapEditHistory.commitTransaction();
        this.notifyHistoryChanged();
    };

    cancelEditTransaction = (): void => {
        this.mapEditHistory.cancelTransaction();
    };

    recordEditMutation = (mutation: EditorMutation): void => {
        this.mapEditHistory.recordMutation(mutation);
    };

    appendAppliedHistoryTransaction = (
        transaction: import("./editor-transaction").EditorTransaction,
    ): void => {
        this.mapEditHistory.appendAppliedTransaction(transaction);
        this.notifyHistoryChanged();
    };

    /** Compatibility wrappers while paint-stroke call sites migrate to transactions. */
    beginHistoryStroke = (tool: MapEditorHistoryTool, label?: string): void => {
        this.beginEditTransaction(tool, label);
    };

    commitHistoryStroke = (): void => {
        this.commitEditTransaction();
    };

    cancelHistoryStroke = (): void => {
        this.cancelEditTransaction();
    };

    recordHistoryTileChange = (
        mapId: number,
        level: number,
        localTileId: number,
        before: TileFieldSnapshot,
        after: TileFieldSnapshot,
    ): void => {
        this.mapEditHistory.recordTileChange(mapId, level, localTileId, before, after);
    };

    recordHistoryObjectChange = (
        mapId: number,
        level: number,
        before: import("./webgl/sceneLocData").SceneTileLocData[],
        after: import("./webgl/sceneLocData").SceneTileLocData[],
    ): void => {
        this.mapEditHistory.recordObjectChange(mapId, level, 0, before, after);
    };

    isHistoryApplying = (): boolean => {
        return this.mapEditHistory.applying;
    };

    undoHistory = (): void => {
        if (!(this.renderer instanceof WebGLMapEditorRenderer)) {
            return;
        }
        const entry = this.mapEditHistory.getUndoEntry();
        if (!entry) {
            return;
        }
        this.mapEditHistory.applying = true;
        applyHistoryUndo(this.renderer, entry);
        this.mapEditHistory.applying = false;
        this.mapEditHistory.markUndone();
        this.notifyHistoryChanged();
    };

    redoHistory = (): void => {
        if (!(this.renderer instanceof WebGLMapEditorRenderer)) {
            return;
        }
        const entry = this.mapEditHistory.getRedoEntry();
        if (!entry) {
            return;
        }
        this.mapEditHistory.applying = true;
        applyHistoryRedo(this.renderer, entry);
        this.mapEditHistory.applying = false;
        this.mapEditHistory.markRedone();
        this.notifyHistoryChanged();
    };

    /** Moves the edit history to `targetIndex` (-1 = before the first edit), applying every step in between. */
    jumpHistory = (targetIndex: number): void => {
        if (!(this.renderer instanceof WebGLMapEditorRenderer)) {
            return;
        }
        const from = this.mapEditHistory.getSnapshot().currentIndex;
        const steps = this.mapEditHistory.jumpToIndex(targetIndex);
        if (steps.length === 0) {
            return;
        }
        this.mapEditHistory.applying = true;
        try {
            applyHistoryJump(this.renderer, steps, targetIndex < from ? "undo" : "redo");
        } finally {
            this.mapEditHistory.applying = false;
        }
        this.notifyHistoryChanged();
    };

    clearHistory = (): void => {
        this.mapEditHistory.clear();
        this.notifyHistoryChanged();
    };

    /** For `useSyncExternalStore` (paint tools, workbench UI, brush shapes, keybind overrides). */
    getWorkbenchPluginsStateSnapshot = (): string => {
        const tools = BUILTIN_EDITOR_TOOL_PLUGINS.map((p) => (this.enabledEditorToolPlugins.has(p.id) ? "1" : "0")).join(
            "",
        );
        const ui = BUILTIN_WORKBENCH_UI_PLUGINS.map((p) => (this.enabledWorkbenchUiPlugins.has(p.id) ? "1" : "0")).join("");
        const brush = BUILTIN_BRUSH_TYPE_PLUGINS.map((p) => (this.enabledBrushShapePlugins.has(p.id) ? "1" : "0")).join(
            "",
        );
        const keybinds = [...this.keybindOverrides.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}:${v === null ? "∅" : JSON.stringify(v)}`)
            .join("¦");
        const viewer = JSON.stringify(this.viewerControlSettings);
        const heightStep = this.heightAdjustStep.toString();
        const heightWorkbench = getHeightToolWorkbenchSnapshot(this.pluginHost);
        const paintToolsStripWorkbench = getPaintToolsStripWorkbenchSnapshot(this.pluginHost);
        const bottomBarWorkbench = getEditorBottomBarWorkbenchSnapshot(this.pluginHost);
        const panelDisplayWorkbench = getMapEditorPanelDisplaySnapshot(this.pluginHost);
        const tileFlagsWorkbench = getTileFlagsToolWorkbenchSnapshot(this.pluginHost);
        const tileBrushWorkbench = `${getTileBrushWorkbenchSnapshot(this.pluginHost)}#${this.brushSize}:${this.brushType}#${this.selectedUnderlayId}:${this.selectedOverlayId}`;
        const gridFlags = this.renderer as unknown as { drawGrid?: boolean; drawChunkGrid?: boolean; drawTileGrid?: boolean };
        const grids = `${gridFlags.drawGrid ? 1 : 0}${gridFlags.drawChunkGrid ? 1 : 0}${gridFlags.drawTileGrid ? 1 : 0}`;
        const objectDeleteWorkbench = `${getObjectDeleteWorkbenchSnapshot(this.pluginHost)}#${getObjectActionWorkbenchSnapshot(this.pluginHost)}#${getStatusBarWorkbenchSnapshot(this.pluginHost)}#${getViewportMinimapWorkbenchSnapshot(this.pluginHost)}#${grids}#${barSnapshot(VIEWPORT_BAR)}#${barSnapshot(TOOL_RAIL)}`;
        const underlayWorkbench = getUnderlayGradientWorkbenchSnapshot(this.pluginHost);
        const overlayWorkbench = getOverlayGradientWorkbenchSnapshot(this.pluginHost);
        const objectVisibility = this.objectsVisible ? "1" : "0";
        const planeView = `${this.showRoofs ? 1 : 0}${this.bridgeLinkBelow ? 1 : 0}${this.hideBelowViewPlane ? 1 : 0}${this.viewPlaneMax}`;
        const quickControls = getQuickControlsWorkbenchSnapshot(this.pluginHost);
        const terrainSmoothing = this.terrainSmoothingEnabled ? "1" : "0";
        const sandbox = JSON.stringify({
            active: this.sandboxModeActive,
            bounds: this.sandboxBounds ?? null,
            settings: this.sandboxTerrainSettings,
        });
        const objectSelector = JSON.stringify({
            hovered: this.hoveredObject ?? null,
            selected: this.selectedObject ?? null,
            selectedTile: this.selectedTile ?? null,
            copyActive: this.objectCopyPlacementActive,
            copyTemplate: this.objectCopyTemplate ?? null,
        });
        const regionStamp = JSON.stringify({
            select: this.regionStampSelectBounds ?? null,
            draft: this.regionStampDraftBounds ?? null,
            pasteActive: this.regionStampPlacementActive,
            rotation: this.regionStampRotation,
            copyDialog: this.regionStampCopyDialogOpen,
            copyOptions: this.regionStampCopyOptions,
            clipboard: this.regionStampClipboard ? `${this.regionStampClipboard.width}x${this.regionStampClipboard.height}` : null,
        });
        return `${tools}|${ui}|${brush}|${keybinds}|${viewer}|${heightStep}|${heightWorkbench}|${paintToolsStripWorkbench}|${bottomBarWorkbench}|${panelDisplayWorkbench}|${tileFlagsWorkbench}|${tileBrushWorkbench}|${underlayWorkbench}|${overlayWorkbench}|${objectVisibility}|${planeView}|${terrainSmoothing}|${quickControls}|${objectDeleteWorkbench}|${sandbox}|${objectSelector}|${regionStamp}`;
    };

    saveDockPanelRestore(panelId: string, options: AddPanelOptions): void {
        this.dockPanelRestoreById.set(panelId, options);
        this.persistDockPanelRestore();
    }

    peekDockPanelRestore(panelId: string): AddPanelOptions | undefined {
        return this.dockPanelRestoreById.get(panelId);
    }

    consumeDockPanelRestore(panelId: string): void {
        if (!this.dockPanelRestoreById.delete(panelId)) {
            return;
        }
        this.persistDockPanelRestore();
    }

    clearDockPanelRestore(): void {
        this.dockPanelRestoreById.clear();
        this.persistDockPanelRestore();
    }

    getResolvedKeybindChords(bindingKey: string, defaultChords: readonly EditorToolKeyChord[]): readonly EditorToolKeyChord[] {
        if (!this.keybindOverrides.has(bindingKey)) {
            return defaultChords;
        }
        const override = this.keybindOverrides.get(bindingKey) ?? null;
        return override ? [override] : [];
    }

    setKeybindOverride(bindingKey: string, chord: EditorToolKeyChord | null): void {
        this.keybindOverrides.set(bindingKey, chord);
        this.persistKeybindOverrides();
        this.notifyWorkbenchStateChanged();
    }

    /** Drop any saved override for this binding (custom chord or explicit unbind). Returns whether storage changed. */
    clearKeybindOverride(bindingKey: string): boolean {
        if (!this.keybindOverrides.delete(bindingKey)) {
            return false;
        }
        this.persistKeybindOverrides();
        this.notifyWorkbenchStateChanged();
        return true;
    }

    /** Remove every saved override (custom chords and explicit unbinds); plugins use their defaults again. */
    clearAllKeybindOverrides(): boolean {
        if (this.keybindOverrides.size === 0) {
            return false;
        }
        this.keybindOverrides.clear();
        this.persistKeybindOverrides();
        this.notifyWorkbenchStateChanged();
        return true;
    }

    private persistKeybindOverrides(): void {
        if (typeof localStorage === "undefined") {
            return;
        }
        try {
            const obj: PersistedKeybindOverrides = Object.fromEntries(this.keybindOverrides);
            localStorage.setItem(MAP_EDITOR_KEYBINDS_STORAGE_KEY, JSON.stringify(obj));
        } catch {
            /* ignore quota / private mode */
        }
    }

    private loadKeybindOverridesFromStorage(): void {
        if (typeof localStorage === "undefined") {
            return;
        }
        try {
            const raw = localStorage.getItem(MAP_EDITOR_KEYBINDS_STORAGE_KEY);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw) as PersistedKeybindOverrides;
            if (!parsed || typeof parsed !== "object") {
                return;
            }
            this.keybindOverrides = new Map(Object.entries(parsed));
        } catch {
            /* keep defaults */
        }
    }

    private persistDockPanelRestore(): void {
        if (typeof localStorage === "undefined") {
            return;
        }
        try {
            const obj = Object.fromEntries(this.dockPanelRestoreById);
            localStorage.setItem(MAP_EDITOR_DOCK_PANEL_RESTORE_KEY, JSON.stringify(obj));
        } catch {
            /* ignore */
        }
    }

    private loadDockPanelRestoreFromStorage(): void {
        if (typeof localStorage === "undefined") {
            return;
        }
        try {
            const raw = localStorage.getItem(MAP_EDITOR_DOCK_PANEL_RESTORE_KEY);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw) as Record<string, AddPanelOptions>;
            if (parsed && typeof parsed === "object") {
                this.dockPanelRestoreById = new Map(Object.entries(parsed));
            }
        } catch {
            /* keep empty */
        }
    }

    notifyWorkbenchStateChanged(): void {
        for (const listener of this.workbenchStateListeners) {
            listener();
        }
    }

    /**
     * Right-click opens the viewport "Copy …" menu in tools that don't paint with the right button;
     * Alt+right-click opens it in any tool (painting skips Alt-held right drags).
     */
    viewportContextMenuAllowed(altKey: boolean): boolean {
        if (altKey) {
            return true;
        }
        const tool = this.editorTool;
        return (
            tool === "object-selector" ||
            tool === "object-delete" ||
            tool === "region-stamp" ||
            tool === "tile-flags" ||
            (tool === "tile-brush" && getTileBrushFocus(this.pluginHost) === "flags")
        );
    }

    /** Snapshot of the hovered tile on every plane plus its objects, for copying out. */
    inspectHoveredTile(): ViewportHoverInspectInfo | undefined {
        if (!(this.renderer instanceof WebGLMapEditorRenderer)) {
            return undefined;
        }
        // Prefer the hovered object's tile: over a wall the terrain tile hit lies behind it.
        const hovered = this.hoveredObject;
        const hoveredMap = hovered
            ? (this.renderer.mapManager.getMap(hovered.mapX, hovered.mapY) as EditorMapSquare | undefined)
            : undefined;
        const worldX =
            hovered && hoveredMap
                ? hovered.mapX * 64 + hovered.anchorTileX - hoveredMap.borderSize
                : this.renderer.hoverWorldX;
        const worldY =
            hovered && hoveredMap
                ? hovered.mapY * 64 + hovered.anchorTileY - hoveredMap.borderSize
                : this.renderer.hoverWorldY;
        if (worldX === -1 || worldY === -1) {
            return undefined;
        }
        const map =
            hoveredMap ??
            (this.renderer.mapManager.getMap(worldX >> 6, worldY >> 6) as EditorMapSquare | undefined);
        if (!map) {
            return undefined;
        }
        const info = inspectViewportTile(
            map,
            worldX,
            worldY,
            this.getPlaneViewOptions(),
            this.locTypeLoader,
            this.seqTypeLoader,
            this.varManager,
        );
        if (!info) {
            return undefined;
        }
        return this.hoveredObject ? { ...info, hoveredObject: this.hoveredObject } : info;
    }

    getPlaneViewOptions(): PlaneViewOptions {
        return {
            plane: Math.max(0, Math.min(Scene.MAX_LEVELS - 1, this.viewPlaneMax | 0)),
            hideBelow: this.hideBelowViewPlane,
            showRoofs: this.showRoofs,
            bridgeLinkBelow: this.bridgeLinkBelow,
        };
    }

    setShowRoofs(show: boolean): void {
        if (this.showRoofs === show) {
            return;
        }
        this.showRoofs = show;
        this.notifyWorkbenchStateChanged();
    }

    setBridgeLinkBelow(link: boolean): void {
        if (this.bridgeLinkBelow === link) {
            return;
        }
        this.bridgeLinkBelow = link;
        this.notifyWorkbenchStateChanged();
    }

    /**
     * Whether any tile on a plane can be drawn. Per-tile visibility (min plane from tile flags) is
     * {@link isSceneTileVisible}; flag 8 and bridge columns can lift any plane into view.
     */
    isPlaneVisible(level: number): boolean {
        const plane = Math.max(0, Math.min(Scene.MAX_LEVELS - 1, level | 0));
        return !this.hideBelowViewPlane || plane >= this.getPlaneViewOptions().plane;
    }

    /** Terrain levels to submit; the shader clips each tile by its min plane. */
    getVisiblePlaneRange(): { startLevel: number; endLevel: number } {
        const startLevel = this.hideBelowViewPlane ? this.getPlaneViewOptions().plane : 0;
        return { startLevel, endLevel: Scene.MAX_LEVELS };
    }

    clearSelectedObject(): void {
        this.selectedObject = undefined;
    }

    getTileModel(level: number, worldX: number, worldY: number): { model: import("../rs/scene/SceneTileModel").SceneTileModel; sceneX: number; sceneY: number } | undefined {
        return this.renderer instanceof WebGLMapEditorRenderer ? this.renderer.getTileModel(level, worldX, worldY) : undefined;
    }

    getHoveredTile(): { worldX: number; worldY: number } | undefined {
        return this.renderer instanceof WebGLMapEditorRenderer ? this.renderer.getHoveredTile() : undefined;
    }

    clearSelectedTile(): void {
        this.selectedTile = undefined;
    }

    /** Stored tile fields (heights, underlay/overlay ids + 1, shape, flags) for a world tile, if its map is loaded. */
    getTileInfo(level: number, worldX: number, worldY: number): import("./map-editor-history").TileFieldSnapshot | undefined {
        return this.renderer instanceof WebGLMapEditorRenderer ? this.renderer.getTileInfo(level, worldX, worldY) : undefined;
    }

    isObjectCopyPlacementActive(): boolean {
        return this.objectCopyPlacementActive && this.objectCopyTemplate != null;
    }

    getObjectCopyTemplate(): import("./webgl/sceneLocPicker").EditorObjectRef | undefined {
        return this.objectCopyTemplate;
    }

    /** Copies the selected object to the clipboard and switches to the Place tool to put copies down. */
    startObjectCopyPlacement(): boolean {
        const ref = this.selectedObject;
        if (!ref || !this.isObjectSelectorToolActive() || !isCopyableObjectKind(ref.kind)) {
            return false;
        }
        this.objectCopyTemplate = { ...ref };
        this.objectCopyPlacementActive = true;
        // The selection stays: the object panel keeps showing what was copied, and the wireframe keeps marking the original.
        if (this.editorTool !== "object-place" && this.isEditorToolPluginEnabled("object-place")) {
            this.setEditorTool("object-place");
        }
        this.notifyWorkbenchStateChanged();
        return true;
    }

    hasObjectClipboard(): boolean {
        return this.objectCopyTemplate != null;
    }

    /** Puts the clipboard back in hand (V, or opening the Place tool). */
    resumeObjectCopyPlacement(): boolean {
        if (!this.objectCopyTemplate) {
            return false;
        }
        this.objectCopyPlacementActive = true;
        if (this.editorTool !== "object-place" && this.isEditorToolPluginEnabled("object-place")) {
            this.setEditorTool("object-place");
        }
        this.notifyWorkbenchStateChanged();
        return true;
    }

    /** Ends putting copies down. The copied object stays on the clipboard. */
    cancelObjectCopyPlacement(): void {
        // Leaving the tool (or starting another placement) also ends a Move/Place in progress.
        getObjectActionModel(this.pluginHost).cancel();
        if (!this.objectCopyPlacementActive) {
            return;
        }
        this.objectCopyPlacementActive = false;
        this.notifyWorkbenchStateChanged();
    }

    clearObjectClipboard(): void {
        if (!this.objectCopyTemplate && !this.objectCopyPlacementActive) {
            return;
        }
        this.objectCopyPlacementActive = false;
        this.objectCopyTemplate = undefined;
        this.notifyWorkbenchStateChanged();
    }

    rotateSelectedObject(): boolean {
        if (!(this.renderer instanceof WebGLMapEditorRenderer)) {
            return false;
        }
        return rotateSelectedObjectRuntime(this.pluginHost, this.renderer);
    }

    isObjectDeleteModeActive(): boolean {
        if (!this.isObjectDeleteToolActive()) {
            return false;
        }
        if (this.isEditorInputSuspended()) {
            return false;
        }
        const input = this.inputManager;
        return input.isKeyDown("Delete") || input.isKeyDown("Backspace");
    }

    /** Deletes what the Delete tool is previewing (the hovered object, or everything under the brush). */
    deleteHoveredObject(): boolean {
        if (!this.isObjectDeleteToolActive() || !(this.renderer instanceof WebGLMapEditorRenderer)) {
            return false;
        }
        return this.renderer.deleteObjectDeleteTargets();
    }

    private persistWorkbenchPluginState(): void {
        if (typeof localStorage === "undefined") {
            return;
        }
        try {
            const payload: PersistedWorkbenchPluginsV2 = {
                tools: BUILTIN_EDITOR_TOOL_PLUGINS.map((p) => p.id).filter((id) => this.enabledEditorToolPlugins.has(id)),
                ui: BUILTIN_WORKBENCH_UI_PLUGINS.map((p) => p.id).filter((id) => this.enabledWorkbenchUiPlugins.has(id)),
                brushShapes: BUILTIN_BRUSH_TYPE_PLUGINS.map((p) => p.id).filter((id) =>
                    this.enabledBrushShapePlugins.has(id),
                ),
            };
            localStorage.setItem(WORKBENCH_PLUGINS_STORAGE_KEY, JSON.stringify(payload));
        } catch {
            /* ignore quota / private mode */
        }
    }

    private loadWorkbenchPluginStateFromStorage(): void {
        if (typeof localStorage === "undefined") {
            return;
        }
        try {
            const rawV2 = localStorage.getItem(WORKBENCH_PLUGINS_STORAGE_KEY);
            if (!rawV2) {
                return;
            }
            const parsed = JSON.parse(rawV2) as Partial<PersistedWorkbenchPluginsV2>;

            if (Array.isArray(parsed.tools) && parsed.tools.length > 0) {
                const allowedTools = new Set<MapEditorTool>(BUILTIN_EDITOR_TOOL_PLUGINS.map((p) => p.id));
                const nextTools = new Set<MapEditorTool>();
                for (const id of parsed.tools) {
                    if (allowedTools.has(id)) {
                        nextTools.add(id);
                    }
                }
                // Migration guard: Height is now a primary tool (and also owns Smooth mode).
                // Keep it available even when older saved layouts/tools omitted it.
                nextTools.add("height");
                nextTools.add("tile-flags");
                nextTools.add("tile-brush");
                nextTools.add("object-selector");
                nextTools.add("object-place");
                nextTools.add("object-delete");
                nextTools.add("region-stamp");
                if (nextTools.size > 0) {
                    this.enabledEditorToolPlugins = nextTools;
                }
            }

            if (Array.isArray(parsed.ui) && parsed.ui.length > 0) {
                const allowedUi = new Set<MapEditorWorkbenchUiPluginId>(BUILTIN_WORKBENCH_UI_PLUGINS.map((row) => row.id));
                const nextUi = new Set<MapEditorWorkbenchUiPluginId>();
                for (const id of parsed.ui) {
                    if (allowedUi.has(id)) {
                        nextUi.add(id);
                    }
                }
                if (nextUi.size > 0) {
                    this.enabledWorkbenchUiPlugins = nextUi;
                }
            }

            if (Array.isArray(parsed.brushShapes) && parsed.brushShapes.length > 0) {
                const allowedBrush = new Set<MapEditorBrushType>(BUILTIN_BRUSH_TYPE_PLUGINS.map((p) => p.id));
                const nextBrush = new Set<MapEditorBrushType>();
                for (const id of parsed.brushShapes) {
                    if (allowedBrush.has(id)) {
                        nextBrush.add(id);
                    }
                }
                if (nextBrush.size > 0) {
                    this.enabledBrushShapePlugins = nextBrush;
                }
            }
        } catch {
            /* keep defaults */
        }
    }

    private ensureActiveEditorToolIsEnabled(): void {
        if (this.enabledEditorToolPlugins.has(this.editorTool)) {
            return;
        }
        const fallback = BUILTIN_EDITOR_TOOL_PLUGINS.find((p) => this.enabledEditorToolPlugins.has(p.id))?.id;
        if (fallback) {
            this.editorTool = fallback;
            for (const listener of this.editorToolListeners) {
                listener();
            }
        }
    }

    private ensureBrushTypePluginEnabled(): void {
        if (this.enabledBrushShapePlugins.has(this.brushType)) {
            return;
        }
        const fallback = BUILTIN_BRUSH_TYPE_PLUGINS.find((p) => this.enabledBrushShapePlugins.has(p.id))?.id;
        if (fallback) {
            this.brushType = fallback;
        }
    }

    getGizmoAppearance(): MapEditorGizmoAppearance {
        return (this.renderer as WebGLMapEditorRenderer).getGizmoAppearance();
    }

    /** Updates gizmo colors / brush tints and persists full appearance to `localStorage`. */
    setGizmoAppearance(partial: Partial<MapEditorGizmoAppearance>): MapEditorGizmoAppearance {
        const gl = this.renderer as WebGLMapEditorRenderer;
        const full = gl.setGizmoAppearance(partial);
        saveGizmoAppearanceToStorage(full);
        return full;
    }

    constructor(
        readonly workerPool: RenderDataWorkerPool,
        readonly cacheList: CacheList,
        cache: LoadedCache,
    ) {
        this.pluginHost = new EditorPluginHost(this);
        if (import.meta.env.DEV && typeof window !== "undefined") {
            // Dev-only console/devtools handle for inspecting scene data.
            (window as unknown as { __mapEditor?: MapEditor }).__mapEditor = this;
            // WebGPU object-pass A/B harness (docs/WGPU_RENDERER_PLAN.md, phase 0): `await __webgpuHarness()`.
            (window as unknown as { __webgpuHarness?: () => Promise<unknown> }).__webgpuHarness = () =>
                import("./webgpu/object-pass-harness").then((module) => module.startObjectPassHarness(this));
        }
        this.renderer = new WebGLMapEditorRenderer(this.pluginHost);
        this.ready = this.initCache(cache);
        this.loadWorkbenchPluginStateFromStorage();
        this.loadKeybindOverridesFromStorage();
        this.loadDockPanelRestoreFromStorage();
        this.ensureActiveEditorToolIsEnabled();
        this.ensureBrushTypePluginEnabled();
    }

    initCache(cache: LoadedCache): Promise<void> {
        this.loadedCache = cache;
        this.cacheSystem = CacheSystem.fromFiles(cache.type, cache.files);
        this.loaderFactory = getCacheLoaderFactory(cache.info, this.cacheSystem);
        const workerReady = this.workerPool.initCache(cache, [], []);

        this.textureLoader = this.loaderFactory.getTextureLoader();
        this.seqTypeLoader = this.loaderFactory.getSeqTypeLoader();
        this.seqFrameLoader = this.loaderFactory.getSeqFrameLoader();
        this.locTypeLoader = this.loaderFactory.getLocTypeLoader();
        this.objTypeLoader = this.loaderFactory.getObjTypeLoader();
        this.npcTypeLoader = this.loaderFactory.getNpcTypeLoader();
        this.basTypeLoader = this.loaderFactory.getBasTypeLoader();

        this.varManager = new VarManager(this.loaderFactory.getVarBitTypeLoader());
        const questTypeLoader = this.loaderFactory.getQuestTypeLoader();
        if (questTypeLoader) {
            this.varManager.setQuestsCompleted(questTypeLoader);
        }

        this.mapFileIndex = this.loaderFactory.getMapFileLoader().mapFileIndex;

        this.underlayTypeLoader = this.loaderFactory.getUnderlayTypeLoader();
        this.overlayTypeLoader = this.loaderFactory.getOverlayTypeLoader();

        bootstrapHeightToolModel(this.pluginHost);
        bootstrapPaintToolsStripModel(this.pluginHost);
        bootstrapEditorBottomBarModel(this.pluginHost);
        bootstrapTileFlagsToolModel(this.pluginHost);
        bootstrapTileBrushModel(this.pluginHost);
        bootstrapUnderlayGradient(this.pluginHost);
        bootstrapOverlayGradient(this.pluginHost);

        this.modelLoader = this.loaderFactory.getModelLoader();

        this.locModelLoader = new LocModelLoader(
            this.locTypeLoader,
            this.modelLoader,
            this.textureLoader,
            this.seqTypeLoader,
            this.seqFrameLoader,
            this.loaderFactory.getSkeletalSeqLoader(),
        );

        this.sceneBuilder = new SceneBuilder(
            cache.info,
            this.loaderFactory.getMapFileLoader(),
            this.underlayTypeLoader,
            this.overlayTypeLoader,
            this.locTypeLoader,
            this.locModelLoader,
            cache.xteas
        );

        this.renderer.initCache();
        return workerReady;
    }

    getSearchParams(): Record<string, string> {
        return {};
    }

    applySearchParams(_searchParams: URLSearchParams): void {
        /* Camera state is no longer synced to the URL. */
    }

    configureRegionFocus(centerMapX: number, centerMapY: number, radius: number): void {
        const safeRadius = Math.max(0, Math.floor(radius));
        const minX = Math.max(0, centerMapX - safeRadius);
        const maxX = Math.min(MapManager.MAX_MAP_X - 1, centerMapX + safeRadius);
        const minY = Math.max(0, centerMapY - safeRadius);
        const maxY = Math.min(MapManager.MAX_MAP_Y - 1, centerMapY + safeRadius);

        this.renderer.mapManager.setAllowedBounds(minX, minY, maxX, maxY);

        // Jump camera to the middle of the selected region square.
        this.camera.pos[0] = centerMapX * 64 + 32;
        this.camera.pos[2] = centerMapY * 64 + 32;
        this.camera.updated = true;
        this.camera.updatedPosition = true;
    }

    /**
     * Moves the camera over a world tile (and optionally switches the view plane). When the tile lies outside the
     * map squares currently loaded, the loaded area is re-centred there with the same radius.
     */
    goToWorldTile(worldX: number, worldY: number, plane?: number): void {
        const mapX = Math.max(0, Math.min(MapManager.MAX_MAP_X - 1, worldX >> 6));
        const mapY = Math.max(0, Math.min(MapManager.MAX_MAP_Y - 1, worldY >> 6));
        const manager = this.renderer.mapManager;
        const bounds = manager.getAllowedBounds();
        if (bounds && (mapX < bounds.minX || mapX > bounds.maxX || mapY < bounds.minY || mapY > bounds.maxY)) {
            const radius = Math.max(0, Math.floor(Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2));
            this.configureRegionFocus(mapX, mapY, radius);
        }
        this.camera.pos[0] = worldX + 0.5;
        this.camera.pos[2] = worldY + 0.5;
        this.camera.updated = true;
        this.camera.updatedPosition = true;
        if (plane !== undefined) {
            this.viewPlaneMax = Math.max(0, Math.min(Scene.MAX_LEVELS - 1, plane | 0));
        }
        this.notifyWorkbenchStateChanged();
    }

    applyFlatUnderlayInBounds(
        minX: number,
        minY: number,
        maxX: number,
        maxY: number,
        underlayId: number,
        processedMapIds?: Set<number>,
    ): number {
        if (!(this.renderer instanceof WebGLMapEditorRenderer)) {
            return 0;
        }

        const renderer = this.renderer;
        const level = this.selectedLevel;
        const underlayCount = this.underlayTypeLoader.getCount();
        const resolvedUnderlayId =
            underlayCount > 0 ? Math.max(0, Math.min(underlayCount - 1, underlayId)) : 0;
        let updatedMaps = 0;
        this.beginHistoryStroke("bulk", "Flat underlay");

        for (let mapX = minX; mapX <= maxX; mapX++) {
            for (let mapY = minY; mapY <= maxY; mapY++) {
                const mapId = getMapSquareId(mapX, mapY);
                if (processedMapIds?.has(mapId)) {
                    continue;
                }

                const map = renderer.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
                if (!map) {
                    continue;
                }

                const scene = map.scene;
                const border = map.borderSize;
                const flatHeight = scene.tileHeights[level][border][border];
                for (let tileX = 0; tileX < 64; tileX++) {
                    for (let tileY = 0; tileY < 64; tileY++) {
                        const sceneX = border + tileX;
                        const sceneY = border + tileY;
                        recordHistoryTileMutation(this.pluginHost, map, level, sceneX, sceneY, () => {
                            scene.tileUnderlays[level][sceneX][sceneY] = resolvedUnderlayId + 1;
                            scene.setHeight(level, sceneX, sceneY, flatHeight);
                        });
                        renderer.addAffectedTile(map.mapX * 64 + tileX, map.mapY * 64 + tileY);
                        renderer.addHeightChangedTile(map.mapX * 64 + tileX, map.mapY * 64 + tileY);
                    }
                }

                map.underlayUpdated = true;
                map.heightUpdated = true;
                processedMapIds?.add(mapId);
                updatedMaps += 1;
            }
        }

        if (updatedMaps > 0) {
            renderer.updateAffectedTiles();
            this.commitHistoryStroke();
            this.scheduleMinimapRefreshAfterEdit();
        } else {
            this.mapEditHistory.cancelStroke();
        }

        return updatedMaps;
    }

    applyFlatHeightInBounds(
        minX: number,
        minY: number,
        maxX: number,
        maxY: number,
        flatHeight: number,
        options?: {
            noiseEnabled?: boolean;
            terrainPreset?: "flat" | "hills" | "mountains";
            landform?: "normal" | "island";
            noiseSeed?: number;
            noiseAmplitude?: number;
            noiseScale?: number;
            roughness?: number;
            cliffiness?: number;
            valleyDepth?: number;
            waterLevel?: number;
            waterDepth?: number;
            beachWidth?: number;
            inlandness?: number;
        },
        processedMapIds?: Set<number>,
    ): number {
        if (!(this.renderer instanceof WebGLMapEditorRenderer)) {
            return 0;
        }

        const renderer = this.renderer;
        const underlayCount = this.underlayTypeLoader.getCount();
        const resolvedUnderlayId =
            underlayCount > 0 ? Math.max(0, Math.min(underlayCount - 1, 39)) : 0;
        const underlayValue = resolvedUnderlayId + 1;
        const overlayCount = this.overlayTypeLoader.getCount();
        const findAnyUsableOverlayId = (): number => {
            if (overlayCount <= 0) {
                return -1;
            }
            if (603 < overlayCount) {
                return 603;
            }
            for (let i = 0; i < overlayCount; i++) {
                const overlay = this.overlayTypeLoader.load(i);
                if (!overlay) {
                    continue;
                }
                if (overlay.primaryRgb > 0 || overlay.textureId >= 0 || overlay.secondaryTextureId >= 0) {
                    return i;
                }
            }
            return 0;
        };
        const resolvedWaterOverlayId = findAnyUsableOverlayId();
        const waterOverlayValue = resolvedWaterOverlayId >= 0 ? resolvedWaterOverlayId + 1 : 0;
        const terrainPreset = options?.terrainPreset ?? "flat";
        const landform = options?.landform ?? "normal";
        const noiseEnabled = options?.noiseEnabled ?? false;
        const noiseSeed = Math.floor(options?.noiseSeed ?? 1337);
        const baseNoiseAmplitude = Math.max(0, Math.floor(options?.noiseAmplitude ?? 64));
        const baseNoiseScale = Math.max(2, Math.floor(options?.noiseScale ?? 24));
        const roughness = Math.max(0, Math.min(1, options?.roughness ?? 0.6));
        const cliffiness = Math.max(0, Math.min(1, options?.cliffiness ?? 0.55));
        const valleyDepth = Math.max(0, Math.min(1, options?.valleyDepth ?? 0.45));
        const waterLevel = Math.max(0, Math.min(1, options?.waterLevel ?? 0.28));
        const waterDepth = Math.max(0, Math.min(1, options?.waterDepth ?? 0.55));
        const beachWidth = Math.max(0.02, Math.min(0.5, options?.beachWidth ?? 0.14));
        const inlandness = Math.max(0, Math.min(1, options?.inlandness ?? 0.55));
        const noiseAmplitude = Math.round(
            baseNoiseAmplitude *
                (terrainPreset === "mountains" ? 16 : terrainPreset === "hills" ? 8 : 1),
        );
        const noiseScale =
            terrainPreset === "mountains" ? Math.max(2, Math.floor(baseNoiseScale * 0.7)) : baseNoiseScale;
        const octaves = terrainPreset === "mountains" ? 5 : terrainPreset === "hills" ? 3 : 1;
        const persistence = terrainPreset === "mountains" ? 0.55 : terrainPreset === "hills" ? 0.62 : 0;
        const useNoise = noiseEnabled && terrainPreset !== "flat" && noiseAmplitude > 0;
        const shouldCopyTemplate = terrainPreset === "flat";
        let updatedMaps = 0;
        let templateMap: EditorMapSquare | undefined;
        this.beginHistoryStroke("sandbox", `Sandbox ${terrainPreset} terrain`);

        const splitRgb = (rgb: number): [number, number, number] => [
            (rgb >> 16) & 0xff,
            (rgb >> 8) & 0xff,
            rgb & 0xff,
        ];
        const rgbDistanceSq = (a: number, b: number): number => {
            const [ar, ag, ab] = splitRgb(a);
            const [br, bg, bb] = splitRgb(b);
            const dr = ar - br;
            const dg = ag - bg;
            const db = ab - bb;
            return dr * dr + dg * dg + db * db;
        };
        const findNearestUnderlayId = (targetRgb: number, fallbackId: number): number => {
            let bestId = fallbackId;
            let bestDistance = Number.POSITIVE_INFINITY;
            for (let i = 0; i < underlayCount; i++) {
                const floor = this.underlayTypeLoader.load(i);
                if (!floor) {
                    continue;
                }
                const rgb = floor.getRgb();
                if (!Number.isFinite(rgb) || rgb <= 0) {
                    continue;
                }
                const dist = rgbDistanceSq(rgb, targetRgb);
                if (dist < bestDistance) {
                    bestDistance = dist;
                    bestId = i;
                }
            }
            return bestId;
        };
        const grassUnderlayValue = findNearestUnderlayId(0x4f8a3f, resolvedUnderlayId) + 1;
        const darkGrassUnderlayValue = findNearestUnderlayId(0x3c6f31, resolvedUnderlayId) + 1;
        const dirtUnderlayValue = findNearestUnderlayId(0x8c6a43, resolvedUnderlayId) + 1;
        const rockUnderlayValue = findNearestUnderlayId(0x7b6a58, resolvedUnderlayId) + 1;
        const snowUnderlayValue = findNearestUnderlayId(0xe8ecef, resolvedUnderlayId) + 1;
        const beachUnderlayValue = findNearestUnderlayId(0xc2b280, resolvedUnderlayId) + 1;

        for (let mapX = minX; mapX <= maxX && !templateMap; mapX++) {
            for (let mapY = minY; mapY <= maxY; mapY++) {
                const map = renderer.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
                if (map) {
                    templateMap = map;
                    break;
                }
            }
        }

        if (!templateMap) {
            return 0;
        }

        const hash2 = (x: number, y: number): number => {
            let h = (x * 374761393 + y * 668265263 + noiseSeed * 1442695040888963407) | 0;
            h = (h ^ (h >>> 13)) * 1274126177;
            h ^= h >>> 16;
            return (h >>> 0) / 4294967295;
        };
        const valueNoise = (x: number, y: number): number => {
            const fx = x / noiseScale;
            const fy = y / noiseScale;
            const x0 = Math.floor(fx);
            const y0 = Math.floor(fy);
            const tx = fx - x0;
            const ty = fy - y0;
            const fade = (t: number) => t * t * (3 - 2 * t);
            const sx = fade(tx);
            const sy = fade(ty);
            const n00 = hash2(x0, y0);
            const n10 = hash2(x0 + 1, y0);
            const n01 = hash2(x0, y0 + 1);
            const n11 = hash2(x0 + 1, y0 + 1);
            const ix0 = n00 + (n10 - n00) * sx;
            const ix1 = n01 + (n11 - n01) * sx;
            return ix0 + (ix1 - ix0) * sy;
        };
        const fractalNoise = (x: number, y: number): number => {
            let total = 0;
            let frequency = 1;
            let amplitudeAccum = 1;
            let maxAccum = 0;
            for (let i = 0; i < octaves; i++) {
                total += valueNoise(x * frequency, y * frequency) * amplitudeAccum;
                maxAccum += amplitudeAccum;
                amplitudeAccum *= persistence;
                frequency *= 2;
            }
            return maxAccum > 0 ? total / maxAccum : 0.5;
        };
        const rotatedFractalNoise = (x: number, y: number, angleDeg: number, offset = 0): number => {
            const rad = (angleDeg * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const rx = x * cos - y * sin + offset;
            const ry = x * sin + y * cos - offset;
            return fractalNoise(rx, ry);
        };
        const terrainSample = (x: number, y: number): number => {
            const warpX = (rotatedFractalNoise(x * 0.35, y * 0.35, 18, 71) - 0.5) * 22;
            const warpY = (rotatedFractalNoise(x * 0.35, y * 0.35, -24, 173) - 0.5) * 22;
            const wx = x + warpX;
            const wy = y + warpY;

            const base = rotatedFractalNoise(wx, wy, 35, 211);
            const detail = rotatedFractalNoise(wx * 1.9, wy * 1.9, -12, 587);
            const ridgeNoise = rotatedFractalNoise(wx * 1.3, wy * 1.3, 68, 997);
            const ridged = 1 - Math.abs(ridgeNoise * 2 - 1);
            const continental = rotatedFractalNoise(wx * 0.16, wy * 0.16, 9, 1987);
            const baseMask = Math.max(
                0,
                Math.min(1, (continental - (0.28 + (1 - inlandness) * 0.2)) / 0.44),
            );
            const continentMask =
                landform === "island"
                    ? (() => {
                          // Radial falloff creates shoreline wrapping like islands.
                          const centerX = ((minX + maxX + 1) * 64) / 2;
                          const centerY = ((minY + maxY + 1) * 64) / 2;
                          const dx = x - centerX;
                          const dy = y - centerY;
                          const maxRadius = Math.max(64, ((maxX - minX + maxY - minY + 2) * 64) / 2);
                          const radial = Math.max(0, Math.min(1, 1 - Math.sqrt(dx * dx + dy * dy) / maxRadius));
                          return Math.max(0, Math.min(1, baseMask * 0.5 + radial * 0.8));
                      })()
                    : baseMask;
            const valleyField = rotatedFractalNoise(wx * 0.52, wy * 0.52, -33, 3119);
            const valleyCarve = Math.pow(1 - Math.abs(valleyField * 2 - 1), 2.1) * (0.35 + valleyDepth * 0.9);

            const cliffTerm = Math.sign(base - 0.5) * Math.pow(Math.abs(base - 0.5), 0.7 - cliffiness * 0.45);
            const blended =
                (base - 0.5) * (0.55 + roughness * 0.35) +
                (ridged - 0.5) * (0.2 + cliffiness * 0.6) +
                (detail - 0.5) * (0.15 + roughness * 0.4) +
                cliffTerm * (0.05 + cliffiness * 0.25);
            const shaped = blended * (0.25 + continentMask * (0.85 + inlandness * 0.45)) - valleyCarve * 0.5;
            return Math.max(-1, Math.min(1, shaped * 1.7));
        };

        const applyTerrainTemplate = (map: EditorMapSquare): void => {
            const scene = map.scene;
            const border = map.borderSize;
            for (let level = 0; level < scene.levels; level++) {
                for (let sceneX = 0; sceneX < scene.sizeX; sceneX++) {
                    for (let sceneY = 0; sceneY < scene.sizeY; sceneY++) {
                        const localTileX = sceneX - border;
                        const localTileY = sceneY - border;
                        const worldTileX = map.mapX * 64 + localTileX;
                        const worldTileY = map.mapY * 64 + localTileY;
                        const sample = useNoise ? terrainSample(worldTileX, worldTileY) : 0;
                        let heightOffset = 0;

                        let paintedUnderlay = underlayValue;
                        let paintedOverlay = 0;
                        if (useNoise) {
                            if (sample < -waterLevel) {
                                paintedUnderlay = beachUnderlayValue;
                                paintedOverlay = waterOverlayValue;
                            } else if (sample < -(waterLevel - beachWidth)) {
                                paintedUnderlay = beachUnderlayValue;
                            } else if (sample > 0.58) {
                                paintedUnderlay = snowUnderlayValue;
                            } else if (sample > 0.26) {
                                paintedUnderlay = rockUnderlayValue;
                            } else if (sample > 0.08) {
                                paintedUnderlay = darkGrassUnderlayValue;
                            } else if (sample > -0.03) {
                                paintedUnderlay = grassUnderlayValue;
                            } else {
                                paintedUnderlay = dirtUnderlayValue;
                            }
                        }
                        if (paintedOverlay > 0 && paintedUnderlay <= 0) {
                            // Overlay tiles need a base underlay; force one if missing.
                            paintedUnderlay = underlayValue;
                        }
                        if (useNoise) {
                            if (paintedOverlay > 0) {
                                // OSRS-style sea level: keep water tiles at baseline (0).
                                heightOffset = 0;
                            } else {
                                // Raise all non-water terrain above sea level.
                                const aboveSea = Math.max(0, sample + waterLevel);
                                const terrainRise = Math.round(aboveSea * noiseAmplitude * (1.2 + waterDepth * 0.8));
                                // RS terrain heights are inverted (more negative = higher ground).
                                heightOffset = -Math.max(8, terrainRise);
                            }
                        }
                        const nextHeight = flatHeight + heightOffset;
                        recordHistoryTileMutation(this.pluginHost, map, level, sceneX, sceneY, () => {
                            scene.setHeight(level, sceneX, sceneY, nextHeight);
                            scene.tileUnderlays[level][sceneX][sceneY] = paintedUnderlay;
                            scene.tileShapes[level][sceneX][sceneY] = 0;
                            scene.tileOverlays[level][sceneX][sceneY] = paintedOverlay;
                        });
                    }
                }
            }
        };

        applyTerrainTemplate(templateMap);

        for (let mapX = minX; mapX <= maxX; mapX++) {
            for (let mapY = minY; mapY <= maxY; mapY++) {
                const mapId = getMapSquareId(mapX, mapY);
                if (processedMapIds?.has(mapId)) {
                    continue;
                }

                const map = renderer.mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
                if (!map) {
                    continue;
                }

                const scene = map.scene;
                if (shouldCopyTemplate && map !== templateMap) {
                    const template = templateMap.scene;
                    for (let level = 0; level < scene.levels; level++) {
                        for (let sceneX = 0; sceneX < scene.sizeX; sceneX++) {
                            scene.tileHeights[level][sceneX].set(template.tileHeights[level][sceneX]);
                            scene.tileUnderlays[level][sceneX].set(
                                template.tileUnderlays[level][sceneX],
                            );
                            scene.tileShapes[level][sceneX].set(template.tileShapes[level][sceneX]);
                            scene.tileOverlays[level][sceneX].set(template.tileOverlays[level][sceneX]);
                        }
                    }
                } else if (map !== templateMap) {
                    applyTerrainTemplate(map);
                }
                for (let tileX = 0; tileX < 64; tileX++) {
                    for (let tileY = 0; tileY < 64; tileY++) {
                        renderer.addAffectedTile(map.mapX * 64 + tileX, map.mapY * 64 + tileY);
                        renderer.addHeightChangedTile(map.mapX * 64 + tileX, map.mapY * 64 + tileY);
                    }
                }

                map.heightUpdated = true;
                map.underlayUpdated = true;
                map.overlayUpdated = true;
                processedMapIds?.add(mapId);
                updatedMaps += 1;
            }
        }

        if (updatedMaps > 0) {
            renderer.updateAffectedTiles();
            this.commitHistoryStroke();
            this.scheduleMinimapRefreshAfterEdit();
        } else {
            this.mapEditHistory.cancelStroke();
        }

        return updatedMaps;
    }

    updateSearchParams(): void {
        /* No-op: editor camera is not written to the URL. */
    }

    setViewMode(mode: MapEditorViewMode): void {
        if (this.viewMode === mode) {
            return;
        }
        this.saveCameraSnapshotForMode(this.viewMode);
        this.viewMode = mode;
        const saved = this.cameraSnapshotByMode[mode];
        if (saved) {
            this.restoreCameraSnapshot(saved);
        } else {
            this.applyDefaultCameraForMode(mode);
        }
    }

    setSandboxModeActive(active: boolean): void {
        if (this.sandboxModeActive === active) {
            return;
        }
        this.sandboxModeActive = active;
        this.notifyWorkbenchStateChanged();
    }

    setSandboxBounds(bounds?: { minX: number; minY: number; maxX: number; maxY: number }): void {
        this.sandboxBounds = bounds;
        this.notifyWorkbenchStateChanged();
    }

    setSandboxTerrainSettings(partial: Partial<SandboxTerrainSettings>): SandboxTerrainSettings {
        this.sandboxTerrainSettings = {
            ...this.sandboxTerrainSettings,
            ...partial,
        };
        this.notifyWorkbenchStateChanged();
        return this.sandboxTerrainSettings;
    }

    private saveCameraSnapshotForMode(mode: MapEditorViewMode): void {
        const c = this.camera;
        this.cameraSnapshotByMode[mode] = {
            projectionType: c.projectionType,
            pitch: c.pitch,
            yaw: c.yaw,
            fov: c.fov,
            orthoZoom: c.orthoZoom,
            pos: vec3.clone(c.pos),
        };
    }

    private restoreCameraSnapshot(s: MapEditorCameraSnapshot): void {
        const c = this.camera;
        c.projectionType = s.projectionType;
        c.pitch = s.pitch;
        c.yaw = s.yaw;
        // FOV zoom used to widen past 90°; snapshots from then would restore a fisheye view.
        c.fov = Math.min(Math.max(s.fov, 30), 90);
        c.orthoZoom = s.orthoZoom;
        vec3.copy(c.pos, s.pos);
        c.updated = true;
    }

    /**
     * RS minimap textures for the dock minimap.
     * When this map square is **loaded in the editor**, renders from the **live** `Scene` so paint
     * matches the 3D view. Otherwise falls back to the worker (cache-based) snapshot.
     */
    getMinimapImageUrl(mapX: number, mapY: number): string | undefined {
        if (mapX < 0 || mapY < 0 || mapX >= MapManager.MAX_MAP_X || mapY >= MapManager.MAX_MAP_Y) {
            return undefined;
        }
        const mapManager = this.renderer.mapManager;
        const mapId = getMapSquareId(mapX, mapY);
        // Only regions that are loaded in the editor show up: the minimap never streams in or renders its own neighbours.
        const loaded = mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
        if (!loaded) return undefined;
        void this.queueLiveMinimapImage(mapX, mapY);
        return this.minimapImageUrls.get(mapId);
    }

    /**
     * Full-resolution minimap preview for the virtualized setup/world-map UI.
     *
     * Unloaded regions render directly through the worker and return the Blob
     * without creating a retained object URL or streaming a full editable map
     * square. Loaded regions use the live editor minimap so unsaved edits remain
     * visible, then convert the editor's bounded minimap URL back to a Blob.
     */
    async loadMinimapPreviewBlob(
        mapX: number,
        mapY: number,
    ): Promise<Blob | undefined> {
        if (
            mapX < 0 ||
            mapY < 0 ||
            mapX >= MapManager.MAX_MAP_X ||
            mapY >= MapManager.MAX_MAP_Y
        ) {
            return undefined;
        }

        const mapManager = this.renderer.mapManager;
        const mapId = getMapSquareId(mapX, mapY);
        if (mapManager.invalidMapIds.has(mapId)) return undefined;

        const loaded = mapManager.getMap(mapX, mapY) as
            | EditorMapSquare
            | undefined;
        if (!loaded) {
            const minimapData = await this.workerPool.queueMapImage(
                mapX,
                mapY,
                this.selectedLevel,
                true,
                true,
            );
            if (!minimapData) {
                mapManager.invalidMapIds.add(mapId);
                return undefined;
            }
            return minimapData.minimapBlob;
        }

        await this.queueLiveMinimapImage(mapX, mapY);
        const url = this.minimapImageUrls.get(mapId);
        if (!url) return undefined;

        const response = await fetch(url);
        return response.ok ? response.blob() : undefined;
    }

    /** Debounced: bust minimap blobs near the camera after terrain / overlay edits. */
    /**
     * A map square finished streaming in. Only its own minimap can be stale (a cache render made
     * before a sandbox square loaded), so leave the neighbours alone; busting all nine around the
     * camera per streamed square re-rendered and re-posted minimaps constantly while moving.
     */
    refreshMinimapForLoadedMap(mapX: number, mapY: number): void {
        const mapId = getMapSquareId(mapX, mapY);
        const url = this.minimapImageUrls.get(mapId);
        if (url && !this.sandboxModeActive) {
            return;
        }
        if (url) {
            this.scheduleRevokeMinimapBlobUrl(url);
            this.minimapImageUrls.delete(mapId);
        }
        this.getMinimapImageUrl(mapX, mapY);
    }

    scheduleMinimapRefreshAfterEdit(): void {
        if (this.minimapEditRefreshTimer !== null) {
            clearTimeout(this.minimapEditRefreshTimer);
        }
        this.minimapEditRefreshTimer = window.setTimeout(() => {
            this.minimapEditRefreshTimer = null;
            this.bustMinimapBlobUrlsAroundCamera();
            const cx = this.camera.getPosX();
            const cy = this.camera.getPosZ();
            const cmx = cx >> 6;
            const cmy = cy >> 6;
            for (let mx = 0; mx < 3; mx++) {
                for (let my = 0; my < 3; my++) {
                    const x = cmx - 1 + mx;
                    const y = cmy - 1 + my;
                    if (x >= 0 && y >= 0 && x < MapManager.MAX_MAP_X && y < MapManager.MAX_MAP_Y) {
                        this.getMinimapImageUrl(x, y);
                    }
                }
            }
        }, MINIMAP_REFRESH_DEBOUNCE_MS);
    }

    /**
     * Merge scene-tile bounds affected by the latest terrain flush (underlay blend radius included).
     * Called from the GL renderer while tile ids are still available.
     */
    accumulateMinimapDirtyFromEditedTiles(
        mapId: number,
        borderSize: number,
        tileIds: Set<number>,
        sceneSizeX: number,
        sceneSizeY: number,
    ): void {
        if (tileIds.size === 0) {
            return;
        }
        let minSX = Infinity;
        let minSY = Infinity;
        let maxSX = -Infinity;
        let maxSY = -Infinity;
        for (const tid of tileIds) {
            const tx = tid >> 8;
            const ty = tid & 0xff;
            const sx = tx + borderSize;
            const sy = ty + borderSize;
            if (sx < 0 || sy < 0 || sx >= sceneSizeX || sy >= sceneSizeY) {
                continue;
            }
            minSX = Math.min(minSX, sx);
            minSY = Math.min(minSY, sy);
            maxSX = Math.max(maxSX, sx);
            maxSY = Math.max(maxSY, sy);
        }
        if (minSX === Infinity) {
            return;
        }
        const expand = SceneBuilder.BLEND_RADIUS + 2;
        this.mergeMinimapDirtyRect(
            mapId,
            minSX - expand,
            minSY - expand,
            maxSX + expand,
            maxSY + expand,
            sceneSizeX,
            sceneSizeY,
        );
    }

    private mergeMinimapDirtyRect(
        mapId: number,
        minX: number,
        minY: number,
        maxX: number,
        maxY: number,
        sceneSizeX: number,
        sceneSizeY: number,
    ): void {
        const minXi = Math.max(0, Math.min(minX, maxX));
        const minYi = Math.max(0, Math.min(minY, maxY));
        const maxXi = Math.min(sceneSizeX - 1, Math.max(minX, maxX));
        const maxYi = Math.min(sceneSizeY - 1, Math.max(minY, maxY));
        if (minXi > maxXi || minYi > maxYi) {
            return;
        }
        const prev = this.minimapDirtyByMapId.get(mapId);
        if (!prev) {
            this.minimapDirtyByMapId.set(mapId, {
                minX: minXi,
                minY: minYi,
                maxX: maxXi,
                maxY: maxYi,
            });
        } else {
            prev.minX = Math.min(prev.minX, minXi);
            prev.minY = Math.min(prev.minY, minYi);
            prev.maxX = Math.max(prev.maxX, maxXi);
            prev.maxY = Math.max(prev.maxY, maxYi);
        }
    }

    /** Drop blob URLs only so the dock reloads; keeps pixel cache for regional minimap updates. */
    private bustMinimapBlobUrlsAroundCamera(): void {
        const cx = this.camera.getPosX();
        const cy = this.camera.getPosZ();
        const cameraMapX = cx >> 6;
        const cameraMapY = cy >> 6;
        for (let mx = 0; mx < 3; mx++) {
            for (let my = 0; my < 3; my++) {
                const mapX = cameraMapX - 1 + mx;
                const mapY = cameraMapY - 1 + my;
                if (mapX < 0 || mapY < 0 || mapX >= MapManager.MAX_MAP_X || mapY >= MapManager.MAX_MAP_Y) {
                    continue;
                }
                const mapId = getMapSquareId(mapX, mapY);
                const url = this.minimapImageUrls.get(mapId);
                if (url) {
                    this.scheduleRevokeMinimapBlobUrl(url);
                }
                this.minimapImageUrls.delete(mapId);
            }
        }
    }

    private async queueLiveMinimapImage(mapX: number, mapY: number): Promise<void> {
        const mapManager = this.renderer.mapManager;
        const mapId = getMapSquareId(mapX, mapY);
        const map = mapManager.getMap(mapX, mapY) as EditorMapSquare | undefined;
        if (!map) return;
        if (
            this.loadingMinimapImageIds.size > this.workerPool.size * 4 ||
            this.minimapImageUrls.has(mapId) ||
            this.loadingMinimapImageIds.has(mapId) ||
            mapManager.invalidMapIds.has(mapId) ||
            mapManager.loadingMapIds.has(mapId)
        ) {
            return;
        }
        this.loadingMinimapImageIds.add(mapId);
        try {
            const scene = map.scene;
            const dirty = this.minimapDirtyByMapId.get(mapId);
            const cached = this.minimapPixelCache.get(mapId);
            const expectedLen = scene.sizeX * 4 * scene.sizeY * 4;
            const canPatch = !!(dirty && cached && cached.length === expectedLen);

            if (canPatch && dirty) {
                try {
                    const bleed = 1;
                    const px0 = Math.max(0, dirty.minX - bleed);
                    const py0 = Math.max(0, dirty.minY - bleed);
                    const px1 = Math.min(scene.sizeX - 1, dirty.maxX + bleed);
                    const py1 = Math.min(scene.sizeY - 1, dirty.maxY + bleed);

                    const expand = SceneBuilder.BLEND_RADIUS + 2;
                    const modelMinX = Math.max(1, dirty.minX - expand);
                    const modelMinY = Math.max(1, dirty.minY - expand);
                    const modelMaxX = Math.min(scene.sizeX - 2, dirty.maxX + expand);
                    const modelMaxY = Math.min(scene.sizeY - 2, dirty.maxY + expand);

                    const sceneData = cloneSceneTerrainData(scene);
                    const patchPixels = new Int32Array(cached);
                    const patchReq: LiveMinimapWorkerRequest = {
                        mode: "patch",
                        scene: sceneData,
                        locs: map.sceneLocData,
                        selectedLevel: this.selectedLevel,
                        borderSize: map.borderSize,
                        pixels: patchPixels,
                        modelMinX,
                        modelMaxX,
                        modelMinY,
                        modelMaxY,
                        patchMinX: px0,
                        patchMaxX: px1,
                        patchMinY: py0,
                        patchMaxY: py1,
                    };

                    const patchResult = await this.workerPool.queueEditorLiveMinimap(
                        transferLiveMinimapWorkerRequest(patchReq),
                    );
                    this.setMinimapPixelCache(mapId, new Int32Array(patchResult.pixelCache));
                    this.setMinimapBlobUrl(mapX, mapY, await mainThreadBlobUrl(patchResult.minimapBlob));
                    this.minimapDirtyByMapId.delete(mapId);
                } catch {
                    this.minimapPixelCache.delete(mapId);
                    this.minimapDirtyByMapId.delete(mapId);
                    await this.renderLiveMinimapFullViaWorker(mapX, mapY, map, mapId);
                }
            } else {
                await this.renderLiveMinimapFullViaWorker(mapX, mapY, map, mapId);
                this.minimapDirtyByMapId.delete(mapId);
            }
        } catch {
            mapManager.invalidMapIds.add(mapId);
        } finally {
            this.loadingMinimapImageIds.delete(mapId);
        }
    }

    private async renderLiveMinimapFullViaWorker(
        mapX: number,
        mapY: number,
        map: EditorMapSquare,
        mapId: number,
    ): Promise<void> {
        const sceneData = cloneSceneTerrainData(map.scene);
        const fullReq: LiveMinimapWorkerRequest = {
            mode: "full",
            scene: sceneData,
            locs: map.sceneLocData,
            selectedLevel: this.selectedLevel,
            borderSize: map.borderSize,
        };
        const result = await this.workerPool.queueEditorLiveMinimap(
            transferLiveMinimapWorkerRequest(fullReq),
        );
        this.setMinimapPixelCache(mapId, new Int32Array(result.pixelCache));
        this.setMinimapBlobUrl(mapX, mapY, await mainThreadBlobUrl(result.minimapBlob));
    }

    /** Blob URLs stay valid until UI swaps to a new texture; immediate revoke caused minimap flashes. */
    private static readonly MINIMAP_BLOB_REVOKE_DELAY_MS = 4000;

    private scheduleRevokeMinimapBlobUrl(url: string): void {
        window.setTimeout(() => {
            URL.revokeObjectURL(url);
        }, MapEditor.MINIMAP_BLOB_REVOKE_DELAY_MS);
    }

    private setMinimapBlobUrl(mapX: number, mapY: number, blobUrl: string): void {
        const mapId = getMapSquareId(mapX, mapY);
        const prev = this.minimapImageUrls.get(mapId);
        if (prev) {
            this.scheduleRevokeMinimapBlobUrl(prev);
            this.minimapImageUrls.delete(mapId);
        }
        this.minimapImageUrls.set(mapId, blobUrl);

        while (this.minimapImageUrls.size > MAX_MINIMAP_IMAGE_CACHE_ENTRIES) {
            const oldest = this.minimapImageUrls.entries().next().value as [number, string] | undefined;
            if (!oldest) break;
            this.minimapImageUrls.delete(oldest[0]);
            this.scheduleRevokeMinimapBlobUrl(oldest[1]);
            this.minimapPixelCache.delete(oldest[0]);
            this.minimapDirtyByMapId.delete(oldest[0]);
        }
    }

    private setMinimapPixelCache(mapId: number, pixels: Int32Array): void {
        this.minimapPixelCache.delete(mapId);
        this.minimapPixelCache.set(mapId, pixels);
        while (this.minimapPixelCache.size > MAX_MINIMAP_PIXEL_CACHE_ENTRIES) {
            const oldestMapId = this.minimapPixelCache.keys().next().value as number | undefined;
            if (oldestMapId === undefined) break;
            this.minimapPixelCache.delete(oldestMapId);
            this.minimapDirtyByMapId.delete(oldestMapId);
        }
    }

    dispose(): void {
        if (this.minimapEditRefreshTimer !== null) {
            window.clearTimeout(this.minimapEditRefreshTimer);
            this.minimapEditRefreshTimer = null;
        }
        for (const url of this.minimapImageUrls.values()) {
            URL.revokeObjectURL(url);
        }
        this.minimapImageUrls.clear();
        this.loadingMinimapImageIds.clear();
        this.minimapPixelCache.clear();
        this.minimapDirtyByMapId.clear();
        this.locModelLoader?.clearCache();
        this.seqFrameLoader?.clearCache();

        if (import.meta.env.DEV && typeof window !== "undefined") {
            const devWindow = window as unknown as { __mapEditor?: MapEditor };
            if (devWindow.__mapEditor === this) {
                delete devWindow.__mapEditor;
            }
        }
    }

    private async queueMinimapImage(mapX: number, mapY: number): Promise<void> {
        const mapManager = this.renderer.mapManager;
        const mapId = getMapSquareId(mapX, mapY);
        if (
            this.loadingMinimapImageIds.size > this.workerPool.size * 4 ||
            this.minimapImageUrls.has(mapId) ||
            this.loadingMinimapImageIds.has(mapId) ||
            mapManager.invalidMapIds.has(mapId) ||
            mapManager.loadingMapIds.has(mapId)
        ) {
            return;
        }
        this.loadingMinimapImageIds.add(mapId);

        const minimapData = await this.workerPool.queueMapImage(mapX, mapY, this.selectedLevel, true, true);
        if (minimapData) {
            this.setMinimapBlobUrl(mapX, mapY, await mainThreadBlobUrl(minimapData.minimapBlob));
        } else {
            mapManager.invalidMapIds.add(mapId);
        }

        this.loadingMinimapImageIds.delete(mapId);
    }

    /**
     * Clears cached minimap blobs and incremental raster state for the 3×3 region around the camera
     * (manual refresh — forces full minimap rebuilds).
     */
    refreshMinimapAroundCamera(): void {
        const cx = this.camera.getPosX();
        const cy = this.camera.getPosZ();
        const cameraMapX = cx >> 6;
        const cameraMapY = cy >> 6;
        for (let mx = 0; mx < 3; mx++) {
            for (let my = 0; my < 3; my++) {
                const mapX = cameraMapX - 1 + mx;
                const mapY = cameraMapY - 1 + my;
                if (mapX < 0 || mapY < 0 || mapX >= MapManager.MAX_MAP_X || mapY >= MapManager.MAX_MAP_Y) {
                    continue;
                }
                const mapId = getMapSquareId(mapX, mapY);
                const url = this.minimapImageUrls.get(mapId);
                if (url) {
                    this.scheduleRevokeMinimapBlobUrl(url);
                }
                this.minimapImageUrls.delete(mapId);
                this.minimapPixelCache.delete(mapId);
                this.minimapDirtyByMapId.delete(mapId);
            }
        }
    }

    private applyDefaultCameraForMode(mode: MapEditorViewMode): void {
        const c = this.camera;
        if (mode === "editor") {
            c.setProjectionType(ProjectionType.PERSPECTIVE);
            c.pitch = -245;
            c.yaw = 1862;
            c.fov = 62;
        } else if (mode === "2d") {
            c.setProjectionType(ProjectionType.ORTHO);
            c.pitch = 0;
            c.orthoZoom = 28;
        } else {
            c.setProjectionType(ProjectionType.PERSPECTIVE);
            c.fov = 60;
            c.pitch = -400;
        }
        c.updated = true;
    }
}
