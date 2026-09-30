import type { Cs2LogLine } from "@/lib/interface-renderer/cs2/cs2-console-sink";
import type { Cs1SimState } from "@/lib/interface-renderer/cs1-interpreter";
import type { ComponentType, InterfaceEntry } from "@/lib/interface-renderer/component-types";
import type { CacheType } from "@/lib/cache-types";
import type { VarbitDefinitionLookup } from "@/rs/config/vartype/bit/VarBitTypeLoader";

import type { InterfaceViewer } from "./InterfaceViewer";

export type RsInterfaceMode = "fixed" | "resizable";
export type InterfaceLegacyFilter = "all" | "new" | "legacy";

/** React Dispatch compatible, but framework-neutral for Svelte and plain TS consumers. */
export type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

/** Minimal context-menu event surface shared by React synthetic and native mouse events. */
export type InterfaceContextMenuEvent = {
  preventDefault(): void;
};

export type InterfaceListEntry = {
  id: number;
  name: string;
  iflegacy: boolean | null;
};

export type TreeNode = {
  id: number;
  runtimeId: number;
  type: number;
  dynamicCreated: boolean;
  nodeKey: string;
  component: ComponentType;
  children: TreeNode[];
};

export type TreeRow = TreeNode & { depth: number };

/** All state and actions consumed by interface editor dock panels. */
export type InterfaceEditorWorkbench = {
  viewer: InterfaceViewer;
  selectedCacheType: CacheType;
  revision: string | number;

  entries: InterfaceListEntry[];
  filtered: InterfaceListEntry[];
  search: string;
  setSearch: StateSetter<string>;
  legacyFilter: InterfaceLegacyFilter;
  setLegacyFilter: StateSetter<InterfaceLegacyFilter>;
  selectedId: number | null;
  setSelectedId: StateSetter<number | null>;
  runInterfaceViewerExport: () => void;

  mode: RsInterfaceMode;
  setMode: StateSetter<RsInterfaceMode>;
  showOverlays: boolean;
  setShowOverlays: StateSetter<boolean>;
  showViewportBorder: boolean;
  setShowViewportBorder: StateSetter<boolean>;
  showPixelGrid: boolean;
  setShowPixelGrid: StateSetter<boolean>;
  setViewportColor: StateSetter<string>;

  viewportColor: string;
  interactiveMode: boolean;
  setInteractiveMode: StateSetter<boolean>;

  isInterfaceLoaded: boolean;
  interfaceLoadError: string | null;
  interfaceData: InterfaceEntry | null;
  setInterfaceData: StateSetter<InterfaceEntry | null>;
  rootWidgetV3: boolean | null;

  selectedComponentNodeKey: string | null;
  setSelectedComponentNodeKey: StateSetter<string | null>;
  selectedComponent: ComponentType | null;
  selectedComponentId: number | null;

  componentTreeRows: TreeRow[];
  componentTreeRowsForList: TreeRow[];
  showGeneratedTreeRows: boolean;
  setShowGeneratedTreeRows: StateSetter<boolean>;
  unhideAllComponents: () => void;
  handleComponentRightClick: (event: InterfaceContextMenuEvent, nodeKey: string) => void;

  cs1SimState: Cs1SimState;
  setCs1SimState: StateSetter<Cs1SimState>;
  cs1ForCanvas: Cs1SimState | null;
  varbitDefinitionLookup: VarbitDefinitionLookup | null;

  cs2LogLines: Cs2LogLine[];
  appendCs2LogLine: (line: Cs2LogLine) => void;
  clearCs2Log: () => void;
  cs2RedrawNonce: number;
  setCs2RedrawNonce: StateSetter<number>;
};
