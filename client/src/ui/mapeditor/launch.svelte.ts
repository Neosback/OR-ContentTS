import { registerSerializer } from "threads";

import { getActiveProfileIdAsync, loadLocalCacheProfilesAsync } from "../../lib/local-cache-profiles";
import { resolveActiveProfileCache } from "../../lib/resolve-active-profile-cache";
import { MapEditor } from "../../mapeditor/MapEditor";
import type { IEditorPluginHost } from "../../mapeditor/plugins/editor-plugin-host";
import { collectEditReplayMapRefs, replayEditBatchV1 } from "../../project/edit-format-v1-replay";
import type { Project } from "../../project/project-store";
import type { CacheList } from "../../mapviewer/Caches";
import { getMapRenderWorkerPool } from "../../mapviewer/map-render-worker-pool";
import { renderDataLoaderSerializer } from "../../mapviewer/worker/RenderDataLoader";
import { perfLog } from "../../perf/gl-memory";
import { perf } from "../../perf/perf-profile";
import { isIos } from "../../util/DeviceUtil";
import { readJson, readStorage, writeStorage } from "../lib/persisted";
import { router } from "../lib/router.svelte";
import type { ProjectSessionController } from "./project-session.svelte";

registerSerializer(renderDataLoaderSerializer);

export type LaunchMode = "region" | "sandbox";

export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface LastLoadedEntry {
    id: string;
    name: string;
    date: string;
    imageUrl: string;
    mode: LaunchMode;
    regionId: number;
    mapX: number;
    mapY: number;
    radius: number;
    cacheProfileId: string;
    cacheProfileName: string;
}

interface LaunchMeta {
    mode: LaunchMode;
    mapX: number;
    mapY: number;
    regionId: number;
    radius: number;
}

/** Region-load progress poll. State changes are cheap now, but there is no reason to poll every frame. */
const READY_POLL_MS = 100;
const LAST_LOADED_PREFIX = "map-editor-last-loaded:";
const LAST_LOADED_INDEX_KEY = "map-editor-last-loaded:index";
const LAST_LOADED_MAX_ITEMS = 30;
/** The sandbox is always centred on this region (Lumbridge-ish flat area). */
const SANDBOX_REGION_ID = 10353;

const storageKey = (cacheProfileId: string): string => `${LAST_LOADED_PREFIX}${cacheProfileId}`;

function isLastLoadedEntry(entry: unknown): entry is LastLoadedEntry {
    const e = entry as Partial<LastLoadedEntry> | null;
    return (
        !!e &&
        typeof e.id === "string" &&
        typeof e.name === "string" &&
        typeof e.date === "string" &&
        typeof e.imageUrl === "string" &&
        typeof e.mode === "string" &&
        typeof e.regionId === "number" &&
        typeof e.mapX === "number" &&
        typeof e.mapY === "number" &&
        typeof e.radius === "number" &&
        typeof e.cacheProfileId === "string" &&
        typeof e.cacheProfileName === "string"
    );
}

export function loadLastLoaded(cacheProfileId: string, cacheProfileName?: string): LastLoadedEntry[] {
    let raw = readStorage(storageKey(cacheProfileId));
    if (!raw && cacheProfileName) {
        // Profile ids changed between versions; fall back to the name index.
        const index = readJson<Record<string, string>>(LAST_LOADED_INDEX_KEY);
        const fallbackId = index?.[cacheProfileName];
        raw = fallbackId ? readStorage(storageKey(fallbackId)) : null;
    }
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isLastLoadedEntry) : [];
    } catch {
        return [];
    }
}

function persistLastLoaded(cacheProfileId: string, cacheProfileName: string, entries: LastLoadedEntry[]): void {
    writeStorage(storageKey(cacheProfileId), JSON.stringify(entries));
    const index = readJson<Record<string, string>>(LAST_LOADED_INDEX_KEY) ?? {};
    index[cacheProfileName] = cacheProfileId;
    writeStorage(LAST_LOADED_INDEX_KEY, JSON.stringify(index));
}

