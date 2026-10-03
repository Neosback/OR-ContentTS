<script lang="ts">
    import Undo2 from "@lucide/svelte/icons/undo-2";

    import { getObjectDeleteModel, OBJECT_DELETE_KINDS } from "../../../mapeditor/plugins/builtins/object-delete-model";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;
    const hud = editor.hud;

    const view = $derived(
        editor.read(() => {
            const model = getObjectDeleteModel(host);
            return { mode: model.mode, kinds: { ...model.kinds }, count: model.previewCount, label: model.previewLabel, deleted: model.deleted };
        }),
    );
    const radius = $derived(hud.brushSize);
    const side = $derived(radius * 2 + 1);
</script>

<div class="map-editor-panel flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-xs">
    <section class="grid gap-1.5">
        <h3 class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">What a click removes</h3>
        <div class="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Delete mode">
            {#each [["single", "One object", "The object under the cursor"], ["area", "Brush area", `Everything in the ${side} × ${side} brush`]] as [mode, label, hint] (mode)}
                <button
                    type="button"
                    role="radio"
                    aria-checked={view.mode === mode}
                    class={cn(
                        "flex cursor-pointer flex-col items-start rounded-md border px-2 py-1.5 text-left transition-colors",
                        view.mode === mode ? "border-primary bg-primary/10" : "border-border/70 hover:bg-muted/40",
                    )}
                    onclick={() => getObjectDeleteModel(host).setMode(mode as "single" | "area")}
                >
                    <span class="font-medium">{label}</span>
                    <span class="text-[10px] text-muted-foreground">{hint}</span>
                </button>
            {/each}
        </div>
        {#if view.mode === "area"}
            <p class="text-[11px] text-muted-foreground">Size and shape come from the brush bar below (radius {radius}).</p>
        {/if}
    </section>

    <section class="grid gap-1.5">
        <h3 class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Only these kinds</h3>
        <div class="grid grid-cols-2 gap-1">
            {#each OBJECT_DELETE_KINDS as { kind, label, hint } (kind)}
                <label class="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-2 py-1 hover:bg-muted/40" title={hint}>
                    <input type="checkbox" class="size-3.5 accent-primary" checked={view.kinds[kind]} onchange={(event) => getObjectDeleteModel(host).setKind(kind, event.currentTarget.checked)} />
                    {label}
                </label>
            {/each}
        </div>
    </section>

    <section class={cn("rounded-md border p-2", view.count > 0 ? "border-red-500/50 bg-red-500/10" : "border-border/60 bg-muted/20")} aria-live="polite">
        {#if view.count > 0}
            <p class="font-medium">Next click removes {view.count === 1 ? "this object" : `${view.count} objects`}</p>
            <p class="mt-0.5 font-mono text-[11px] text-muted-foreground">{view.label}{view.count > 1 ? ` and ${view.count - 1} more` : ""}</p>
        {:else}
            <p class="text-muted-foreground">{view.mode === "area" ? "Move the brush over objects to preview what it clears." : "Hover an object to preview it in red."}</p>
        {/if}
    </section>

    <section class="flex items-center justify-between gap-2">
        <p class="text-muted-foreground">Removed so far: <span class="font-mono text-foreground">{view.deleted}</span></p>
        <button type="button" class="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-input px-2 hover:bg-muted" onclick={() => host.undoHistory()}>
            <Undo2 class="size-3.5" aria-hidden="true" /> Undo
        </button>
    </section>

    <ul class="grid gap-0.5 text-[11px] text-muted-foreground">
        <li><span class="font-medium text-foreground">Click</span> removes the preview.</li>
        <li><span class="font-medium text-foreground">Hold the right button</span> and sweep to remove as you go.</li>
        <li><span class="font-medium text-foreground">Delete</span> / <span class="font-medium text-foreground">Backspace</span> removes it too. Each action is one Ctrl+Z.</li>
    </ul>
</div>
