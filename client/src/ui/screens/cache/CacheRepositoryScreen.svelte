<script lang="ts">
    import { onMount, untrack } from "svelte";
    import FolderOpen from "@lucide/svelte/icons/folder-open";
    import ImagePlus from "@lucide/svelte/icons/image-plus";
    import Package from "@lucide/svelte/icons/package";
    import Pencil from "@lucide/svelte/icons/pencil";
    import Plus from "@lucide/svelte/icons/plus";
    import Server from "@lucide/svelte/icons/server";

    import {
        hasResolvedProfileCache,
        loadResolvedProfileCache,
        SERVER_PROFILE_PREFIX,
        serverProfileId,
    } from "../../../cache/profile-cache-source";
    import { staticRangeCacheSource } from "../../../cache/static-range-cache-source";
    import { clearRuntimeLoadedCache, setRuntimeLoadedCache } from "../../../lib/active-cache-runtime";
    import {
        getActiveProfileIdAsync,
        loadLocalCacheProfilesAsync,
        saveLocalCacheProfilesAsync,
        setActiveProfileIdAsync,
        type LocalCacheProfile,
    } from "../../../lib/local-cache-profiles";
    import {
        deleteProfileCache,
        saveProfileCacheFiles,
    } from "../../../lib/profile-cache-store";
    import type { CacheInfo } from "../../../rs/cache/CacheInfo";
    import ConfirmationDialog from "../../components/confirmation/ConfirmationDialog.svelte";
    import { errorMessage, notifyError, notifySuccess } from "../../lib/notify";
    import { router } from "../../lib/router.svelte";
    import { cn } from "../../lib/utils";
    import AddCacheDialog from "./AddCacheDialog.svelte";

    let profiles = $state<LocalCacheProfile[]>([]);
    let activeProfileId = $state<string | null>(null);
    let editingProfile = $state<LocalCacheProfile | null>(null);
    let addOpen = $state(false);
    let savedMap = $state<Record<string, boolean>>({});
    let pendingSwitchProfileId = $state<string | null>(null);
    let pendingImportProfileId = $state<string | null>(null);
    let switchOpen = $state(false);
    let importOpen = $state(false);
    let draggingProfileId = $state<string | null>(null);
    let autoloadProgress = $state<number | null>(null);
    let autoloadLabel = $state("Loading cache...");
    let autoloadStarted = false;
    let serverCaches = $state<CacheInfo[]>([]);
    let folderInput = $state<HTMLInputElement>();
    let importProfileId: string | null = null;

    const activeProfile = $derived(profiles.find((p) => p.id === activeProfileId) ?? null);
    const nameOf = (id: string | null, fallback: string): string => profiles.find((p) => p.id === id)?.name ?? fallback;
    const progress = $derived(Math.max(0, Math.min(100, autoloadProgress ?? 0)));

    onMount(() => {
        let cancelled = false;
        // Studio-owned caches served from /caches with Range support.
        staticRangeCacheSource.listCaches()
            .then((list) => {
                if (!cancelled) serverCaches = Array.isArray(list) ? list : [];
            })
            .catch(() => {
                if (!cancelled) serverCaches = [];
            });
        void (async () => {
            const list = await loadLocalCacheProfilesAsync();
            const active = await getActiveProfileIdAsync();
            if (cancelled) return;
            profiles = list;
            activeProfileId = active;
        })();
        return () => {
            cancelled = true;
        };
    });

    // Which profiles have their files imported into browser storage.
    $effect(() => {
        const list = profiles;
        let cancelled = false;
        void Promise.all(list.map(async (p) => [p.id, await hasResolvedProfileCache(p)] as const)).then((entries) => {
            if (!cancelled) savedMap = { ...savedMap, ...Object.fromEntries(entries) };
        });
        return () => {
            cancelled = true;
        };
    });

    async function persist(next: LocalCacheProfile[]): Promise<void> {
        profiles = next;
        await saveLocalCacheProfilesAsync($state.snapshot(next) as LocalCacheProfile[]);
    }

    async function onSaveProfile(
        profile: LocalCacheProfile,
        importFiles: File[] = [],
    ): Promise<void> {
        const exists = profiles.some((p) => p.id === profile.id);
        const next = exists
            ? profiles.map((p) => (p.id === profile.id ? profile : p))
            : [...profiles, profile];

        await persist(next);
        activeProfileId = profile.id;
        await setActiveProfileIdAsync(profile.id);
        addOpen = false;
        editingProfile = null;

        try {
            if (importFiles.length > 0) {
                await saveProfileCacheFiles(profile.id, importFiles);
                savedMap = { ...savedMap, [profile.id]: true };
            }

            if (profile.useSystemFolder || importFiles.length > 0) {
                await loadProfile(profile.id, next);
            }
        } catch (error) {
            notifyError(errorMessage(error));
            return;
        }

        notifySuccess(
            exists
                ? `Updated "${profile.name}".`
                : `Added "${profile.name}".`,
        );
    }

    async function onDeleteProfile(id: string): Promise<void> {
        await deleteProfileCache(id);
        const next = profiles.filter((p) => p.id !== id);
        await persist(next);
        const nextActive = activeProfileId === id ? (next[0]?.id ?? null) : activeProfileId;
        activeProfileId = nextActive;
        await setActiveProfileIdAsync(nextActive);
        addOpen = false;
        editingProfile = null;
        notifySuccess("Profile removed.");
    }

    async function loadProfile(id: string, list: LocalCacheProfile[] = profiles): Promise<void> {
        activeProfileId = id;
        await setActiveProfileIdAsync(id);
        const profile = list.find((x) => x.id === id);
        if (!profile) return;
        try {
            clearRuntimeLoadedCache();
            const loaded = await loadResolvedProfileCache(
                $state.snapshot(profile) as LocalCacheProfile,
            );
            setRuntimeLoadedCache(profile.id, loaded);
        } catch (error) {
            notifyError(errorMessage(error));
            return;
        }
        notifySuccess(`Ready: "${profile.name}". Open Map to use this cache.`);
    }

    function confirmAndLoadProfile(id: string): void {
        if (id === activeProfileId) return;
        const profile = profiles.find((p) => p.id === id);
        if (!profile) return;
        if (!savedMap[id]) {
            notifyError(
                `"${profile.name}" is not currently available. Re-open its folder in Manage or update the imported cache.`,
            );
            return;
        }
        pendingSwitchProfileId = id;
        switchOpen = true;
    }

    /** Adds (once) and activates a profile that streams a dev-server cache instead of importing it. */
    async function selectServerCache(info: CacheInfo): Promise<void> {
        const id = serverProfileId(info.name);
        let next = profiles;
        if (!profiles.some((p) => p.id === id)) {
            next = [
                ...profiles,
                {
                    id,
                    name: `${info.name} (local)`,
                    revision: String(info.revision),
                    locationNotes: `Streams from /caches/${info.name}`,
                },
            ];
            await persist(next);
        }
        savedMap = { ...savedMap, [id]: true };
        await loadProfile(id, next);
    }

    function startImport(profileId: string): void {
        pendingImportProfileId = profileId;
        importOpen = true;
    }

    async function onFolderPicked(files: FileList | null): Promise<void> {
        const profileId = importProfileId;
        importProfileId = null;
        if (!profileId || !files?.length) return;
        const profile = profiles.find((p) => p.id === profileId);
        if (!profile) return;
        try {
            await saveProfileCacheFiles(profileId, files);
            savedMap = { ...savedMap, [profileId]: true };
            await loadProfile(profileId);
            notifySuccess(`Imported ${files.length} files into "${profile.name}".`);
        } catch (error) {
            notifyError(errorMessage(error));
        }
    }

    // `/cache-test?autoload=1&returnTo=...`: load the active profile, then bounce back to where the user was.
    $effect(() => {
        const params = router.params;
        if (params.get("autoload") !== "1") return;
        const id = activeProfileId;
        const list = profiles;
        untrack(() => {
            if (autoloadStarted || !id || list.length === 0) return;
            const profile = list.find((p) => p.id === id);
            if (!profile) return;

            autoloadStarted = true;
            autoloadProgress = 10;
            autoloadLabel = `Opening "${profile.name}"...`;

            void (async () => {
                try {
                    autoloadProgress = 40;
                    clearRuntimeLoadedCache();
                    const loaded = await loadResolvedProfileCache(
                        $state.snapshot(profile) as LocalCacheProfile,
                    );
                    autoloadProgress = 85;
                    setRuntimeLoadedCache(profile.id, loaded);
                    autoloadProgress = 100;
                    autoloadLabel = "Cache ready. Returning...";
                    const returnTo = params.get("returnTo") || "/map";
                    setTimeout(() => router.navigate(returnTo, { replace: true }), 250);
                } catch (error) {
                    autoloadStarted = false;
                    autoloadProgress = null;
                    notifyError(errorMessage(error));
                }
            })();
        });
    });

    async function moveProfileBefore(dragId: string, targetId: string): Promise<void> {
        if (dragId === targetId) return;
        const dragIndex = profiles.findIndex((p) => p.id === dragId);
        const targetIndex = profiles.findIndex((p) => p.id === targetId);
        if (dragIndex < 0 || targetIndex < 0) return;
        const next = [...profiles];
        const [dragged] = next.splice(dragIndex, 1);
        next.splice(targetIndex, 0, dragged);
        await persist(next);
    }

    const directoryInput = { webkitdirectory: "" } as Record<string, string>;
    const actionButton =
        "inline-flex h-9 w-[132px] items-center justify-center gap-1 rounded-md border border-input px-3 py-2 text-xs font-medium";
