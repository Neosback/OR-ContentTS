<script lang="ts">
    import Loader from "@lucide/svelte/icons/loader-circle";

    import { cacheSetupKind, type LocalCacheProfile } from "../../../lib/local-cache-profiles";
    import { getActiveOpenRuneProjectRuntime, syncActiveOpenRuneProjectRuntime } from "../../../lib/active-openrune-project-runtime";
    import { describeOpenRuneProject, type OpenRuneProjectOverview as Overview } from "../../../project/openrune-project-overview";
    import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
    import { errorMessage } from "../../lib/notify";
    import OpenRuneProjectOverview from "./OpenRuneProjectOverview.svelte";

    let { open = $bindable(false), profile }: { open?: boolean; profile: LocalCacheProfile | null } = $props();

    let overview = $state<Overview | undefined>();
    let loadError = $state<string | undefined>();
    let loading = $state(false);

    // Loads (or reuses) the retained project session for this setup whenever the dialog opens.
    $effect(() => {
        if (!open || !profile || cacheSetupKind(profile) !== "openrune") return;
        const target = $state.snapshot(profile) as LocalCacheProfile;
        let cancelled = false;
        overview = undefined;
        loadError = undefined;
        loading = true;
        void (async () => {
            try {
                const runtime = getActiveOpenRuneProjectRuntime(target.id) ?? (await syncActiveOpenRuneProjectRuntime(target));
                if (cancelled) return;
                if (!runtime) throw new Error("This setup is not an OpenRune project.");
                overview = describeOpenRuneProject(runtime.snapshot, target.name);
            } catch (error) {
                if (!cancelled) loadError = errorMessage(error);
            } finally {
                if (!cancelled) loading = false;
            }
        })();
        return () => {
            cancelled = true;
        };
    });
</script>

<Dialog bind:open>
    <DialogContent class="flex max-h-[88vh] w-[92vw] max-w-3xl flex-col gap-0 bg-card p-0 sm:rounded-lg">
        <div class="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle class="text-base leading-normal">{overview?.name ?? profile?.name ?? "OpenRune project"}</DialogTitle>
            <p class="text-xs text-muted-foreground">{overview?.summary ?? "Reading your project..."}</p>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {#if loading}
                <p class="flex items-center gap-2 text-sm text-muted-foreground"><Loader class="size-4 animate-spin" aria-hidden="true" /> Reading the project folder...</p>
            {:else if loadError}
                <p class="break-words rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive select-text">{loadError}</p>
            {:else if overview}
                <OpenRuneProjectOverview {overview} />
            {/if}
        </div>
        <div class="flex shrink-0 justify-end border-t border-border px-6 py-3">
            <button type="button" class="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onclick={() => (open = false)}>Done</button>
        </div>
    </DialogContent>
</Dialog>
