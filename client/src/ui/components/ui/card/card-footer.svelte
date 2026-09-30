<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";

    import { cn } from "../../../lib/utils";

    let { class: className, children, ...restProps }: HTMLAttributes<HTMLElement> = $props();
</script>

<div class={cn("flex items-center p-4 pt-0", className)} {...restProps as any}>
    {@render children?.()}
</div>
