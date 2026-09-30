<script lang="ts">
    import { getRegisteredEditorToolKeybinds, keybindChordToLabel } from "../../../mapeditor/editor-tool-input";
    import { CORE_VIEWER_KEYBIND_PLUGIN_ID } from "../../../mapeditor/plugins/builtins/core-viewer-keybinds.builtin";
    import { Button } from "../../components/ui/button";
    import { Input } from "../../components/ui/input";
    import { contextMenu } from "../../components/context-menu/context-menu.svelte";
    import { useEditorState } from "../editor-state.svelte";
    import { KeybindCapture } from "./keybind-capture.svelte";

    /** "core" is the camera/navigation keybinds plus the viewer control settings; "plugins" is every other keybind, grouped by plugin. */
    let { scope }: { scope: "core" | "plugins" } = $props();

    const editor = useEditorState();
    const host = editor.host;
    const capture = new KeybindCapture(host);

    let search = $state("");
    let compact = $state(false);

    // Re-read whenever overrides change (they notify the workbench snapshot).
    const rows = $derived.by(() => {
        editor.snapshot.current;
        const q = search.trim().toLowerCase();
        return getRegisteredEditorToolKeybinds()
            .map((row) => ({
                pluginId: row.pluginId,
                pluginName: row.pluginName,
                key: row.key,
                name: row.binding.name,
                description: row.binding.description,
                defaultChords: row.binding.defaultChords,
            }))
            .filter((row) => (scope === "core") === (row.pluginId === CORE_VIEWER_KEYBIND_PLUGIN_ID))
            .filter((row) => {
                if (!q) return true;
                const parts = scope === "core" ? [row.name, row.description ?? "", row.key] : [row.pluginName, row.pluginId, row.name, row.description ?? "", row.key];
                return parts.join(" ").toLowerCase().includes(q);
            });
    });
    const groups = $derived.by(() => {
        const map = new Map<string, typeof rows>();
        for (const row of rows) map.set(row.pluginName, [...(map.get(row.pluginName) ?? []), row]);
        return Array.from(map.entries());
    });
    const viewer = $derived(editor.read(() => host.getViewerControlSettings()));

    $effect(() => {
        capture.capturingKey;
        return capture.listen();
    });

    const label = (chords: readonly Parameters<typeof keybindChordToLabel>[0][]): string => chords.map((c) => keybindChordToLabel(c)).join(" / ");
    function current(row: (typeof rows)[number]): string {
        if (capture.capturingKey === row.key && capture.preview) return keybindChordToLabel(capture.preview);
        const resolved = host.getResolvedKeybindChords(row.key, row.defaultChords);
        return resolved.length > 0 ? label(resolved) : "Not set";
    }

    function resetAll(): void {
        if (!window.confirm(scope === "core" ? "Reset all core keybind overrides to defaults?" : "Reset all keybind overrides to defaults?")) return;
        if (scope === "core") {
            for (const row of rows) host.clearKeybindOverride(row.key);
        } else {
            host.clearAllKeybindOverrides();
        }
    }

    function rowMenu(event: MouseEvent, key: string): void {
        contextMenu.open(event, undefined, [
            { id: "change", label: "Change keybind", onSelect: () => capture.begin(key) },
            { id: "reset", label: "Reset to default", onSelect: () => host.clearKeybindOverride(key) },
        ]);
    }

    const sliders = [
        { key: "mouseWheelZoomSensitivity", label: "Zoom sensitivity" },
        { key: "mouseLookSensitivity", label: "Mouse look sensitivity" },
        { key: "mousePanSensitivity", label: "2D pan sensitivity" },
        { key: "keyboardMoveSpeed", label: "Keyboard move speed" },
    ] as const;
    const toggles = [
        { key: "mouseCameraEnabled", label: "Mouse drag look/pan" },
        { key: "mouseWheelZoomEnabled", label: "Mouse wheel zoom" },
    ] as const;
</script>

