<script lang="ts">
    import Check from "@lucide/svelte/icons/check";
    import FolderGit2 from "@lucide/svelte/icons/folder-git-2";
    import Loader from "@lucide/svelte/icons/loader-circle";
    import HardDrive from "@lucide/svelte/icons/hard-drive";
    import ImagePlus from "@lucide/svelte/icons/image-plus";

    import { readImageFileAsDataUrl } from "../../../lib/cache-icon";
    import {
        cacheSetupKind,
        newProfileId,
        openRuneProjectAccessMode,
        type CacheSetupKind,
        type LocalCacheProfile,
        type OpenRuneProjectAccessMode,
    } from "../../../lib/local-cache-profiles";
    import {
        pickOpenRuneProjectDirectory,
        pickSystemCacheDirectory,
    } from "../../../lib/tauri/desktop-cache";
    import { isTauriRuntime } from "../../../lib/tauri/is-tauri";
    import {
        BrowserProjectFileSystem,
        getBrowserProjectAccessMode,
        selectBrowserProjectDirectory,
        type BrowserDirectoryHandle,
    } from "../../../project/browser-project-filesystem";
    import { join } from "@tauri-apps/api/path";
    import {
        describeOpenRuneProject,
        type OpenRuneProjectOverview as ProjectOverview,
    } from "../../../project/openrune-project-overview";
    import {
        locateOpenRuneProject,
        type ProjectCandidate,
        type ProjectRejection,
    } from "../../../project/openrune-project-locator";
    import type { OpenRuneProjectIndex } from "../../../project/openrune-project-index";
    import { OpenRuneProjectSession } from "../../../project/openrune-project-session";
    import { ScopedProjectFileSystem } from "../../../project/scoped-project-filesystem";
    import type { ProjectFileSystem } from "../../../project/project-filesystem";
    import { pickAndGrantFolder } from "../../../lib/tauri/desktop-access";
    import { ProjectFileSystemError } from "../../../project/project-filesystem";
    import { TauriProjectFileSystem } from "../../../project/tauri-project-filesystem";
    import ConfirmationDialog from "../../components/confirmation/ConfirmationDialog.svelte";
    import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
    import { errorMessage } from "../../lib/notify";
    import { cn } from "../../lib/utils";

    let {
        open = $bindable(false),
        editing,
        onSave,
        onDelete,
    }: {
        open?: boolean;
        editing: LocalCacheProfile | null;
        onSave: (
            profile: LocalCacheProfile,
            importFiles?: File[],
            browserProjectHandle?: BrowserDirectoryHandle,
        ) => void;
        onDelete?: (id: string) => void;
    } = $props();

    const tauri = isTauriRuntime();
    const browserProjectAccess = getBrowserProjectAccessMode();
    const openRuneFolderAccess =
        tauri || browserProjectAccess === "filesystem";

    let setupKind = $state<CacheSetupKind>("basic");
    let name = $state("");
    let revision = $state("");
    let description = $state("");
    let locationNotes = $state("");
    let iconDataUrl = $state<string | undefined>();
    let systemCachePath = $state<string | undefined>();
    let openRuneRootPath = $state<string | undefined>();
    let openRuneAccessMode = $state<OpenRuneProjectAccessMode>("system-path");
    let pendingBrowserProjectHandle = $state<BrowserDirectoryHandle | undefined>();
    let openRuneProject = $state<OpenRuneProjectIndex | null>(null);
    let browserCacheFiles = $state<File[]>([]);
    let iconError = $state<string | null>(null);
    let sourceError = $state<string | null>(null);
    let confirmDeleteOpen = $state(false);
    let inspectingOpenRune = $state(false);
    /** Set when the picked folder is not a project; explains why. */
    let rejection = $state<ProjectRejection | null>(null);
    /** Several projects were found inside the picked folder: the user chooses one. */
    let candidates = $state<ProjectCandidate[]>([]);
    let pickedSource: {
        fileSystem: ProjectFileSystem;
        label: string;
        accessMode: OpenRuneProjectAccessMode;
        rootPath?: string;
        browserHandle?: BrowserDirectoryHandle;
    } | null = null;
    /** What the project provides, shown as a short summary (full detail opens after setup). */
    let overview = $state<ProjectOverview | null>(null);
    let loadingOverview = $state(false);
    let foundNote = $state<string | null>(null);

    $effect(() => {
        if (!open) return;
        const profile = editing;
        setupKind = profile ? cacheSetupKind(profile) : "basic";
        name = profile?.name ?? "";
        revision = profile?.revision ?? "";
        description = profile?.description ?? "";
        locationNotes = profile?.locationNotes ?? "";
        iconDataUrl = profile?.iconDataUrl;
        systemCachePath = profile?.systemCachePath;
        openRuneRootPath = profile?.openRuneRootPath;
        openRuneAccessMode = profile
            ? openRuneProjectAccessMode(profile)
            : tauri
              ? "system-path"
              : "browser-handle";
        pendingBrowserProjectHandle = undefined;
        openRuneProject = null;
        browserCacheFiles = [];
        iconError = null;
        sourceError = null;
        rejection = null;
        candidates = [];
        pickedSource = null;
        overview = null;
        foundNote = null;
    });

    async function onIconFiles(files: FileList | null): Promise<void> {
        const file = files?.[0];
        if (!file) return;
        try {
            iconError = null;
            iconDataUrl = await readImageFileAsDataUrl(file);
        } catch (error) {
            iconError = errorMessage(error);
        }
    }

    function selectKind(kind: CacheSetupKind): void {
        if (editing || setupKind === kind) return;
        setupKind = kind;
        sourceError = null;
        if (kind === "basic") {
            openRuneRootPath = undefined;
            pendingBrowserProjectHandle = undefined;
            openRuneProject = null;
            overview = null;
        } else {
            systemCachePath = undefined;
            browserCacheFiles = [];
            locationNotes = "";
            openRuneAccessMode = tauri ? "system-path" : "browser-handle";
        }
    }

    function onBrowserFolderFiles(files: FileList | null): void {
        if (!files?.length) return;
        browserCacheFiles = Array.from(files);
        const first = files[0]!;
        const relative = first.webkitRelativePath || first.name || "";
        const root = relative.split(/[\\/]/g).filter(Boolean)[0];
        locationNotes = root || "Browser cache folder selected";
    }

    async function onPickSystemFolder(): Promise<void> {
        const path = await pickSystemCacheDirectory();
        if (!path) return;
        systemCachePath = path;
        locationNotes = path;
        sourceError = null;
    }

    function resetProjectSelection(): void {
        openRuneProject = null;
        overview = null;
        rejection = null;
        candidates = [];
        foundNote = null;
        sourceError = null;
    }

    /**
     * Looks for an OpenRune project in the folder the user picked: the folder itself, or one inside it. Explains
     * clearly when there is none, and re-asks for access (with the picker at that folder) when access was missing.
     */
    async function handlePickedFolder(source: NonNullable<typeof pickedSource>): Promise<void> {
        pickedSource = source;
        inspectingOpenRune = true;
        resetProjectSelection();
        try {
            let located;
            try {
                located = await locateOpenRuneProject(source.fileSystem);
            } catch (error) {
                if (!(error instanceof ProjectFileSystemError) || error.code !== "ACCESS_DENIED" || !source.rootPath) throw error;
                const granted = await pickAndGrantFolder({ title: "Allow access to this OpenRune project", defaultPath: source.rootPath });
                if (!granted) throw error;
                located = await locateOpenRuneProject(source.fileSystem);
            }

            if (located.kind === "rejected") {
                rejection = located.rejection;
                locationNotes = source.label;
                return;
            }
            if (located.kind === "project") {
                await acceptProject("", source, located.project);
                return;
            }
            if (located.candidates.length === 1) {
                const [only] = located.candidates;
                foundNote = `Found the project in "${only.subPath}" inside the folder you chose.`;
                await acceptProject(only.subPath, source);
                return;
            }
            candidates = located.candidates;
            locationNotes = source.label;
        } catch (error) {
            resetProjectSelection();
            sourceError = errorMessage(error);
        } finally {
            inspectingOpenRune = false;
        }
    }

    async function chooseCandidate(candidate: ProjectCandidate): Promise<void> {
        if (!pickedSource) return;
        inspectingOpenRune = true;
        candidates = [];
        foundNote = `Using "${candidate.subPath}".`;
        try {
            await acceptProject(candidate.subPath, pickedSource);
        } catch (error) {
            resetProjectSelection();
            sourceError = errorMessage(error);
        } finally {
            inspectingOpenRune = false;
        }
    }

    /** Makes `subPath` (inside the picked folder) the project root for this setup, then reads what it provides. */
    async function acceptProject(
        subPath: string,
        source: NonNullable<typeof pickedSource>,
        knownProject?: OpenRuneProjectIndex,
    ): Promise<void> {
        let fileSystem = source.fileSystem;
        let rootPath = source.rootPath;
        let browserHandle = source.browserHandle;
        let label = source.label;
        if (subPath) {
            fileSystem = new ScopedProjectFileSystem(source.fileSystem, subPath);
            if (source.accessMode === "system-path" && source.rootPath) {
                rootPath = await join(source.rootPath, ...subPath.split("/"));
                fileSystem = new TauriProjectFileSystem(rootPath);
                label = rootPath;
            } else if (source.browserHandle) {
                let handle = source.browserHandle;
                for (const part of subPath.split("/")) handle = await handle.getDirectoryHandle(part);
                browserHandle = handle;
                fileSystem = new BrowserProjectFileSystem(handle);
                label = `${source.label}/${subPath}`;
            }
        }

        const session = new OpenRuneProjectSession(fileSystem);
        loadingOverview = true;
        try {
            const snapshot = await session.refresh();
            openRuneProject = snapshot.project;
            overview = describeOpenRuneProject(snapshot, name.trim() || undefined);
        } catch (error) {
            // The folder was recognized (the locator checked it), so keep it usable even if a source index failed.
            openRuneProject = knownProject ?? null;
            sourceError = `The project was found but reading it failed: ${errorMessage(error)}`;
            if (!openRuneProject) return;
        } finally {
            loadingOverview = false;
        }

        openRuneAccessMode = source.accessMode;
        openRuneRootPath = source.accessMode === "system-path" ? rootPath : undefined;
        pendingBrowserProjectHandle = source.accessMode === "browser-handle" ? browserHandle : undefined;
        locationNotes = label;
        const project = openRuneProject;
        if (project && !name.trim()) name = project.gameConfig?.name?.trim() || "OpenRune project";
        if (project?.gameConfig?.revision !== undefined) revision = String(project.gameConfig.revision);
    }

    async function onPickOpenRuneRoot(): Promise<void> {
        if (tauri) {
            const path = await pickOpenRuneProjectDirectory();
            if (!path) return;
            await handlePickedFolder({
                fileSystem: new TauriProjectFileSystem(path),
                label: path,
                accessMode: "system-path",
                rootPath: path,
            });
            return;
        }

        if (browserProjectAccess !== "filesystem") {
            sourceError =
                "This browser does not provide direct project-folder access. Use a Chromium browser with File System Access support or the desktop app.";
            return;
        }

        try {
            const fileSystem = await selectBrowserProjectDirectory({
                id: editing
                    ? `openrune-project-${editing.id}`
                    : "openrune-project",
            });
            if (!fileSystem) return;
            await handlePickedFolder({
                fileSystem,
                label: fileSystem.rootHandle.name || "OpenRune project",
                accessMode: "browser-handle",
                browserHandle: fileSystem.rootHandle,
            });
        } catch (error) {
            sourceError = errorMessage(error);
        }
    }

    function save(): void {
        const openRune = setupKind === "openrune";
        onSave(
            {
                id: editing?.id ?? newProfileId(),
                name:
                    name.trim() ||
                    (openRune ? "OpenRune project" : "Untitled cache"),
                revision: revision.trim(),
                description: description.trim() || undefined,
                locationNotes: locationNotes.trim(),
                iconDataUrl,
                setupKind,
                systemCachePath: openRune ? undefined : systemCachePath,
                useSystemFolder:
                    !openRune && tauri && Boolean(systemCachePath),
                openRuneRootPath:
                    openRune && openRuneAccessMode === "system-path"
                        ? openRuneRootPath
                        : undefined,
                openRuneAccessMode:
                    openRune ? openRuneAccessMode : undefined,
            },
            openRune || tauri ? undefined : [...browserCacheFiles],
            openRuneAccessMode === "browser-handle"
                ? pendingBrowserProjectHandle
                : undefined,
        );
    }

    const sourceReady = $derived(
        setupKind === "openrune"
            ? editing !== null ||
                  (openRuneProject?.isOpenRuneProject === true &&
                      (openRuneAccessMode === "browser-handle"
                          ? Boolean(pendingBrowserProjectHandle)
                          : Boolean(openRuneRootPath)))
            : editing !== null ||
                  (tauri
                      ? Boolean(systemCachePath)
                      : browserCacheFiles.length > 0),
    );

    const directoryInput = { webkitdirectory: "" } as Record<string, string>;
    const fieldClass =
        "w-full rounded-md border border-input bg-background px-2 py-1.5";
    const kindCard =
        "flex flex-1 items-start gap-3 rounded-lg border p-3 text-left transition-colors";
