<script lang="ts">
    import FolderOpen from "@lucide/svelte/icons/folder-open";
    import Play from "@lucide/svelte/icons/play";
    import Plus from "@lucide/svelte/icons/plus";
    import Upload from "@lucide/svelte/icons/upload";

    import WorldMapModal from "../../components/rs/WorldMapModal.svelte";
    import { errorMessage, notifyError, notifySuccess } from "../../lib/notify";
    import { router } from "../../lib/router.svelte";
    import { fallbackPreviewDataUrl, type LaunchController } from "../launch.svelte";
    import StartCard from "./StartCard.svelte";

    let { launch }: { launch: LaunchController } = $props();

    let newProjectName = $state("");
    let importFile = $state<File | undefined>();

    const activeProject = $derived(launch.projects.snapshot.project);
    const dirty = $derived(launch.projects.snapshot.dirty);

    function isDirtyProjectError(error: unknown): boolean {
        return typeof error === "object" && error !== null && "code" in error &&
            (error as { code?: unknown }).code === "DIRTY_PROJECT";
    }

    async function createProject(discardChanges = false): Promise<void> {
        try {
            const project = await launch.createProject(newProjectName, discardChanges);
            newProjectName = "";
            notifySuccess(`Created "${project.name}".`);
        } catch (error) {
            if (
                isDirtyProjectError(error) &&
                !discardChanges &&
                window.confirm("Discard unsaved changes and create a new project?")
            ) {
                await createProject(true);
                return;
            }
            notifyError(errorMessage(error));
        }
    }

    async function openProject(id: string, discardChanges = false): Promise<void> {
        try {
            await launch.openProject(id, discardChanges);
        } catch (error) {
            if (
                isDirtyProjectError(error) &&
                !discardChanges &&
                window.confirm("Discard unsaved changes and open this project?")
            ) {
                await openProject(id, true);
                return;
            }
            notifyError(errorMessage(error));
        }
    }

    async function importProject(discardChanges = false): Promise<void> {
        if (!importFile) return;
        try {
            const serialized = await importFile.text();
            await launch.importProject(serialized, discardChanges);
            notifySuccess(`Imported "${importFile.name}".`);
            importFile = undefined;
            launch.selectedLoadFileName = "";
        } catch (error) {
            if (
                isDirtyProjectError(error) &&
                !discardChanges &&
                window.confirm("Discard unsaved changes and import this project?")
            ) {
                await importProject(true);
                return;
            }
            notifyError(errorMessage(error));
        }
    }
</script>

