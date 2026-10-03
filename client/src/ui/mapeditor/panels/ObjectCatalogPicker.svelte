<script lang="ts">
    import { onMount } from "svelte";

    import { getObjectCatalog, type CatalogEntry } from "../../../mapeditor/object-catalog";
    import { getObjectActionModel, LOC_DRAG_TYPE } from "../../../mapeditor/plugins/builtins/object-action-model";
    import { placementProblem } from "../../../mapeditor/plugins/builtins/object-edit-runtime";
    import VirtualList from "../../components/VirtualList.svelte";
    import { cn } from "../../lib/utils";
    import { getObjectThumbnails } from "../inspector/object-thumbnails";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;
    const catalog = getObjectCatalog(host);

    let query = $state("");
    let results = $state<CatalogEntry[]>([]);
    let progress = $state({ scanned: catalog.scanned, total: catalog.total });

    function refresh(): void {
        results = catalog.search(query);
        progress = { scanned: catalog.scanned, total: catalog.total };
    }
    onMount(() => {
        const off = catalog.subscribe(refresh);
        catalog.start();
        refresh();
        return off;
    });
    $effect(() => {
        query;
        refresh();
    });

    const view = $derived(
        editor.read(() => {
            const actions = getObjectActionModel(host);
            const selected = host.selectedObject;
            return { candidate: actions.candidate, mode: actions.mode, canReplace: selected?.kind === "loc" };
        }),
    );

    /** Dragging a row onto the 3D view shows the placement ghost under the cursor; dropping places one object. */
    function beginDrag(event: DragEvent, id: number): void {
        if (!event.dataTransfer) return;
        event.dataTransfer.setData(LOC_DRAG_TYPE, String(id));
        event.dataTransfer.setData("text/plain", `object:${id}`);
        event.dataTransfer.effectAllowed = "copy";
        host.setEditorTool("object-place");
        getObjectActionModel(host).startPlace(id);
    }
    function endDrag(): void {
        getObjectActionModel(host).cancel();
    }

    const thumbnails = getObjectThumbnails(host);
    /** Fills an <img> with the object's picture once the queue has drawn it (rows that scroll away withdraw their request). */
    function thumb(node: HTMLImageElement, id: number): { update: (next: number) => void; destroy: () => void } {
        let cancel = (): void => undefined;
        const load = (key: number): void => {
            cancel();
            node.removeAttribute("src");
            cancel = thumbnails.request(key, (url) => {
                if (url) node.src = url;
            });
        };
        load(id);
        return { update: load, destroy: () => cancel() };
    }

    function problemFor(id: number): string | undefined {
        try {
            return placementProblem(host.locTypeLoader.load(id));
        } catch {
            return "No definition";
        }
    }
    const candidateProblem = $derived(view.candidate === undefined ? undefined : problemFor(view.candidate));
    const candidateName = $derived(results.find((entry) => entry.id === view.candidate)?.name ?? (view.candidate === undefined ? "" : `Loc #${view.candidate}`));
</script>

<section class="grid gap-1.5" aria-label="Place or replace an object">
    <h3 class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Place or replace</h3>
    <input
        type="search"
        bind:value={query}
        placeholder="Search objects by name or id"
        aria-label="Search objects"
        class="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
    />
    {#if progress.scanned < progress.total}
        <p class="text-[10px] text-muted-foreground">Reading object names… {Math.round((progress.scanned / Math.max(1, progress.total)) * 100)}%</p>
    {/if}
    {#if query.trim()}
        <p class="text-[10px] text-muted-foreground">{results.length}{results.length >= 5000 ? "+" : ""} match{results.length === 1 ? "" : "es"}</p>
        <VirtualList items={results} rowHeight={36} label="Matching objects" class="h-48 rounded-md border border-border/70">
            {#snippet row(entry: CatalogEntry)}
                {@const problem = problemFor(entry.id)}
                <button
                    type="button"
                    role="option"
                    aria-selected={view.candidate === entry.id}
                    title={problem}
                    draggable={!problem}
                    class={cn(
                        "flex h-full w-full cursor-pointer items-center gap-2 px-2 text-left hover:bg-muted/50",
                        view.candidate === entry.id && "bg-primary/10",
                        problem && "opacity-50",
                    )}
                    onclick={() => getObjectActionModel(host).setCandidate(entry.id)}
                    ondragstart={(event) => beginDrag(event, entry.id)}
                    ondragend={endDrag}
                >
                    <span class="grid size-7 shrink-0 place-items-center overflow-hidden rounded bg-muted/40 text-[10px] text-muted-foreground">
                        <img use:thumb={entry.id} alt="" class="size-7 object-contain" draggable="false" onerror={(event) => event.currentTarget.removeAttribute("src")} />
                    </span>
                    <span class="min-w-0 flex-1 truncate">{entry.name}</span>
                    <span class="shrink-0 font-mono text-[10px] text-muted-foreground">#{entry.id}</span>
                </button>
            {/snippet}
            {#snippet empty()}
                <p class="px-2 py-1.5 text-muted-foreground">{progress.scanned < progress.total ? "Nothing yet, still reading names…" : "No object matches."}</p>
            {/snippet}
        </VirtualList>
    {/if}
    {#if view.candidate !== undefined}
        <div class="grid gap-1.5 rounded-md border border-border/70 bg-muted/20 p-2">
            <p class="truncate"><span class="font-medium">{candidateName}</span> <span class="font-mono text-[10px] text-muted-foreground">#{view.candidate}</span></p>
            {#if candidateProblem}
                <p class="text-[11px] text-amber-400">{candidateProblem}</p>
            {/if}
            <div class="flex flex-wrap gap-1.5">
                <button
                    type="button"
                    class="h-7 cursor-pointer rounded-md border border-input px-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!!candidateProblem}
                    onclick={() => getObjectActionModel(host).startPlace(view.candidate)}
                    title="Show it under the cursor and click to place (R turns it, Esc ends)"
                >
                    Place
                </button>
                <button
                    type="button"
                    class="h-7 cursor-pointer rounded-md border border-input px-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!!candidateProblem || !view.canReplace}
                    onpointerenter={() => getObjectActionModel(host).setPreviewReplace(true)}
                    onpointerleave={() => getObjectActionModel(host).setPreviewReplace(false)}
                    onfocus={() => getObjectActionModel(host).setPreviewReplace(true)}
                    onblur={() => getObjectActionModel(host).setPreviewReplace(false)}
                    onclick={() => view.candidate !== undefined && getObjectActionModel(host).request({ type: "replace", locTypeId: view.candidate })}
                    title={view.canReplace ? "Swap the selected object for this one (hover to preview)" : "Select a placed object first"}
                >
                    Replace selected
                </button>
            </div>
        </div>
    {/if}
</section>
