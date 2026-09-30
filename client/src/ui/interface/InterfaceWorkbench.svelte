<script lang="ts">
    import { onDestroy, onMount } from "svelte";

    import "../../interface/interface-editor-dock.css";
    import { applyInterfaceEditorWorkbenchLayout } from "../../interface/interface-editor-workbench-layout";
    import { createStudioDock, type StudioDock } from "../lib/dock";
    import { sveltePanel } from "../lib/panel";
    import InterfaceDialogs from "./InterfaceDialogs.svelte";
    import type { InterfaceEditorState } from "./interface-editor-state.svelte";
    import ComponentTreePanel from "./panels/ComponentTreePanel.svelte";
    import ComponentEditorPanel from "./panels/ComponentEditorPanel.svelte";
    import ClientScriptPanel from "./panels/ClientScriptPanel.svelte";
    import InterfacesPanel from "./panels/InterfacesPanel.svelte";
    import PreviewPanel from "./panels/PreviewPanel.svelte";

    let { state }: { state: InterfaceEditorState } = $props();
    let host = $state<HTMLDivElement>();
    let dock: StudioDock | undefined;

    onMount(() => {
        if (!host) return;

        const panels = [
            sveltePanel({ id: "ifaceInterfaces", title: "Interfaces", component: InterfacesPanel, props: { state }, isolateInput: true }),
            sveltePanel({ id: "ifacePreview", title: "Client preview", component: PreviewPanel, props: { state }, keepAlive: true }),
            sveltePanel({ id: "ifaceComponentTree", title: "Component view", component: ComponentTreePanel, props: { state }, isolateInput: true }),
            sveltePanel({
                id: "ifaceClientScript",
                title: "Client script",
                component: ClientScriptPanel,
                props: { state },
                isolateInput: true,
            }),
            sveltePanel({
                id: "ifaceComponentEditor",
                title: "Component editor",
                component: ComponentEditorPanel,
                props: { state },
                isolateInput: true,
            }),
        ];

        dock = createStudioDock(host, {
            panels,
            storageKey: "interface-editor-workbench-layout-v1",
            isRestoredLayoutValid: (api) => api.getPanel("iface-preview") !== undefined,
            defaultRenderer: "always",
            defaultLayout: (workspace) => applyInterfaceEditorWorkbenchLayout(workspace.api),
        });
    });

    onDestroy(() => dock?.dispose());
</script>

<div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
    <div bind:this={host} class="interface-editor-workbench-dockview h-full w-full min-h-0 min-w-0"></div>
    <InterfaceDialogs {state} />
</div>
