<script lang="ts">
    import Check from "@lucide/svelte/icons/check";
    import Copy from "@lucide/svelte/icons/copy";

    import { Button } from "../components/ui/button";
    import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
    import type { InterfaceEditorState } from "./interface-editor-editor.svelte";

    let { state: editor }: { state: InterfaceEditorState } = $props();
    let componentCopied = $state(false);
    let exportCopied = $state(false);

    async function copyComponent(): Promise<void> {
        const data = editor.componentJsonData;
        if (!data) return;
        await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        componentCopied = true;
        window.setTimeout(() => (componentCopied = false), 2000);
    }

    async function copyExport(): Promise<void> {
        if (!editor.exportJson) return;
        await navigator.clipboard.writeText(editor.exportJson);
        exportCopied = true;
        window.setTimeout(() => (exportCopied = false), 2000);
    }
</script>

<Dialog bind:open={editor.componentJsonOpen}>
    <DialogContent class="flex max-h-[80vh] max-w-4xl flex-col">
        <DialogHeader class="flex flex-row items-center justify-between">
            <DialogTitle>Component {editor.componentJsonData?.id ?? ""} JSON</DialogTitle>
            <Button size="sm" variant="outline" class="gap-2" disabled={!editor.componentJsonData} onclick={() => void copyComponent()}>
                {#if componentCopied}<Check class="size-3.5" /> Copied{:else}<Copy class="size-3.5" /> Copy JSON{/if}
            </Button>
        </DialogHeader>
        <div class="flex-1 overflow-auto rounded border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap break-words">
            {editor.componentJsonData ? JSON.stringify(editor.componentJsonData, null, 2) : "No data"}
        </div>
    </DialogContent>
</Dialog>

<Dialog bind:open={editor.exportOpen}>
    <DialogContent class="flex max-h-[85vh] max-w-4xl flex-col">
        <DialogHeader class="flex flex-row items-center justify-between">
            <DialogTitle class="text-base">
                InterfaceViewer JSON
                {#if editor.exportInterfaceId != null}
                    <span class="font-mono text-muted-foreground"> · #{editor.exportInterfaceId}</span>
                {/if}
            </DialogTitle>
            <Button size="sm" variant="outline" class="gap-2" disabled={!editor.exportJson || editor.exportBusy} onclick={() => void copyExport()}>
                {#if exportCopied}<Check class="size-3.5" /> Copied{:else}<Copy class="size-3.5" /> Copy JSON{/if}
            </Button>
        </DialogHeader>
        <div class="min-h-0 flex-1 overflow-auto rounded border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap break-words">
            {#if editor.exportBusy}
                <span class="text-muted-foreground">Running ComponentDecoder (local cache)…</span>
            {:else if editor.exportError}
                <span class="text-destructive">{editor.exportError}</span>
            {:else if editor.exportJson}
                {editor.exportJson}
            {:else}
                <span class="text-muted-foreground">No data.</span>
            {/if}
        </div>
    </DialogContent>
</Dialog>
