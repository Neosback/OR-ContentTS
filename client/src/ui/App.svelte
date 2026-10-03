<script lang="ts">
    import { untrack } from "svelte";

    import ContextMenuHost from "./components/context-menu/context-menu-host.svelte";
    import { Toaster } from "./components/ui/sonner";
    import { router } from "./lib/router.svelte";
    import { settings } from "./lib/settings.svelte";
    import { shellPrefs } from "./lib/shell-prefs.svelte";
    import { cn } from "./lib/utils";
    import CacheRepositoryScreen from "./screens/cache/CacheRepositoryScreen.svelte";
    import MapEditorScreen from "./mapeditor/MapEditorScreen.svelte";
    import MapViewerScreen from "./mapviewer/MapViewerScreen.svelte";
    import InterfaceEditorScreen from "./interface/InterfaceEditorScreen.svelte";
    import HomeScreen from "./screens/HomeScreen.svelte";
    import MapHubScreen from "./screens/MapHubScreen.svelte";
    import ServerContentScreen from "./screens/server/ServerContentScreen.svelte";
    import Sidebar from "./shell/Sidebar.svelte";
    import DockLabScreen from "./dev/DockLabScreen.svelte";

    // Keep <html>/<body> theme classes in sync with the settings store.
    $effect(() => {
        settings.value;
        untrack(() => settings.apply());
    });

    const path = $derived(router.path);
    const isPopout = $derived(path.startsWith("/map/editor/popout"));
    const isMapRoute = $derived(path.startsWith("/map"));
    const isInterfaceRoute = $derived(path.startsWith("/interface"));
    // Interface Editor uses the same Studio navigation shell as Map. Only
    // dedicated editor popouts should suppress the global sidebar.
    const hideSidebar = $derived(isPopout);
    const isServerRoute = $derived(path === "/server");
    const fullBleed = $derived(isMapRoute || isInterfaceRoute || isServerRoute || path === "/__dock");

    // Unknown routes go home, like the React router's catch-all.
    $effect(() => {
        const known = path === "/" || (import.meta.env.DEV && path === "/__dock") || path === "/cache-test" || isServerRoute || isMapRoute || isInterfaceRoute;
        if (!known) router.navigate("/", { replace: true });
    });
</script>

<div class="flex h-dvh w-full">
    <aside
        class={cn(
            "relative z-20 h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-out",
            hideSidebar ? "hidden" : "hidden md:flex",
            shellPrefs.sidebarCollapsed ? "w-16" : "w-60",
        )}
        aria-label="Primary navigation"
    >
        <Sidebar collapsed={shellPrefs.sidebarCollapsed} />
    </aside>
    <div class="flex min-w-0 flex-1 flex-col">
        <main
            data-app-main
            class={fullBleed
                ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-background p-0"
                : "flex-1 overflow-y-auto bg-background p-4 md:p-6"}
        >
            <div class={fullBleed ? "flex h-full min-h-0 w-full flex-1 bg-background" : "mx-auto w-full max-w-7xl"}>
                {#if path === "/"}
                    <HomeScreen />
                {:else if import.meta.env.DEV && path === "/__dock"}
                    <DockLabScreen />
                {:else if path === "/map"}
                    <MapHubScreen />
                {:else if path === "/cache-test"}
                    <CacheRepositoryScreen />
                {:else if path.startsWith("/map/viewer")}
                    <MapViewerScreen />
                {:else if path.startsWith("/map/editor")}
                    <MapEditorScreen />
                {:else if isServerRoute}
                    <ServerContentScreen />
                {:else if isInterfaceRoute}
                    <InterfaceEditorScreen />
                {/if}
            </div>
        </main>
    </div>
</div>

<Toaster />
<ContextMenuHost />
