<script lang="ts">
    import Check from "@lucide/svelte/icons/check";
    import FolderOpen from "@lucide/svelte/icons/folder-open";
    import RefreshCw from "@lucide/svelte/icons/refresh-cw";
    import X from "@lucide/svelte/icons/x";
    import { onMount } from "svelte";

    import { loadLocalCacheProfilesAsync } from "../../lib/local-cache-profiles";
    import { desktopFileOps, listGrantedFolders, pickAndGrantFolder, removeFile, revokeFolder } from "../../lib/tauri/desktop-access";
    import { describePermissions, probeRead, probeWrite, type ProbeResult } from "../../lib/tauri/folder-access";
    import { cn } from "../lib/utils";

    type Folder = { path: string; source: string; granted: boolean };
    type Status = { read?: ProbeResult; write?: ProbeResult; busy?: "read" | "write" };

    const permissions = describePermissions();

    let folders = $state<Folder[]>([]);
    let status = $state<Record<string, Status>>({});
    let loadError = $state<string | undefined>();

    /** Granted folders (the app's own list) plus the folders saved profiles point at, which may not be granted. */
    async function loadFolders(): Promise<void> {
        const list: Folder[] = [];
        const index = new Map<string, Folder>();
        const add = (path: string | undefined, source: string, granted: boolean): void => {
            if (!path) return;
            const existing = index.get(path);
            if (existing) {
                existing.source = existing.granted ? `${existing.source}, ${source}` : source;
                existing.granted ||= granted;
                return;
            }
            const folder = { path, source, granted };
            index.set(path, folder);
            list.push(folder);
        };
        try {
            for (const path of await listGrantedFolders()) add(path, "Granted", true);
            loadError = undefined;
        } catch (error) {
            loadError = String(error);
        }
        try {
            for (const profile of await loadLocalCacheProfilesAsync()) {
                add(profile.openRuneRootPath, `${profile.name}: project`, false);
                add(profile.systemCachePath, `${profile.name}: cache`, false);
            }
        } catch {
            /* no saved profiles yet */
        }
        folders = list;
    }

    async function checkRead(path: string): Promise<void> {
        status[path] = { ...status[path], busy: "read" };
        const read = await probeRead(path);
        status[path] = { ...status[path], read, busy: undefined };
    }

    async function checkWrite(path: string): Promise<void> {
        status[path] = { ...status[path], busy: "write" };
        const write = await probeWrite(path, { join: desktopFileOps.join, writeTextFile: desktopFileOps.writeTextFile, remove: removeFile });
        status[path] = { ...status[path], write, busy: undefined };
    }

    async function checkAll(): Promise<void> {
        await loadFolders();
        await Promise.all(folders.map((folder) => checkRead(folder.path)));
    }

    /** The native picker is the app's request for access; when re-granting it opens at the folder. */
    async function grant(path?: string): Promise<void> {
        const picked = await pickAndGrantFolder({ title: "Choose a folder to give OpenRune access to", defaultPath: path });
        if (!picked) return;
        await loadFolders();
        status = {};
        await checkAll();
    }

    async function revoke(path: string): Promise<void> {
        await revokeFolder(path);
        status = {};
        await checkAll();
    }

    onMount(() => {
        void checkAll();
    });
</script>

<section>
    <div class="mb-2 flex items-center justify-between">
        <h3 class="text-sm font-semibold">Folder access</h3>
        <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
            onclick={checkAll}
        >
            <RefreshCw class="size-3.5" aria-hidden="true" />
            Re-check all
        </button>
    </div>

    <div class="rounded-md border border-border bg-background p-3">
        <p class="mb-2 text-xs text-muted-foreground">
            What the desktop app may do with files. It can only touch folders you have granted below (hidden folders such as <code>.data</code>
            included), and the permissions themselves are built in.
        </p>
        <ul class="mb-3 space-y-1" aria-label="File permissions">
            {#each permissions as row (row.id)}
                <li class="flex items-start gap-2 text-xs">
                    {#if row.allowed}
                        <Check class="mt-0.5 size-3.5 shrink-0 text-emerald-400" aria-label="Allowed" />
                    {:else}
                        <X class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Not allowed" />
                    {/if}
                    <span>
                        <span class="font-medium">{row.label}</span>
                        <span class="text-muted-foreground"> — {row.detail}</span>
                    </span>
                </li>
            {/each}
        </ul>

        <p class="mb-1 text-xs font-medium">Folders</p>
        {#if loadError}
            <p class="mb-2 break-words text-xs text-destructive select-text">Could not read the list of granted folders: {loadError}</p>
        {:else if folders.length === 0}
            <p class="mb-2 text-xs text-muted-foreground">No folders yet. Add one, or import a project or cache.</p>
        {/if}
        <ul class="mb-3 space-y-2">
            {#each folders as folder (folder.path)}
                {@const state = status[folder.path]}
                <li class="rounded-md border border-border p-2 text-xs">
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <p class="break-all font-mono select-text">{folder.path}</p>
                            <p class={folder.granted ? "text-muted-foreground" : "text-amber-400"}>
                                {folder.granted ? folder.source : `${folder.source} — not granted yet`}
                            </p>
                        </div>
                        {#if folder.granted}
                            <button type="button" class="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Revoke access to this folder" title="Revoke access" onclick={() => revoke(folder.path)}>
                                <X class="size-3.5" />
                            </button>
                        {/if}
                    </div>
                    <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span class={cn(state?.read ? (state.read.ok ? "text-emerald-400" : "text-destructive") : "text-muted-foreground")}>
                            Read: {state?.busy === "read" ? "checking…" : state?.read ? (state.read.ok ? "yes" : "no") : "not checked"}
                        </span>
                        <span class={cn(state?.write ? (state.write.ok ? "text-emerald-400" : "text-destructive") : "text-muted-foreground")}>
                            Write: {state?.busy === "write" ? "testing…" : state?.write ? (state.write.ok ? "yes" : "no") : "not tested"}
                        </span>
                        <button type="button" class="underline-offset-2 hover:underline" disabled={!!state?.busy} onclick={() => checkRead(folder.path)}>Check read</button>
                        <button type="button" class="underline-offset-2 hover:underline" disabled={!!state?.busy} onclick={() => checkWrite(folder.path)} title="Creates and deletes a small temporary file in the folder">
                            Test write
                        </button>
                        {#if !folder.granted || (state?.read && !state.read.ok)}
                            <button type="button" class="text-sky-400 underline-offset-2 hover:underline" onclick={() => grant(folder.path)}>Grant access…</button>
                        {/if}
                    </div>
                    {#each [state?.read, state?.write] as result}
                        {#if result && (!result.ok || result.detail !== "writable")}
                            <p class={cn("mt-1 max-h-20 overflow-y-auto break-words select-text", result.ok ? "text-muted-foreground" : "text-destructive")}>{result.detail}</p>
                        {/if}
                    {/each}
                </li>
            {/each}
        </ul>

        <button
            type="button"
            class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
            onclick={() => grant()}
        >
            <FolderOpen class="size-4" aria-hidden="true" />
            Add folder…
        </button>
        <p class="mt-2 text-xs text-muted-foreground">
            Adding a folder opens the system folder picker, which is how this app asks for access. Grants are remembered between launches; revoke one
            with the × next to it.
        </p>
        <p class="mt-1 text-xs text-muted-foreground">
            If a check says "Operation not permitted", macOS itself is blocking the folder: open System Settings → Privacy &amp; Security → Files and
            Folders (or Full Disk Access) and allow the program that started the app. When running from source that is your terminal; an installed app
            appears under its own name.
        </p>
    </div>
</section>
