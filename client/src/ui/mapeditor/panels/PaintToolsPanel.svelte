<script lang="ts">
    import SquareArrowOutUpRight from "@lucide/svelte/icons/square-arrow-out-up-right";

    import { BUILTIN_EDITOR_TOOL_PLUGINS } from "../../../mapeditor/plugins/builtins/current-plugin-layout.builtin";
    import { getPaintToolsStripModel } from "../../../mapeditor/plugins/builtins/paint-tools-strip-model";
    import { Button } from "../../components/ui/button";
    import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
    import { contextMenu } from "../../components/context-menu/context-menu.svelte";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";
    import { TOOL_ICONS } from "../icons";
    import { PAINT_TOOLS_PANEL_ID } from "../workbench-controller.svelte";
    import type { DockviewPanelApi } from "dockview-core";

    let { api }: { api: DockviewPanelApi } = $props();

    const editor = useEditorState();
    const host = editor.host;
    const workbench = $derived(editor.layout);
    const docked = $derived(workbench?.locations[PAINT_TOOLS_PANEL_ID] === "grid");
    const orientation = $derived(editor.read(() => (docked ? "vertical" : getPaintToolsStripModel(host).orientation)));
    const vertical = $derived(orientation === "vertical");
    const tools = $derived(editor.read(() => BUILTIN_EDITOR_TOOL_PLUGINS.filter((p) => host.isEditorToolPluginEnabled(p.id))));
    const activeTool = $derived(editor.tool.current);
    const tooltipSide = $derived(vertical ? "right" : "bottom");

    // A floating strip resizes to fit its orientation.
    $effect(() => {
        if (docked) return;
        api.setSize(vertical ? { width: 64, height: 300 } : { width: 300, height: 96 });
    });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="flex h-full min-h-0 flex-col bg-background/40 p-1"
    oncontextmenu={(event) => contextMenu.open(event, "Paint tools", workbench?.menuFor(PAINT_TOOLS_PANEL_ID) ?? [])}
>
    <div class={cn("flex min-h-0 w-full gap-0.5 overflow-hidden", vertical ? "h-full flex-col items-center" : "flex-row flex-wrap items-center justify-center")}>
        {#if docked}
            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button {...props} size="icon" variant="ghost" class="size-7 shrink-0" aria-label="Undock paint tools" onclick={() => workbench?.floatFromDock(PAINT_TOOLS_PANEL_ID)}>
                            <SquareArrowOutUpRight class="size-3.5" aria-hidden="true" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent side="right" class="text-xs">Undock (right-click for more)</TooltipContent>
            </Tooltip>
        {/if}
        <nav class={cn("flex gap-0.5", vertical ? "flex-col items-center" : "flex-row items-center")} aria-label="Map paint tools">
            {#each tools as tool (tool.id)}
                {@const Icon = TOOL_ICONS[tool.icon]}
                <Tooltip>
                    <TooltipTrigger>
                        {#snippet child({ props })}
                            <Button
                                {...props}
                                size="icon"
                                variant={activeTool === tool.id ? "default" : "outline"}
                                class="size-8 shrink-0"
                                aria-label={tool.name}
                                aria-pressed={activeTool === tool.id}
                                onclick={() => host.setEditorTool(tool.id)}
                            >
                                <Icon class="size-4" aria-hidden="true" />
                            </Button>
                        {/snippet}
                    </TooltipTrigger>
                    <TooltipContent side={tooltipSide} class="max-w-xs text-xs leading-snug">
                        <span class="font-medium text-foreground">{tool.name}</span>
                        <span class="mt-1 block text-muted-foreground">{tool.description}</span>
                    </TooltipContent>
                </Tooltip>
            {/each}
        </nav>
    </div>
</div>
