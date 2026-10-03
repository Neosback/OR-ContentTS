<script lang="ts">
    import Download from "@lucide/svelte/icons/download";
    import File from "@lucide/svelte/icons/file";
    import LayoutGrid from "@lucide/svelte/icons/layout-grid";
    import Save from "@lucide/svelte/icons/save";
    import PanelRightOpen from "@lucide/svelte/icons/panel-right-open";
    import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
    import Settings from "@lucide/svelte/icons/settings";
    import Upload from "@lucide/svelte/icons/upload";

    import { groupProviders } from "../../mapeditor/plugins/builtins/import-export-providers";
    import { executeEditorCommand } from "../../mapeditor/commands/editor-command-registry";
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
    import { errorMessage, notifyError, notifyMessage, notifySuccess } from "../lib/notify";
    import { useEditorState } from "./editor-state.svelte";
    import type { ProjectSessionController } from "./project-session.svelte";
    import PluginHub from "./PluginHub.svelte";
    import SettingsDialog from "./settings/SettingsDialog.svelte";
    import { listLayouts, saveLayout, uniqueLayoutName, type SavedLayout } from "./workspace-layouts";

    let {
        projectSession,
        onCloseProject,
    }: {
        projectSession: ProjectSessionController;
        onCloseProject: (discardChanges: boolean) => void;
    } = $props();

    const editor = useEditorState();
    const host = editor.host;
    const project = $derived(projectSession.snapshot.project);
    const projectDirty = $derived(projectSession.snapshot.dirty);

    let settingsOpen = $state(false);
    let settingsTab = $state<string | undefined>();
    let savedLayouts = $state<SavedLayout[]>([]);
    let layoutName = $state("");

    const importGroups = groupProviders("import");
    const exportGroups = groupProviders("export");
    // Panels' open/closed state is read reactively from the dock's location map.
    const panels = $derived.by(() => {
        editor.layout?.locations;
        return editor.layout?.reopenablePanels() ?? [];
    });

    const commandContext = () => ({
        host,
        layout: editor.layout,
        notify: { success: notifySuccess, message: notifyMessage },
    });

    function reopen(id: string, title: string): void {
        executeEditorCommand("workbench.open-panel", commandContext(), { panelId: id, panelTitle: title });
    }
    function restoreAll(): void {
        executeEditorCommand("workbench.restore-panels", commandContext());
    }
    function openSettings(tab?: string): void {
        settingsTab = tab;
        settingsOpen = true;
    }
    function saveLayoutAs(): void {
        const workbench = editor.layout;
        if (!workbench) return;
        const name = uniqueLayoutName(listLayouts(), layoutName || "My layout");
        saveLayout(workbench.captureLayout(name));
        layoutName = "";
        notifySuccess(`Saved layout "${name}".`);
    }
    function applyNamed(layout: SavedLayout): void {
        if (editor.layout?.applyLayout(layout)) notifySuccess(`Switched to "${layout.name}".`);
        else notifyError(`"${layout.name}" could not be loaded; the default layout was restored.`);
    }
    function resetLayout(): void {
        executeEditorCommand("workbench.reset-layout", commandContext());
    }

    async function saveProject(): Promise<void> {
        try {
            const saved = await projectSession.saveProject();
            notifySuccess(`Saved "${saved.name}".`);
        } catch (error) {
            notifyError(errorMessage(error));
        }
    }

    async function saveProjectAs(): Promise<void> {
        const current = projectSession.snapshot.project;
        if (!current) return;
        const name = window.prompt("Save project as", current.name + " copy")?.trim();
        if (!name) return;
        try {
            const saved = await projectSession.saveProjectAs({ name });
            notifySuccess(`Saved as "${saved.name}".`);
        } catch (error) {
            notifyError(errorMessage(error));
        }
    }

    function exportProject(): void {
        const current = projectSession.snapshot.project;
        if (!current) return;
        try {
            const serialized = projectSession.exportCurrentProject(true);
            const blob = new Blob([serialized], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `${current.name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "openrune-project"}.openrune.json`;
            anchor.click();
            URL.revokeObjectURL(url);
            notifySuccess(`Exported "${current.name}".`);
        } catch (error) {
            notifyError(errorMessage(error));
        }
    }

    function closeProject(): void {
        const current = projectSession.snapshot;
        if (current.dirty && !window.confirm("Discard unsaved project changes and return to setup?")) {
            return;
        }
        try {
            onCloseProject(current.dirty);
        } catch (error) {
            notifyError(errorMessage(error));
        }
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
    <header data-map-editor-title-bar class="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <div class="flex min-w-0 items-center gap-2">
            <span class="truncate text-sm font-semibold text-foreground">Map editor</span>
            {#if project}
                <Badge variant="secondary" class="hidden max-w-[12rem] truncate font-normal sm:inline-flex">
                    {project.name}{projectDirty ? " *" : ""}
                </Badge>
            {/if}
            <Badge variant="secondary" class="hidden max-w-[10rem] truncate font-normal md:inline-flex">{host.loadedCache.info.name}</Badge>
        </div>

        <Separator orientation="vertical" class="mx-1 h-6" />

        <DropdownMenu>
            {@render menuButton("Project", "Project actions", File)}
            <DropdownMenuContent align="start" class="w-64">
                <div class="px-2 py-1.5 text-sm font-semibold">
                    {project ? project.name : "No project open"}
                </div>
                {#if project}
                    <DropdownMenuItem disabled={projectSession.busy} onSelect={() => void saveProject()}>
                        <Save class="size-4" />
                        Save
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={projectSession.busy} onSelect={() => void saveProjectAs()}>
                        Save As...
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={exportProject}>
                        <Download class="size-4" />
                        Export project
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={closeProject}>Close project</DropdownMenuItem>
                {:else}
                    <DropdownMenuItem onSelect={closeProject}>Return to project setup</DropdownMenuItem>
                {/if}
            </DropdownMenuContent>
        </DropdownMenu>

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
                <DropdownMenuSub onOpenChange={(open) => open && (savedLayouts = listLayouts())}>
                    <DropdownMenuSubTrigger>
                        <LayoutGrid class="size-4" />
                        Layouts
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent class="w-60">
                        <div class="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Starting points</div>
                        <DropdownMenuItem onSelect={() => editor.layout?.applyPreset("default")}>Default</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => editor.layout?.applyPreset("minimal")}>Minimal (3D + painter)</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <div class="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Your layouts</div>
                        {#each savedLayouts as layout (layout.id)}
                            <DropdownMenuItem onSelect={() => applyNamed(layout)}>{layout.name}</DropdownMenuItem>
                        {:else}
                            <div class="px-2 py-1 text-xs text-muted-foreground">None saved yet</div>
                        {/each}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => openSettings("workspace")}>Save, manage and share…</DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
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

        <Button variant="ghost" size="sm" class="gap-1.5 px-2" onclick={() => openSettings()}>
            <Settings class="size-4" />
            <span class="hidden sm:inline">Settings</span>
        </Button>
        <PluginHub />

        <div class="flex-1"></div>

        <SettingsDialog bind:open={settingsOpen} bind:tab={settingsTab} />
    </header>
</TooltipProvider>
