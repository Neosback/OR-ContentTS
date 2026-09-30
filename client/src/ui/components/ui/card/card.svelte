<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";

    import { cn } from "../../../lib/utils";

    let { class: className, children, ...restProps }: HTMLAttributes<HTMLElement> = $props();
</script>

<div class={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...restProps as any}>
    {@render children?.()}
</div>
