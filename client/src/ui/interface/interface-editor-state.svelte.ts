import { cacheProxyHeaders, syncCacheTypeCookie } from "../../lib/cache-proxy-client";
import {
    getActiveOpenRuneProjectSnapshot,
    subscribeActiveOpenRuneProjectRuntime,
} from "../../lib/active-openrune-project-runtime";
import {
    BASE_CACHE_TYPES,
    LOCALHOST_CACHE_TYPE,
    LOCAL_STORAGE_KEY,
    STORAGE_KEY,
    type CacheType,
} from "../../lib/cache-types";
import {
    cloneInterfaceEntryForSimulation,
    type InterfaceEntry,
} from "../../lib/interface-renderer/component-types";
import { Cs1Interpreter, type Cs1SimState } from "../../lib/interface-renderer/cs1-interpreter";
import {
    clearMockClientChanges,
    mergeMockClientState,
} from "../../lib/interface-renderer/mock-client-state";
import {
    makeCs2LogLine,
    setCs2ConsoleSink,
    type Cs2LogLevel,
    type Cs2LogLine,
} from "../../lib/interface-renderer/cs2/cs2-console-sink";
import { collectOnLoadScriptDiagnostics } from "../../lib/interface-renderer/cs2/on-load-script-diagnostics";
import { applyCs2RuntimeFromSim, getCs2RuntimeContext } from "../../lib/interface-renderer/cs2/runtime-context";
import { openInterface, setCs1InterfaceEntry } from "../../lib/interface-renderer/interface-manager";
import type { VarbitDefinitionLookup } from "../../rs/config/vartype/bit/VarBitTypeLoader";
import type { InterfaceViewer } from "../../interface/InterfaceViewer";
import {
    createInterfaceMetadataSource,
    type InterfaceMetadataSource,
} from "../../interface/interface-metadata-source";
import {
    buildComponentTree,
    flattenTree,
    getRootWidgetV3,
    interfaceRootLegacy,
    legacyForInterfaceGroup,
    unhideComponentSubtree,
} from "../../interface/interface-editor-model-utils";
import type {
    InterfaceContextMenuEvent,
    InterfaceLegacyFilter,
    InterfaceListEntry,
    InterfaceRuntimeMode,
    RsInterfaceMode,
    StateSetter,
    TreeRow,
} from "../../interface/interface-editor-workbench-model";

function resolveSelectedCacheType(): CacheType {
    const local =
        import.meta.env.DEV ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
    const cacheTypes = local ? [LOCALHOST_CACHE_TYPE, ...BASE_CACHE_TYPES] : BASE_CACHE_TYPES;

    try {
        const manuallySelected = localStorage.getItem(LOCAL_STORAGE_KEY) === "true";
        const storedId = localStorage.getItem(STORAGE_KEY);
        if (local && !manuallySelected) return LOCALHOST_CACHE_TYPE;
        return cacheTypes.find((cacheType) => cacheType.id === storedId) ?? cacheTypes[0]!;
    } catch {
        return cacheTypes[0]!;
    }
}

function cs2DiagLineLevel(body: string): Cs2LogLevel {
    const value = body.toLowerCase();
    return value.includes("missing") || value.includes("invalid") || value.includes("error") ? "warn" : "load";
}

function applySetter<T>(current: T, value: T | ((previous: T) => T)): T {
    return typeof value === "function" ? (value as (previous: T) => T)(current) : value;
}

/**
 * Svelte 5 workbench state for the interface editor.
 *
 * The expensive cache/interface engines remain framework-free. This class owns only view state,
 * selected-interface loading, component-tree projection and simulator/runtime glue.
 */
export class InterfaceEditorState {
    readonly selectedCacheType = resolveSelectedCacheType();
    readonly revision: string | number;
    entries = $state<InterfaceListEntry[]>([]);
    readonly varbitDefinitionLookup: VarbitDefinitionLookup | null;

    search = $state("");
    legacyFilter = $state<InterfaceLegacyFilter>("all");
    selectedId = $state<number | null>(null);
    mode = $state<RsInterfaceMode>("fixed");
    viewportColor = $state("#171616");
    showOverlays = $state(true);
    showViewportBorder = $state(false);
    showPixelGrid = $state(false);
    runtimeMode = $state<InterfaceRuntimeMode>("edit");
    showGeneratedTreeRows = $state(false);

