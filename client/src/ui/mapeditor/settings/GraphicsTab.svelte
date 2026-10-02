<script lang="ts">
    import { PERF_LEVELS, PERF_PROFILES, perf, type PerfLevel } from "../../../perf/perf-profile";
    import { Button } from "../../components/ui/button";
    import { Label } from "../../components/ui/label";
    import { perfState } from "../../lib/perf.svelte";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;

    // These are plain fields on the host, so keep local copies the sliders can bind to.
    let renderDistance = $state(host.renderDistance);
    let unloadDistance = $state(host.unloadDistance);
    let lodDistance = $state(host.lodDistance);
    let fpsLimit = $state(host.renderer.fpsLimit);

    const level = $derived(perfState.current.level);
    // Worker count is fixed when the render pool is created, so a different profile needs a reload for that part.
    let workersChanged = $state(false);
    function choose(next: PerfLevel): void {
        if (PERF_PROFILES[next].workers !== PERF_PROFILES[perf.level].workers) workersChanged = true;
        perf.setLevel(next);
        // Apply the new frame limit to the running renderer too (the slider below can still override it).
        host.renderer.fpsLimit = PERF_PROFILES[next].fpsLimit;
        fpsLimit = host.renderer.fpsLimit;
    }

    const sliders = [
        { label: "Render Distance", min: 16, max: 2000, step: 16, get: () => renderDistance, set: (v: number) => ((renderDistance = v), (host.renderDistance = v)) },
        { label: "Unload Distance", min: 1, max: 30, step: 1, get: () => unloadDistance, set: (v: number) => ((unloadDistance = v), (host.unloadDistance = v)) },
        { label: "LOD Distance", min: 0, max: 30, step: 1, get: () => lodDistance, set: (v: number) => ((lodDistance = v), (host.lodDistance = v)) },
        { label: "Max FPS", min: 15, max: 240, step: 1, get: () => fpsLimit, set: (v: number) => ((fpsLimit = v), (host.renderer.fpsLimit = v)) },
    ];
</script>

<div class="grid gap-4 rounded-md border p-3">
    <div class="grid gap-2">
        <Label class="text-xs">Performance profile</Label>
        <div class="grid grid-cols-3 gap-1.5">
            {#each PERF_LEVELS as option (option)}
                <Button size="sm" variant={level === option ? "secondary" : "outline"} class={cn("h-8 text-xs", level === option && "ring-1 ring-primary/40")} aria-pressed={level === option} onclick={() => choose(option)}>
                    {PERF_PROFILES[option].label}
                </Button>
            {/each}
        </div>
        <p class="text-[11px] leading-snug text-muted-foreground">{PERF_PROFILES[level].description}</p>
        {#if workersChanged}
            <div class="flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px]">
                <span>Worker count changes after a reload.</span>
                <Button size="sm" variant="outline" class="h-6 px-2 text-[11px]" onclick={() => window.location.reload()}>Reload</Button>
            </div>
        {/if}
    </div>
    <div class="h-px bg-border"></div>
    {#each sliders as slider (slider.label)}
        <div class="grid gap-1">
            <Label class="text-xs">{slider.label} ({slider.get()})</Label>
            <input
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={slider.get()}
                class="h-2 w-full accent-primary"
                oninput={(event) => slider.set(Number(event.currentTarget.value))}
            />
        </div>
    {/each}
</div>
