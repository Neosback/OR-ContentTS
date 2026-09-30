import { memo, useMemo, useSyncExternalStore } from "react";
import { HEIGHT_MODE_ICONS } from "../../react-height-icons";
import { ArrowDownToLine, ArrowUpDown } from "lucide-react";

import type { EditorToolPlugin, MapEditorPalettePanelProps } from "./builtin-plugin-types";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Label } from "../../../components/ui/label";
import { Separator } from "../../../components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../components/ui/tooltip";
import { cn } from "../../../util/cn";
import { getBuiltinEditorToolPlugin } from "./current-plugin-layout.builtin";
import { HEIGHT_MODES } from "./height-brush-settings.shared";
import { getHeightToolModel } from "./height-tool-model";
import { isEditorToolKeybindHeld, keybindChordToLabel } from "../../editor-tool-input";
import "../../MapEditorPanel.css";

function HeightEditorToolPanelInner({ pluginHost: host }: MapEditorPalettePanelProps): JSX.Element {
    const workbenchSnap = useSyncExternalStore(
        host.subscribeWorkbenchPlugins,
        host.getWorkbenchPluginsStateSnapshot,
        host.getWorkbenchPluginsStateSnapshot,
    );
    const heightModel = getHeightToolModel(host);
    const currentMode = heightModel.mode;
    const selectedMode = useMemo(() => HEIGHT_MODES.find((mode) => mode.id === currentMode) ?? HEIGHT_MODES[0], [currentMode]);
    const lowerModifierLabel = useMemo(() => {
        const chords = host.getResolvedKeybindChords("height:hold-lower-modifier", [
            { code: "AltLeft" },
            { code: "AltRight" },
        ]);
        const first = chords[0] ?? null;
        return first ? keybindChordToLabel(first) : "Unbound";
    }, [host, workbenchSnap]);

    return (
        <div className="map-editor-panel flex min-h-0 flex-1 flex-col">
            <CardHeader className="space-y-1.5 border-b border-border bg-muted/20 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold tracking-tight text-foreground">Height</CardTitle>
                    <Badge variant="outline" className="h-5 border-border px-2 font-mono text-[10px] font-normal">
                        Step {host.heightAdjustStep}
                    </Badge>
                </div>
                <div className="rounded-md border border-muted bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    Active mode: <span className="font-medium text-foreground">{selectedMode.name}</span>
                </div>
            </CardHeader>
            <Separator />
            <TooltipProvider delayDuration={250}>
                <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                    <div className="grid grid-cols-2 gap-1.5">
                        {HEIGHT_MODES.map((mode) => {
                            const Icon = HEIGHT_MODE_ICONS[mode.icon];
                            const selected = mode.id === currentMode;
                            return (
                                <Tooltip key={mode.id}>
                                    <TooltipTrigger asChild>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={selected ? "secondary" : "outline"}
                                            className={cn("h-8 justify-start gap-1.5 px-2 text-[11px]", selected && "ring-1 ring-primary/35")}
                                            onClick={() => {
                                                heightModel.setMode(mode.id);
                                                host.setEditorTool("height");
                                            }}
                                        >
                                            <Icon className="size-3.5" />
                                            {mode.name}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom">{mode.description}</TooltipContent>
                                </Tooltip>
                            );
                        })}
                    </div>
                <p className="text-xs text-muted-foreground">{selectedMode.description}</p>
                <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Height step ({host.heightAdjustStep})
                    </Label>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <input
                                type="range"
                                min={1}
                                max={32}
                                value={host.heightAdjustStep}
                                onPointerDown={(event) => event.stopPropagation()}
                                onChange={(event) => {
                                    const raw = Number(event.target.value);
                                    getBuiltinEditorToolPlugin("height").data?.applyHeightStepFromRawInput?.(host, raw);
                                    host.notifyWorkbenchStateChanged();
                                }}
                                className="h-2 w-full accent-primary"
                            />
                        </TooltipTrigger>
                        <TooltipContent side="bottom">How much each stroke raises/lowers height.</TooltipContent>
                    </Tooltip>
                </div>
                {currentMode === "slope" ? (
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Slope strength ({Math.round(heightModel.slopeStrength * 100)}%)
                        </Label>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <input
                                    type="range"
                                    min={10}
                                    max={100}
                                    value={Math.round(heightModel.slopeStrength * 100)}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onChange={(event) => heightModel.setSlopeStrength(Number(event.target.value) / 100)}
                                    className="h-2 w-full accent-primary"
                                />
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Controls how steep the generated slope is.</TooltipContent>
                        </Tooltip>
                    </div>
                ) : null}
                {currentMode === "blend" ? (
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Blend strength ({Math.round(heightModel.blendStrength * 100)}%)
                        </Label>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <input
                                    type="range"
                                    min={5}
                                    max={100}
                                    value={Math.round(heightModel.blendStrength * 100)}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onChange={(event) => heightModel.setBlendStrength(Number(event.target.value) / 100)}
                                    className="h-2 w-full accent-primary"
                                />
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Higher values blend harder into nearby terrain.</TooltipContent>
                        </Tooltip>
                    </div>
                ) : null}
                {currentMode === "flatten" ? (
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Flatten strength ({Math.round(heightModel.flattenStrength * 100)}%)
                        </Label>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <input
                                    type="range"
                                    min={5}
                                    max={100}
                                    value={Math.round(heightModel.flattenStrength * 100)}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onChange={(event) => heightModel.setFlattenStrength(Number(event.target.value) / 100)}
                                    className="h-2 w-full accent-primary"
                                />
                            </TooltipTrigger>
                            <TooltipContent side="bottom">How fast terrain gets pulled to hovered anchor height.</TooltipContent>
                        </Tooltip>
                    </div>
                ) : null}
                {currentMode === "terrace" ? (
                    <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Terrace step ({heightModel.terraceStep})
                        </Label>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <input
                                    type="range"
                                    min={2}
                                    max={96}
                                    value={heightModel.terraceStep}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onChange={(event) => heightModel.setTerraceStep(Number(event.target.value))}
                                    className="h-2 w-full accent-primary"
                                />
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Step size for snapped terrace levels.</TooltipContent>
                        </Tooltip>
                    </div>
                ) : null}
                <div className="rounded-md border border-border/80 bg-card/50 px-2.5 py-2 text-[11px] text-muted-foreground">
                    <ArrowDownToLine className="mr-1 inline size-3.5 align-text-bottom" />
                    Tip: paint raises terrain by default. Hold <span className="font-medium text-foreground">{lowerModifierLabel}</span> to lower (and invert slope direction).
                </div>
                </CardContent>
            </TooltipProvider>
        </div>
    );
}

export const HeightEditorToolPanel = memo(HeightEditorToolPanelInner);
