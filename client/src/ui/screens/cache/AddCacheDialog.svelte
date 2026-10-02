<script lang="ts">
    import ImagePlus from "@lucide/svelte/icons/image-plus";

    import { readImageFileAsDataUrl } from "../../../lib/cache-icon";
    import { newProfileId, type LocalCacheProfile } from "../../../lib/local-cache-profiles";
    import { pickSystemCacheDirectory } from "../../../lib/tauri/desktop-cache";
    import { isTauriRuntime } from "../../../lib/tauri/is-tauri";
    import ConfirmationDialog from "../../components/confirmation/ConfirmationDialog.svelte";
    import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
    import { errorMessage } from "../../lib/notify";

    let {
        open = $bindable(false),
        editing,
        onSave,
        onDelete,
    }: {
        open?: boolean;
        editing: LocalCacheProfile | null;
        onSave: (profile: LocalCacheProfile, importFiles?: File[]) => void;
        onDelete?: (id: string) => void;
    } = $props();

    const tauri = isTauriRuntime();

    let name = $state("");
    let revision = $state("");
    let description = $state("");
    let locationNotes = $state("");
    let iconDataUrl = $state<string | undefined>();
    let systemCachePath = $state<string | undefined>();
    let useSystemFolder = $state(false);
    let browserCacheFiles = $state<File[]>([]);
    let iconError = $state<string | null>(null);
    let confirmDeleteOpen = $state(false);

    // Reset the form whenever the dialog opens for a (different) profile.
    $effect(() => {
        if (!open) return;
        const profile = editing;
        name = profile?.name ?? "";
        revision = profile?.revision ?? "";
        description = profile?.description ?? "";
        locationNotes = profile?.locationNotes ?? "";
        iconDataUrl = profile?.iconDataUrl;
        systemCachePath = profile?.systemCachePath;
        useSystemFolder = Boolean(profile?.useSystemFolder && profile.systemCachePath);
        browserCacheFiles = [];
        iconError = null;
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
        useSystemFolder = true;
    }

    function save(): void {
        onSave({
            id: editing?.id ?? newProfileId(),
            name: name.trim() || "Untitled cache",
            revision: revision.trim(),
            description: description.trim() || undefined,
            locationNotes: locationNotes.trim(),
            iconDataUrl,
            systemCachePath,
            useSystemFolder: tauri && Boolean(systemCachePath),
        }, tauri ? undefined : [...browserCacheFiles]);
    }

    const sourceReady = $derived(
        editing !== null ||
        (tauri ? Boolean(systemCachePath) : browserCacheFiles.length > 0),
    );

    const directoryInput = { webkitdirectory: "" } as Record<string, string>;
    const fieldClass = "w-full rounded-md border border-input bg-background px-2 py-1.5";
</script>

<Dialog bind:open>
    <DialogContent showClose={false} class="w-[40vw] min-w-[320px] max-w-[760px] gap-0 bg-card p-0 sm:rounded-lg">
        <div class="border-b border-border px-6 py-4">
            <DialogTitle class="text-base leading-normal">{editing ? "Edit cache" : "Add cache"}</DialogTitle>
        </div>
        <div class="space-y-3 px-6 py-4">
            <div class="grid gap-3 sm:grid-cols-[128px_1fr]">
                <div class="space-y-1">
                    <span class="text-sm font-medium">Icon</span>
                    <label class="inline-flex cursor-pointer">
                        <span class="inline-flex size-32 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
                            {#if iconDataUrl}
                                <img src={iconDataUrl} alt="" class="size-32 object-cover" />
                            {:else}
                                <ImagePlus class="size-8 text-muted-foreground" />
                            {/if}
                        </span>
                        <input type="file" accept="image/*" class="sr-only" onchange={(e) => void onIconFiles(e.currentTarget.files)} />
                    </label>
                    {#if iconError}<p class="text-xs text-destructive">{iconError}</p>{/if}
                </div>
                <div class="space-y-3">
                    <label class="block text-sm">
                        <span class="mb-1 block font-medium">Name</span>
                        <input class={fieldClass} bind:value={name} />
                    </label>
                    <label class="block text-sm">
                        <span class="mb-1 block font-medium">Revision</span>
                        <input class={fieldClass} bind:value={revision} />
                        <span class="mt-1 block text-xs text-muted-foreground">
                            OSRS revision 237+ does not need keys.json or xteas.json for maps.
                        </span>
                    </label>
                </div>
                <label class="block text-sm sm:col-span-2">
                    <span class="mb-1 block font-medium">Description</span>
                    <textarea rows="3" class={fieldClass} bind:value={description}></textarea>
                </label>
                <div class="space-y-2 sm:col-span-2">
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
                            Desktop reads this folder directly from disk. The cache is not copied into IndexedDB.
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
                            Browser mode imports the selected cache once into local browser storage.
                        </p>
                    {/if}
                    {#if locationNotes}<p class="text-xs text-muted-foreground">{locationNotes}</p>{/if}
                </div>
            </div>
        </div>
        <div class="flex justify-end gap-2 border-t border-border px-6 py-4">
            <button type="button" class="rounded-md border border-input px-3 py-2 text-sm" onclick={() => (open = false)}>Cancel</button>
            {#if editing && onDelete}
                <button type="button" class="rounded-md bg-destructive/20 px-3 py-2 text-sm text-destructive" onclick={() => (confirmDeleteOpen = true)}>
                    Delete
                </button>
            {/if}
            <button
                type="button"
                disabled={!sourceReady}
                class="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                onclick={save}
            >
                {editing ? "Save changes" : "Add cache"}
            </button>
        </div>
    </DialogContent>
</Dialog>

<ConfirmationDialog
    bind:open={confirmDeleteOpen}
    title="Delete cache profile?"
    description="This removes the cache profile and its imported browser cache files."
    confirmLabel="Delete"
    destructive
    onConfirm={() => {
        if (editing && onDelete) onDelete(editing.id);
    }}
/>
