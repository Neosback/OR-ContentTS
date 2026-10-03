<script lang="ts">
    import { HEIGHT_MODES } from "../../../mapeditor/plugins/builtins/height-brush-settings.shared";
    import { executeEditorCommand, heightModeCommandId } from "../../../mapeditor/commands/editor-command-registry";
    import { getBuiltinEditorToolPlugin } from "../../../mapeditor/plugins/builtins/current-plugin-layout.builtin";
    import { getHeightToolModel } from "../../../mapeditor/plugins/builtins/height-tool-model";
    import { Button } from "../../components/ui/button";
    import { Label } from "../../components/ui/label";
    import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";
    import { HEIGHT_MODE_ICONS } from "../icons";

    const editor = useEditorState();
    const host = editor.host;
    const tool = $derived(editor.tool.current);
    const heightFocus = $derived(editor.read(() => host.getEditorTool() === "height"));
    const heightMode = $derived(editor.read(() => getHeightToolModel(host).mode));
    const selectedMode = $derived(HEIGHT_MODES.find((mode) => mode.id === heightMode) ?? HEIGHT_MODES[0]);
    const heightStep = $derived(editor.read(() => host.heightAdjustStep));
    const hint = "px-2 py-1 text-[11px] leading-snug text-muted-foreground";
</script>

{#if tool === "tile-brush" && heightFocus}
    <div class="space-y-2.5 px-2 pb-1 pt-0.5">
        <div class="grid grid-cols-2 gap-1">
            {#each HEIGHT_MODES as mode (mode.id)}
                {@const Icon = HEIGHT_MODE_ICONS[mode.icon]}
                {@const selected = mode.id === heightMode}
                <Tooltip>
                    <TooltipTrigger>
                        {#snippet child({ props })}
                            <Button
                                {...props}
                                size="sm"
                                variant={selected ? "secondary" : "outline"}
                                class={cn("h-7 justify-start gap-1 px-1.5 text-[10px]", selected && "ring-1 ring-primary/35")}
                                onclick={() => executeEditorCommand(heightModeCommandId(mode.id), { host })}
                            >
                                <Icon class="size-3 shrink-0" />
                                <span class="truncate">{mode.name}</span>
                            </Button>
                        {/snippet}
                    </TooltipTrigger>
                    <TooltipContent side="bottom" class="max-w-[14rem] text-xs">{mode.description}</TooltipContent>
                </Tooltip>
            {/each}
        </div>
        <p class="text-[10px] leading-snug text-muted-foreground">{selectedMode.description}</p>
        <div class="space-y-1">
            <Label class="text-[10px] uppercase tracking-wide text-muted-foreground">Height step ({heightStep})</Label>
            <input
                type="range"
                min="1"
                max="32"
                value={heightStep}
                onpointerdown={(event) => event.stopPropagation()}
                oninput={(event) => {
                    getBuiltinEditorToolPlugin("height").data?.applyHeightStepFromRawInput?.(host, Number(event.currentTarget.value));
                    host.notifyWorkbenchStateChanged();
                }}
                class="map-editor-panel-slider h-1.5 w-full cursor-pointer accent-primary"
            />
        </div>
    </div>
{:else if tool === "object-selector"}
    <p class={hint}>Selection tool — hover and click objects in the 3D view.</p>
{:else if tool === "object-place"}
    <p class={hint}>Place tool — click to put the copied or catalog object down · R rotates · Esc finishes.</p>
{:else if tool === "object-delete"}
    <p class={hint}>Delete tool — hold Delete and hover objects to remove them.</p>
{:else if tool === "region-stamp"}
    <p class={hint}>Region stamp — drag to select · C opens copy options · live preview while placing · R rotate.</p>
{:else}
    <p class={hint}>No additional settings for this tool.</p>
{/if}
