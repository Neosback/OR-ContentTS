<script lang="ts">
    import { buttonVariants, type ButtonSize, type ButtonVariant } from "./variants";
    import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

    import { cn } from "../../../lib/utils";

    type Props = (HTMLButtonAttributes & HTMLAnchorAttributes) & {
        variant?: ButtonVariant;
        size?: ButtonSize;
        ref?: HTMLElement | null;
    };

    let {
        class: className,
        variant = "default",
        size = "default",
        ref = $bindable(null),
        href = undefined,
        type = "button",
        disabled,
        children,
        ...restProps
    }: Props = $props();
</script>

{#if href}
    <a bind:this={ref} class={cn(buttonVariants({ variant, size }), className)} {href} aria-disabled={disabled} {...restProps}>
        {@render children?.()}
    </a>
{:else}
    <button bind:this={ref} class={cn(buttonVariants({ variant, size }), className)} {type} {disabled} {...restProps}>
        {@render children?.()}
    </button>
{/if}