</script>

<div class="mx-auto w-full max-w-7xl space-y-4">
    {#if autoloadProgress !== null}
        <section class="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div class="mx-auto w-full max-w-xl rounded-lg border border-border/80 bg-background/80 p-4">
                <div class="mb-3 flex items-center justify-between">
                    <p class="text-sm font-medium">Preparing cache</p>
                    <span class="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{progress}%</span>
                </div>
                <p class="mb-3 text-sm text-muted-foreground">{autoloadLabel}</p>
                <div class="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div class="h-full rounded-full bg-primary transition-all duration-300 ease-out" style="width: {progress}%"></div>
                </div>
            </div>
        </section>
    {/if}

    <section class="rounded-xl border border-border bg-card p-5 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">OpenRune</p>
        <h1 class="mt-2 flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <Package class="size-6" />
            Cache repository
        </h1>
        <p class="mt-2 text-sm text-muted-foreground">
            Add cache profiles (icon, revision, description, location), mark one active, and keep your cache catalog ready.
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
            <button
                type="button"
                class="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted"
                onclick={() => {
                    editingProfile = null;
                    addOpen = true;
                }}
            >
                <Plus class="size-4" />
                Add cache
            </button>
            {#if activeProfile}
                <span class="inline-flex items-center rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                    Active: {activeProfile.name}
                </span>
            {/if}
        </div>
    </section>

    {#if serverCaches.length > 0}
        <section class="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 class="flex items-center gap-2 text-sm font-semibold">
                <Server class="size-4" />
                Studio local caches
            </h2>
            <p class="mt-1 text-sm text-muted-foreground">
                Served from <code class="font-mono text-xs">client/caches</code> through <code class="font-mono text-xs">/caches</code> with Range support. These stream directly; nothing is copied into browser storage.
            </p>
            <div class="mt-3 space-y-2">
                {#each serverCaches as info (info.name)}
                    {@const active = serverProfileId(info.name) === activeProfileId}
                    <div class="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 p-3">
                        <div class="min-w-0">
                            <p class="truncate text-sm font-medium">{info.name}</p>
                            <p class="text-xs text-muted-foreground">{info.game} · revision {info.revision}</p>
                        </div>
                        <button
                            type="button"
                            disabled={active}
                            class="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-60"
                            onclick={() => void selectServerCache(info)}
                        >
                            {active ? "Active" : "Use"}
                        </button>
                    </div>
                {/each}
            </div>
        </section>
    {/if}

    <section class="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div class="space-y-2">
            {#if profiles.length === 0}
                <div class="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                    No caches yet. Click Add cache to create your first cache profile.
                </div>
            {:else}
                {#each profiles as p (p.id)}
                    {@const active = p.id === activeProfileId}
                    {@const saved = savedMap[p.id] === true}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class={cn(
                            "cursor-pointer rounded-lg border bg-card p-3 transition-colors",
                            active ? "border-emerald-500/60" : "border-border hover:border-primary/40",
                        )}
                        onclick={() => confirmAndLoadProfile(p.id)}
                        draggable="true"
                        ondragstart={(e) => {
                            draggingProfileId = p.id;
                            if (e.dataTransfer) {
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", p.id);
                            }
                        }}
                        ondragend={() => (draggingProfileId = null)}
                        ondragover={(e) => {
                            e.preventDefault();
                            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                        }}
                        ondrop={(e) => {
                            e.preventDefault();
                            const dragId = e.dataTransfer?.getData("text/plain") || draggingProfileId;
                            if (dragId) void moveProfileBefore(dragId, p.id);
                            draggingProfileId = null;
                        }}
                    >
                        <div class="flex flex-wrap items-start justify-between gap-2">
                            <div class="flex min-w-0 items-start gap-3">
                                <div class="flex shrink-0 items-center">
                                    {#if p.iconDataUrl}
                                        <img src={p.iconDataUrl} alt="" class="size-20 rounded border border-border object-cover" />
                                    {:else}
                                        <div class="flex size-20 items-center justify-center rounded border border-dashed border-border bg-muted/30">
                                            <ImagePlus class="size-6 text-muted-foreground" />
                                        </div>
                                    {/if}
                                </div>
                                <div class="min-w-0">
                                    <div class="flex flex-wrap items-center gap-2">
                                        <span class="font-medium">{p.name}</span>
                                        {#if p.revision}
                                            <span class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">rev {p.revision}</span>
                                        {/if}
                                        {#if p.id.startsWith(SERVER_PROFILE_PREFIX)}
                                            <span class="rounded bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-300">Local source</span>
                                        {:else if p.useSystemFolder}
                                            <span class={cn(
                                                "rounded px-1.5 py-0.5 text-xs",
                                                saved
                                                    ? "bg-emerald-500/15 text-emerald-300"
                                                    : "bg-amber-500/10 text-amber-300",
                                            )}>
                                                {saved ? "Direct disk" : "Disk access needed"}
                                            </span>
                                        {:else if saved}
                                            <span class="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-300">Saved in browser</span>
                                        {:else}
                                            <span class="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-300">Not imported yet</span>
                                        {/if}
                                    </div>
                                    {#if p.description}<p class="mt-1 text-xs text-muted-foreground">{p.description}</p>{/if}
                                    {#if p.locationNotes}<p class="mt-1 text-xs text-muted-foreground">{p.locationNotes}</p>{/if}
                                </div>
                            </div>
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div class="ml-auto flex flex-col gap-1 self-start" onclick={(e) => e.stopPropagation()}>
                                <button
                                    type="button"
                                    class={actionButton}
                                    onclick={() => {
                                        editingProfile = p;
                                        addOpen = true;
                                    }}
                                >
                                    <Pencil class="size-3.5" />
                                    Manage
                                </button>
                                <button
                                    type="button"
                                    class={actionButton}
                                    onclick={() => p.useSystemFolder ? void loadProfile(p.id) : startImport(p.id)}
                                >
                                    <FolderOpen class="size-3.5" />
                                    {p.useSystemFolder ? "Reload from disk" : "Update cache"}
                                </button>
                            </div>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>
    </section>
</div>

<AddCacheDialog
    bind:open={addOpen}
    editing={editingProfile}
    onSave={(p, files) => void onSaveProfile(p, files)}
    onDelete={(id) => void onDeleteProfile(id)}
/>

<input
    bind:this={folderInput}
    type="file"
    class="sr-only"
    multiple
    {...directoryInput}
    onchange={(e) => {
        void onFolderPicked(e.currentTarget.files);
        e.currentTarget.value = "";
    }}
/>

<ConfirmationDialog
    bind:open={switchOpen}
    title="Switch active cache?"
    description={pendingSwitchProfileId ? `Set "${nameOf(pendingSwitchProfileId, "this cache")}" as the active cache for Map?` : ""}
    confirmLabel="Switch"
    onCancel={() => (pendingSwitchProfileId = null)}
    onConfirm={() => {
        const id = pendingSwitchProfileId;
        pendingSwitchProfileId = null;
        if (id) void loadProfile(id);
    }}
/>
<ConfirmationDialog
    bind:open={importOpen}
    title="Import cache files?"
    description={pendingImportProfileId
        ? `This will import selected files into "${nameOf(pendingImportProfileId, "this profile")}" browser storage.`
        : ""}
    confirmLabel="Continue"
    onCancel={() => (pendingImportProfileId = null)}
    onConfirm={() => {
        const id = pendingImportProfileId;
        pendingImportProfileId = null;
        if (!id) return;
        importProfileId = id;
        folderInput?.click();
    }}
/>
