<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";

    import { cn } from "../../../lib/utils";

    let { class: className, children, ...restProps }: HTMLAttributes<HTMLElement> = $props();
</script>

<h3 class={cn("text-lg font-semibold leading-none tracking-tight", className)} {...restProps as any}>
    {@render children?.()}
</h3>
