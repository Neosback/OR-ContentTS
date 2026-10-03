<script lang="ts">
    import { Command } from "bits-ui";

    import { onOpenCommandPalette } from "../../mapeditor/command-palette-signal";
    import { getObjectCatalog } from "../../mapeditor/object-catalog";
    import { buildPaletteItems, groupPaletteItems } from "../../mapeditor/palette-sources";
    import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../components/ui/dialog";
    import { notifyMessage, notifySuccess } from "../lib/notify";
    import { useEditorState } from "./editor-state.svelte";
    import { listLayouts, type SavedLayout } from "./workspace-layouts";

    let { onOpenSettings }: { onOpenSettings: (tab?: string) => void } = $props();

    const editor = useEditorState();
    const host = editor.host;
    const catalog = getObjectCatalog(host);

    let open = $state(false);
    let query = $state("");
    let layouts = $state<SavedLayout[]>([]);
    /** Bumped while the object names are still being read, so results fill in as they arrive. */
    let catalogVersion = $state(0);
    let selected = $state("");

    $effect(() => onOpenCommandPalette(() => show()));
    $effect(() => {
        if (!open) return;
        const off = catalog.subscribe(() => catalogVersion++);
        catalog.start();
        return off;
    });
    // Typing into the palette must not drive the camera or tools underneath.
    $effect(() => {
        host.setEditorInputSuspendedBySource("command-palette", open);
        return () => host.setEditorInputSuspendedBySource("command-palette", false);
    });

    export function show(): void {
        query = "";
        selected = "";
        layouts = listLayouts();
        open = true;
    }

    const items = $derived.by(() => {
        catalogVersion;
        editor.snapshot.current;
        const workbench = editor.layout;
        return buildPaletteItems(
            {
                commandContext: { host, layout: workbench, notify: { success: notifySuccess, message: notifyMessage } },
                panels: workbench?.reopenablePanels() ?? [],
                openPanel: (id) => workbench?.openPanel(id),
                layouts,
                applyLayout: (id) => {
                    const layout = layouts.find((entry) => entry.id === id);
                    if (layout) workbench?.applyLayout(layout);
                },
                presets: [
                    { id: "default", name: "Default" },
                    { id: "minimal", name: "Minimal (3D + painter)" },
                ],
                applyPreset: (id) => workbench?.applyPreset(id as "default" | "minimal"),
                openSettings: onOpenSettings,
                searchObjects: (text) => catalog.search(text),
            },
            query,
        );
    });
    const groups = $derived(groupPaletteItems(items));

    function run(item: (typeof items)[number]): void {
        open = false;
        // Let the dialog release focus first so tools that read the keyboard see a clean state.
        queueMicrotask(() => item.run());
    }
</script>

<Dialog bind:open>
    <DialogContent class="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0" showClose={false}>
        <DialogTitle class="sr-only">Command palette</DialogTitle>
        <DialogDescription class="sr-only">Search commands, panels, layouts and objects, or type a region id or coordinates to jump there.</DialogDescription>
        <Command.Root shouldFilter={false} loop bind:value={selected} class="flex max-h-[min(28rem,70vh)] flex-col" label="Command palette">
            <Command.Input
                bind:value={query}
                placeholder="Type a command, an object name, a region id (12342) or coordinates (3100, 3512)…"
                class="h-11 w-full shrink-0 border-b border-border bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Command.List class="min-h-0 flex-1 overflow-y-auto p-1">
                <Command.Viewport>
                    <Command.Empty class="px-3 py-6 text-center text-sm text-muted-foreground">
                        {catalog.done ? "Nothing matches." : "Nothing yet. Object names are still loading…"}
                    </Command.Empty>
                    {#each groups as group (group.group)}
                        <Command.Group value={group.group}>
                            <Command.GroupHeading class="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group.group}</Command.GroupHeading>
                            <Command.GroupItems>
                                {#each group.items as item (item.id)}
                                    <Command.Item
                                        value={item.id}
                                        onSelect={() => run(item)}
                                        class="flex cursor-pointer flex-col rounded-md px-3 py-1.5 text-sm outline-none data-[selected]:bg-accent data-[selected]:text-accent-foreground"
                                    >
                                        <span class="truncate">{item.title}</span>
                                        {#if item.subtitle}
                                            <span class="truncate text-[11px] text-muted-foreground">{item.subtitle}</span>
                                        {/if}
                                    </Command.Item>
                                {/each}
                            </Command.GroupItems>
                        </Command.Group>
                    {/each}
                </Command.Viewport>
            </Command.List>
        </Command.Root>
    </DialogContent>
</Dialog>