export function fallbackPreviewDataUrl(label: string): string {
    return (
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="8" fill="#0f172a"/><rect x="4" y="4" width="56" height="56" rx="6" fill="#1e293b"/><text x="32" y="30" font-family="Arial, sans-serif" font-size="10" text-anchor="middle" fill="#e2e8f0">${label}</text><text x="32" y="44" font-family="Arial, sans-serif" font-size="9" text-anchor="middle" fill="#94a3b8">64x64</text></svg>`,
        )
    );
}

function buildEntryName(mode: LaunchMode, regionId: number, mapX: number, mapY: number): string {
    if (Number.isFinite(regionId)) return `${mode === "sandbox" ? "Sandbox" : "Region"} ${regionId}`;
    return `${mode === "sandbox" ? "Sandbox" : "Coords"} ${mapX}, ${mapY}`;
}

/** Persisted preview images must stay small (localStorage quota). */
function sanitizePersistedImage(previewUrl: string, regionId: number): string {
    if (!previewUrl) return fallbackPreviewDataUrl(`R${regionId}`);
    if (previewUrl.startsWith("data:image") && previewUrl.length > 120_000) return fallbackPreviewDataUrl(`R${regionId}`);
    return previewUrl;
}

function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
    });
}

/** Grid preview for "regions around target": capped at 100 cells, tiles shrink as the radius grows. */
export function previewCells(radius: number): {
    safeRadius: number;
    safeCount: number;
    cellCount: number;
    columns: number;
    rows: number;
    tileSize: number;
} {
    const safeRadius = Math.max(0, Math.floor(radius || 0));
    const safeCount = (safeRadius * 2 + 1) ** 2;
    const cellCount = Math.min(100, safeCount);
    const columns = Math.max(3, Math.min(14, safeRadius * 2 + 1));
    const rows = Math.max(1, Math.ceil(cellCount / columns));
    const sizeRatio = Math.min(1, 24 / Math.max(24, safeCount));
    const tileSize = Math.max(5, Math.round(17 * Math.sqrt(sizeRatio)));
    return { safeRadius, safeCount, cellCount, columns, rows, tileSize };
}

/** Sandbox seeds may be numbers or any text; text is hashed (FNV-1a). */
function parseSandboxSeed(seed: string): number {
    const trimmed = seed.trim();
    if (!trimmed) return 0;
    if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10) || 0;
    let hash = 2166136261;
    for (let i = 0; i < trimmed.length; i++) {
        hash ^= trimmed.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash | 0;
}

function flattenSandbox(mapEditor: MapEditor, host: IEditorPluginHost, bounds: Bounds): void {
    const s = host.sandboxTerrainSettings;
    mapEditor.applyFlatHeightInBounds(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, 0, {
        noiseEnabled: s.preset !== "flat",
        terrainPreset: s.preset,
        landform: s.landform,
        noiseSeed: parseSandboxSeed(s.seed),
        noiseAmplitude: s.amplitude,
        noiseScale: s.scale,
        roughness: s.roughness,
        cliffiness: s.cliffiness,
        valleyDepth: s.valleyDepth,
        waterLevel: s.waterLevel,
        waterDepth: s.waterDepth,
        beachWidth: s.beachWidth,
        inlandness: s.inlandness,
    });
}

function boundsAround(mapX: number, mapY: number, radius: number): Bounds {
    return {
        minX: Math.max(0, mapX - radius),
        maxX: Math.min(99, mapX + radius),
        minY: Math.max(0, mapY - radius),
        maxY: Math.min(199, mapY + radius),
    };
}

/**
 * Everything the map editor screen does before the workbench appears: resolve the active cache, create
 * the editor, run the Region/Sandbox launch card, and track "last loaded" maps.
 */
export class LaunchController {
    constructor(readonly projects: ProjectSessionController) {}
    // ── loading ──────────────────────────────────────────────
    loadingLabel = $state("Loading selected cache...");
    loadingProgress = $state(0);
    errorMessage = $state<string | undefined>();
    projectMessage = $state<string | undefined>();
    mapEditor = $state.raw<MapEditor | undefined>();
    pluginHost = $state.raw<IEditorPluginHost | undefined>();
    activeCacheProfileId = $state("");
    activeCacheProfileName = $state("");

    // ── launch card ──────────────────────────────────────────
    showLaunchPanel = $state(true);
    isWorldMapOpen = $state(false);
    activeMode = $state<LaunchMode>("region");
    targetRegion = $state("12342");
    targetRegionX = $state("");
    targetRegionY = $state("");
    // Start small: each region adds geometry, workers and GPU memory. The profile caps the maximum.
    regionRadius = $state(Math.min(perf.profile.defaultRegionRadius, perf.profile.maxRegionRadius));
    sandboxRegionRadius = $state(Math.min(perf.profile.defaultRegionRadius, perf.profile.maxRegionRadius));
    selectedLoadFileName = $state("");
    lastLoadedMaps = $state<LastLoadedEntry[]>([]);

    // ── entering the editor ──────────────────────────────────
    isEnteringEditor = $state(false);
    /** Once true, keep the workbench/canvas mounted behind the setup overlay so map streaming can progress. */
    rendererActivated = $state(false);
    launchMode = $state<LaunchMode | null>(null);
    enteringProgress = $state(0);
    enteringLoaded = $state(0);
    enteringTotal = $state(0);
    isSandboxPostProcessing = $state(false);

    private enteringBounds: Bounds | undefined;
    private sandboxSweepBounds: Bounds | undefined;
    private launchMeta: LaunchMeta | undefined;
    /** The region (and radius) the editor was last opened on; shown in the title bar. */
    currentLocation = $state<{ regionId: number; mapX: number; mapY: number; radius: number; mode: LaunchMode } | undefined>();
    private lastSavedSessionKey = "";
    private timers = new Set<number>();
    private abort = new AbortController();
    private started = false;

    // ── derived form state ───────────────────────────────────
    readonly hasRegionIdInput = $derived(this.targetRegion.trim().length > 0);
    readonly hasAnyCoordInput = $derived(this.targetRegionX.trim().length > 0 || this.targetRegionY.trim().length > 0);
    readonly isRegionIdValid = $derived(/^\d+$/.test(this.targetRegion.trim()));
    readonly isRegionCoordsValid = $derived(/^\d+$/.test(this.targetRegionX.trim()) && /^\d+$/.test(this.targetRegionY.trim()));
    readonly canOpenRegion = $derived(this.isRegionIdValid || this.isRegionCoordsValid);
    get canLaunchManualRegion(): boolean {
        return (this.projects.snapshot.workingEdits?.transactions.length ?? 0) === 0;
    }
    readonly regionPreview = $derived(previewCells(this.regionRadius));
    readonly sandboxPreview = $derived(previewCells(this.sandboxRegionRadius));
    /** The sandbox preview grid is fitted into a fixed-size footprint. */
    readonly sandboxTileSize = $derived(
        Math.max(2, Math.min(Math.floor(177 / Math.max(1, this.sandboxPreview.columns)), Math.floor(177 / Math.max(1, this.sandboxPreview.rows)))),
    );

    /** Phase the screen should show. */
    readonly phase = $derived<"loading" | "launch" | "error" | "editor">(
        this.showLaunchPanel && !this.pluginHost && !this.errorMessage
            ? "loading"
            : this.showLaunchPanel
              ? "launch"
              : this.errorMessage
                ? "error"
                : this.pluginHost
                  ? "editor"
                  : "loading",
    );

    /** Begins resolving the cache and creating the editor. Safe to call once. */
    start(): void {
        if (this.started) return;
        this.started = true;
        this.projects.start().catch((error: unknown) => {
            this.projectMessage = error instanceof Error ? error.message : String(error);
        });
        window.addEventListener("beforeunload", this.saveOnExit);

        if (isIos) {
            this.errorMessage = "iOS is not supported.";
            return;
        }
        this.load().catch((error: unknown) => {
            if (this.abort.signal.aborted) return;
            if (!(error instanceof DOMException && error.name === "AbortError")) console.error(error);
            this.errorMessage =
                error instanceof Error ? error.message : "Failed to load selected cache. Import it in Cache Repository.";
        });
    }

    dispose(): void {
        this.saveOnExit();
        window.removeEventListener("beforeunload", this.saveOnExit);
        this.abort.abort("component-unmount");
        for (const timer of this.timers) window.clearTimeout(timer);
        this.timers.clear();
        this.mapEditor?.dispose();
    }

    private async load(): Promise<void> {
        this.loadingLabel = "Resolving cache profile...";
        this.loadingProgress = 10;

        const [profiles, activeProfileId] = await Promise.all([loadLocalCacheProfilesAsync(), getActiveProfileIdAsync()]);
        if (!activeProfileId) {
            this.errorMessage = "No cache selected. Pick one in Cache Repository.";
            return;
        }
        const profile = profiles.find((p) => p.id === activeProfileId);
        if (!profile) {
            this.errorMessage = "Selected cache profile missing. Re-select in Cache Repository.";
            return;
        }
        this.activeCacheProfileId = profile.id;
        this.activeCacheProfileName = profile.name;
        this.lastLoadedMaps = loadLastLoaded(profile.id, profile.name);
        this.loadingLabel = `Loading "${profile.name}" cache...`;
        this.loadingProgress = 30;

        const cache = await resolveActiveProfileCache(profile);
        if (!cache) {
            // Not loaded into memory yet: bounce through the cache page, which returns here.
            const returnTo = `${router.path}${router.search}`;
            router.navigate(`/cache-test?autoload=1&returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
            return;
        }

        this.loadingLabel = `Using "${profile.name}" cache...`;
        this.loadingProgress = 45;
        const cacheList: CacheList = { caches: [cache.info], latest: cache.info };
        if (this.abort.signal.aborted) return;

        this.loadingLabel = "Preparing editor setup...";
        this.loadingProgress = 85;
        const editor = new MapEditor(getMapRenderWorkerPool(), cacheList, cache);
        await editor.ready;
        if (this.abort.signal.aborted) {
            editor.dispose();
            return;
        }
        this.loadingProgress = 100;
        this.mapEditor = editor;
        this.pluginHost = editor.pluginHost;
        this.projects.bindHost(editor.pluginHost);
        router.setSearchParams({});
    }

    // ── last loaded ──────────────────────────────────────────
    private saveLastLoadedEntry(meta: LaunchMeta, reason: "enter" | "exit"): void {
        const editor = this.mapEditor;
        if (!editor || !this.activeCacheProfileId || !this.activeCacheProfileName) return;

        const sessionKey = `${meta.mode}:${meta.regionId}:${meta.mapX}:${meta.mapY}:${meta.radius}:${this.activeCacheProfileId}`;
        if (reason === "enter" && this.lastSavedSessionKey === sessionKey) return;

        const now = Date.now();
        const imageUrl = editor.getMinimapImageUrl(meta.mapX, meta.mapY) ?? fallbackPreviewDataUrl(`R${meta.regionId}`);
        const entry: LastLoadedEntry = {
            id: `${now}-${meta.mode}-${meta.regionId}-${meta.radius}-${reason}`,
            name: buildEntryName(meta.mode, meta.regionId, meta.mapX, meta.mapY),
            date: formatDate(now),
            imageUrl: sanitizePersistedImage(imageUrl, meta.regionId),
            mode: meta.mode,
            regionId: meta.regionId,
            mapX: meta.mapX,
            mapY: meta.mapY,
            radius: meta.radius,
            cacheProfileId: this.activeCacheProfileId,
            cacheProfileName: this.activeCacheProfileName,
        };
        const deduped = this.lastLoadedMaps.filter(
            (item) =>
                !(
                    item.mode === entry.mode &&
                    item.regionId === entry.regionId &&
                    item.mapX === entry.mapX &&
                    item.mapY === entry.mapY &&
                    item.radius === entry.radius
                ),
        );
        const next = [entry, ...deduped].slice(0, LAST_LOADED_MAX_ITEMS);
        persistLastLoaded(this.activeCacheProfileId, this.activeCacheProfileName, next);
        this.lastLoadedMaps = next;
        this.lastSavedSessionKey = sessionKey;
    }

    private saveOnExit = (event?: BeforeUnloadEvent): void => {
        if (this.launchMeta && !this.showLaunchPanel) this.saveLastLoadedEntry(this.launchMeta, "exit");
        if (event && this.projects.snapshot.dirty) {
            event.preventDefault();
            event.returnValue = "";
        }
    };

    // ── launching ────────────────────────────────────────────
    /** Loads the regions around a target and starts the enter-editor progress. */
    private launch(meta: LaunchMeta, mode: LaunchMode, persistNow: boolean): void {
        const editor = this.mapEditor;
        const host = this.pluginHost;
        if (!editor || !host) return;

        perfLog(`phase: launch start r=${meta.radius}`);
        const bounds = boundsAround(meta.mapX, meta.mapY, meta.radius);
        editor.configureRegionFocus(meta.mapX, meta.mapY, meta.radius);
        host.setSandboxModeActive(mode === "sandbox");
        host.setSandboxBounds(mode === "sandbox" ? bounds : undefined);
        this.sandboxSweepBounds = mode === "sandbox" ? bounds : undefined;
        this.launchMeta = meta;
        this.currentLocation = { regionId: meta.regionId, mapX: meta.mapX, mapY: meta.mapY, radius: meta.radius, mode: meta.mode };

        // Mount/start the renderer before waiting for map squares. The WebGL map
        // builder advances from the renderer frame loop.
        perfLog("phase: launch end (regions queued)");
        this.beginEntering(bounds, mode);
        for (let x = bounds.minX; x <= bounds.maxX; x++) {
            for (let y = bounds.minY; y <= bounds.maxY; y++) editor.renderer.mapManager.loadMap(x, y);
        }

        // Persist immediately so rapid tab switches cannot miss Last Loaded.
        if (persistNow) this.saveLastLoadedEntry(meta, "enter");
    }

    /** The Change location dialog (title bar button, or the world map when the place picked is not loaded). */
    locationDialogOpen = $state(false);
    private locationTargetPreset = false;

    /**
     * Opens Change location. `regionId` (from the world map) pre-fills the target; without it the card starts on where the
     * editor is now. Asks first when the project has unsaved changes. Returns whether it opened.
     */
    requestLocationChange(regionId?: number): boolean {
        if (this.projects.snapshot.dirty && !window.confirm("You have unsaved project changes. Change location anyway?")) return false;
        if (regionId !== undefined) {
            this.targetRegion = String(regionId);
            this.targetRegionX = "";
            this.targetRegionY = "";
            this.locationTargetPreset = true;
        }
        this.locationDialogOpen = true;
        return true;
    }

    /** Opens the region card on where the editor currently is, ready to type a different place. */
    primeForLocationChange(): void {
        this.activeMode = "region";
        if (this.locationTargetPreset) {
            // The world map already chose the target; only the radius comes from the current place.
            this.locationTargetPreset = false;
            if (this.currentLocation?.mode === "region") this.regionRadius = this.currentLocation.radius;
            return;
        }
        const current = this.currentLocation;
        if (current && current.mode === "region") {
            this.targetRegion = String(current.regionId);
            this.targetRegionX = "";
            this.targetRegionY = "";
            this.regionRadius = current.radius;
        }
    }

    launchRegion(mode: LaunchMode = this.activeMode): void {
        if (
            !this.mapEditor ||
            !this.pluginHost ||
            !this.canLaunchManualRegion ||
            (mode === "region" && !this.canOpenRegion)
        ) return;

        let target: { mapX: number; mapY: number } | undefined;
        if (mode === "sandbox") {
            target = { mapX: SANDBOX_REGION_ID >> 8, mapY: SANDBOX_REGION_ID & 0xff };
        } else if (this.isRegionIdValid) {
            const regionId = Number.parseInt(this.targetRegion.trim(), 10);
            target = { mapX: regionId >> 8, mapY: regionId & 0xff };
        } else if (this.isRegionCoordsValid) {
            target = { mapX: Number.parseInt(this.targetRegionX.trim(), 10), mapY: Number.parseInt(this.targetRegionY.trim(), 10) };
        }
        if (!target || Number.isNaN(target.mapX) || Number.isNaN(target.mapY)) return;

        const mapX = Math.max(0, Math.min(99, target.mapX));
        const mapY = Math.max(0, Math.min(199, target.mapY));
        const radius = Math.max(0, Math.min(perf.profile.maxRegionRadius, Math.floor(mode === "sandbox" ? this.sandboxRegionRadius : this.regionRadius)));
        this.launch({ mode, mapX, mapY, regionId: mapX * 256 + mapY, radius }, mode, true);
    }

    async createProject(name: string, discardChanges = false): Promise<Project> {
        const normalized = name.trim();
        if (!normalized) throw new Error("Project name is required.");
        const project = await this.projects.createProject(
            normalized,
            this.activeCacheProfileId,
            this.activeCacheProfileName,
            discardChanges,
        );
        this.projectMessage = `Created project "${project.name}". Choose a region to start editing.`;
        return project;
    }

    async openProject(id: string, discardChanges = false): Promise<void> {
        this.projectMessage = undefined;
        const project = await this.projects.openProject(id, discardChanges);
        await this.enterProject(project);
    }

    async importProject(serialized: string, discardChanges = false): Promise<void> {
        this.projectMessage = undefined;
        const project = await this.projects.importProject(serialized, discardChanges);
        await this.enterProject(project);
    }

    private async enterProject(project: Project): Promise<void> {
        const editor = this.mapEditor;
        const host = this.pluginHost;
        if (!editor || !host) throw new Error("Editor cache is not ready.");

        const refs = collectEditReplayMapRefs(project.edits);
        if (refs.length === 0) {
            this.projectMessage = `Opened "${project.name}". Choose a region to start editing.`;
            return;
        }

        const minX = Math.min(...refs.map((ref) => ref.mapX));
        const minY = Math.min(...refs.map((ref) => ref.mapY));
        const maxX = Math.max(...refs.map((ref) => ref.mapX));
        const maxY = Math.max(...refs.map((ref) => ref.mapY));
        host.mapManager.setAllowedBounds(minX, minY, maxX, maxY);

        const first = refs[0]!;
        editor.camera.pos[0] = first.mapX * 64 + 32;
        editor.camera.pos[2] = first.mapY * 64 + 32;
        editor.camera.updated = true;
        editor.camera.updatedPosition = true;

        this.rendererActivated = true;
        this.isEnteringEditor = true;
        this.enteringProgress = 5;
        this.enteringLoaded = 0;
        this.enteringTotal = refs.length;
        for (const ref of refs) host.mapManager.loadMap(ref.mapX, ref.mapY);
        this.pollProjectReady(project, refs, performance.now());
    }

    private pollProjectReady(
        project: Project,
        refs: ReturnType<typeof collectEditReplayMapRefs>,
        startedAt: number,
    ): void {
        this.later(() => {
            const host = this.pluginHost;
            if (!host || !this.isEnteringEditor) return;

            let loaded = 0;
            for (const ref of refs) {
                if (host.mapManager.getMapById(ref.mapId)) {
                    loaded++;
                } else {
                    host.mapManager.loadMap(ref.mapX, ref.mapY);
                }
            }
            this.enteringLoaded = loaded;
            this.enteringProgress = Math.max(5, Math.round((loaded / Math.max(1, refs.length)) * 90));

            if (loaded < refs.length) {
                if (performance.now() - startedAt > 20000) {
                    this.isEnteringEditor = false;
                    this.projects.pauseHistorySync();
                    this.projects.resetEditorToBase();
                    this.projectMessage = `Could not load every map square required by "${project.name}".`;
                    return;
                }
                this.pollProjectReady(project, refs, startedAt);
                return;
            }

            try {
                replayEditBatchV1(host, project.edits);
                this.projects.resumeHistorySync(true);
                this.enteringProgress = 100;
                this.isEnteringEditor = false;
                this.showLaunchPanel = false;
                this.projectMessage = undefined;
            } catch (error) {
                this.projects.pauseHistorySync();
                this.projects.resetEditorToBase();
                this.isEnteringEditor = false;
                this.projectMessage = error instanceof Error ? error.message : String(error);
            }
        }, READY_POLL_MS);
    }

    returnToLaunch(): void {
        this.projects.pauseHistorySync();
        this.showLaunchPanel = true;
        this.isEnteringEditor = false;
        this.launchMode = null;
        this.enteringProgress = 0;
        this.enteringLoaded = 0;
        this.enteringTotal = 0;
    }

    /** Re-opens an entry from the Last Loaded list. */
    loadSaved(entry: LastLoadedEntry): void {
        this.activeMode = entry.mode;
        if (entry.mode === "region") {
            this.targetRegion = entry.regionId.toString();
            this.regionRadius = entry.radius;
        } else {
            this.sandboxRegionRadius = entry.radius;
        }
        this.targetRegionX = "";
        this.targetRegionY = "";
        this.launch(
            { mode: entry.mode, mapX: entry.mapX, mapY: entry.mapY, regionId: entry.regionId, radius: entry.radius },
            entry.mode,
            false,
        );
    }

    /** Double-click on the world map picks a region and returns to the card. */
    onWorldMapDoubleClick(x: number, y: number): void {
        this.selectRegionId(Math.max(0, Math.floor(x / 64)) * 256 + Math.max(0, Math.floor(y / 64)));
        this.isWorldMapOpen = false;
    }

    selectRegionId(regionId: number): void {
        this.targetRegion = regionId.toString();
        this.targetRegionX = "";
        this.targetRegionY = "";
        this.activeMode = "region";
    }

    private beginEntering(bounds: Bounds, mode: LaunchMode): void {
        this.rendererActivated = true;
        this.isEnteringEditor = true;
        this.isSandboxPostProcessing = false;
        this.launchMode = mode;
        this.enteringProgress = 10;
        this.enteringLoaded = 0;
        this.enteringBounds = bounds;
        this.enteringTotal = (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);
        this.pollReady(performance.now(), mode);
    }

    private later(fn: () => void, ms: number): void {
        const timer = window.setTimeout(() => {
            this.timers.delete(timer);
            fn();
        }, ms);
        this.timers.add(timer);
    }

    private pollReady(startedAt: number, mode: LaunchMode): void {
        this.later(() => {
            const host = this.pluginHost;
            const bounds = this.enteringBounds;
            if (!host || !this.isEnteringEditor) return;

            const elapsed = performance.now() - startedAt;
            let loaded = 0;
            let total = this.enteringTotal;
            if (bounds) {
                for (let x = bounds.minX; x <= bounds.maxX; x++) {
                    for (let y = bounds.minY; y <= bounds.maxY; y++) {
                        if (host.mapManager.mapSquares.has(x * 256 + y)) loaded += 1;
                    }
                }
            } else {
                loaded = host.mapManager.mapSquares.size;
                total = Math.max(1, loaded);
            }

            const smooth = Math.min(92, 10 + Math.round(elapsed / 28));
            const real = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : smooth;
            const progress = Number.isFinite(Math.max(smooth, real)) ? Math.max(smooth, real) : 0;
            this.enteringLoaded = total > 0 ? Math.min(total, Math.max(0, Math.round((progress / 100) * total))) : loaded;
            if (!bounds) this.enteringTotal = total;
            this.enteringProgress = Math.max(this.enteringProgress, progress);

            const sandboxDone = mode === "sandbox" && ((this.enteringTotal > 0 && loaded >= this.enteringTotal) || elapsed > 12000);
            const regionDone = mode !== "sandbox" && ((loaded > 0 && elapsed > 650) || elapsed > 4500);
            if (!sandboxDone && !regionDone) {
                this.pollReady(startedAt, mode);
                return;
            }

            this.enteringProgress = 100;
            this.isEnteringEditor = false;
            if (mode === "sandbox") {
                this.isSandboxPostProcessing = true;
                this.postProcessSandbox();
            } else {
                this.finishEntering();
            }
        }, READY_POLL_MS);
    }

    private finishEntering(): void {
        this.launchMode = null;
        if (this.launchMeta) this.saveLastLoadedEntry(this.launchMeta, "enter");
        if (this.projects.snapshot.project) {
            this.projects.resumeHistorySync(true);
        }
        this.showLaunchPanel = false;
    }

    /** Sandbox: flatten (or generate) heights once the regions are in, then sweep a few times as late tiles arrive. */
    private postProcessSandbox(): void {
        this.later(() => {
            const editor = this.mapEditor;
            const host = this.pluginHost;
            const bounds = this.enteringBounds;
            if (!editor || !host || !bounds) return;
            flattenSandbox(editor, host, bounds);
            this.isSandboxPostProcessing = false;
            this.finishEntering();
            this.sweepSandbox(0);
        }, 50);
    }

    private sweepSandbox(runs: number): void {
        const editor = this.mapEditor;
        const host = this.pluginHost;
        const bounds = this.sandboxSweepBounds;
        if (!editor || !host || !bounds) return;
        flattenSandbox(editor, host, bounds);
        if (runs + 1 >= 8) {
            this.sandboxSweepBounds = undefined;
            return;
        }
        this.later(() => this.sweepSandbox(runs + 1), 300);
    }
}
