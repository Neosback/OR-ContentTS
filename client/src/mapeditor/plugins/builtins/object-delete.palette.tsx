import { memo, useSyncExternalStore } from "react";
import { Trash2 } from "lucide-react";

import { Label } from "../../../components/ui/label";
import type { EditorToolPlugin, MapEditorPalettePanelProps } from "./builtin-plugin-types";

function ObjectDeleteToolPanelInner({ pluginHost }: MapEditorPalettePanelProps): JSX.Element {
    useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );
    const hovered = pluginHost.hoveredObject;
    const deleteHeld = pluginHost.isObjectDeleteModeActive();
    return (
        <div className="map-editor-panel flex min-h-0 flex-1 flex-col gap-3 p-4">
            <p className="text-xs text-muted-foreground">
                Hover objects for a red wireframe preview. Hold Delete (or Backspace) and move the cursor over objects
                to remove them. Each deletion is undoable with Ctrl+Z.
            </p>
            {deleteHeld ? (
                <div className="rounded-md border border-red-500/50 bg-red-500/10 px-2 py-1.5 text-xs text-red-100/90">
                    Delete held — hover objects to remove
                </div>
            ) : (
                <div className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">
                    Hold Delete to erase hovered objects
                </div>
            )}
            {hovered ? (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs">
                    <Label className="text-xs text-muted-foreground">Hovered object</Label>
                    <p className="mt-1 font-mono tabular-nums">
                        Loc #{hovered.locTypeId} · plane {hovered.level} · {hovered.kind}
                    </p>
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">Hover a tile with an object to preview it.</p>
            )}
        </div>
    );
}

export const ObjectDeleteToolPanel = memo(ObjectDeleteToolPanelInner);
