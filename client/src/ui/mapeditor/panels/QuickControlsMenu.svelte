<script lang="ts">
    import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

    import { executeEditorCommand } from "../../../mapeditor/commands/editor-command-registry";

    import { Button } from "../../components/ui/button";
    import {
        DropdownMenu,
        DropdownMenuCheckboxItem,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuTrigger,
    } from "../../components/ui/dropdown-menu";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;
    const smoothing = $derived(editor.read(() => host.terrainSmoothingEnabled));
    const objects = $derived(editor.read(() => host.objectsVisible));
</script>

<DropdownMenu>
    <DropdownMenuTrigger>
        {#snippet child({ props })}
            <Button {...props} variant="ghost" size="sm" class="h-7 gap-1.5 px-2 text-xs" aria-label="Quick controls">
                <SlidersHorizontal class="size-3.5" />
            </Button>
        {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" side="bottom" collisionPadding={8} class="w-52">
        <div class="px-2 py-1.5 text-sm font-semibold">Quick controls</div>
        <DropdownMenuCheckboxItem checked={smoothing} onCheckedChange={() => executeEditorCommand("workbench.toggle-terrain-smoothing", { host })}>
            Terrain smoothing: {smoothing ? "On" : "Off"}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={objects} onCheckedChange={() => executeEditorCommand("workbench.toggle-objects-visible", { host })}>
            Objects: {objects ? "On" : "Off"}
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem onSelect={() => host.setViewMode("editor")}>Switch to Editor view</DropdownMenuItem>
    </DropdownMenuContent>
</DropdownMenu>
