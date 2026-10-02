import type { OsrsMenuProps } from "../components/rs/osrs-menu";
import { router } from "../lib/router.svelte";
import type { MapViewer } from "../../mapviewer/MapViewer";
import type { MapViewerRenderer } from "../../mapviewer/MapViewerRenderer";

const HUD_UPDATE_MS = 120;
const URL_UPDATE_MS = 200;

export class MapViewerUiState {
    renderer = $state<MapViewerRenderer>();
    hideUi = $state(false);
    fps = $state(0);
    debugText = $state<string>();
    cameraYaw = $state(0);
    worldMapOpen = $state(false);
    menu = $state<OsrsMenuProps>();

    private raf = 0;
    private lastHudUpdate = 0;
    private menuSignature = "";

    constructor(readonly mapViewer: MapViewer) {
        this.renderer = mapViewer.renderer;
        this.cameraYaw = mapViewer.camera.getYaw();
    }

    start(): void {
        if (this.raf) return;
        const frame = (time: number): void => {
            const viewer = this.mapViewer;
            const renderer = this.renderer;

            if (
                viewer.needsSearchParamUpdate &&
                performance.now() - viewer.lastTimeSearchParamsUpdated > URL_UPDATE_MS
            ) {
                router.setSearchParams(viewer.getSearchParams(), { replace: true });
                viewer.needsSearchParamUpdate = false;
            }

            this.cameraYaw = viewer.camera.getYaw();
            if (renderer && time - this.lastHudUpdate >= HUD_UPDATE_MS) {
                this.lastHudUpdate = time;
                this.fps = Math.round(renderer.stats.frameTimeFps);
                this.debugText = viewer.debugText;
            }

            const nextMenu =
                viewer.menuEntries.length > 0 && viewer.menuX !== -1 && viewer.menuY !== -1
                    ? {
                          x: viewer.menuX,
                          y: viewer.menuY,
                          tooltip: !viewer.menuOpen,
                          entries: viewer.menuEntries,
                          debugId: viewer.debugId,
                      }
                    : undefined;
            const signature = nextMenu
                ? `${nextMenu.x}:${nextMenu.y}:${nextMenu.tooltip ? 1 : 0}:${nextMenu.debugId ? 1 : 0}:${nextMenu.entries
                      .map((entry) => `${entry.option}:${entry.targetId}`)
                      .join("|")}`
                : "";
            if (signature !== this.menuSignature) {
                this.menuSignature = signature;
                this.menu = nextMenu;
            }

            this.raf = requestAnimationFrame(frame);
        };
        this.raf = requestAnimationFrame(frame);
    }

    stop(): void {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
    }

    setRenderer(renderer: MapViewerRenderer): void {
        this.mapViewer.setRenderer(renderer);
        this.renderer = renderer;
    }

    toggleUi(): void {
        this.hideUi = !this.hideUi;
    }

    openWorldMap(): void {
        this.worldMapOpen = true;
    }

    closeWorldMap(): void {
        this.worldMapOpen = false;
        this.renderer?.canvas.focus();
    }

    teleportFromWorldMap(x: number, y: number): void {
        this.mapViewer.camera.pos[0] = x;
        this.mapViewer.camera.pos[2] = y;
        this.mapViewer.camera.updated = true;
        this.closeWorldMap();
    }

    getPosition = (): { x: number; y: number } => ({
        x: this.mapViewer.camera.getPosX(),
        y: this.mapViewer.camera.getPosZ(),
    });

    loadMapImageBlob = (
        mapX: number,
        mapY: number,
    ): Promise<Blob | undefined> =>
        this.mapViewer.loadWorldMapImageBlob(mapX, mapY);

    loadMinimapImageUrl = (mapX: number, mapY: number): string | undefined =>
        this.mapViewer.getMapImageUrl(mapX, mapY, true);
}
