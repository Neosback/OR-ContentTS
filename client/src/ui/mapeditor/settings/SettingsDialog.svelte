<script lang="ts">
    import type { Component } from "svelte";

    import { Button } from "../../components/ui/button";
    import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
    import { useEditorState } from "../editor-state.svelte";
    import GizmoTab from "./GizmoTab.svelte";
    import GraphicsTab from "./GraphicsTab.svelte";
    import KeybindsTab from "./KeybindsTab.svelte";
    import WorkspaceTab from "./WorkspaceTab.svelte";

    let { open = $bindable(false), tab = $bindable() }: { open?: boolean; tab?: string } = $props();

    const editor = useEditorState();
    const host = editor.host;

    interface Tab {
        id: string;
        title: string;
        component: Component<any>;
        props?: Record<string, unknown>;
    }

    // Same tabs and order as the React settings dialog (Graphics, Gizmo Style, Core Keybinds, Keybinds).
    const tabs: readonly Tab[] = [
        { id: "graphics", title: "Graphics", component: GraphicsTab },
        { id: "gizmo-style", title: "Gizmo Style", component: GizmoTab },
        { id: "core-keybinds", title: "Core Keybinds", component: KeybindsTab, props: { scope: "core" } },
        { id: "keybinds", title: "Keybinds", component: KeybindsTab, props: { scope: "plugins" } },
        { id: "workspace", title: "Workspace & layouts", component: WorkspaceTab },
    ];

    let activeId = $state(tab ?? tabs[0].id);
    // Opening the dialog on a given tab (for example from the View menu).
    $effect(() => {
        if (open && tab) activeId = tab;
    });
    const active = $derived(tabs.find((tab) => tab.id === activeId) ?? tabs[0]);
    const Active = $derived(active.component);

    // Typing into settings must not drive the camera or tools underneath.
    $effect(() => {
        host.setEditorInputSuspendedBySource("settings-dialog", open);
        return () => host.setEditorInputSuspendedBySource("settings-dialog", false);
    });
</script>

<Dialog bind:open>
    <DialogContent class="max-w-4xl">
        <DialogHeader>
            <DialogTitle>Map editor settings</DialogTitle>
        </DialogHeader>
        <div class="flex h-[52vh] gap-3">
            <div class="flex w-52 shrink-0 flex-col gap-1 border-r pr-3" role="tablist">
                {#each tabs as tab (tab.id)}
                    <Button role="tab" aria-selected={active.id === tab.id} variant={active.id === tab.id ? "secondary" : "ghost"} class="justify-start" onclick={() => (activeId = tab.id)}>
                        {tab.title}
                    </Button>
                {/each}
            </div>
            <div class="min-w-0 flex-1 overflow-hidden">
                {#key active.id}
                    <Active {...active.props ?? {}} />
                {/key}
            </div>
        </div>
    </DialogContent>
</Dialog>
