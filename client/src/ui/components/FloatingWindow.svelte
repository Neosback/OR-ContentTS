<script lang="ts">
    import X from "@lucide/svelte/icons/x";
    import type { Snippet } from "svelte";

    import { cn } from "../lib/utils";

    let {
        title,
        subtitle,
        onclose,
        width = 420,
        height = 520,
        x = $bindable(96),
        y = $bindable(96),
        class: className,
        actions,
        children,
    }: {
        title: string;
        subtitle?: string;
        onclose: () => void;
        width?: number;
        height?: number;
        x?: number;
        y?: number;
        class?: string;
        actions?: Snippet;
        children: Snippet;
    } = $props();

    let drag: { dx: number; dy: number } | undefined;

    function begin(event: PointerEvent): void {
        if ((event.target as HTMLElement).closest("button, input")) return;
        drag = { dx: event.clientX - x, dy: event.clientY - y };
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    function move(event: PointerEvent): void {
        if (!drag) return;
        // Keep the title bar reachable.
        x = Math.max(-width + 80, Math.min(window.innerWidth - 80, event.clientX - drag.dx));
        y = Math.max(0, Math.min(window.innerHeight - 32, event.clientY - drag.dy));
    }
    function end(): void {
        drag = undefined;
    }
</script>

<!-- A non-modal window that floats over the app: drag the title bar, resize from the corner, close with the X. -->
<div
    role="dialog"
    aria-label={title}
    class={cn("fixed z-[45] flex min-h-40 min-w-64 resize flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-2xl", className)}
    style="left: {x}px; top: {y}px; width: {width}px; height: {height}px; max-width: 96vw; max-height: 92vh;"
>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="flex h-9 shrink-0 cursor-grab touch-none items-center gap-2 border-b border-border bg-muted/30 pr-1.5 pl-3 active:cursor-grabbing" onpointerdown={begin} onpointermove={move} onpointerup={end} onpointercancel={end}>
        <div class="min-w-0 flex-1 truncate text-sm font-medium">
            {title}{#if subtitle}<span class="ml-2 font-normal text-muted-foreground">{subtitle}</span>{/if}
        </div>
        {@render actions?.()}
        <button type="button" class="grid size-6 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close" onclick={onclose}>
            <X class="size-4" aria-hidden="true" />
        </button>
    </div>
    <div class="flex min-h-0 flex-1 flex-col">{@render children()}</div>
</div>
