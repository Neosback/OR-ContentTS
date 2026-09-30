<script lang="ts">
    import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
    import Check from "@lucide/svelte/icons/check";
    import type { Snippet } from "svelte";

    import { cn } from "../../../lib/utils";

    let {
        ref = $bindable(null),
        checked = $bindable(false),
        class: className,
        children: childrenProp,
        ...restProps
    }: DropdownMenuPrimitive.CheckboxItemProps & { children?: Snippet } = $props();
</script>

<DropdownMenuPrimitive.CheckboxItem
    bind:ref
    bind:checked
    class={cn(
        "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
    )}
    {...restProps}
>
    {#snippet children({ checked })}
        <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
            {#if checked}
                <Check class="h-4 w-4" />
            {/if}
        </span>
        {@render childrenProp?.()}
    {/snippet}
</DropdownMenuPrimitive.CheckboxItem>
