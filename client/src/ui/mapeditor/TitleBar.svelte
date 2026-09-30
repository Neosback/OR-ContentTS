<script lang="ts">
    import Download from "@lucide/svelte/icons/download";
    import LayoutGrid from "@lucide/svelte/icons/layout-grid";
    import PanelRightOpen from "@lucide/svelte/icons/panel-right-open";
    import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
    import Settings from "@lucide/svelte/icons/settings";
    import Upload from "@lucide/svelte/icons/upload";

    import { groupProviders } from "../../mapeditor/plugins/builtins/import-export-providers";
    import { Badge } from "../components/ui/badge";
    import { Button } from "../components/ui/button";
    import {
        DropdownMenu,
        DropdownMenuContent,
        DropdownMenuItem,
        DropdownMenuSeparator,
        DropdownMenuSub,
        DropdownMenuSubContent,
        DropdownMenuSubTrigger,
        DropdownMenuTrigger,
    } from "../components/ui/dropdown-menu";
    import { Separator } from "../components/ui/separator";
    import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "../components/ui/tooltip";
    import { notifyError, notifyMessage, notifySuccess } from "../lib/notify";
    import { useEditorState } from "./editor-state.svelte";
    import PluginHub from "./PluginHub.svelte";
    import SettingsDialog from "./settings/SettingsDialog.svelte";

    const editor = useEditorState();
    const host = editor.host;

    let settingsOpen = $state(false);

    const importGroups = groupProviders("import");
    const exportGroups = groupProviders("export");
    // Panels' open/closed state is read reactively from the dock's location map.
    const panels = $derived.by(() => {
        editor.layout?.locations;
        return editor.layout?.reopenablePanels() ?? [];
    });

    function reopen(id: string, title: string): void {
        if (!editor.layout) return notifyError("Workbench is still loading.");
        editor.layout.openPanel(id);
        notifySuccess(`${title} opened`);
    }
    function restoreAll(): void {
        if (!editor.layout) return notifyError("Workbench is still loading.");
        editor.layout.restoreAllPanels();
        notifySuccess("Closed panels restored where possible.");
    }
    function resetLayout(): void {
        if (!editor.layout) return notifyError("Workbench is still loading.");
        editor.layout.resetLayout();
        notifyMessage("Workspace reset to default layout.");
    }
</script>

{#snippet menuButton(label: string, tip: string, Icon: typeof Upload)}
    <Tooltip>
        <TooltipTrigger>
            {#snippet child({ props })}
                <DropdownMenuTrigger>
                    {#snippet child({ props: triggerProps })}
                        <Button {...props} {...triggerProps} variant="ghost" size="sm" class="gap-1.5 px-2">
                            <Icon class="size-4" />
                            <span class="hidden sm:inline">{label}</span>
                        </Button>
                    {/snippet}
                </DropdownMenuTrigger>
            {/snippet}
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
{/snippet}

{#snippet providerMenu(groups: ReturnType<typeof groupProviders>, emptyText: string)}
    {#if groups.length === 0}
        <DropdownMenuItem disabled>{emptyText}</DropdownMenuItem>
    {:else}
        {#each groups as [category, providers] (category)}
            <DropdownMenuSub>
                <DropdownMenuSubTrigger>{category}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                    {#each providers as provider (provider.id)}
                        <DropdownMenuItem onSelect={() => provider.run({ host, notify: notifyMessage })}>{provider.name}</DropdownMenuItem>
                    {/each}
                </DropdownMenuSubContent>
            </DropdownMenuSub>
        {/each}
    {/if}
{/snippet}

<TooltipProvider delayDuration={300}>
    <header data-map-editor-title-bar class="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3 backdrop-blur-sm">
        <div class="flex min-w-0 items-center gap-2">
            <span class="truncate text-sm font-semibold text-foreground">Map editor</span>
            <Badge variant="secondary" class="hidden max-w-[10rem] truncate font-normal sm:inline-flex">{host.loadedCache.info.name}</Badge>
        </div>

        <Separator orientation="vertical" class="mx-1 h-6" />

        <DropdownMenu>
            {@render menuButton("Import", "Import map data", Upload)}
            <DropdownMenuContent align="start" class="w-64">
                <div class="px-2 py-1.5 text-sm font-semibold">Import</div>
                {@render providerMenu(importGroups, "No import providers registered")}
            </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
            {@render menuButton("View", "Panels & layout", LayoutGrid)}
            <DropdownMenuContent align="start" class="w-56">
                <div class="px-2 py-1.5 text-sm font-semibold">Windows</div>
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <PanelRightOpen class="size-4" />
                        Reopen panel
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        {#each panels as panel (panel.id)}
                            <DropdownMenuItem disabled={!editor.layout || panel.open} onSelect={() => reopen(panel.id, panel.title)}>{panel.title}</DropdownMenuItem>
                        {/each}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onSelect={restoreAll}>Restore all missing panels</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={resetLayout}>
                    <RotateCcw class="size-4" />
                    Reset workspace layout
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
            {@render menuButton("Export", "Export map data", Download)}
            <DropdownMenuContent align="start" class="w-64">
                <div class="px-2 py-1.5 text-sm font-semibold">Export</div>
                {@render providerMenu(exportGroups, "No export providers registered")}
            </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="sm" class="gap-1.5 px-2" onclick={() => (settingsOpen = true)}>
            <Settings class="size-4" />
            <span class="hidden sm:inline">Settings</span>
        </Button>
        <PluginHub />

        <div class="flex-1"></div>

        <SettingsDialog bind:open={settingsOpen} />
    </header>
</TooltipProvider>
