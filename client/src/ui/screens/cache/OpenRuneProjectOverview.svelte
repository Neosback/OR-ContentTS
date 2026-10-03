<script lang="ts">
    import Check from "@lucide/svelte/icons/check";
    import CircleAlert from "@lucide/svelte/icons/circle-alert";
    import Minus from "@lucide/svelte/icons/minus";

    import type { FeatureStatus, OpenRuneProjectOverview } from "../../../project/openrune-project-overview";
    import { cn } from "../../lib/utils";

    let { overview }: { overview: OpenRuneProjectOverview } = $props();

    const statusLabel: Record<FeatureStatus, string> = { ready: "Ready", partial: "Partly there", missing: "Not available" };
    const statusClass: Record<FeatureStatus, string> = {
        ready: "text-emerald-400",
        partial: "text-amber-400",
        missing: "text-muted-foreground",
    };
</script>

<div class="space-y-5 text-sm">
    <section aria-labelledby="overview-features">
        <h3 id="overview-features" class="mb-2 text-sm font-semibold">What this project gives you</h3>
        <ul class="divide-y divide-border rounded-md border border-border">
            {#each overview.features as feature (feature.id)}
                <li class="flex items-start gap-3 px-3 py-2">
                    <span class={cn("mt-0.5 shrink-0", statusClass[feature.status])} role="img" aria-label={statusLabel[feature.status]}>
                        {#if feature.status === "ready"}
                            <Check class="size-4" />
                        {:else if feature.status === "partial"}
                            <CircleAlert class="size-4" />
                        {:else}
                            <Minus class="size-4" />
                        {/if}
                    </span>
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-x-2">
                            <span class="font-medium">{feature.label}</span>
                            {#if feature.usage === "active"}
                                <span class="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary" title="A Studio editor uses this today">In use</span>
                            {:else}
                                <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title="Loaded and queryable, but no editor uses it yet">Loaded</span>
                            {/if}
                        </div>
                        <p class="text-xs text-muted-foreground">{feature.detail}</p>
                    </div>
                </li>
            {/each}
        </ul>
        <p class="mt-1.5 text-xs text-muted-foreground">
            <span class="font-medium">In use</span> means a Studio editor reads it today. <span class="font-medium">Loaded</span> means Studio has indexed it from your project and it is ready for editors that use it.
        </p>
    </section>

    <section aria-labelledby="overview-data">
        <h3 id="overview-data" class="mb-2 text-sm font-semibold">Everything that was loaded</h3>
        <div class="grid gap-3 sm:grid-cols-2">
            {#each overview.sections as section (section.id)}
                <div class="rounded-md border border-border p-3">
                    <h4 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</h4>
                    <dl class="space-y-1 text-xs">
                        {#each section.rows as row (row.label)}
                            <div class="grid grid-cols-[7.5rem_1fr] gap-2" title={row.hint}>
                                <dt class="text-muted-foreground">{row.label}</dt>
                                <dd class="min-w-0 break-words select-text">{row.value}</dd>
                            </div>
                        {/each}
                    </dl>
                </div>
            {/each}
        </div>
    </section>

    {#if overview.issues.length > 0}
        <section aria-labelledby="overview-issues">
            <h3 id="overview-issues" class="mb-2 text-sm font-semibold">To review ({overview.issueTotal.toLocaleString("en-US")})</h3>
            <div class="space-y-2">
                {#each overview.issues as group (group.area)}
                    <details class="rounded-md border border-border px-3 py-2 text-xs">
                        <summary class="cursor-pointer font-medium">{group.area}: {group.count.toLocaleString("en-US")} {group.count === 1 ? "issue" : "issues"}</summary>
                        <ul class="mt-2 space-y-1 text-muted-foreground">
                            {#each group.samples as sample}
                                <li class="break-words select-text">{sample}</li>
                            {/each}
                            {#if group.count > group.samples.length}
                                <li>and {group.count - group.samples.length} more</li>
                            {/if}
                        </ul>
                    </details>
                {/each}
            </div>
        </section>
    {/if}
</div>