    isInterfaceLoaded = $state(false);
    interfaceLoadError = $state<string | null>(null);
    interfaceData = $state<InterfaceEntry | null>(null);
    simulationInterfaceData = $state<InterfaceEntry | null>(null);
    selectedComponentNodeKey = $state<string | null>(null);

    cs1SimState = $state<Cs1SimState>(Cs1Interpreter.defaultState());
    cs2LogLines = $state<Cs2LogLine[]>([]);
    cs2RedrawNonce = $state(0);

    componentJsonOpen = $state(false);
    componentJsonNodeKey = $state<string | null>(null);

    exportOpen = $state(false);
    exportBusy = $state(false);
    exportError = $state<string | null>(null);
    exportJson = $state("");
    exportInterfaceId = $state<number | null>(null);

    private loadController?: AbortController;
    private metadataSource: InterfaceMetadataSource;
    private metadataVersion = $state(0);
    private unsubscribeOpenRuneRuntime?: () => void;

    constructor(readonly viewer: InterfaceViewer) {
        this.revision = viewer.loadedCache.info.revision ?? "latest";
        this.metadataSource = createInterfaceMetadataSource(
            viewer.gamevals,
            getActiveOpenRuneProjectSnapshot()?.gameVals ?? null,
        );
        this.entries = this.buildEntries();
        const defs = viewer.varbitDefinitions;
        this.varbitDefinitionLookup = defs == null ? null : (id: number) => defs.get(id) ?? null;
        syncCacheTypeCookie(this.selectedCacheType);
        setCs2ConsoleSink((line) => this.appendCs2LogLine(line));
        this.unsubscribeOpenRuneRuntime = subscribeActiveOpenRuneProjectRuntime((runtime) => {
            this.metadataSource = createInterfaceMetadataSource(
                this.viewer.gamevals,
                runtime?.snapshot.gameVals ?? null,
            );
            this.entries = this.buildEntries();
            this.metadataVersion++;
        });
    }

    dispose(): void {
        this.loadController?.abort("interface-editor-dispose");
        this.loadController = undefined;
        this.unsubscribeOpenRuneRuntime?.();
        this.unsubscribeOpenRuneRuntime = undefined;
        setCs2ConsoleSink(null);
    }

    get filtered(): InterfaceListEntry[] {
        const query = this.search.trim().toLowerCase();
        return this.entries.filter((entry) => {
            if (this.legacyFilter === "legacy" && entry.iflegacy !== true) return false;
            if (this.legacyFilter === "new" && entry.iflegacy !== false) return false;
            return !query || entry.name.toLowerCase().includes(query) || String(entry.id).includes(query);
        });
    }

    get previewInterfaceData(): InterfaceEntry | null {
        return this.runtimeMode === "simulate"
            ? this.simulationInterfaceData ?? this.interfaceData
            : this.interfaceData;
    }

    get interactiveMode(): boolean {
        return this.runtimeMode === "simulate";
    }

    get componentTreeRows(): TreeRow[] {
        void this.metadataVersion;
        const data = this.previewInterfaceData;
        if (!data || this.selectedId == null) return [];
        return flattenTree(
            buildComponentTree(
                data,
                this.selectedId,
                this.metadataSource,
            ),
        );
    }

    get componentTreeRowsForList(): TreeRow[] {
        const rows = this.componentTreeRows;
        return this.showGeneratedTreeRows ? rows : rows.filter((row) => !row.dynamicCreated);
    }

    get treeNodeByKey(): Map<string, TreeRow> {
        return new Map(this.componentTreeRows.map((row) => [row.nodeKey, row]));
    }

    get selectedComponent() {
        return this.selectedComponentNodeKey
            ? this.treeNodeByKey.get(this.selectedComponentNodeKey)?.component ?? null
            : null;
    }

    get selectedComponentId(): number | null {
        return this.selectedComponent?.id ?? null;
    }

    get rootWidgetV3(): boolean | null {
        const data = this.previewInterfaceData;
        if (!data || this.selectedId == null) return null;
        return getRootWidgetV3(data, this.selectedId);
    }

    get cs1ForCanvas(): Cs1SimState | null {
        return this.rootWidgetV3 === false ? this.cs1SimState : null;
    }

    get selectedName(): string {
        if (this.selectedId == null) return "";
        return this.entries.find((entry) => entry.id === this.selectedId)?.name ?? "";
    }

    get componentJsonData() {
        return this.componentJsonNodeKey ? this.treeNodeByKey.get(this.componentJsonNodeKey)?.component ?? null : null;
    }

