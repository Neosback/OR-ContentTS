<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";

    import { perfLog } from "../../perf/gl-memory";

    import "../../mapeditor/MapEditorContainer.css";
    import "../../mapeditor/MapEditorWorkbenchDock.css";
    import "../../mapeditor/MapEditorPanel.css";
    import { contextMenu } from "../components/context-menu/context-menu.svelte";
    import { EditorState, provideEditorState } from "./editor-state.svelte";
    import { createEditorPanels } from "./panels";
    import RegionStampCopyDialog from "./palettes/RegionStampCopyDialog.svelte";
    import TitleBar from "./TitleBar.svelte";
    import { Workbench } from "./workbench-controller.svelte";
    import type { IEditorPluginHost } from "../../mapeditor/plugins/editor-plugin-host";
    import type { ProjectSessionController } from "./project-session.svelte";

    let {
        host,
        projectSession,
        onCloseProject,
    }: {
        host: IEditorPluginHost;
        projectSession: ProjectSessionController;
        onCloseProject: (discardChanges: boolean) => void;
    } = $props();

    const editor = new EditorState(host);
    provideEditorState(editor);

    let dockHost = $state<HTMLDivElement>();
    let workbench: Workbench | undefined;

    onMount(() => {
        perfLog("phase: workbench mount");
        editor.hud.start();
        if (!dockHost) return;
        workbench = new Workbench(dockHost, host, createEditorPanels(editor), (panelId, event) =>
            contextMenu.open(event, undefined, workbench?.menuFor(panelId) ?? []),
        );
        editor.layout = workbench;
        // Bring the starting tool's palette tab forward on first entry.
        workbench.activateTool(editor.tool.current);
        // Dev-only handle for inspecting the dock from the console.
        if (import.meta.env.DEV) (window as unknown as { __workbench?: Workbench }).__workbench = workbench;
        // 2D/Live placeholder tabs from older layouts are gone for good.
        workbench.api.getPanel("editor-scene-2d")?.api.close();
        workbench.api.getPanel("editor-scene-live")?.api.close();
    });

    onDestroy(() => {
        editor.hud.stop();
        workbench?.dispose();
        editor.layout = undefined;
    });

    // Plugin enable flags may open/close panels.
    $effect(() => {
        editor.snapshot.current;
        untrack(() => workbench?.syncWithPluginState());
    });

    // Choosing a tool brings its palette tab forward.
    $effect(() => {
        const tool = editor.tool.current;
        untrack(() => workbench?.activateTool(tool));
    });
</script>

<div class="map-editor-container">
    <TitleBar {projectSession} {onCloseProject} />
    <div class="map-editor-workbench-body">
        <div bind:this={dockHost} class="map-editor-workbench-dockview h-full w-full min-h-0 min-w-0"></div>
    </div>
</div>

<!-- Mounted at workbench level so pressing C works even when the Region stamp panel is closed. -->
<RegionStampCopyDialog />
