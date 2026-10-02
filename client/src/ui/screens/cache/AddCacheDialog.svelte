<script lang="ts">
    import FolderGit2 from "@lucide/svelte/icons/folder-git-2";
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
        getBrowserProjectAccessMode,
        selectBrowserProjectDirectory,
        type BrowserDirectoryHandle,
    } from "../../../project/browser-project-filesystem";
    import {
        indexOpenRuneProject,
        type OpenRuneProjectIndex,
    } from "../../../project/openrune-project-index";
    import type { ProjectFileSystem } from "../../../project/project-filesystem";
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

    async function inspectOpenRuneFileSystem(
        fileSystem: ProjectFileSystem,
        label: string,
        accessMode: OpenRuneProjectAccessMode,
        rootPath?: string,
        browserHandle?: BrowserDirectoryHandle,
    ): Promise<void> {
        inspectingOpenRune = true;
        sourceError = null;
        try {
            const project = await indexOpenRuneProject(fileSystem);
            if (!project.isOpenRuneProject) {
                openRuneProject = null;
                sourceError =
                    "That folder does not look like an OpenRune Server project root. Choose the repository root containing the Gradle/OpenRune project.";
                return;
            }

            openRuneAccessMode = accessMode;
            openRuneRootPath =
                accessMode === "system-path" ? rootPath : undefined;
            pendingBrowserProjectHandle =
                accessMode === "browser-handle"
                    ? browserHandle
                    : undefined;
            openRuneProject = project;
            locationNotes = label;
            if (!name.trim()) {
                name = project.gameConfig?.name?.trim() || "OpenRune project";
            }
            if (project.gameConfig?.revision !== undefined) {
                revision = String(project.gameConfig.revision);
            }
        } catch (error) {
            openRuneProject = null;
            sourceError = errorMessage(error);
        } finally {
            inspectingOpenRune = false;
        }
    }

    async function onPickOpenRuneRoot(): Promise<void> {
        if (tauri) {
            const path = await pickOpenRuneProjectDirectory();
            if (!path) return;
            await inspectOpenRuneFileSystem(
                new TauriProjectFileSystem(path),
                path,
                "system-path",
                path,
            );
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
            await inspectOpenRuneFileSystem(
                fileSystem,
                fileSystem.rootHandle.name || "OpenRune project",
                "browser-handle",
                undefined,
                fileSystem.rootHandle,
            );
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
        "flex min-h-24 flex-1 items-start gap-3 rounded-lg border p-3 text-left transition-colors";
</script>

<Dialog bind:open>
    <DialogContent
        showClose={false}
        class="w-[44vw] min-w-[340px] max-w-[820px] gap-0 bg-card p-0 sm:rounded-lg"
    >
        <div class="border-b border-border px-6 py-4">
            <DialogTitle class="text-base leading-normal">
                {editing ? "Manage setup" : "Add setup"}
            </DialogTitle>
        </div>

        <div class="space-y-4 px-6 py-4">
            <div class="space-y-2">
                <span class="text-sm font-medium">Setup type</span>
                <div class="flex gap-2">
                    <button
                        type="button"
                        disabled={editing !== null}
                        class={cn(
                            kindCard,
                            setupKind === "basic"
                                ? "border-primary bg-primary/10"
                                : "border-border bg-background",
                            editing && "cursor-default",
                        )}
                        onclick={() => selectKind("basic")}
                    >
                        <HardDrive class="mt-0.5 size-5 shrink-0" />
                        <span>
                            <span class="block text-sm font-medium">Basic cache</span>
                            <span class="mt-1 block text-xs text-muted-foreground">
                                Cache-only setup. Use any compatible cache directory without OpenRune project features.
                            </span>
                        </span>
                    </button>
                    <button
                        type="button"
                        disabled={editing !== null || !openRuneFolderAccess}
                        class={cn(
                            kindCard,
                            setupKind === "openrune"
                                ? "border-primary bg-primary/10"
                                : "border-border bg-background",
                            (!openRuneFolderAccess || editing) &&
                                "cursor-default opacity-70",
                        )}
                        onclick={() => selectKind("openrune")}
                    >
                        <FolderGit2 class="mt-0.5 size-5 shrink-0" />
                        <span>
                            <span class="block text-sm font-medium">OpenRune project</span>
                            <span class="mt-1 block text-xs text-muted-foreground">
                                Choose the OpenRune Server repository root once. Studio discovers LIVE/SERVER, GameVals, RSCM, map/server TOML, and pack sources from it.
                            </span>
                            {#if !tauri && browserProjectAccess === "filesystem"}
                                <span class="mt-1 block text-xs text-emerald-400">
                                    Direct project read/write is available in this browser. Build/run operations will still require native execution later.
                                </span>
                            {:else if !tauri}
                                <span class="mt-1 block text-xs text-amber-400">
                                    This browser cannot grant direct project-folder access. Use a Chromium browser or the desktop app for OpenRune projects.
                                </span>
                            {/if}
                        </span>
                    </button>
                </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-[128px_1fr]">
                <div class="space-y-1">
                    <span class="text-sm font-medium">Icon</span>
                    <label class="inline-flex cursor-pointer">
                        <span
                            class="inline-flex size-32 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40"
                        >
                            {#if iconDataUrl}
                                <img
                                    src={iconDataUrl}
                                    alt=""
                                    class="size-32 object-cover"
                                />
                            {:else}
                                <ImagePlus
                                    class="size-8 text-muted-foreground"
                                />
                            {/if}
                        </span>
                        <input
                            type="file"
                            accept="image/*"
                            class="sr-only"
                            onchange={(e) =>
                                void onIconFiles(e.currentTarget.files)}
                        />
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
                            placeholder={setupKind === "openrune"
                                ? "Read from game.yml"
                                : "Optional"}
                        />
                        <span class="mt-1 block text-xs text-muted-foreground">
                            {setupKind === "openrune"
                                ? "OpenRune revision is discovered from the project when available."
                                : "Optional cache metadata. Studio still detects the cache storage format from its files."}
                        </span>
                    </label>
                </div>

                <label class="block text-sm sm:col-span-2">
                    <span class="mb-1 block font-medium">Description</span>
                    <textarea
                        rows="2"
                        class={fieldClass}
                        bind:value={description}
                    ></textarea>
                </label>

                {#if setupKind === "openrune"}
                    <div class="space-y-2 sm:col-span-2">
                        <span class="block text-sm font-medium">
                            OpenRune Server root
                        </span>
                        <button
                            type="button"
                            disabled={!openRuneFolderAccess || inspectingOpenRune}
                            class="h-9 w-full rounded-md border border-input bg-secondary px-3 text-sm disabled:opacity-60"
                            onclick={() => void onPickOpenRuneRoot()}
                        >
                            {inspectingOpenRune
                                ? "Inspecting OpenRune project..."
                                : locationNotes
                                  ? "Change OpenRune project root"
                                  : "Choose OpenRune project root"}
                        </button>

                        {#if locationNotes}
                            <p class="break-all text-xs text-muted-foreground">
                                {locationNotes}
                            </p>
                        {/if}

                        {#if openRuneProject}
                            <div
                                class="grid gap-2 rounded-md border border-border bg-background/50 p-3 text-xs sm:grid-cols-2"
                            >
                                <div>
                                    <span class="text-muted-foreground">Project</span>
                                    <p class="font-medium text-emerald-400">
                                        Valid OpenRune project
                                    </p>
                                </div>
                                <div>
                                    <span class="text-muted-foreground">Authoring access</span>
                                    <p class="font-medium">
                                        {openRuneAccessMode === "browser-handle"
                                            ? "Browser read/write"
                                            : "Direct disk read/write"}
                                    </p>
                                </div>
                                <div>
                                    <span class="text-muted-foreground">LIVE cache</span>
                                    <p class="font-medium">
                                        {openRuneProject.liveCachePath ??
                                            "Not built yet — bootstrap needed"}
                                    </p>
                                </div>
                                <div>
                                    <span class="text-muted-foreground">SERVER cache</span>
                                    <p class="font-medium">
                                        {openRuneProject.serverCachePath ?? "Not built yet"}
                                    </p>
                                </div>
                                <div>
                                    <span class="text-muted-foreground">GameVal/RSCM</span>
                                    <p class="font-medium">
                                        {openRuneProject.gameValBinaryFiles.length} DAT ·
                                        {openRuneProject.rscmFiles.length} RSCM ·
                                        {openRuneProject.gameValTomlFiles.length} module TOML
                                    </p>
                                </div>
                                <div>
                                    <span class="text-muted-foreground">OpenRune sources</span>
                                    <p class="font-medium">
                                        {openRuneProject.rawMapSources.npcTomlFiles.length +
                                            openRuneProject.rawMapSources.objTomlFiles.length +
                                            openRuneProject.rawMapSources.areaTomlFiles.length}
                                        map TOML ·
                                        {openRuneProject.rawServerSources.tomlFiles.length}
                                        server TOML ·
                                        {openRuneProject.packRoots.length} pack roots
                                    </p>
                                </div>
                            </div>
                            {#if !openRuneProject.liveCachePath}
                                <p class="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
                                    This is a valid OpenRune project. Source editing is available, but Map cannot load until OpenRune generates LIVE. Bootstrap will be added as a separate native/Companion capability.
                                </p>
                            {/if}
                        {/if}
                    </div>
                {:else}
                    <div class="space-y-2 sm:col-span-2">
                        <span class="block text-sm font-medium">Cache folder</span>
                        {#if tauri}
                            <button
                                type="button"
                                class="h-9 w-full rounded-md border border-input bg-secondary px-3 text-sm"
                                onclick={() => void onPickSystemFolder()}
                            >
                                {systemCachePath
                                    ? "Change cache folder"
                                    : "Choose cache folder"}
                            </button>
                            <p class="text-xs text-muted-foreground">
                                Desktop reads the selected cache directly from disk. No IndexedDB cache copy is created.
                            </p>
                        {:else}
                            <label class="inline-flex w-full cursor-pointer">
                                <span
                                    class="inline-flex h-9 w-full items-center justify-center rounded-md border border-input bg-background px-3 text-sm"
                                >
                                    {browserCacheFiles.length > 0
                                        ? "Change cache folder"
                                        : "Choose cache folder"}
                                </span>
                                <input
                                    type="file"
                                    class="sr-only"
                                    multiple
                                    {...directoryInput}
                                    onchange={(e) =>
                                        onBrowserFolderFiles(
                                            e.currentTarget.files,
                                        )}
                                />
                            </label>
                            <p class="text-xs text-muted-foreground">
                                Browser basic-cache mode imports the selected cache into local browser storage.
                            </p>
                        {/if}
                        {#if locationNotes}
                            <p class="break-all text-xs text-muted-foreground">
                                {locationNotes}
                            </p>
                        {/if}
                    </div>
                {/if}

                {#if sourceError}
                    <p
                        class="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive sm:col-span-2"
                    >
                        {sourceError}
                    </p>
                {/if}
            </div>
        </div>

        <div class="flex justify-end gap-2 border-t border-border px-6 py-4">
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
                disabled={!sourceReady}
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