    setSearch: StateSetter<string> = (value) => {
        this.search = applySetter(this.search, value);
    };

    setLegacyFilter: StateSetter<InterfaceLegacyFilter> = (value) => {
        this.legacyFilter = applySetter(this.legacyFilter, value);
    };

    setSelectedId: StateSetter<number | null> = (value) => {
        const next = applySetter(this.selectedId, value);
        if (next === this.selectedId) return;
        this.selectedId = next;
        void this.loadSelectedInterface();
    };

    setMode: StateSetter<RsInterfaceMode> = (value) => {
        this.mode = applySetter(this.mode, value);
    };

    setShowOverlays: StateSetter<boolean> = (value) => {
        this.showOverlays = applySetter(this.showOverlays, value);
    };

    setShowViewportBorder: StateSetter<boolean> = (value) => {
        this.showViewportBorder = applySetter(this.showViewportBorder, value);
    };

    setShowPixelGrid: StateSetter<boolean> = (value) => {
        this.showPixelGrid = applySetter(this.showPixelGrid, value);
    };

    setViewportColor: StateSetter<string> = (value) => {
        this.viewportColor = applySetter(this.viewportColor, value);
    };

    setRuntimeMode: StateSetter<InterfaceRuntimeMode> = (value) => {
        const next = applySetter(this.runtimeMode, value);
        if (next === this.runtimeMode) return;

        if (next === "simulate") {
            clearMockClientChanges(this.cs1SimState);
            this.simulationInterfaceData = this.interfaceData
                ? cloneInterfaceEntryForSimulation(this.interfaceData)
                : null;
        } else {
            this.simulationInterfaceData = null;
        }

        this.runtimeMode = next;
        this.selectedComponentNodeKey = null;
        this.cs2RedrawNonce++;
    };

    setInteractiveMode: StateSetter<boolean> = (value) => {
        const next = applySetter(this.interactiveMode, value);
        this.setRuntimeMode(next ? "simulate" : "edit");
    };

    setInterfaceData: StateSetter<InterfaceEntry | null> = (value) => {
        if (this.runtimeMode === "simulate") {
            this.simulationInterfaceData = applySetter(this.simulationInterfaceData, value);
        } else {
            this.interfaceData = applySetter(this.interfaceData, value);
        }
    };

    setSelectedComponentNodeKey: StateSetter<string | null> = (value) => {
        this.selectedComponentNodeKey = applySetter(this.selectedComponentNodeKey, value);
    };

    setShowGeneratedTreeRows: StateSetter<boolean> = (value) => {
        this.showGeneratedTreeRows = applySetter(this.showGeneratedTreeRows, value);
        if (!this.showGeneratedTreeRows && this.selectedComponentNodeKey) {
            const selected = this.treeNodeByKey.get(this.selectedComponentNodeKey);
            if (selected?.dynamicCreated) this.selectedComponentNodeKey = null;
        }
    };

    setCs1SimState: StateSetter<Cs1SimState> = (value) => {
        const previous = this.cs1SimState;
        const next = applySetter(previous, value);
        this.cs1SimState = mergeMockClientState(previous, next);
    };

    mutateMockClientState = (mutator: (state: Cs1SimState) => void): void => {
        const current = this.cs1SimState;
        mutator(current);
        // Replace the root reference so Svelte consumers refresh while preserving
        // the harness-owned Varps/Varcs/change-journal instances.
        this.cs1SimState = { ...current };
        this.cs2RedrawNonce++;
    };

    resetMockClientState = (): void => {
        this.cs1SimState = Cs1Interpreter.defaultState();
        this.cs2RedrawNonce++;
    };

    setCs2RedrawNonce: StateSetter<number> = (value) => {
        this.cs2RedrawNonce = applySetter(this.cs2RedrawNonce, value);
    };

    appendCs2LogLine = (line: Cs2LogLine): void => {
        this.cs2LogLines = [...this.cs2LogLines.slice(-499), line];
    };

    clearCs2Log = (): void => {
        this.cs2LogLines = [];
    };

    handleComponentRightClick = (event: InterfaceContextMenuEvent, nodeKey: string): void => {
        event.preventDefault();
        this.componentJsonNodeKey = nodeKey;
        this.componentJsonOpen = true;
    };

    unhideAllComponents = (): void => {
        if (!this.interfaceData) return;
        for (const component of Object.values(this.interfaceData.components)) {
            unhideComponentSubtree(component);
        }
        this.interfaceData = { ...this.interfaceData, components: { ...this.interfaceData.components } };
    };

