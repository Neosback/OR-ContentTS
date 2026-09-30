<script lang="ts">
    import Maximize2 from "@lucide/svelte/icons/maximize-2";
    import Monitor from "@lucide/svelte/icons/monitor";
    import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

    import { Button } from "../components/ui/button";
    import type { InterfaceEditorState } from "./interface-editor-state.svelte";

    let { state }: { state: InterfaceEditorState } = $props();
    let colorTimer: number | undefined;

    function scheduleColor(value: string): void {
        window.clearTimeout(colorTimer);
        colorTimer = window.setTimeout(() => (state.viewportColor = value), 80);
    }
</script>

<div class="flex items-center gap-1">
    <Button size="icon-xs" variant={state.mode === "fixed" ? "default" : "outline"} title="Fixed mode (512×334)" onclick={() => (state.mode = "fixed")}>
        <Monitor class="size-3.5" />
    </Button>
    <Button size="icon-xs" variant={state.mode === "resizable" ? "default" : "outline"} title="Resizable mode" onclick={() => (state.mode = "resizable")}>
        <Maximize2 class="size-3.5" />
    </Button>
    <details class="group relative">
        <summary class="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-md border bg-background text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal class="size-3.5" />
        </summary>
        <div class="absolute right-0 z-20 mt-1 w-52 rounded-md border bg-popover p-2 text-xs shadow-md">
            <label class="mb-2 flex items-center justify-between gap-2">
                <span>Viewport color</span>
                <input
                    type="color"
                    value={state.viewportColor}
                    oninput={(event) => scheduleColor(event.currentTarget.value)}
                    class="h-6 w-8 cursor-pointer rounded border bg-transparent p-0"
                />
            </label>
            <label class="mb-1 flex items-center gap-2">
                <input type="checkbox" checked={state.showOverlays} onchange={(event) => (state.showOverlays = event.currentTarget.checked)} />
                <span>Show UI overlays</span>
            </label>
            <label class="flex items-center gap-2">
                <input type="checkbox" checked={state.showViewportBorder} onchange={(event) => (state.showViewportBorder = event.currentTarget.checked)} />
                <span>Show viewport border</span>
            </label>
            <label class="mt-1 flex items-center gap-2">
                <input type="checkbox" checked={state.showPixelGrid} onchange={(event) => (state.showPixelGrid = event.currentTarget.checked)} />
                <span>Pixel lines</span>
            </label>
        </div>
    </details>
</div>
