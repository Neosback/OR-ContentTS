<script lang="ts">
    import History from "@lucide/svelte/icons/history";
    import Redo2 from "@lucide/svelte/icons/redo-2";
    import Undo2 from "@lucide/svelte/icons/undo-2";

    import { formatMapSquareLabel } from "../../../mapeditor/map-editor-history-apply";
    import { Button } from "../../components/ui/button";
    import { useEditorState } from "../editor-state.svelte";
    import PanelFrame from "./PanelFrame.svelte";

    const editor = useEditorState();
    const host = editor.host;
    const history = $derived(editor.history.current);
    const entries = $derived([...history.entries].reverse());

    const formatTime = (timestamp: number): string =>
        new Date(timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
</script>

<PanelFrame>
    <div class="flex h-full min-h-0 flex-col gap-2 p-2 text-card-foreground">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <History class="size-3.5 shrink-0" aria-hidden="true" />
            <span>Ctrl+Z undo · Ctrl+Y redo</span>
        </div>

        <div class="flex gap-1">
            <Button variant="outline" size="sm" class="h-7 flex-1 gap-1 text-xs" disabled={!history.canUndo} onclick={() => host.undoHistory()} title="Undo (Ctrl+Z)">
                <Undo2 class="size-3" />
                Undo
            </Button>
            <Button variant="outline" size="sm" class="h-7 flex-1 gap-1 text-xs" disabled={!history.canRedo} onclick={() => host.redoHistory()} title="Redo (Ctrl+Y)">
                <Redo2 class="size-3" />
                Redo
            </Button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto rounded-md border border-border/80 bg-muted/10">
            {#if history.entries.length === 0}
                <p class="p-3 text-xs text-muted-foreground">Terrain and paint edits appear here as you work.</p>
            {:else}
                <ul class="divide-y divide-border/60 p-1">
                    {#each entries as entry, displayIdx (entry.id)}
                        {@const index = history.entries.length - 1 - displayIdx}
                        <li
                            class="flex items-start gap-2 rounded px-2 py-1.5 text-xs {index === history.currentIndex ? 'bg-primary/10 ring-1 ring-primary/30' : ''} {index > history.currentIndex ? 'opacity-50' : ''}"
                        >
                            <span class="w-5 shrink-0 font-mono text-[10px] text-muted-foreground">{index + 1}.</span>
                            <span class="shrink-0 font-mono text-[10px] text-muted-foreground">{formatTime(entry.timestamp)}</span>
                            <span class="min-w-0 flex-1">
                                <span class="block truncate font-medium">{entry.label}</span>
                                <span class="block truncate text-[10px] text-muted-foreground">
                                    {entry.tileCount} tile{entry.tileCount === 1 ? "" : "s"}{entry.mapIds.length > 0
                                        ? ` · ${entry.mapIds.map((id) => formatMapSquareLabel(id)).join(", ")}`
                                        : ""}
                                </span>
                            </span>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    </div>
</PanelFrame>
