<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";

    import { cn } from "../../../lib/utils";

    let { class: className, children, ...restProps }: HTMLAttributes<HTMLElement> = $props();
</script>

<div class={cn("p-4 pt-0", className)} {...restProps as any}>
    {@render children?.()}
</div>
