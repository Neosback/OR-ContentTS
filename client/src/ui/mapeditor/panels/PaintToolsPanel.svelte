<script lang="ts">
    import SquareArrowOutUpRight from "@lucide/svelte/icons/square-arrow-out-up-right";

    import { BUILTIN_EDITOR_TOOL_PLUGINS } from "../../../mapeditor/plugins/builtins/current-plugin-layout.builtin";
    import { editorToolSelectCommandId, executeEditorCommand } from "../../../mapeditor/commands/editor-command-registry";
    import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
    import { contextMenu } from "../../components/context-menu/context-menu.svelte";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";
    import { TOOL_ICONS } from "../icons";
    import { visibleRailGroups } from "../tool-rail";
    import { PAINT_TOOLS_PANEL_ID } from "../workbench-controller.svelte";

    const editor = useEditorState();
    const host = editor.host;
    const workbench = $derived(editor.layout);
    const docked = $derived(workbench?.locations[PAINT_TOOLS_PANEL_ID] === "grid");
    const activeTool = $derived(editor.tool.current);
    const groups = $derived(
        editor.read(() =>
            visibleRailGroups((id) => host.isEditorToolPluginEnabled(id)).map((group) =>
                group.map((id) => BUILTIN_EDITOR_TOOL_PLUGINS.find((plugin) => plugin.id === id)).filter((plugin) => plugin !== undefined),
            ),
        ),
    );

    const buttonBase = "grid size-[34px] shrink-0 place-items-center rounded-[5px] border text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="flex h-full min-h-0 flex-col items-center gap-1 overflow-hidden bg-card p-[5px]"
    oncontextmenu={(event) => contextMenu.open(event, "Paint tools", workbench?.menuFor(PAINT_TOOLS_PANEL_ID) ?? [])}
>
    {#if docked}
        <Tooltip>
            <TooltipTrigger>
                {#snippet child({ props })}
                    <button {...props} type="button" class={cn(buttonBase, "size-[22px] border-transparent hover:bg-muted hover:text-foreground")} aria-label="Undock tools" onclick={() => workbench?.floatFromDock(PAINT_TOOLS_PANEL_ID)}>
                        <SquareArrowOutUpRight class="size-3.5" aria-hidden="true" />
                    </button>
                {/snippet}
            </TooltipTrigger>
            <TooltipContent side="right" class="text-xs">Undock (right-click for more)</TooltipContent>
        </Tooltip>
    {/if}

    <nav class="flex min-h-0 flex-col items-center gap-1" aria-label="Map editor tools">
        {#each groups as group, index (index)}
            {#if index > 0}
                <div class="my-[3px] h-px w-[26px] shrink-0 bg-border" aria-hidden="true"></div>
            {/if}
            {#each group as tool (tool.id)}
                {@const Icon = TOOL_ICONS[tool.icon]}
                {@const active = activeTool === tool.id}
                <Tooltip>
                    <TooltipTrigger>
                        {#snippet child({ props })}
                            <button
                                {...props}
                                type="button"
                                class={cn(buttonBase, active ? "border-blue-300 bg-blue-500 text-white" : "border-transparent hover:bg-muted hover:text-foreground")}
                                aria-label={tool.name}
                                aria-pressed={active}
                                onclick={() => executeEditorCommand(editorToolSelectCommandId(tool.id), { host })}
                            >
                                <Icon class="size-[18px]" aria-hidden="true" />
                            </button>
                        {/snippet}
                    </TooltipTrigger>
                    <TooltipContent side="right" class="max-w-xs text-xs leading-snug">
                        <span class="font-medium text-foreground">{tool.name}</span>
                        <span class="mt-1 block text-muted-foreground">{tool.description}</span>
                    </TooltipContent>
                </Tooltip>
            {/each}
        {/each}
    </nav>
</div>
