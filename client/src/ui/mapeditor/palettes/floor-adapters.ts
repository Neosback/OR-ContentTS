import type { UnderlayGradientPattern, UnderlayPanelTab } from "../../../mapeditor/map-editor-underlay-gradient";
import { getOverlayTexturePreviewDataUrl } from "../../../mapeditor/overlaySwatchTexture";
import { getOverlayGradientModel } from "../../../mapeditor/plugins/builtins/overlay-gradient-model";
import { overlayToolData } from "../../../mapeditor/plugins/builtins/overlay.plugin";
import { getUnderlayGradientModel } from "../../../mapeditor/plugins/builtins/underlay-gradient-model";
import type { IEditorPluginHost } from "../../../mapeditor/plugins/editor-plugin-host";
import type { OverlayFloorType } from "../../../rs/config/floortype/OverlayFloorType";
import type { UnderlayFloorType } from "../../../rs/config/floortype/UnderlayFloorType";

/** One paintable floor type as the palette shows it. */
export interface FloorItem {
    id: number;
    rgb: number;
    name?: string;
    textured: boolean;
}

export interface GradientState {
    tab: UnderlayPanelTab;
    ids: number[];
    baseId: number;
    paletteSize: number;
    candidatePool: number;
    pattern: UnderlayGradientPattern;
}

/**
 * The underlay and overlay palettes are the same UI over two differently named models. An adapter hides the naming
 * so a single `FloorPalette` component serves both.
 */
export interface FloorPaletteAdapter {
    readonly kind: "underlay" | "overlay";
    readonly title: string;
    /** Overlays can be cleared ("None") and filtered by texture; underlays cannot. */
    readonly hasNone: boolean;
    readonly hasTextureFilter: boolean;
    readonly items: readonly FloorItem[];
    preview(id: number): string | null;
    selectedId(): number;
    select(id: number): void;
    clear(): void;
    gradient(): GradientState;
    setTab(tab: UnderlayPanelTab): void;
    setIds(ids: number[]): void;
    setBaseId(id: number): void;
    setPaletteSize(size: number): void;
    setCandidatePool(size: number): void;
    setPattern(pattern: UnderlayGradientPattern): void;
    bumpPaintSeed(): void;
    generate(): void;
    randomMix(): void;
}

function loadAll<T>(count: number, load: (i: number) => unknown): T[] {
    const list: T[] = [];
    for (let i = 0; i < count; i++) list.push(load(i) as T);
    return list;
}

export function underlayAdapter(host: IEditorPluginHost): FloorPaletteAdapter {
    const raw = loadAll<UnderlayFloorType>(host.underlayTypeLoader.getCount(), (i) => host.underlayTypeLoader.load(i));
    const model = () => getUnderlayGradientModel(host);
    return {
        kind: "underlay",
        title: "Underlays",
        hasNone: false,
        hasTextureFilter: false,
        items: raw.map((u) => ({ id: u.id, rgb: u.getRgb(), textured: false })),
        preview: () => null,
        selectedId: () => host.selectedUnderlayId,
        select(id) {
            host.selectedUnderlayId = id;
            host.setEditorTool("underlay");
        },
        clear() {},
        gradient() {
            const m = model();
            return {
                tab: m.underlayPanelTab,
                ids: m.underlayGradientIds,
                baseId: m.underlayGradientBaseUnderlayId,
                paletteSize: m.underlayGradientPaletteSize,
                candidatePool: m.underlayGradientCandidatePool,
                pattern: m.underlayGradientPattern,
            };
        },
        setTab: (tab) => model().setUnderlayPanelTab(tab),
        setIds: (ids) => model().setUnderlayGradientIds(ids),
        setBaseId: (id) => model().setUnderlayGradientBaseUnderlayId(id),
        setPaletteSize: (size) => model().setUnderlayGradientPaletteSize(size),
        setCandidatePool: (size) => model().setUnderlayGradientCandidatePool(size),
        setPattern: (pattern) => model().setUnderlayGradientPattern(pattern),
        bumpPaintSeed: () => model().bumpUnderlayGradientPaintSeed(),
        generate: () => model().setUnderlayGradientIds(model().pickSimilarSorted(raw)),
        randomMix() {
            model().bumpUnderlayGradientMixSeed();
            model().setUnderlayGradientIds(model().pickSimilarMixed(raw));
        },
    };
}

export function overlayAdapter(host: IEditorPluginHost): FloorPaletteAdapter {
    const raw = loadAll<OverlayFloorType>(host.overlayTypeLoader.getCount(), (i) => host.overlayTypeLoader.load(i));
    const previews = new Map<number, string | null>(raw.map((o) => [o.id, getOverlayTexturePreviewDataUrl(host.textureLoader, o)]));
    const model = () => getOverlayGradientModel(host);
    return {
        kind: "overlay",
        title: "Overlays",
        hasNone: true,
        hasTextureFilter: true,
        items: raw.map((o) => ({ id: o.id, rgb: o.getRgb(), name: o.name, textured: o.textureId >= 0 })),
        preview: (id) => previews.get(id) ?? null,
        selectedId: () => host.selectedOverlayId,
        select: (id) => overlayToolData.selectPrimary?.(host, id),
        clear: () => overlayToolData.clearPrimary?.(host),
        gradient() {
            const m = model();
            return {
                tab: m.overlayPanelTab,
                ids: m.overlayGradientIds,
                baseId: m.overlayGradientBaseOverlayId,
                paletteSize: m.overlayGradientPaletteSize,
                candidatePool: m.overlayGradientCandidatePool,
                pattern: m.overlayGradientPattern,
            };
        },
        setTab: (tab) => model().setOverlayPanelTab(tab),
        setIds: (ids) => model().setOverlayGradientIds(ids),
        setBaseId: (id) => model().setOverlayGradientBaseOverlayId(id),
        setPaletteSize: (size) => model().setOverlayGradientPaletteSize(size),
        setCandidatePool: (size) => model().setOverlayGradientCandidatePool(size),
        setPattern: (pattern) => model().setOverlayGradientPattern(pattern),
        bumpPaintSeed: () => model().bumpOverlayGradientPaintSeed(),
        generate: () => model().setOverlayGradientIds(model().pickSimilarSorted(raw)),
        randomMix() {
            model().bumpOverlayGradientMixSeed();
            model().setOverlayGradientIds(model().pickSimilarMixed(raw));
        },
    };
}

export function rgbToCss(rgb: number): string {
    return `rgb(${rgb >> 16}, ${(rgb >> 8) & 0xff}, ${rgb & 0xff})`;
}
