<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";

    import { cn } from "../../../lib/utils";

    let { class: className, children, ...restProps }: HTMLAttributes<HTMLElement> = $props();
</script>

<p class={cn("text-sm text-muted-foreground", className)} {...restProps as any}>
    {@render children?.()}
</p>
