<script lang="ts">
    import Blend from "@lucide/svelte/icons/blend";
    import Boxes from "@lucide/svelte/icons/boxes";

    import { keybindChordToLabel } from "../../../mapeditor/editor-tool-input";
    import { executeEditorCommand } from "../../../mapeditor/commands/editor-command-registry";
    import { workbenchBindingKey, workbenchDefaultChords } from "../../../mapeditor/plugins/builtins/workbench-keybinds.builtin";
    import { Button } from "../../components/ui/button";
    import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;

    const smoothing = $derived(editor.read(() => host.terrainSmoothingEnabled));
    const objects = $derived(editor.read(() => host.objectsVisible));

    function hint(binding: "toggle-terrain-smoothing" | "toggle-objects-visible"): string {
        const chords = host.getResolvedKeybindChords(workbenchBindingKey(binding), workbenchDefaultChords(binding));
        return chords.length === 0 ? "No hotkey" : chords.map((chord) => keybindChordToLabel(chord)).join(" / ");
    }
</script>

<Tooltip>
    <TooltipTrigger>
        {#snippet child({ props })}
            <Button {...props} variant={smoothing ? "secondary" : "ghost"} size="sm" class="h-7 gap-1.5 px-2 text-xs" onclick={() => executeEditorCommand("workbench.toggle-terrain-smoothing", { host })} aria-pressed={smoothing}>
                <Blend class="size-3.5" />
                <span>{smoothing ? "Terrain Smoothing on" : "Terrain Smoothing off"}</span>
            </Button>
        {/snippet}
    </TooltipTrigger>
    <TooltipContent>
        Toggle terrain smoothing/blending ({hint("toggle-terrain-smoothing")}) - currently {smoothing ? "on" : "off"}
    </TooltipContent>
</Tooltip>

<Tooltip>
    <TooltipTrigger>
        {#snippet child({ props })}
            <Button {...props} variant={objects ? "secondary" : "ghost"} size="sm" class="h-7 gap-1.5 px-2 text-xs" onclick={() => executeEditorCommand("workbench.toggle-objects-visible", { host })} aria-pressed={objects}>
                <Boxes class="size-3.5" />
                <span>{objects ? "Objects on" : "Objects off"}</span>
            </Button>
        {/snippet}
    </TooltipTrigger>
    <TooltipContent>Toggle objects visibility ({hint("toggle-objects-visible")})</TooltipContent>
</Tooltip>