{#snippet rowActions(row: (typeof rows)[number], size: "sm" | "md")}
    <div class="flex items-center gap-2">
        <span class="rounded border bg-muted/40 font-mono {size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs'}">{current(row)}</span>
        <Button
            size="sm"
            variant={capture.capturingKey === row.key ? "default" : "outline"}
            disabled={!!capture.capturingKey && capture.capturingKey !== row.key}
            onclick={() => capture.toggle(row.key)}
            oncontextmenu={(event: MouseEvent) => rowMenu(event, row.key)}
            title="Left click: change keybind. Right click: reset."
        >
            {capture.capturingKey === row.key ? "Cancel" : "Change"}
        </Button>
    </div>
{/snippet}

<div class="flex h-full min-h-0 flex-col {scope === 'core' ? 'gap-2' : 'gap-3'}">
    <div class="flex items-center {scope === 'core' ? 'gap-1.5' : 'gap-2'}">
        {#if capture.capturingKey}
            <div class="flex-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-foreground">
                Recording Keybind.. [{capture.preview ? keybindChordToLabel(capture.preview) : capture.previewLabel}]
            </div>
        {:else}
            <Input bind:value={search} placeholder={scope === "core" ? "Search core keybinds..." : "Search keybinds..."} class={scope === "core" ? "h-7 text-xs" : "h-8"} />
        {/if}
        {#if scope === "plugins"}
            <Button size="sm" variant={compact ? "default" : "outline"} onclick={() => (compact = !compact)}>Compact</Button>
        {/if}
        <Button size="sm" variant="outline" onclick={resetAll}>Reset all keybinds</Button>
    </div>

    <div class="min-h-0 flex-1 {scope === 'core' ? 'space-y-2' : 'space-y-3'} overflow-y-auto pr-1">
        {#if scope === "core"}
            <div class="rounded-md border p-2">
                <p class="mb-1 text-xs font-semibold">Core Controls</p>
                <div class="grid gap-1.5">
                    {#each toggles as toggle (toggle.key)}
                        <label class="flex cursor-pointer items-start justify-between gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
                            <div><p class="text-xs font-medium">{toggle.label}</p></div>
                            <input
                                type="checkbox"
                                class="mt-0.5 size-4 rounded border border-input accent-primary"
                                checked={viewer[toggle.key]}
                                onchange={(e) => host.setViewerControlSettings({ [toggle.key]: e.currentTarget.checked })}
                            />
                        </label>
                    {/each}
                </div>
                <div class="mt-2 grid gap-1.5">
                    {#each sliders as slider (slider.key)}
                        <div class="grid gap-1">
                            <div class="flex items-center justify-between gap-2">
                                <p class="text-[11px] text-muted-foreground">{slider.label}</p>
                                <span class="text-[11px] tabular-nums text-muted-foreground">{viewer[slider.key].toFixed(2)}x</span>
                            </div>
                            <input
                                type="range"
                                min="10"
                                max="400"
                                value={Math.round(viewer[slider.key] * 100)}
                                class="h-2 w-full accent-primary"
                                oninput={(e) => host.setViewerControlSettings({ [slider.key]: Number(e.currentTarget.value) / 100 })}
                            />
                        </div>
                    {/each}
                </div>
            </div>
            <div class="rounded-md border">
                {#if rows.length === 0}
                    <p class="p-3 text-sm text-muted-foreground">No core keybinds match this filter.</p>
                {:else}
                    <div class="divide-y">
                        {#each rows as row (row.key)}
                            <div class="flex items-center justify-between gap-2 px-2 py-1.5">
                                <div class="min-w-0"><p class="truncate text-xs font-medium">{row.name}</p></div>
                                {@render rowActions(row, "sm")}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {:else}
            {#each groups as [pluginName, groupRows] (pluginName)}
                <div class="rounded-md border">
                    <div class="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">{pluginName}</div>
                    <div class="divide-y">
                        {#each groupRows as row (row.key)}
                            <div class="flex items-center justify-between gap-3 px-3 py-2">
                                <div class="min-w-0">
                                    <p class="truncate text-sm font-medium">{row.name}</p>
                                    {#if !compact}
                                        <p class="truncate text-xs text-muted-foreground">{row.description || row.key}</p>
                                        <p class="truncate text-[11px] text-muted-foreground">Default: {row.defaultChords.length > 0 ? label(row.defaultChords) : "None"}</p>
                                    {/if}
                                </div>
                                {@render rowActions(row, "md")}
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
            {#if groups.length === 0}<p class="text-sm text-muted-foreground">No keybinds match this filter.</p>{/if}
        {/if}
    </div>
</div>
