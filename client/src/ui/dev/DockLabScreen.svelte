<script lang="ts">
    import { onMount } from "svelte";

    import { Button } from "../components/ui/button";
    import { contextMenu } from "../components/context-menu/context-menu.svelte";
    import { createStudioDock, floatPanel, pinGroup, popoutPanel, type StudioDock } from "../lib/dock";
    import { sveltePanel } from "../lib/panel";
    import DockLabPanel from "./DockLabPanel.svelte";

    let host = $state<HTMLDivElement>();
    let dock = $state<StudioDock>();

    const panels = [
        sveltePanel({ id: "lab-main", title: "Main", component: DockLabPanel, props: { label: "Main", note: "keepAlive + fixed tab" }, keepAlive: true, fixed: true }),
        sveltePanel({ id: "lab-a", title: "Palette A", component: DockLabPanel, props: (ctx) => ({ label: `A (${ctx.api.id})`, note: String(ctx.params.note ?? "") }) }),
        sveltePanel({ id: "lab-b", title: "Palette B", component: DockLabPanel, props: { label: "B" } }),
        sveltePanel({ id: "lab-strip", title: "Strip", component: DockLabPanel, props: { label: "S" } }),
    ];

    onMount(() => {
        if (!host) return;
        const created = createStudioDock(host, {
            panels,
            storageKey: "studio-dock-lab-v1",
            isRestoredLayoutValid: (api) => api.getPanel("lab-main") !== undefined,
            onTabContextMenu(panelId, event) {
                contextMenu.open(event, panelId, [
                    { id: "float", label: "Float over workbench", onSelect: () => floatPanel(created.api, panelId, { x: 80, y: 80, width: 320, height: 240 }) },
                    { id: "popout", label: "Open external window", onSelect: () => void popoutPanel(created.api, panelId) },
                    { id: "close", label: "Close", onSelect: () => created.api.getPanel(panelId)?.api.close() },
                ]);
            },
            defaultLayout(d) {
                d.open("lab-main");
                d.open("lab-a", { position: { referencePanel: "lab-main", direction: "right" }, initialWidth: 300, params: { note: "params passthrough" } });
                d.open("lab-b", { position: { referencePanel: "lab-a", direction: "within" }, inactive: true });
                d.open("lab-strip", { position: { referencePanel: "lab-main", direction: "left" } });
            },
            afterLayout(d) {
                const strip = d.api.getPanel("lab-strip");
                if (strip) pinGroup(strip.group, { width: 40, hideHeader: true });
            },
        });
        dock = created;
        return () => created.dispose();
    });
</script>

<div class="flex h-full w-full flex-col">
    <div class="flex items-center gap-2 border-b border-border p-2 text-xs">
        <span class="font-semibold">Dock lab</span>
        <Button size="sm" variant="outline" onclick={() => dock?.resetLayout()}>Reset layout</Button>
        <Button size="sm" variant="outline" onclick={() => dock?.open("lab-b")}>Open B</Button>
    </div>
    <div bind:this={host} class="min-h-0 flex-1"></div>
</div>