<div class="flex h-full min-h-0 w-full items-center justify-center overflow-y-auto p-6">
    <div class="relative my-auto w-full max-w-6xl rounded-xl border border-border bg-card p-6 shadow-sm">
        {#if launch.mapEditor}
            {@const editor = launch.mapEditor}
            <WorldMapModal
                open={launch.isWorldMapOpen}
                onClose={() => (launch.isWorldMapOpen = false)}
                onDoubleClick={(x, y) => launch.onWorldMapDoubleClick(x, y)}
                onRegionSelect={(_mapX, _mapY, regionId) => launch.selectRegionId(regionId)}
                getPosition={() => ({ x: editor.camera.getPosX(), y: editor.camera.getPosZ() })}
                loadMapImageUrl={(mapX, mapY) => editor.getMinimapImageUrl(mapX, mapY)}
            />
        {/if}

        <div class="mb-5 flex items-start justify-between gap-3">
            <div>
                <h1 class="text-xl font-semibold tracking-tight">Map Editor Setup</h1>
                <p class="mt-1 text-sm text-muted-foreground">
                    Open or create a project, then choose where to start editing.
                </p>
            </div>
            <button
                type="button"
                class="rounded-md border border-border bg-background px-3 py-1.5 text-xs"
                onclick={() => router.navigate("/map")}
            >
                Back
            </button>
        </div>

        {#if activeProject}
            <div class="mb-4 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                <div class="min-w-0">
                    <p class="truncate text-sm font-semibold">{activeProject.name}{dirty ? " *" : ""}</p>
                    <p class="text-xs text-muted-foreground">
                        {activeProject.base.game} rev {activeProject.base.revision}
                        {dirty ? " · unsaved changes" : " · saved"}
                    </p>
                </div>
                <span class="text-xs text-muted-foreground">Active project</span>
            </div>
        {/if}

        {#if launch.projectMessage}
            <div class="mb-4 rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                {launch.projectMessage}
            </div>
        {/if}

        <div class="grid gap-4 xl:grid-cols-[1fr_340px]">
            <div class="grid gap-4 md:grid-cols-2">
                <StartCard mode="region" title="Region / World Start" ariaLabel="Activate region mode" {launch} />
                <StartCard mode="sandbox" title="Sandbox Mode" ariaLabel="Activate sandbox mode" {launch} />
            </div>

            <aside class="space-y-4 rounded-lg border border-border bg-background/60 p-3">
                <section class="rounded-md border border-border bg-card p-3">
                    <div class="mb-2 flex items-center justify-between">
                        <div>
                            <h3 class="text-sm font-semibold">Projects</h3>
                            <p class="text-[11px] text-muted-foreground">Stored locally in this browser.</p>
                        </div>
                        <span class="text-[11px] text-muted-foreground">{launch.projects.projects.length} saved</span>
                    </div>

                    <div class="flex gap-2">
                        <input
                            type="text"
                            bind:value={newProjectName}
                            placeholder="New project name"
                            class="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                            onkeydown={(event) => {
                                if (event.key === "Enter" && newProjectName.trim()) void createProject();
                            }}
                        />
                        <button
                            type="button"
                            class="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                            disabled={!newProjectName.trim() || launch.projects.busy}
                            onclick={() => void createProject()}
                        >
                            <Plus class="size-3.5" />
                            New
                        </button>
                    </div>

                    <div class="mt-3 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                        {#each launch.projects.projects as project (project.id)}
                            {@const compatible = launch.projects.isCompatible(project)}
                            <div class="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background px-2 py-2">
                                <div class="min-w-0">
                                    <p class="truncate text-xs font-medium">{project.name}</p>
                                    <p class="text-[10px] text-muted-foreground">
                                        {project.base.game} rev {project.base.revision}
                                        {compatible ? "" : " · different cache"}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    class="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-40"
                                    disabled={!compatible || launch.projects.busy || launch.isEnteringEditor}
                                    onclick={() => void openProject(project.id)}
                                >
                                    <FolderOpen class="size-3" />
                                    Open
                                </button>
                            </div>
                        {:else}
                            <p class="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
                                No saved projects yet.
                            </p>
                        {/each}
                    </div>
                </section>

                <section class="rounded-md border border-border bg-card p-3">
                    <h3 class="text-sm font-semibold">Import Project</h3>
                    <p class="mt-0.5 text-[11px] text-muted-foreground">Open a portable OpenRune Project v1 JSON file.</p>
                    <input
                        type="file"
                        accept=".json,.openrune.json,application/json"
                        class="mt-2 block w-full text-xs file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-xs"
                        onchange={(event) => {
                            importFile = event.currentTarget.files?.[0];
                            launch.selectedLoadFileName = importFile?.name ?? "";
                        }}
                    />
                    <button
                        type="button"
                        class="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                        disabled={!importFile || launch.projects.busy || launch.isEnteringEditor}
                        onclick={() => void importProject()}
                    >
                        <Upload class="size-3.5" />
                        Import Project
                    </button>
                </section>

                <section>
                    <div class="mb-2 flex items-center justify-between">
                        <h3 class="text-sm font-semibold">Last Loaded Regions</h3>
                        <span class="text-[11px] text-muted-foreground">{launch.lastLoadedMaps.length}</span>
                    </div>
                    <div class="max-h-48 space-y-2 overflow-y-auto pr-1">
                        {#each launch.lastLoadedMaps as save (save.id)}
                            <div class="rounded-md border border-border bg-card p-2">
                                <div class="flex items-start gap-2">
                                    <img
                                        src={launch.mapEditor?.getMinimapImageUrl(save.mapX, save.mapY) ?? (save.imageUrl || fallbackPreviewDataUrl(`R${save.regionId}`))}
                                        alt="{save.name} preview 64 by 64"
                                        width="48"
                                        height="48"
                                        class="h-12 w-12 rounded-md border border-border object-cover"
                                    />
                                    <div class="min-w-0 flex-1">
                                        <p class="truncate text-xs font-medium">{save.name}</p>
                                        <p class="text-[10px] text-muted-foreground">Region {save.regionId} · Radius {save.radius}</p>
                                        <button
                                            type="button"
                                            class="mt-1 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-accent"
                                            onclick={() => launch.loadSaved(save)}
                                        >
                                            <Play class="size-3" />
                                            Load
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {:else}
                            <p class="rounded-md border border-dashed border-border px-2 py-3 text-[11px] text-muted-foreground">
                                No recently loaded regions for this cache.
                            </p>
                        {/each}
                    </div>
                </section>
            </aside>
        </div>

        {#if launch.isEnteringEditor && launch.launchMode === null}
            <div class="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-background/85 backdrop-blur-[1px]">
                <div class="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-md">
                    <p class="text-sm font-semibold">Opening project</p>
                    <p class="mt-1 text-xs text-muted-foreground">
                        Loading required map squares and replaying saved edits...
                    </p>
                    <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div class="h-full rounded-full bg-primary transition-all" style="width: {Math.max(5, launch.enteringProgress)}%"></div>
                    </div>
                    <p class="mt-2 text-[11px] text-muted-foreground">
                        Loaded {launch.enteringLoaded} / {launch.enteringTotal} required regions
                    </p>
                </div>
            </div>
        {/if}

        {#if launch.isSandboxPostProcessing}
            <div class="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-background/85 backdrop-blur-[1px]">
                <div class="h-[50vh] w-[50vw] min-h-[240px] min-w-[340px] rounded-lg border border-border bg-card p-6 shadow-md">
                    <p class="text-sm font-semibold">Processing Sandbox Terrain</p>
                    <p class="mt-1 text-xs text-muted-foreground">Applying the selected sandbox terrain preset...</p>
                    <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div class="h-full w-1/2 animate-pulse rounded-full bg-primary"></div>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>
