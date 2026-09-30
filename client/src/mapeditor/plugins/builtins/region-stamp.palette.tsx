import { memo, useSyncExternalStore } from "react";
import { Copy } from "lucide-react";

import { Label } from "../../../components/ui/label";
import { boundsHeight, boundsWidth } from "./region-stamp-types";
import { RegionStampCopyDialog } from "./RegionStampCopyDialog";
import { REGION_STAMP_COPY_OPTION_ROWS } from "./region-stamp-copy-options";
import type { EditorToolPlugin, MapEditorPalettePanelProps } from "./builtin-plugin-types";

function formatBounds(bounds: { minWorldX: number; minWorldY: number; maxWorldX: number; maxWorldY: number }): string {
    const w = boundsWidth(bounds);
    const h = boundsHeight(bounds);
    return `${w}×${h} tiles (${bounds.minWorldX},${bounds.minWorldY})–(${bounds.maxWorldX},${bounds.maxWorldY})`;
}

function RegionStampToolPanelInner({ pluginHost }: MapEditorPalettePanelProps): JSX.Element {
    useSyncExternalStore(
        pluginHost.subscribeWorkbenchPlugins,
        pluginHost.getWorkbenchPluginsStateSnapshot,
        pluginHost.getWorkbenchPluginsStateSnapshot,
    );
    const bounds = pluginHost.getRegionStampSelectBounds();
    const draft = pluginHost.getRegionStampDraftBounds();
    const pasteActive = pluginHost.isRegionStampPlacementActive();
    const rotation = pluginHost.getRegionStampRotation();
    const stamp = pluginHost.getRegionStampClipboard();

    return (
        <div className="map-editor-panel flex min-h-0 flex-1 flex-col gap-3 p-4">
            <RegionStampCopyDialog pluginHost={pluginHost} />
            <p className="text-xs text-muted-foreground">
                Drag to select a region, then press C to choose what to copy. Paste preview renders real terrain and
                objects — use R to rotate before clicking to place.
            </p>
            {pasteActive && stamp ? (
                <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100/90">
                    Paste mode — left-drag pan · click place · R rotate ({rotation & 3}) · Esc cancel
                </div>
            ) : null}
            {draft ? (
                <div className="rounded-md border border-cyan-500/40 bg-cyan-500/10 p-2 text-xs">
                    <Label className="text-xs text-muted-foreground">Selecting</Label>
                    <p className="mt-1 font-mono tabular-nums">{formatBounds(draft)}</p>
                </div>
            ) : bounds ? (
                <div className="rounded-md border border-cyan-500/40 bg-cyan-500/10 p-2 text-xs">
                    <Label className="text-xs text-muted-foreground">Selected region</Label>
                    <p className="mt-1 font-mono tabular-nums">{formatBounds(bounds)}</p>
                    <p className="mt-1 text-muted-foreground">C copy · Delete clear region</p>
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">Drag on the map to select tiles.</p>
            )}
            {stamp && !pasteActive ? (
                <div className="rounded-md border bg-muted/30 p-2 text-xs">
                    <Label className="text-xs text-muted-foreground">Clipboard</Label>
                    <p className="mt-1 font-mono tabular-nums">
                        {stamp.width}×{stamp.height} · {new Set(stamp.tiles.map((tile) => tile.level)).size} levels ·{" "}
                        {stamp.objects.length} objects
                    </p>
                    <p className="mt-1 text-muted-foreground">
                        Includes:{" "}
                        {REGION_STAMP_COPY_OPTION_ROWS.filter((row) => (stamp.copyOptions ?? {})[row.key]).map((row) => row.label).join(", ") ||
                            "nothing"}
                    </p>
                    <p className="mt-1 text-muted-foreground">Press C again to enter paste mode</p>
                </div>
            ) : null}
        </div>
    );
}

export const RegionStampToolPanel = memo(RegionStampToolPanelInner);
