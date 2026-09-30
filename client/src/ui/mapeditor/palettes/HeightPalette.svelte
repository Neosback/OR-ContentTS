<script lang="ts">
    import { keybindChordToLabel } from "../../../mapeditor/editor-tool-input";
    import { executeEditorCommand, heightModeCommandId } from "../../../mapeditor/commands/editor-command-registry";
    import { getBuiltinEditorToolPlugin } from "../../../mapeditor/plugins/builtins/current-plugin-layout.builtin";
    import { HEIGHT_MODES } from "../../../mapeditor/plugins/builtins/height-brush-settings.shared";
    import { getHeightToolModel } from "../../../mapeditor/plugins/builtins/height-tool-model";
    import { Badge } from "../../components/ui/badge";
    import { Button } from "../../components/ui/button";
    import { CardContent, CardHeader, CardTitle } from "../../components/ui/card";
    import { Label } from "../../components/ui/label";
    import { Separator } from "../../components/ui/separator";
    import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";
    import { ArrowDownToLine, HEIGHT_MODE_ICONS } from "../icons";

    const editor = useEditorState();
    const host = editor.host;
    const model = $derived(editor.read(() => getHeightToolModel(host)));
    const mode = $derived(editor.read(() => getHeightToolModel(host).mode));
    const selectedMode = $derived(HEIGHT_MODES.find((m) => m.id === mode) ?? HEIGHT_MODES[0]);
    const step = $derived(editor.read(() => host.heightAdjustStep));
    const strengths = $derived(
        editor.read(() => {
            const m = getHeightToolModel(host);
            return { slope: m.slopeStrength, blend: m.blendStrength, flatten: m.flattenStrength, terrace: m.terraceStep };
        }),
    );
    const lowerModifierLabel = $derived(
        editor.read(() => {
            const chords = host.getResolvedKeybindChords("height:hold-lower-modifier", [{ code: "AltLeft" }, { code: "AltRight" }]);
            return chords[0] ? keybindChordToLabel(chords[0]) : "Unbound";
        }),
    );

    const pct = (value: number): number => Math.round(value * 100);
</script>

{#snippet slider(label: string, min: number, max: number, value: number, hint: string, onChange: (value: number) => void)}
    <div class="space-y-1">
        <Label class="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
        <Tooltip>
            <TooltipTrigger>
                {#snippet child({ props })}
                    <input
                        {...props}
                        type="range"
                        {min}
                        {max}
                        {value}
                        onpointerdown={(event) => event.stopPropagation()}
                        oninput={(event) => onChange(Number(event.currentTarget.value))}
                        class="h-2 w-full accent-primary"
                    />
                {/snippet}
            </TooltipTrigger>
            <TooltipContent side="bottom">{hint}</TooltipContent>
        </Tooltip>
    </div>
{/snippet}

<div class="map-editor-panel flex min-h-0 flex-1 flex-col">
    <CardHeader class="space-y-1.5 border-b border-border bg-muted/20 px-4 py-3">
        <div class="flex items-center justify-between gap-2">
            <CardTitle class="text-sm font-semibold tracking-tight text-foreground">Height</CardTitle>
            <Badge variant="outline" class="h-5 border-border px-2 font-mono text-[10px] font-normal">Step {step}</Badge>
        </div>
        <div class="rounded-md border border-muted bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            Active mode: <span class="font-medium text-foreground">{selectedMode.name}</span>
        </div>
    </CardHeader>
    <Separator />
    <CardContent class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div class="grid grid-cols-2 gap-1.5">
            {#each HEIGHT_MODES as m (m.id)}
                {@const Icon = HEIGHT_MODE_ICONS[m.icon]}
                {@const selected = m.id === mode}
                <Tooltip>
                    <TooltipTrigger>
                        {#snippet child({ props })}
                            <Button
                                {...props}
                                size="sm"
                                variant={selected ? "secondary" : "outline"}
                                class={cn("h-8 justify-start gap-1.5 px-2 text-[11px]", selected && "ring-1 ring-primary/35")}
                                onclick={() => executeEditorCommand(heightModeCommandId(m.id), { host })}
                            >
                                <Icon class="size-3.5" />
                                {m.name}
                            </Button>
                        {/snippet}
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{m.description}</TooltipContent>
                </Tooltip>
            {/each}
        </div>
        <p class="text-xs text-muted-foreground">{selectedMode.description}</p>

        {@render slider(`Height step (${step})`, 1, 32, step, "How much each stroke raises/lowers height.", (raw) => {
            getBuiltinEditorToolPlugin("height").data?.applyHeightStepFromRawInput?.(host, raw);
            host.notifyWorkbenchStateChanged();
        })}
        {#if mode === "slope"}
            {@render slider(`Slope strength (${pct(strengths.slope)}%)`, 10, 100, pct(strengths.slope), "Controls how steep the generated slope is.", (v) => model.setSlopeStrength(v / 100))}
        {/if}
        {#if mode === "blend"}
            {@render slider(`Blend strength (${pct(strengths.blend)}%)`, 5, 100, pct(strengths.blend), "Higher values blend harder into nearby terrain.", (v) => model.setBlendStrength(v / 100))}
        {/if}
        {#if mode === "flatten"}
            {@render slider(`Flatten strength (${pct(strengths.flatten)}%)`, 5, 100, pct(strengths.flatten), "How fast terrain gets pulled to hovered anchor height.", (v) => model.setFlattenStrength(v / 100))}
        {/if}
        {#if mode === "terrace"}
            {@render slider(`Terrace step (${strengths.terrace})`, 2, 96, strengths.terrace, "Step size for snapped terrace levels.", (v) => model.setTerraceStep(v))}
        {/if}

        <div class="rounded-md border border-border/80 bg-card/50 px-2.5 py-2 text-[11px] text-muted-foreground">
            <ArrowDownToLine class="mr-1 inline size-3.5 align-text-bottom" />
            Tip: paint raises terrain by default. Hold <span class="font-medium text-foreground">{lowerModifierLabel}</span> to lower (and invert slope direction).
        </div>
    </CardContent>
</div>