    runInterfaceViewerExport = (): void => {
        const selectedId = this.selectedId;
        this.exportOpen = true;
        this.exportJson = "";
        this.exportError = null;
        this.exportInterfaceId = selectedId;
        if (selectedId == null) {
            this.exportBusy = false;
            this.exportError = "Select an interface in the list first.";
            return;
        }

        this.exportBusy = true;
        window.setTimeout(() => {
            try {
                const iface = this.viewer.interfaces[selectedId];
                if (!iface) {
                    this.exportError = `No decoded interface for id ${selectedId} in local index 3 (InterfaceViewer).`;
                    return;
                }
                this.exportJson = JSON.stringify(
                    {
                        loadedCache: {
                            type: this.viewer.loadedCache.type,
                            name: this.viewer.loadedCache.info.name,
                        },
                        interfaceId: selectedId,
                        interface: iface,
                        legacy: legacyForInterfaceGroup(this.viewer.legacy, selectedId),
                    },
                    null,
                    2,
                );
            } catch (error) {
                this.exportError = error instanceof Error ? error.message : String(error);
            } finally {
                this.exportBusy = false;
            }
        }, 0);
    };

    private buildEntries(): InterfaceListEntry[] {
        return Object.keys(this.viewer.interfaces)
            .map(Number)
            .filter(Number.isFinite)
            .sort((a, b) => a - b)
            .map((id) => {
                const iface = this.viewer.interfaces[id]!;
                const metadata = this.metadataSource.getInterface(id);
                const fileIds = Object.keys(iface.components).map(Number);
                return {
                    id,
                    name: metadata.displayName,
                    iflegacy: interfaceRootLegacy(this.viewer.legacy, id, fileIds),
                    metadata,
                };
            });
    }

    private async loadSelectedInterface(): Promise<void> {
        this.loadController?.abort("interface-selection-changed");
        this.loadController = undefined;

        const selectedId = this.selectedId;
        this.isInterfaceLoaded = false;
        this.interfaceLoadError = null;
        this.interfaceData = null;
        this.simulationInterfaceData = null;
        this.selectedComponentNodeKey = null;
        this.cs2LogLines = [];

        if (selectedId == null) return;

        const controller = new AbortController();
        this.loadController = controller;

        try {
            const data = this.viewer.getInterfaceEntry(
                selectedId,
                this.selectedName || null,
            );
            if (!data) {
                throw new Error(
                    `Interface ${selectedId} is not present in the selected cache.`,
                );
            }
            if (controller.signal.aborted || selectedId !== this.selectedId) return;

            this.interfaceData = data;
            this.simulationInterfaceData =
                this.runtimeMode === "simulate"
                    ? cloneInterfaceEntryForSimulation(data)
                    : null;
            const runtimeData = this.previewInterfaceData ?? data;
            setCs1InterfaceEntry(runtimeData);
            applyCs2RuntimeFromSim(
                this.cs1SimState,
                this.revision,
                cacheProxyHeaders(this.selectedCacheType),
                this.varbitDefinitionLookup,
                runtimeData,
                undefined,
                undefined,
                this.viewer.clientScriptIndex,
                this.viewer.objTypeLoader,
                this.viewer.enumTypeLoader,
            );
            await openInterface(1, selectedId, 1, false);
            if (controller.signal.aborted || selectedId !== this.selectedId) return;

            this.interfaceData = { ...data, components: { ...data.components } };
            if (this.runtimeMode === "simulate" && this.simulationInterfaceData == null) {
                this.simulationInterfaceData = cloneInterfaceEntryForSimulation(this.interfaceData);
            }
            const entryAfter = getCs2RuntimeContext().interfaceEntry ?? runtimeData;
            const diagnostics = await collectOnLoadScriptDiagnostics(entryAfter, selectedId);
            if (controller.signal.aborted || selectedId !== this.selectedId) return;
            this.cs2LogLines = [
                ...this.cs2LogLines,
                ...diagnostics.map((line) => makeCs2LogLine(cs2DiagLineLevel(line), line)),
            ].slice(-500);
            this.isInterfaceLoaded = true;
        } catch (error) {
            if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
            this.interfaceData = null;
            this.isInterfaceLoaded = false;
            this.interfaceLoadError = error instanceof Error ? error.message : "Failed to load interface";
        }
    }
}
