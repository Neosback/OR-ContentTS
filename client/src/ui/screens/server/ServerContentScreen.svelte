<script lang="ts">
    import { onMount } from "svelte";
    import Loader from "@lucide/svelte/icons/loader-circle";
    import RotateCw from "@lucide/svelte/icons/rotate-cw";
    import Search from "@lucide/svelte/icons/search";
    import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
    import Undo2 from "@lucide/svelte/icons/undo-2";

    import {
        getActiveOpenRuneProjectRuntime,
        refreshActiveOpenRuneProjectRuntime,
        subscribeActiveOpenRuneProjectRuntime,
        syncActiveOpenRuneProjectRuntime,
        type ActiveOpenRuneProjectRuntimeState,
    } from "../../../lib/active-openrune-project-runtime";
    import {
        cacheSetupKind,
        getActiveProfileIdAsync,
        loadLocalCacheProfilesAsync,
        type LocalCacheProfile,
    } from "../../../lib/local-cache-profiles";
    import {
        blockDisplayName,
        blockKey,
        blockTitle,
        editableFields,
        listServerBlocks,
        parseFieldInput,
        readOnlyFields,
        relocateBlock,
        tableCounts,
        SERVER_TABLE_LABELS,
        type EditableServerField,
    } from "../../../project/openrune-server-content";
    import {
        OpenRuneServerWriteError,
        updateOpenRuneServerField,
        type OpenRuneServerDefinitionBlock,
        type OpenRuneServerTable,
    } from "../../../project/openrune-server-toml";
    import VirtualList from "../../components/VirtualList.svelte";
    import { link } from "../../lib/router.svelte";
    import { errorMessage, notifyError, notifySuccess } from "../../lib/notify";
    import { cn } from "../../lib/utils";

    let profile = $state<LocalCacheProfile | undefined>();
    let runtime = $state<ActiveOpenRuneProjectRuntimeState | null>(getActiveOpenRuneProjectRuntime());
    let loading = $state(true);
    let loadError = $state<string | undefined>();

    let table = $state<OpenRuneServerTable>("npc");
    let query = $state("");
    let selected = $state<{ table: OpenRuneServerTable; sourcePath: string; ordinal: number } | undefined>();
    let drafts = $state<Record<string, string>>({});
    // The block text the drafts were typed against; if the file moves on underneath them, the user is told.
    let draftBase = $state<string | undefined>();
    let saving = $state<string | undefined>();
    let staleMessage = $state<string | undefined>();

    const index = $derived(runtime?.snapshot.serverToml);
    const canEdit = $derived(runtime?.snapshot.capabilities.sourceEditing ?? false);
    const counts = $derived(index ? tableCounts(index) : []);
    const blocks = $derived(index ? listServerBlocks(index, table, query) : []);
    const block = $derived(index && selected ? relocateBlock(index, selected as OpenRuneServerDefinitionBlock) : undefined);
    const fields = $derived(block ? editableFields(block) : []);
    const others = $derived(block ? readOnlyFields(block) : []);
    const dirty = $derived(Object.keys(drafts).length > 0);
    const changedOnDisk = $derived(dirty && block !== undefined && draftBase !== undefined && block.rawText !== draftBase);

    onMount(() => {
        const stop = subscribeActiveOpenRuneProjectRuntime((state) => (runtime = state));
        void (async () => {
            try {
                const [profiles, activeId] = await Promise.all([loadLocalCacheProfilesAsync(), getActiveProfileIdAsync()]);
                profile = profiles.find((candidate) => candidate.id === activeId);
                if (profile && cacheSetupKind(profile) === "openrune") {
                    await syncActiveOpenRuneProjectRuntime(profile);
                }
            } catch (error) {
                loadError = errorMessage(error);
            } finally {
                loading = false;
            }
        })();
        return stop;
    });

    function selectBlock(next: OpenRuneServerDefinitionBlock): void {
        selected = { table: next.table, sourcePath: next.sourcePath, ordinal: next.ordinal };
        clearDrafts();
    }

    function clearDrafts(): void {
        drafts = {};
        draftBase = undefined;
        staleMessage = undefined;
    }

    function pickTable(next: OpenRuneServerTable): void {
        table = next;
        query = "";
        selected = undefined;
        clearDrafts();
    }

    function shown(field: EditableServerField): string {
        return drafts[field.name] ?? String(field.value);
    }

    function edit(field: EditableServerField, text: string): void {
        if (draftBase === undefined && block) draftBase = block.rawText;
        if (text === String(field.value)) {
            const { [field.name]: _discarded, ...rest } = drafts;
            drafts = rest;
            if (Object.keys(rest).length === 0) draftBase = undefined;
        } else {
            drafts = { ...drafts, [field.name]: text };
        }
    }

    function revert(field: EditableServerField): void {
        edit(field, String(field.value));
    }

    async function reload(): Promise<void> {
        if (!profile) return;
        try {
            await refreshActiveOpenRuneProjectRuntime(profile);
            clearDrafts();
        } catch (error) {
            notifyError(errorMessage(error));
        }
    }

    async function save(field: EditableServerField): Promise<void> {
        const runtimeNow = runtime;
        if (!runtimeNow || !block || !profile || saving) return;
        const parsed = parseFieldInput(field.kind, drafts[field.name] ?? String(field.value));
        if (!parsed.ok) {
            notifyError(`${field.name}: ${parsed.message}`);
            return;
        }
        saving = field.name;
        try {
            await updateOpenRuneServerField(runtimeNow.snapshot.fileSystem, block, field.name, parsed.value);
            await refreshActiveOpenRuneProjectRuntime(profile);
            const { [field.name]: _saved, ...rest } = drafts;
            drafts = rest;
            const next = runtime && selected ? relocateBlock(runtime.snapshot.serverToml, selected as OpenRuneServerDefinitionBlock) : undefined;
            draftBase = Object.keys(rest).length > 0 ? next?.rawText : undefined;
            staleMessage = undefined;
            notifySuccess(`Saved ${field.name} in ${block.sourcePath}`);
        } catch (error) {
            if (error instanceof OpenRuneServerWriteError && (error.code === "STALE_SOURCE" || error.code === "BLOCK_NOT_FOUND")) {
                staleMessage = error.message;
            } else {
                notifyError(errorMessage(error));
            }
        } finally {
            saving = undefined;
        }
    }

    function fieldError(field: EditableServerField): string | undefined {
        const text = drafts[field.name];
        if (text === undefined) return undefined;
        const parsed = parseFieldInput(field.kind, text);
        return parsed.ok ? undefined : parsed.message;
    }
