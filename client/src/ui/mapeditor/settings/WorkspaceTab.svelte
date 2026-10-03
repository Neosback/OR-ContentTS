<script lang="ts">
    import { Button } from "../../components/ui/button";
    import { notifyError, notifySuccess } from "../../lib/notify";
    import { useEditorState } from "../editor-state.svelte";
    import {
        deleteLayout,
        listLayouts,
        parseLayoutFile,
        renameLayout,
        saveLayout,
        serializeLayoutFile,
        uniqueLayoutName,
        type SavedLayout,
    } from "../workspace-layouts";
    import { applySettings, clearSettings, collectSettings, parseSettingsFile, serializeSettings } from "../workspace-settings";

    const editor = useEditorState();
    const workbench = $derived(editor.layout);

    let layouts = $state<SavedLayout[]>(listLayouts());
    let newName = $state("");
    let renaming = $state<{ id: string; name: string } | undefined>();
    // Destructive buttons ask twice instead of using window.confirm (not available in every webview).
    let armed = $state<string | undefined>();

    const refresh = (): void => {
        layouts = listLayouts();
    };
    const arm = (key: string): boolean => {
        if (armed === key) {
            armed = undefined;
            return true;
        }
        armed = key;
        return false;
    };

    function saveNew(): void {
        if (!workbench) return;
        const name = uniqueLayoutName(layouts, newName || "My layout");
        saveLayout(workbench.captureLayout(name));
        newName = "";
        refresh();
        notifySuccess(`Saved layout "${name}".`);
    }
    function apply(layout: SavedLayout): void {
        if (!workbench) return;
        if (workbench.applyLayout(layout)) notifySuccess(`Switched to "${layout.name}".`);
        else notifyError(`"${layout.name}" could not be loaded; the default layout was restored.`);
    }
    function update(layout: SavedLayout): void {
        if (!workbench || !arm(`update:${layout.id}`)) return;
        saveLayout(workbench.captureLayout(layout.name, layout.id));
        refresh();
        notifySuccess(`Updated "${layout.name}" with the current arrangement.`);
    }
    function remove(layout: SavedLayout): void {
        if (!arm(`delete:${layout.id}`)) return;
        deleteLayout(layout.id);
        refresh();
    }
    function commitRename(): void {
        if (!renaming) return;
        renameLayout(renaming.id, renaming.name);
        renaming = undefined;
        refresh();
    }

    function download(text: string, filename: string): void {
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
    }
    const slug = (name: string): string => name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "layout";

    function exportLayout(layout: SavedLayout): void {
        download(serializeLayoutFile(layout), `${slug(layout.name)}.layout.json`);
    }
    async function importLayout(event: Event): Promise<void> {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        const result = parseLayoutFile(await file.text());
        if ("error" in result) return notifyError(result.error);
        saveLayout(result.layout);
        refresh();
        notifySuccess(`Imported layout "${result.layout.name}".`);
    }

    function exportSettings(): void {
        download(serializeSettings(collectSettings()), "map-editor-settings.json");
        notifySuccess("Exported the map editor settings.");
    }
    async function importSettings(event: Event): Promise<void> {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        const result = parseSettingsFile(await file.text());
        if ("error" in result) return notifyError(result.error);
        applySettings(result.settings);
        notifySuccess("Settings imported. Reloading…");
        window.setTimeout(() => window.location.reload(), 600);
    }
    function resetSettings(): void {
        if (!arm("reset-settings")) return;
        clearSettings();
        window.location.reload();
    }

    const section = "grid gap-2 rounded-md border p-3";
    const small = "h-7 px-2 text-xs";
</script>

<div class="flex h-full flex-col gap-3 overflow-y-auto pr-1">
    <section class={section}>
        <h3 class="text-sm font-medium">Starting points</h3>
        <p class="text-xs text-muted-foreground">Replace the current arrangement. Your saved layouts are not touched.</p>
        <div class="flex flex-wrap gap-2">
            <Button variant="outline" class={small} onclick={() => workbench?.applyPreset("default")}>Default</Button>
            <Button variant="outline" class={small} onclick={() => workbench?.applyPreset("minimal")}>Minimal (3D + painter)</Button>
        </div>
    </section>

    <section class={section}>
        <h3 class="text-sm font-medium">Saved layouts</h3>
        <p class="text-xs text-muted-foreground">A layout is where every panel sits (docked or floating), the Tile painter's side, and your pinned Quick controls.</p>
        <form class="flex gap-2" onsubmit={(event) => { event.preventDefault(); saveNew(); }}>
            <input class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm" placeholder="Name for the current layout" aria-label="Layout name" bind:value={newName} />
            <Button type="submit" class="h-8 px-3 text-xs" disabled={!workbench}>Save current layout</Button>
        </form>
        {#if layouts.length === 0}
            <p class="text-xs text-muted-foreground">No saved layouts yet.</p>
        {:else}
            <ul class="grid gap-1.5">
                {#each layouts as layout (layout.id)}
                    <li class="flex flex-wrap items-center gap-1.5 rounded-md border border-border/70 px-2 py-1.5">
                        {#if renaming?.id === layout.id}
                            <form class="flex min-w-0 flex-1 gap-1.5" onsubmit={(event) => { event.preventDefault(); commitRename(); }}>
                                <input class="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm" aria-label="New name" bind:value={renaming.name} />
                                <Button type="submit" class={small}>Rename</Button>
                                <Button type="button" variant="ghost" class={small} onclick={() => (renaming = undefined)}>Cancel</Button>
                            </form>
                        {:else}
                            <span class="min-w-0 flex-1 truncate text-sm font-medium">{layout.name}
                                <span class="ml-1 text-[11px] font-normal text-muted-foreground">{new Date(layout.savedAt).toLocaleDateString()}</span>
                            </span>
                            <Button class={small} onclick={() => apply(layout)}>Apply</Button>
                            <Button variant="outline" class={small} onclick={() => update(layout)}>{armed === `update:${layout.id}` ? "Overwrite?" : "Update"}</Button>
                            <Button variant="ghost" class={small} onclick={() => (renaming = { id: layout.id, name: layout.name })}>Rename</Button>
                            <Button variant="ghost" class={small} onclick={() => exportLayout(layout)}>Export</Button>
                            <Button variant="ghost" class="{small} text-destructive" onclick={() => remove(layout)}>{armed === `delete:${layout.id}` ? "Delete?" : "Delete"}</Button>
                        {/if}
                    </li>
                {/each}
            </ul>
        {/if}
        <label class="text-xs text-muted-foreground">
            Import a layout file
            <input type="file" accept=".json,application/json" class="mt-1 block text-xs" onchange={(event) => void importLayout(event)} />
        </label>
    </section>

    <section class={section}>
        <h3 class="text-sm font-medium">All editor settings</h3>
        <p class="text-xs text-muted-foreground">Keybinds, plugin switches, brush, display, gizmo colours, pinned controls and layouts, in one file. Cache profiles and projects are not included.</p>
        <div class="flex flex-wrap items-center gap-2">
            <Button variant="outline" class={small} onclick={exportSettings}>Export settings</Button>
            <label class="inline-flex cursor-pointer items-center rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">
                Import settings…
                <input type="file" accept=".json,application/json" class="sr-only" onchange={(event) => void importSettings(event)} />
            </label>
            <Button variant="ghost" class="{small} text-destructive" onclick={resetSettings}>{armed === "reset-settings" ? "Really reset everything?" : "Reset all settings"}</Button>
        </div>
    </section>
</div>
