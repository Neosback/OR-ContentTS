import { memo, useSyncExternalStore } from "react";
import { MousePointer2 } from "lucide-react";

import { Label } from "../../../components/ui/label";
import { isCopyableObjectKind } from "./object-copy-placement";
import type { EditorToolPlugin, MapEditorPalettePanelProps } from "./builtin-plugin-types";

function ObjectSelectorToolPanelInner({ pluginHost }: MapEditorPalettePanelProps): JSX.Element {
    useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );
    const hovered = pluginHost.hoveredObject;
    const selected = pluginHost.selectedObject;
    const copyActive = pluginHost.isObjectCopyPlacementActive();
    const copyTemplate = pluginHost.getObjectCopyTemplate();
    return (
        <div className="map-editor-panel flex min-h-0 flex-1 flex-col gap-3 p-4">
            <p className="text-xs text-muted-foreground">
                Hover objects for an orange wireframe preview. Left-click to select (blue wireframe) or click empty
                space to deselect. Press R to rotate the selected object. Press C to copy it — click the map to place
                copies; Esc cancels copy mode. Customize wireframe colors in Settings → Gizmo Style → Object selector
                wireframe.
            </p>
            {copyActive && copyTemplate ? (
                <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100/90">
                    Copy placement active — click the map to place · <span className="font-medium">Esc</span> to cancel
                </div>
            ) : null}
            {hovered ? (
                <div className="rounded-md border border-orange-500/40 bg-orange-500/10 p-2 text-xs">
                    <Label className="text-xs text-muted-foreground">Hovered object</Label>
                    <p className="mt-1 font-mono tabular-nums">
                        Loc #{hovered.locTypeId} · plane {hovered.level} · {hovered.kind}
                    </p>
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">Hover a tile with an object to preview it.</p>
            )}
            {selected ? (
                <div className="rounded-md border bg-muted/30 p-2 text-xs">
                    <Label className="text-xs text-muted-foreground">Selected object</Label>
                    <p className="mt-1 font-mono tabular-nums">
                        Loc #{selected.locTypeId} · plane {selected.level} · {selected.kind} · rot{" "}
                        {selected.rotation & 3}
                    </p>
                    {isCopyableObjectKind(selected.kind) ? (
                        <p className="mt-1 text-muted-foreground">Press R to rotate · Press C to copy</p>
                    ) : null}
                    <button
                        type="button"
                        className="mt-2 text-xs text-primary underline-offset-2 hover:underline"
                        onClick={() => {
                            pluginHost.cancelObjectCopyPlacement();
                            pluginHost.clearSelectedObject();
                            pluginHost.notifyWorkbenchStateChanged();
                        }}
                    >
                        Clear selection
                    </button>
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">No object selected — left-click an object in the map view.</p>
            )}
        </div>
    );
}

export const ObjectSelectorToolPanel = memo(ObjectSelectorToolPanelInner);
