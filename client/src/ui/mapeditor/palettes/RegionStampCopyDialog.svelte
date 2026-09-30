<script lang="ts">
    import { DEFAULT_REGION_STAMP_COPY_OPTIONS, REGION_STAMP_COPY_OPTION_ROWS, hasAnyRegionStampCopyOption, type RegionStampCopyOptions } from "../../../mapeditor/plugins/builtins/region-stamp-copy-options";
    import { Button } from "../../components/ui/button";
    import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
    import { Label } from "../../components/ui/label";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;

    const open = $derived(editor.read(() => host.isRegionStampCopyDialogOpen()));
    let options = $state<RegionStampCopyOptions>({ ...DEFAULT_REGION_STAMP_COPY_OPTIONS });

    // Seed the checkboxes from the host each time the dialog opens.
    $effect(() => {
        if (open) options = { ...host.getRegionStampCopyOptions() };
    });

    function setAll(value: boolean): void {
        const next = { ...DEFAULT_REGION_STAMP_COPY_OPTIONS };
        for (const key of Object.keys(next) as (keyof RegionStampCopyOptions)[]) next[key] = value;
        options = next;
    }
</script>

<Dialog
    {open}
    onOpenChange={(next) => {
        if (!next) host.cancelRegionStampCopyDialog();
    }}
>
    <DialogContent class="max-w-md">
        <DialogHeader>
            <DialogTitle>Copy region</DialogTitle>
            <DialogDescription>
                Choose what to include in the stamp. Paste preview shows the real terrain and objects at full opacity while you move and rotate.
            </DialogDescription>
        </DialogHeader>

        <div class="flex items-center justify-end gap-2 py-1">
            <Button size="sm" variant="outline" onclick={() => setAll(true)}>Select all</Button>
            <Button size="sm" variant="outline" onclick={() => setAll(false)}>Clear all</Button>
        </div>

        <div class="max-h-[min(50vh,24rem)] space-y-2 overflow-y-auto pr-1">
            {#each REGION_STAMP_COPY_OPTION_ROWS as row (row.key)}
                <label class="flex cursor-pointer items-start gap-3 rounded-md border border-border/70 bg-muted/20 px-3 py-2.5">
                    <input type="checkbox" class="mt-0.5 size-4 shrink-0 accent-primary" bind:checked={options[row.key]} />
                    <span class="min-w-0">
                        <Label class="text-sm font-medium leading-none">{row.label}</Label>
                        <p class="mt-1 text-xs text-muted-foreground">{row.description}</p>
                    </span>
                </label>
            {/each}
        </div>

        <DialogFooter class="gap-2 sm:gap-0">
            <Button variant="outline" onclick={() => host.cancelRegionStampCopyDialog()}>Cancel</Button>
            <Button disabled={!hasAnyRegionStampCopyOption(options)} onclick={() => host.confirmRegionStampCopy({ ...options })}>Copy & paste</Button>
        </DialogFooter>
    </DialogContent>
</Dialog>
