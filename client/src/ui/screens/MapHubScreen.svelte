<script lang="ts">
    import Map from "@lucide/svelte/icons/map";
    import Pencil from "@lucide/svelte/icons/pencil";
    import X from "@lucide/svelte/icons/x";

    import { router } from "../lib/router.svelte";

    const suffix = $derived(router.search);

    const options = [
        {
            href: "/map/viewer",
            icon: Map,
            title: "Viewer",
            text: "Fly around the world, inspect locations, and use the full map UI.",
        },
        {
            href: "/map/editor",
            icon: Pencil,
            title: "Editor",
            text: "Paint terrain and underlays in 3D with the same loaded cache data.",
        },
    ];
</script>

<div class="flex h-full min-h-0 w-full flex-col items-center justify-center gap-6 p-6">
    <div class="w-1/2 min-w-0 max-w-full rounded-xl border border-border bg-card p-6 shadow-sm">
        <div class="mb-4 flex items-start justify-between gap-3">
            <div class="flex items-center gap-2">
                <div class="flex size-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Map class="size-5" aria-hidden="true" />
                </div>
                <div>
                    <h1 class="text-lg font-semibold tracking-tight">Map</h1>
                    <p class="text-xs text-muted-foreground">Uses your active cache from Cache Repository.</p>
                </div>
            </div>
            <button
                type="button"
                class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
                onclick={() => router.navigate("/")}
            >
                <X class="size-4" />
            </button>
        </div>
        <p class="mb-4 text-sm text-muted-foreground">
            Pick a mode. Both use the cache you have loaded in Cache Repository.
        </p>
        <div class="flex flex-col gap-3">
            {#each options as option (option.href)}
                {@const Icon = option.icon}
                <button
                    type="button"
                    class="flex w-full gap-3 rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-accent"
                    onclick={() => router.navigate(`${option.href}${suffix}`)}
                >
                    <Icon class="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span class="min-w-0 flex-1">
                        <span class="block text-sm font-medium">{option.title}</span>
                        <span class="mt-0.5 block text-xs leading-snug text-muted-foreground">{option.text}</span>
                    </span>
                </button>
            {/each}
        </div>
    </div>
</div>
