import type { IEditorPluginHost } from "../editor-plugin-host";

/** Framework-free import/export provider contract (the toast/UI is supplied by the caller). */
export interface MapDataProvider {
    id: string;
    kind: "import" | "export";
    name: string;
    description?: string;
    /** Grouping label in the menu; providers without one appear under "General". */
    category?: string;
    run: (ctx: { host: IEditorPluginHost; notify: (message: string) => void }) => void | Promise<void>;
}

const placeholder = (what: string) => ({ notify }: { notify: (message: string) => void }): void =>
    notify(`${what} — hook up provider pipeline.`);

/** Built-in providers. They are placeholders until the backend's import/export pipeline exists. */
export const BUILTIN_MAP_DATA_PROVIDERS: readonly MapDataProvider[] = [
    { id: "openrune.import.region-package", kind: "import", name: "Import region package", description: "Load region data from a packaged import file.", category: "Region", run: placeholder("Import region package") },
    { id: "openrune.import.heightmap", kind: "import", name: "Import heightmap", description: "Apply terrain heights from an image/heightmap source.", category: "Terrain", run: placeholder("Import heightmap") },
    { id: "openrune.export.region", kind: "export", name: "Export region", description: "Export current region data.", category: "Region", run: placeholder("Export region") },
    { id: "openrune.export.heightmap", kind: "export", name: "Export heightmap", description: "Export terrain heights as a heightmap.", category: "Terrain", run: placeholder("Export heightmap") },
    { id: "openrune.export.share-package", kind: "export", name: "Package for share", description: "Build a portable package for sharing edits.", category: "Package", run: placeholder("Package for share") },
];

/** Providers of one kind, grouped by category (categories and providers sorted by name). */
export function groupProviders(kind: "import" | "export"): [string, MapDataProvider[]][] {
    const groups = new Map<string, MapDataProvider[]>();
    for (const provider of BUILTIN_MAP_DATA_PROVIDERS.filter((p) => p.kind === kind)) {
        const category = provider.category ?? "General";
        groups.set(category, [...(groups.get(category) ?? []), provider]);
    }
    return [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, providers]) => [category, providers.sort((a, b) => a.name.localeCompare(b.name))]);
}
