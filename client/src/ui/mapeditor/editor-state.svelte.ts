import { getContext, setContext } from "svelte";

import type { MapEditorBrushType, MapEditorTool } from "../../mapeditor/map-editor-kinds";
import type { MapEditorHistorySnapshot } from "../../mapeditor/map-editor-history";
import { getActivePaintModifiers } from "../../mapeditor/editor-tool-input";
import { drawStats, glMemory } from "../../perf/gl-memory";
import { tileTelemetry, type StatusSegment } from "../../mapeditor/status-format";
import { OVERLAY_SAME_ID_FLOOD_BRUSH_HUD } from "../../mapeditor/overlay-flood-fill";
import type { IEditorPluginHost } from "../../mapeditor/plugins/editor-plugin-host";
import { fromExternal } from "../lib/external.svelte";
import type { Workbench } from "./workbench-controller.svelte";

/** FPS text refreshes at this interval; everything else in the HUD updates every frame. */
const FPS_INTERVAL_MS = 120;

/**
 * Live viewport HUD. Fields are plain `$state`, assigned only when they change, so only the text
 * nodes bound to them update. (The React version re-rendered the whole editor tree on every frame.)
 */
export class Hud {
    fps = $state("");
    debugText = $state("");
    cameraYaw = $state(0);
    brushSize = $state(0);
    brushType = $state<MapEditorBrushType>("square");
    /** Like `brushType`, but reads as the flood marker while flood-fill modifiers are held. */
    brushTypeActive = $state<MapEditorBrushType | typeof OVERLAY_SAME_ID_FLOOD_BRUSH_HUD>("square");
    /** World tile under the cursor (undefined off the map); only reassigned when it changes. */
    hoverTile = $state.raw<{ worldX: number; worldY: number } | undefined>();

    /** Cursor telemetry for the status bar (region, local/world tile, plane and the hovered tile's contents). */
    tileSegments = $state.raw<StatusSegment[]>([]);
    /** Render stats for the status bar, refreshed a few times a second. */
    frameMs = $state("");
    drawCalls = $state(0);
    triangles = $state(0);
    gpuBytes = $state(0);

    private frame = 0;
    private lastTileKey = "";
    private lastStatsAt = 0;
    private lastFpsAt = 0;
    private lastSampleAt = 0;

    constructor(private readonly host: IEditorPluginHost) {
        this.cameraYaw = host.camera.getYaw();
        this.brushSize = host.brushSize;
        this.brushType = host.brushType;
        this.brushTypeActive = host.brushType;
    }

    start(): void {
        if (this.frame) return;
        const tick = (time: DOMHighResTimeStamp): void => {
            this.sample(time);
            this.frame = requestAnimationFrame(tick);
        };
        this.frame = requestAnimationFrame(tick);
    }

    stop(): void {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
    }

    private sample(time: DOMHighResTimeStamp): void {
        // 25 Hz is plenty for text readouts and keeps Svelte from updating 60 times a second.
        if (time - this.lastSampleAt < 40) return;
        this.lastSampleAt = time;
        const host = this.host;
        const floodHeld = getActivePaintModifiers(host).overlaySameIdFloodWithControlAlt;

        if (time - this.lastFpsAt >= FPS_INTERVAL_MS) {
            this.lastFpsAt = time;
            this.fps = Math.round(host.renderer.stats.frameTimeFps).toString();
        }
        const hover = host.getHoveredTile();
        if (hover?.worldX !== this.hoverTile?.worldX || hover?.worldY !== this.hoverTile?.worldY) {
            this.hoverTile = hover;
        }
        const level = host.getTilePickLevel();
        const tileKey = hover ? `${hover.worldX},${hover.worldY},${level}` : "";
        // The tile's contents change while painting, so the same tile is re-read about four times a second.
        const resample = tileKey !== this.lastTileKey || time - this.lastStatsAt >= 250;
        if (resample) {
            this.lastTileKey = tileKey;
            this.tileSegments = hover ? tileTelemetry(hover, level, host.getTileInfo(level, hover.worldX, hover.worldY)) : [];
        }
        if (time - this.lastStatsAt >= 250) {
            this.lastStatsAt = time;
            this.frameMs = host.renderer.stats.frameTime.toFixed(1);
            this.drawCalls = drawStats.lastCalls;
            this.triangles = drawStats.lastTriangles;
            this.gpuBytes = glMemory.bytes;
        }
        this.debugText = host.debugText ?? "";
        this.cameraYaw = host.camera.getYaw();
        this.brushSize = host.brushSize;
        this.brushType = host.brushType;
        this.brushTypeActive = floodHeld ? OVERLAY_SAME_ID_FLOOD_BRUSH_HUD : host.brushType;
    }
}

/** Everything the editor's Svelte UI reads from the engine, bundled for one context. */
export class EditorState {
    readonly hud: Hud;
    /** Changes whenever any workbench state does (a coarse snapshot string; read it to subscribe). */
    readonly snapshot: { readonly current: string };
    /** The dock workbench, once it exists (panels use it for placement and menus). */
    layout = $state.raw<Workbench | undefined>();
    readonly tool: { readonly current: MapEditorTool };
    readonly history: { readonly current: MapEditorHistorySnapshot };

    constructor(readonly host: IEditorPluginHost) {
        this.hud = new Hud(host);
        this.snapshot = fromExternal(host.subscribeWorkbenchPlugins, host.getWorkbenchPluginsStateSnapshot);
        this.tool = fromExternal(host.subscribeEditorTool, host.getEditorTool);
        this.history = fromExternal(host.subscribeHistory, host.getHistorySnapshot);
    }

    /**
     * Reads engine state that is not itself reactive, re-evaluating whenever the workbench snapshot changes:
     * `{state.read(() => host.objectsVisible)}`.
     */
    read<T>(getter: () => T): T {
        void this.snapshot.current;
        return getter();
    }

    dispose(): void {
        this.hud.stop();
    }
}

const KEY = Symbol("map-editor-state");

export function provideEditorState(state: EditorState): void {
    setContext(KEY, state);
}

/** Context map for `mount()`/`sveltePanel`, for components mounted outside the app tree (dock panels). */
export function editorContext(state: EditorState): Map<unknown, unknown> {
    return new Map([[KEY, state]]);
}

export function useEditorState(): EditorState {
    const state = getContext<EditorState | undefined>(KEY);
    if (!state) throw new Error("useEditorState() called outside the map editor");
    return state;
}
