<script lang="ts">
    import Pin from "@lucide/svelte/icons/pin";

    import { getQuickControlsModel } from "../../../mapeditor/quick-controls-model";
    import { getTileFlagsToolModel } from "../../../mapeditor/plugins/builtins/tile-flags-tool-model";
    import { DEFAULT_QUICK_CONTROLS, VIEW_CONTROL_GROUPS, VIEW_CONTROLS, type ViewControl } from "../../../mapeditor/view-controls";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;

    const view = $derived(
        editor.read(() => ({
            plane: host.viewPlaneMax,
            values: Object.fromEntries(VIEW_CONTROLS.map((control) => [control.id, control.get(host)])) as Record<string, boolean>,
            pinned: getQuickControlsModel(host).pinned,
        })),
    );
    const isDefaultPins = $derived(view.pinned.length === DEFAULT_QUICK_CONTROLS.length && DEFAULT_QUICK_CONTROLS.every((id, index) => view.pinned[index] === id));

    const rgb = (c: readonly number[]): string => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;

    /** The number a flag is stored as, e.g. 1 for Unwalkable (shown beside its name). */
    function flagValue(control: ViewControl): string {
        return control.id.startsWith("flag-") ? control.id.slice(5) : "";
    }

    function setPlane(next: number): void {
        host.viewPlaneMax = Math.max(0, Math.min(3, next));
        host.notifyWorkbenchStateChanged();
    }

    function setAllFlags(on: boolean): void {
        const model = getTileFlagsToolModel(host);
        for (const descriptor of model.descriptors) model.setShowFlag(descriptor.flag, on);
    }
</script>

<div class="map-editor-panel flex min-h-0 flex-1 flex-col">
    <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
        <span>What the 3D view draws. Pin <Pin class="inline size-3 align-[-2px]" aria-hidden="true" /> a control to keep it in Quick controls.</span>
        <button
            type="button"
            class="shrink-0 rounded border border-input px-1.5 py-0.5 hover:bg-muted disabled:cursor-default disabled:opacity-50"
            disabled={isDefaultPins}
            onclick={() => getQuickControlsModel(host).reset()}
        >
            Reset pins
        </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
        {#each VIEW_CONTROL_GROUPS.filter((entry) => VIEW_CONTROLS.some((control) => control.group === entry.id)) as group (group.id)}
            {@const controls = VIEW_CONTROLS.filter((control) => control.group === group.id)}
            <section class="border-b border-border/70 px-2 py-2" aria-label={group.title}>
                <header class="mb-1.5 flex items-center justify-between gap-2">
                    <h3 class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
                    {#if group.id === "flags"}
                        <span class="flex gap-1 text-[11px]">
                            <button type="button" class="rounded border border-input px-1.5 py-0.5 hover:bg-muted" onclick={() => setAllFlags(true)}>Show all</button>
                            <button type="button" class="rounded border border-input px-1.5 py-0.5 hover:bg-muted" onclick={() => setAllFlags(false)}>Hide all</button>
                        </span>
                    {:else if group.id === "plane"}
                        <span class="flex items-center gap-1 text-xs">
                            <span class="text-muted-foreground">Plane</span>
                            <button type="button" class="grid size-6 place-items-center rounded border border-input hover:bg-muted disabled:opacity-50" disabled={view.plane <= 0} aria-label="Decrease view plane" onclick={() => setPlane(view.plane - 1)}>−</button>
                            <span class="w-4 text-center font-mono tabular-nums">{view.plane}</span>
                            <button type="button" class="grid size-6 place-items-center rounded border border-input hover:bg-muted disabled:opacity-50" disabled={view.plane >= 3} aria-label="Increase view plane" onclick={() => setPlane(view.plane + 1)}>+</button>
                        </span>
                    {/if}
                </header>
                <ul class="flex flex-col gap-1">
                    {#each controls as control (control.id)}
                        {@const on = view.values[control.id]}
                        {@const pinned = view.pinned.includes(control.id)}
                        <li class={cn("flex items-center gap-2 rounded-md border px-2 py-1 transition-colors", on ? "border-primary/50 bg-primary/5" : "border-border/70")}>
                            <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2" title={control.description}>
                                <input type="checkbox" class="size-3.5 shrink-0 cursor-pointer accent-primary" checked={on} onchange={(event) => control.set(host, event.currentTarget.checked)} />
                                {#if control.swatch}
                                    <span class="size-3 shrink-0 rounded-sm border border-border/60" style="background-color: {rgb(control.swatch)}" aria-hidden="true"></span>
                                {/if}
                                <span class="min-w-0">
                                    <span class="block truncate text-xs font-medium leading-tight">
                                        {control.group === "flags" ? control.label.replace(/ flag$/, "") : control.label}
                                        {#if flagValue(control)}<span class="font-mono text-[10px] font-normal text-muted-foreground"> · {flagValue(control)}</span>{/if}
                                    </span>
                                    <span class="block text-[10px] leading-tight text-muted-foreground">{control.description}</span>
                                </span>
                            </label>
                            <button
                                type="button"
                                class={cn("grid size-6 shrink-0 cursor-pointer place-items-center rounded hover:bg-muted", pinned ? "text-primary" : "text-muted-foreground hover:text-foreground")}
                                aria-pressed={pinned}
                                aria-label={pinned ? `Remove ${control.label} from Quick controls` : `Add ${control.label} to Quick controls`}
                                title={pinned ? "In Quick controls (click to remove)" : "Add to Quick controls"}
                                onclick={() => getQuickControlsModel(host).toggle(control.id)}
                            >
                                <Pin class={cn("size-3.5", pinned ? "fill-current" : "opacity-60")} aria-hidden="true" />
                            </button>
                        </li>
                    {/each}
                </ul>
                {#if group.id === "flags"}
                    <p class="mt-1.5 text-[11px] text-muted-foreground">Shows or hides each flag's colour on the map. Which flags the brush paints is set in the Tile painter's Flags tab.</p>
                {/if}
            </section>
        {/each}
    </div>
</div>
