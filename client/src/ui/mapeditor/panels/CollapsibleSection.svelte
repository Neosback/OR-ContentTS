<script lang="ts">
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    import type { Snippet } from "svelte";

    import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";

    let { title, open = $bindable(true), children }: { title: string; open?: boolean; children: Snippet } = $props();
</script>

<Collapsible bind:open class="group/collapsible border-b border-border/70 last:border-b-0">
    <CollapsibleTrigger class="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold hover:bg-muted/40">
        <span>{title}</span>
        <ChevronDown class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 {open ? 'rotate-180' : ''}" />
    </CollapsibleTrigger>
    <CollapsibleContent>{@render children()}</CollapsibleContent>
</Collapsible>