</script>

<div class="flex h-full min-h-0 w-full flex-col" aria-label="Server content">
    {#if loading}
        <p class="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader class="size-4 animate-spin" aria-hidden="true" /> Reading the OpenRune project...</p>
    {:else if loadError}
        <p class="m-6 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs break-words text-destructive select-text">{loadError}</p>
    {:else if !runtime || !index}
        <div class="m-6 max-w-lg space-y-2 rounded-xl border border-dashed border-border p-5">
            <h1 class="text-lg font-semibold">Server content</h1>
            <p class="text-sm text-muted-foreground">
                Edit the OpenRune server's items, NPCs, objects and more straight from its TOML source files. Choose an OpenRune project as your active setup first.
            </p>
            <a href="/cache-test" use:link class="inline-block rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Open Cache Repository</a>
        </div>
    {:else}
        <header class="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
            <h1 class="text-sm font-semibold">Server content</h1>
            <span class="truncate text-xs text-muted-foreground">{profile?.name} · {index.blocks.length.toLocaleString("en-US")} definitions in {index.files.length.toLocaleString("en-US")} files</span>
            {#if !canEdit}
                <span class="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-400" title="This project folder was opened read-only">Read-only</span>
            {/if}
            <button
                type="button"
                class="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                title="Re-read the project from disk"
                onclick={reload}
            >
                <RotateCw class="size-3.5" aria-hidden="true" /> Reload
            </button>
        </header>

        <div class="flex min-h-0 flex-1">
            <nav class="w-44 shrink-0 overflow-y-auto border-r border-border py-1" aria-label="Server tables">
                {#each counts as row (row.table)}
                    <button
                        type="button"
                        class={cn(
                            "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs",
                            row.table === table ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                            row.count === 0 && row.table !== table && "opacity-50",
                        )}
                        aria-current={row.table === table ? "true" : undefined}
                        onclick={() => pickTable(row.table)}
                    >
                        <span class="truncate">{row.label}</span>
                        <span class="font-mono text-[10px] tabular-nums">{row.count.toLocaleString("en-US")}</span>
                    </button>
                {/each}
            </nav>

            <section class="flex w-80 shrink-0 flex-col border-r border-border" aria-label="{SERVER_TABLE_LABELS[table]} list">
                <label class="flex items-center gap-2 border-b border-border px-3 py-2">
                    <Search class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <input
                        type="search"
                        class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        placeholder="Search id, name or file"
                        bind:value={query}
                    />
                    <span class="text-[10px] text-muted-foreground tabular-nums">{blocks.length.toLocaleString("en-US")}</span>
                </label>
                <VirtualList items={blocks} rowHeight={44} class="min-h-0 flex-1" label="{SERVER_TABLE_LABELS[table]}">
                    {#snippet row(item)}
                        {@const active = block !== undefined && blockKey(item) === blockKey(block)}
                        <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            class={cn("flex h-full w-full flex-col justify-center px-3 text-left", active ? "bg-primary/15" : "hover:bg-muted/50")}
                            onclick={() => selectBlock(item)}
                        >
                            <span class="truncate text-sm">{blockDisplayName(item) ?? blockTitle(item)}</span>
                            <span class="truncate font-mono text-[10px] text-muted-foreground">
                                {blockDisplayName(item) ? `${blockTitle(item)} · ` : ""}{item.resolvedId !== undefined ? `#${item.resolvedId} · ` : ""}{item.sourcePath}
                            </span>
                        </button>
                    {/snippet}
                    {#snippet empty()}
                        <p class="p-4 text-xs text-muted-foreground">{query ? "Nothing matches that search." : `No ${SERVER_TABLE_LABELS[table].toLowerCase()} in this project.`}</p>
                    {/snippet}
                </VirtualList>
            </section>

            <section class="min-w-0 flex-1 overflow-y-auto p-4" aria-label="Definition">
                {#if !block}
                    <p class="text-sm text-muted-foreground">
                        {selected ? "That definition is no longer in the project." : "Pick a definition to see and edit its fields."}
                    </p>
                {:else}
                    <div class="mb-3">
                        <h2 class="text-base font-semibold break-words select-text">{blockDisplayName(block) ?? blockTitle(block)}</h2>
                        <p class="font-mono text-[11px] break-words text-muted-foreground select-text">
                            {blockTitle(block)}{block.resolvedId !== undefined ? ` · #${block.resolvedId}` : ""} · {block.sourcePath}:{block.startLine}
                        </p>
                    </div>

                    {#if changedOnDisk || staleMessage}
                        <div class="mb-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs" role="alert">
                            <TriangleAlert class="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
                            <div class="min-w-0 flex-1">
                                <p class="font-medium">This definition changed on disk.</p>
                                <p class="text-muted-foreground">{staleMessage ?? "Your unsaved edits were typed against an older version. Reload to see the current one."}</p>
                            </div>
                            <button type="button" class="shrink-0 rounded-md bg-primary px-2 py-1 text-primary-foreground" onclick={reload}>Reload</button>
                        </div>
                    {/if}

                    <ul class="divide-y divide-border rounded-md border border-border">
                        {#each fields as field (field.name)}
                            {@const problem = fieldError(field)}
                            <li class="flex items-center gap-3 px-3 py-2">
                                <label class="w-40 shrink-0 truncate font-mono text-xs text-muted-foreground" for="field-{field.name}" title={field.name}>{field.name}</label>
                                <div class="min-w-0 flex-1">
                                    {#if field.kind === "boolean"}
                                        <select
                                            id="field-{field.name}"
                                            class="w-full rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-60"
                                            disabled={!canEdit}
                                            value={shown(field)}
                                            onchange={(event) => edit(field, event.currentTarget.value)}
                                        >
                                            <option value="true">true</option>
                                            <option value="false">false</option>
                                        </select>
                                    {:else}
                                        <input
                                            id="field-{field.name}"
                                            type="text"
                                            inputmode={field.kind === "number" ? "decimal" : "text"}
                                            class={cn(
                                                "w-full rounded-md border bg-background px-2 py-1 text-sm disabled:opacity-60",
                                                problem ? "border-destructive" : "border-border",
                                            )}
                                            disabled={!canEdit}
                                            value={shown(field)}
                                            oninput={(event) => edit(field, event.currentTarget.value)}
                                            onkeydown={(event) => event.key === "Enter" && void save(field)}
                                        />
                                    {/if}
                                    {#if problem}<p class="mt-0.5 text-[11px] text-destructive">{problem}</p>{/if}
                                </div>
                                {#if drafts[field.name] !== undefined}
                                    <button
                                        type="button"
                                        class="grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                                        aria-label="Revert {field.name}"
                                        title="Revert to the saved value"
                                        onclick={() => revert(field)}
                                    >
                                        <Undo2 class="size-3.5" aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        class="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
                                        disabled={problem !== undefined || saving !== undefined || !canEdit}
                                        onclick={() => save(field)}
                                    >
                                        {saving === field.name ? "Saving..." : "Save"}
                                    </button>
                                {/if}
                            </li>
                        {/each}
                        {#each others as field (field.name)}
                            <li class="flex items-start gap-3 px-3 py-2">
                                <span class="w-40 shrink-0 truncate font-mono text-xs text-muted-foreground" title={field.name}>{field.name}</span>
                                <code class="min-w-0 flex-1 text-xs break-words text-muted-foreground select-text">{field.rawValue}</code>
                            </li>
                        {/each}
                        {#each block.nestedSections as section (section.name)}
                            <li class="px-3 py-2">
                                <details>
                                    <summary class="cursor-pointer font-mono text-xs text-muted-foreground">[{section.name}] <span class="text-[10px]">(edit in the file)</span></summary>
                                    <pre class="mt-1 overflow-x-auto text-[11px] select-text">{section.rawText}</pre>
                                </details>
                            </li>
                        {/each}
                    </ul>
                    <p class="mt-2 text-[11px] text-muted-foreground">
                        Changes go to the TOML source. Rebuild the server cache (<code>:or-cache:buildCache</code>) to see them in game; the app keeps a backup of every file it overwrites.
                    </p>
                {/if}
            </section>
        </div>
    {/if}
</div>
