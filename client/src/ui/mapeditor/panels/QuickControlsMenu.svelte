<script lang="ts">
    import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

    import { getQuickControlsModel } from "../../../mapeditor/quick-controls-model";
    import { getViewControl, type ViewControl } from "../../../mapeditor/view-controls";
    import { Button } from "../../components/ui/button";
    import {
        DropdownMenu,
        DropdownMenuCheckboxItem,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuSeparator,
        DropdownMenuTrigger,
    } from "../../components/ui/dropdown-menu";
    import { useEditorState } from "../editor-state.svelte";

    let { side = "bottom" }: { side?: "top" | "bottom" } = $props();

    const editor = useEditorState();
    const host = editor.host;

    // The pinned controls, in order, with their current values.
    const items = $derived(
        editor.read(() =>
            getQuickControlsModel(host)
                .pinned.map((id) => getViewControl(id))
                .filter((control): control is ViewControl => control !== undefined)
                .map((control) => ({ control, on: control.get(host) })),
        ),
    );

    function openRendering(): void {
        editor.layout?.openPanel("editor-rendering");
    }
</script>

<DropdownMenu>
    <DropdownMenuTrigger>
        {#snippet child({ props })}
            <Button {...props} variant="ghost" size="sm" class="h-7 gap-1.5 px-2 text-xs" aria-label="Quick controls">
                <SlidersHorizontal class="size-3.5" />
            </Button>
        {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" {side} collisionPadding={8} class="w-56">
        <div class="px-2 py-1.5 text-sm font-semibold">Quick controls</div>
        {#each items as { control, on } (control.id)}
            <!-- Stays open so several switches can be flipped in one go. -->
            <DropdownMenuCheckboxItem checked={on} closeOnSelect={false} title={control.description} onCheckedChange={(next) => control.set(host, next)}>
                {#if control.swatch}
                    <span class="mr-1.5 inline-block size-2.5 rounded-sm border border-border/60 align-[-1px]" style="background-color: rgb({control.swatch.slice(0, 3).map((v) => Math.round(v * 255)).join(',')})" aria-hidden="true"></span>
                {/if}
                {control.label}
            </DropdownMenuCheckboxItem>
        {:else}
            <div class="px-2 py-1.5 text-xs text-muted-foreground">Nothing pinned yet.</div>
        {/each}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={openRendering}>Customize in Rendering…</DropdownMenuItem>
    </DropdownMenuContent>
</DropdownMenu>
