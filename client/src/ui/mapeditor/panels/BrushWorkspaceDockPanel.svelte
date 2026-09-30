<script lang="ts">
    import SquareArrowOutUpRight from "@lucide/svelte/icons/square-arrow-out-up-right";

    import { Button } from "../../components/ui/button";
    import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
    import { contextMenu } from "../../components/context-menu/context-menu.svelte";
    import { useEditorState } from "../editor-state.svelte";
    import { BRUSH_PANEL_ID } from "../workbench-controller.svelte";
    import BrushControls from "./BrushControls.svelte";

    const editor = useEditorState();
    const workbench = $derived(editor.layout);
    const docked = $derived(workbench?.locations[BRUSH_PANEL_ID] === "grid");
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="flex h-full min-h-0 flex-col bg-background/40 {docked ? 'p-1' : ''}"
    oncontextmenu={(event) => contextMenu.open(event, "Brush workspace", workbench?.menuFor(BRUSH_PANEL_ID) ?? [])}
>
    {#if docked}
        <div class="flex h-full min-h-0 w-full min-w-0 items-center gap-1">
            <Tooltip>
                <TooltipTrigger>
                    {#snippet child({ props })}
                        <Button {...props} size="icon" variant="ghost" class="size-7 shrink-0" aria-label="Undock brush bar" onclick={() => workbench?.floatFromDock(BRUSH_PANEL_ID)}>
                            <SquareArrowOutUpRight class="size-3.5" aria-hidden="true" />
                        </Button>
                    {/snippet}
                </TooltipTrigger>
                <TooltipContent side="top" class="text-xs">Undock (right-click for more)</TooltipContent>
            </Tooltip>
            <div class="min-w-0 flex-1">
                <BrushControls variant="bar" />
            </div>
        </div>
    {:else}
        <BrushControls variant="window" />
    {/if}
</div>
