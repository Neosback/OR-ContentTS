<script lang="ts">
    import ArrowDown from "@lucide/svelte/icons/arrow-down";
    import ArrowUp from "@lucide/svelte/icons/arrow-up";

    import { TOOL_RAIL, VIEWPORT_BAR } from "../../mapeditor/bar-kinds";
    import { getBarModel } from "../../mapeditor/bar-model";
    import { Button } from "../components/ui/button";
    import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
    import { customizeBar } from "./customize-bar.svelte";
    import { useEditorState } from "./editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;

    const kind = $derived(customizeBar.open === "tools" ? TOOL_RAIL : VIEWPORT_BAR);
    const model = $derived.by(() => {
        editor.snapshot.current;
        return getBarModel(host, kind);
    });
    const open = $derived(customizeBar.open !== undefined);
</script>

<Dialog
    {open}
    onOpenChange={(next) => {
        if (!next) customizeBar.open = undefined;
    }}
>
    <DialogContent class="max-w-md">
        <DialogHeader>
            <DialogTitle>Customize the {kind.title.toLowerCase()}</DialogTitle>
            <DialogDescription>Tick what the bar shows and move items up or down to set their order. Changes apply at once and are remembered.</DialogDescription>
        </DialogHeader>
        <ul class="max-h-[min(50vh,24rem)] divide-y divide-border/60 overflow-y-auto rounded-md border border-border/70" aria-label="Bar items">
            {#each model.items as item, index (item.id)}
                <li class="flex items-center gap-2 px-2 py-1.5">
                    <input type="checkbox" class="size-4 shrink-0 accent-primary" checked={item.visible} aria-label={`Show ${item.label}`} onchange={(event) => model.setVisible(item.id, event.currentTarget.checked)} />
                    <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium">{item.label}</span>
                        <span class="block truncate text-[11px] text-muted-foreground">{item.description}</span>
                    </span>
                    <button type="button" class="grid size-7 shrink-0 cursor-pointer place-items-center rounded border border-input hover:bg-muted disabled:cursor-default disabled:opacity-30" aria-label={`Move ${item.label} up`} disabled={index === 0} onclick={() => model.move(item.id, -1)}>
                        <ArrowUp class="size-3.5" aria-hidden="true" />
                    </button>
                    <button type="button" class="grid size-7 shrink-0 cursor-pointer place-items-center rounded border border-input hover:bg-muted disabled:cursor-default disabled:opacity-30" aria-label={`Move ${item.label} down`} disabled={index === model.items.length - 1} onclick={() => model.move(item.id, 1)}>
                        <ArrowDown class="size-3.5" aria-hidden="true" />
                    </button>
                </li>
            {/each}
        </ul>
        <div class="flex justify-between">
            <Button variant="outline" size="sm" onclick={() => model.reset()}>Reset to default</Button>
            <Button size="sm" onclick={() => (customizeBar.open = undefined)}>Done</Button>
        </div>
    </DialogContent>
</Dialog>