</script>

{#snippet identityFields()}
    <div class="grid gap-3 sm:grid-cols-[96px_1fr]">
        <div class="space-y-1">
            <span class="text-sm font-medium">Icon</span>
            <label class="inline-flex cursor-pointer">
                <span class="inline-flex size-24 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
                    {#if iconDataUrl}
                        <img src={iconDataUrl} alt="" class="size-24 object-cover" />
                    {:else}
                        <ImagePlus class="size-7 text-muted-foreground" />
                    {/if}
                </span>
                <input type="file" accept="image/*" class="sr-only" onchange={(e) => void onIconFiles(e.currentTarget.files)} />
            </label>
            {#if iconError}
                <p class="text-xs text-destructive">{iconError}</p>
            {/if}
        </div>

        <div class="space-y-3">
            <label class="block text-sm">
                <span class="mb-1 block font-medium">Name</span>
                <input class={fieldClass} bind:value={name} />
            </label>
            <label class="block text-sm">
                <span class="mb-1 block font-medium">Revision</span>
                <input
                    class={fieldClass}
                    bind:value={revision}
                    readonly={setupKind === "openrune"}
                    placeholder={setupKind === "openrune" ? "Read from game.yml" : "Optional"}
                />
                <span class="mt-1 block text-xs text-muted-foreground">
                    {setupKind === "openrune"
                        ? "Read from the project's game.yml when it has one."
                        : "Optional cache metadata. Studio still detects the cache storage format from its files."}
                </span>
            </label>
        </div>

        <label class="block text-sm sm:col-span-2">
            <span class="mb-1 block font-medium">Description</span>
            <textarea rows="2" class={fieldClass} bind:value={description}></textarea>
        </label>
    </div>
{/snippet}

<Dialog bind:open>
    <DialogContent
        showClose={false}
        class="flex max-h-[90vh] w-[92vw] max-w-[760px] flex-col gap-0 bg-card p-0 sm:rounded-lg"
    >
        <div class="shrink-0 border-b border-border px-6 py-3.5">
            <DialogTitle class="text-base leading-normal">
                {editing ? "Manage setup" : "Add setup"}
            </DialogTitle>
        </div>

        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div class="space-y-2">
                <span class="text-sm font-medium">Setup type</span>
                <div class="flex gap-2">
                    <button
                        type="button"
                        disabled={editing !== null}
                        class={cn(
                            kindCard,
                            setupKind === "basic" ? "border-primary bg-primary/10" : "border-border bg-background",
                            editing && "cursor-default",
                        )}
                        onclick={() => selectKind("basic")}
                    >
                        <HardDrive class="mt-0.5 size-5 shrink-0" />
                        <span>
                            <span class="block text-sm font-medium">Basic cache</span>
                            <span class="mt-0.5 block text-xs text-muted-foreground">A game cache on its own, without a project.</span>
                        </span>
                    </button>
                    <button
                        type="button"
                        disabled={editing !== null || !openRuneFolderAccess}
                        class={cn(
                            kindCard,
                            setupKind === "openrune" ? "border-primary bg-primary/10" : "border-border bg-background",
                            (!openRuneFolderAccess || editing) && "cursor-default opacity-70",
                        )}
                        onclick={() => selectKind("openrune")}
                    >
                        <FolderGit2 class="mt-0.5 size-5 shrink-0" />
                        <span>
                            <span class="block text-sm font-medium">OpenRune project</span>
                            <span class="mt-0.5 block text-xs text-muted-foreground">
                                Pick the server folder once. Studio finds the cache, GameVals and sources.
                            </span>
                        </span>
                    </button>
                </div>
                {#if !tauri && browserProjectAccess === "filesystem"}
                    <p class="text-xs text-emerald-400">Direct project read/write is available in this browser.</p>
                {:else if !tauri}
                    <p class="text-xs text-amber-400">
                        This browser cannot grant direct project-folder access. Use a Chromium browser or the desktop app for OpenRune projects.
                    </p>
                {/if}
            </div>

            {#if setupKind === "openrune"}
                <div class="space-y-2">
                    <span class="block text-sm font-medium">OpenRune Server folder</span>
                    <button
                        type="button"
                        disabled={!openRuneFolderAccess || inspectingOpenRune}
                        class="h-9 w-full rounded-md border border-input bg-secondary px-3 text-sm disabled:opacity-60"
                        onclick={() => void onPickOpenRuneRoot()}
                    >
                        {inspectingOpenRune
                            ? "Looking for the project..."
                            : locationNotes
                              ? "Choose a different folder"
                              : "Choose the OpenRune Server folder"}
                    </button>
                    {#if !locationNotes && !inspectingOpenRune}
                        <p class="text-xs text-muted-foreground">
                            Choose the repository root (the folder with <code>settings.gradle.kts</code>). If you choose a folder that contains it, Studio will find it.
                        </p>
                    {/if}
                    {#if locationNotes}
                        <p class="break-all text-xs text-muted-foreground select-text">{locationNotes}</p>
                    {/if}
                    {#if inspectingOpenRune || loadingOverview}
                        <p class="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                            <Loader class="size-3.5 animate-spin" aria-hidden="true" />
                            {loadingOverview ? "Reading the project..." : "Looking for the project..."}
                        </p>
                    {/if}
                    {#if foundNote}
                        <p class="text-xs text-sky-400">{foundNote}</p>
                    {/if}

                    {#if candidates.length > 0}
                        <div class="rounded-md border border-border bg-background/50 p-3">
                            <p class="mb-2 text-xs font-medium">Found {candidates.length} OpenRune projects in that folder. Which one?</p>
                            <div class="flex flex-wrap gap-2">
                                {#each candidates as candidate (candidate.subPath)}
                                    <button
                                        type="button"
                                        class="rounded-md border border-input bg-secondary px-2.5 py-1 text-xs"
                                        onclick={() => void chooseCandidate(candidate)}
                                    >
                                        {candidate.subPath}
                                    </button>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    {#if rejection}
                        <div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs" role="alert">
                            <p class="font-medium text-amber-300">This folder is not an OpenRune Server project.</p>
                            <p class="mt-1 text-amber-200/90">{rejection.message}</p>
                            {#if rejection.found.length > 0}
                                <p class="mt-1.5 text-muted-foreground">Found: <span class="font-mono">{rejection.found.join(", ")}</span></p>
                            {/if}
                            {#if rejection.missing.length > 0}
                                <p class="text-muted-foreground">Expected one of: <span class="font-mono">{rejection.missing.join(", ")}</span></p>
                            {/if}
                        </div>
                    {/if}

                    {#if openRuneProject && overview}
                        <div class="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
                            <p class="flex items-center gap-1.5 font-medium text-emerald-400">
                                <Check class="size-4" aria-hidden="true" />
                                OpenRune project found: {overview.name}
                            </p>
                            <p class="mt-0.5 text-muted-foreground">{overview.summary}</p>
                            <ul class="mt-2 flex flex-wrap gap-1.5" aria-label="Capabilities">
                                {#each overview.features as feature (feature.id)}
                                    <li
                                        class={cn(
                                            "rounded px-1.5 py-0.5",
                                            feature.status === "ready"
                                                ? "bg-emerald-500/15 text-emerald-300"
                                                : feature.status === "partial"
                                                  ? "bg-amber-500/15 text-amber-300"
                                                  : "bg-muted text-muted-foreground line-through decoration-muted-foreground/40",
                                        )}
                                        title={feature.detail}
                                    >
                                        {feature.label}
                                    </li>
                                {/each}
                            </ul>
                            <p class="mt-2 text-muted-foreground">The full list of everything loaded opens when you add the setup.</p>
                        </div>
                        {#if !openRuneProject.liveCachePath}
                            <p class="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
                                LIVE has not been generated yet. Source access works, but the map and interface editors need the LIVE cache (run OpenRune bootstrap, then reload the project).
                            </p>
                        {/if}
                    {/if}
                </div>

                <details class="rounded-md border border-border" open={editing !== null}>
                    <summary class="cursor-pointer px-3 py-2 text-sm font-medium">Name, icon and description <span class="font-normal text-muted-foreground">(optional)</span></summary>
                    <div class="border-t border-border p-3">
                        {@render identityFields()}
                    </div>
                </details>
            {:else}
                {@render identityFields()}

                <div class="space-y-2">
                    <span class="block text-sm font-medium">Cache folder</span>
                    {#if tauri}
                        <button
                            type="button"
                            class="h-9 w-full rounded-md border border-input bg-secondary px-3 text-sm"
                            onclick={() => void onPickSystemFolder()}
                        >
                            {systemCachePath ? "Change cache folder" : "Choose cache folder"}
                        </button>
                        <p class="text-xs text-muted-foreground">
                            Desktop reads the selected cache directly from disk. No IndexedDB cache copy is created.
                        </p>
                    {:else}
                        <label class="inline-flex w-full cursor-pointer">
                            <span class="inline-flex h-9 w-full items-center justify-center rounded-md border border-input bg-background px-3 text-sm">
                                {browserCacheFiles.length > 0 ? "Change cache folder" : "Choose cache folder"}
                            </span>
                            <input
                                type="file"
                                class="sr-only"
                                multiple
                                {...directoryInput}
                                onchange={(e) => onBrowserFolderFiles(e.currentTarget.files)}
                            />
                        </label>
                        <p class="text-xs text-muted-foreground">
                            Browser basic-cache mode imports the selected cache into local browser storage.
                        </p>
                    {/if}
                    {#if locationNotes}
                        <p class="break-all text-xs text-muted-foreground">{locationNotes}</p>
                    {/if}
                </div>
            {/if}

            {#if sourceError}
                <p class="max-h-32 overflow-y-auto break-words rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive select-text">
                    {sourceError}
                </p>
            {/if}
        </div>

        <div class="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-3.5">
            <button
                type="button"
                class="rounded-md border border-input px-3 py-2 text-sm"
                onclick={() => (open = false)}
            >
                Cancel
            </button>
            {#if editing && onDelete}
                <button
                    type="button"
                    class="rounded-md bg-destructive/20 px-3 py-2 text-sm text-destructive"
                    onclick={() => (confirmDeleteOpen = true)}
                >
                    Delete
                </button>
            {/if}
            <button
                type="button"
                disabled={!sourceReady || inspectingOpenRune || loadingOverview}
                class="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                onclick={save}
            >
                {editing ? "Save changes" : "Add setup"}
            </button>
        </div>
    </DialogContent>
</Dialog>

<ConfirmationDialog
    bind:open={confirmDeleteOpen}
    title="Delete setup?"
    description="This removes the setup profile and any imported browser cache/project handle."
    confirmLabel="Delete"
    destructive
    onConfirm={() => {
        if (editing && onDelete) onDelete(editing.id);
    }}
/>
