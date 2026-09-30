<script lang="ts">
    import { ScrollArea as ScrollAreaPrimitive } from "bits-ui";

    import { cn } from "../../../lib/utils";
    import ScrollAreaScrollbar from "./scroll-area-scrollbar.svelte";

    let {
        ref = $bindable(null),
        viewportRef = $bindable(null),
        class: className,
        orientation = "vertical",
        children,
        ...restProps
    }: Omit<ScrollAreaPrimitive.RootProps, "type"> & {
        orientation?: "vertical" | "horizontal" | "both";
        viewportRef?: HTMLElement | null;
    } = $props();
</script>

<ScrollAreaPrimitive.Root bind:ref type="hover" class={cn("relative overflow-hidden", className)} {...restProps}>
    <ScrollAreaPrimitive.Viewport bind:ref={viewportRef} class="h-full w-full rounded-[inherit]">
        {@render children?.()}
    </ScrollAreaPrimitive.Viewport>
    {#if orientation === "vertical" || orientation === "both"}
        <ScrollAreaScrollbar orientation="vertical" />
    {/if}
    {#if orientation === "horizontal" || orientation === "both"}
        <ScrollAreaScrollbar orientation="horizontal" />
    {/if}
    <ScrollAreaPrimitive.Corner />
</ScrollAreaPrimitive.Root>
