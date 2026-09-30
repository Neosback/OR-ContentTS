<script lang="ts">
    import ChevronDown from "@lucide/svelte/icons/chevron-down";
    import PlugZap from "@lucide/svelte/icons/plug-zap";
    import Search from "@lucide/svelte/icons/search";
    import Settings from "@lucide/svelte/icons/settings";

    import { BUILTIN_BRUSH_TYPE_PLUGINS } from "../../mapeditor/plugins/builtins/current-plugin-layout.builtin";
    import { BRUSHES_PLUGIN_ID, PLUGIN_HUB_ICON, listHubPlugins, setHubPluginEnabled } from "../../mapeditor/plugins/builtins/plugin-catalog";
    import { Badge } from "../components/ui/badge";
    import { Button } from "../components/ui/button";
    import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
    import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
    import { Input } from "../components/ui/input";
    import { Separator } from "../components/ui/separator";
    import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
    import { useEditorState } from "./editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;

    let open = $state(false);
    let brushSettingsOpen = $state(false);
    let search = $state("");
    let author = $state("");
    let disabledTags = $state<string[]>([]);

    const plugins = $derived(editor.read(() => listHubPlugins(host)));
    const allTags = $derived([...new Set(plugins.flatMap((plugin) => plugin.manifest.tags))].sort());
    const filtered = $derived.by(() => {
        const q = search.trim().toLowerCase();
        const a = author.trim().toLowerCase();
        return plugins.filter(({ id, manifest }) => {
            const matchesSearch = !q || manifest.name.toLowerCase().includes(q) || manifest.description.toLowerCase().includes(q) || id.toLowerCase().includes(q);
            const matchesAuthor = !a || manifest.author.toLowerCase().includes(a);
            const matchesTag = allTags.length === 0 || manifest.tags.some((tag) => !disabledTags.includes(tag));
            return matchesSearch && matchesAuthor && matchesTag;
        });
    });
    const enabledBrushCount = $derived(editor.read(() => BUILTIN_BRUSH_TYPE_PLUGINS.filter((brush) => host.isBrushShapePluginEnabled(brush.id)).length));

    // Typing in the hub must not drive the camera or tools underneath.
    $effect(() => {
        host.setEditorInputSuspendedBySource("plugin-hub-dialog", open || brushSettingsOpen);
        return () => host.setEditorInputSuspendedBySource("plugin-hub-dialog", false);
    });

    const toggleTag = (tag: string): void => {
        disabledTags = disabledTags.includes(tag) ? disabledTags.filter((t) => t !== tag) : [...disabledTags, tag];
    };
</script>

<Tooltip>
    <TooltipTrigger>
        {#snippet child({ props })}
            <Button {...props} variant="ghost" size="sm" class="gap-1.5 text-xs" onclick={() => (open = true)}>
                <PlugZap class="size-4" />
                <span>Plugin Hub</span>
            </Button>
        {/snippet}
    </TooltipTrigger>
    <TooltipContent side="bottom">Browse, filter, and toggle editor plugins.</TooltipContent>
</Tooltip>

<Dialog bind:open>
    <DialogContent class="max-w-3xl">
        <DialogHeader><DialogTitle>Plugin Hub</DialogTitle></DialogHeader>
        <div class="flex items-center gap-2">
            <div class="relative flex-1">
                <Search class="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input bind:value={search} placeholder="Search plugins..." class="pl-8 pr-28" />
                <div class="absolute right-1 top-1/2 -translate-y-1/2">
                    <DropdownMenu>
                        <DropdownMenuTrigger>
                            {#snippet child({ props })}
                                <Button {...props} size="sm" variant="outline" class="h-7 gap-1 px-2 text-[11px]">
                                    Tags ({Math.max(0, allTags.length - disabledTags.length)})
                                    <ChevronDown class="size-3.5" />
                                </Button>
                            {/snippet}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" class="w-72">
                            <div class="px-2 py-1.5 text-sm font-semibold">Filter tags</div>
                            <DropdownMenuSeparator />
                            <div class="grid max-h-44 grid-cols-3 gap-2 overflow-y-auto p-1">
                                {#each allTags as tag (tag)}
                                    <button type="button" class="text-left" onclick={() => toggleTag(tag)}>
                                        <Badge variant={disabledTags.includes(tag) ? "outline" : "secondary"}>{tag}</Badge>
                                    </button>
                                {/each}
                            </div>
                            <DropdownMenuSeparator />
                            <Button variant="ghost" size="sm" class="h-7 w-full justify-start px-2 text-[11px]" onclick={() => (disabledTags = [])}>Enable all tags</Button>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
            <Input bind:value={author} placeholder="Filter by author..." class="max-w-52" />
        </div>
        <Separator />
        <div class="max-h-[52vh] space-y-2 overflow-y-auto">
            {#each filtered as plugin (plugin.id)}
                <div class="flex items-start justify-between gap-4 rounded-md border p-3">
                    <div class="space-y-1">
                        <div class="flex items-center gap-2">
                            <span class="inline-flex size-4 items-center justify-center text-muted-foreground">
                                {#if plugin.manifest.icon === PLUGIN_HUB_ICON}<PlugZap class="size-4" />{:else}{plugin.manifest.icon}{/if}
                            </span>
                            <span class="font-medium">{plugin.manifest.name}</span>
                            <Badge variant="outline">v{plugin.manifest.version}</Badge>
                            <Badge variant="secondary">{plugin.manifest.author}</Badge>
                            <Badge variant={plugin.enabled ? "secondary" : "outline"}>{plugin.enabled ? "Enabled" : "Disabled"}</Badge>
                        </div>
                        <p class="text-xs text-muted-foreground">{plugin.manifest.description}</p>
                    </div>
                    <div class="flex items-center gap-2">
                        {#if plugin.id === BRUSHES_PLUGIN_ID}
                            <Button size="sm" variant="outline" onclick={() => (brushSettingsOpen = true)}>
                                <Settings class="mr-1 size-4" />
                                Configure
                            </Button>
                        {/if}
                        <Button size="sm" variant={plugin.enabled ? "outline" : "default"} disabled={plugin.required} onclick={() => setHubPluginEnabled(host, plugin.id, !plugin.enabled)}>
                            {plugin.required ? "Required" : plugin.enabled ? "Disable" : "Enable"}
                        </Button>
                    </div>
                </div>
            {/each}
        </div>
    </DialogContent>
</Dialog>

<Dialog bind:open={brushSettingsOpen}>
    <DialogContent class="max-w-lg">
        <DialogHeader><DialogTitle>Brushes</DialogTitle></DialogHeader>
        <div class="space-y-2">
            {#each BUILTIN_BRUSH_TYPE_PLUGINS as brush (brush.id)}
                {@const enabled = editor.read(() => host.isBrushShapePluginEnabled(brush.id))}
                <div class="flex items-center justify-between rounded-md border p-2">
                    <div>
                        <p class="text-sm font-medium">{brush.name}</p>
                        <p class="text-xs text-muted-foreground">{brush.description}</p>
                    </div>
                    <Button size="sm" variant={enabled ? "outline" : "default"} disabled={enabled && enabledBrushCount <= 1} onclick={() => host.setBrushShapePluginEnabled(brush.id, !enabled)}>
                        {enabled ? "Disable" : "Enable"}
                    </Button>
                </div>
            {/each}
        </div>
    </DialogContent>
</Dialog>
