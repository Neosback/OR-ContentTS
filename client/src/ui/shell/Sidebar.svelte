<script lang="ts">
    import Archive from "@lucide/svelte/icons/archive";
    import Coffee from "@lucide/svelte/icons/coffee";
    import Home from "@lucide/svelte/icons/home";
    import LayoutGrid from "@lucide/svelte/icons/layout-grid";
    import MapIcon from "@lucide/svelte/icons/map";
    import PanelLeft from "@lucide/svelte/icons/panel-left";
    import Settings from "@lucide/svelte/icons/settings";

    import { link, router } from "../lib/router.svelte";
    import { shellPrefs } from "../lib/shell-prefs.svelte";
    import { cn } from "../lib/utils";
    import SettingsDialog from "./SettingsDialog.svelte";

    let { collapsed }: { collapsed: boolean } = $props();

    let settingsOpen = $state(false);

    const nav = [
        { href: "/", label: "Home", icon: Home },
        { href: "/map", label: "Map", icon: MapIcon },
        { href: "/interface", label: "Interface", icon: LayoutGrid },
    ];

    const navClass = (href: string): string =>
        cn(
            "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors duration-200",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center gap-0 px-0",
            router.isActive(href) ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/90",
        );

    const footerClass = $derived(
        cn(
            "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors duration-200",
            "border border-sidebar-border/70 bg-sidebar-accent/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center gap-0 px-0",
        ),
    );
</script>

<div class={cn("flex h-14 items-center border-b border-sidebar-border px-3", collapsed && "justify-center px-0")}>
    {#if collapsed}
        <div class="flex w-full items-center justify-center">
            <img src="/brand/map-editor-logo-small.svg" alt="OpenRune map editor" decoding="async" class="h-8 w-8 object-contain" />
        </div>
    {:else}
        <div class="flex min-w-0 flex-1 items-center gap-2">
            <img src="/brand/map-editor-logo-big.svg" alt="" aria-hidden="true" decoding="async" class="h-8 w-8 shrink-0 object-contain" />
            <img src="/brand/asset-5-wordmark.svg" alt="OpenRune" decoding="async" class="h-8 min-w-0 flex-1 object-contain object-left" />
        </div>
        <button
            type="button"
            class="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Collapse sidebar"
            onclick={() => shellPrefs.toggleSidebar()}
        >
            <PanelLeft class="size-4" />
        </button>
    {/if}
</div>

<div class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 px-2">
        <nav class="flex flex-col gap-1 pt-2 pb-2" aria-label="Site sections">
            {#each nav as item (item.href)}
                {@const Icon = item.icon}
                <a href={item.href} use:link class={navClass(item.href)} aria-current={router.isActive(item.href) ? "page" : undefined}>
                    <Icon class="size-4 shrink-0" aria-hidden="true" />
                    {#if !collapsed}<span class="ml-1 truncate">{item.label}</span>{/if}
                </a>
            {/each}
        </nav>
        {#if collapsed}
            <button
                type="button"
                class="flex w-full items-center justify-center rounded-lg px-0 py-2 text-sm text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onclick={() => shellPrefs.toggleSidebar()}
                aria-label="Expand sidebar"
                title="Expand sidebar"
            >
                <PanelLeft class="size-4 shrink-0" aria-hidden="true" />
            </button>
        {/if}
    </div>
    <div class="flex flex-col gap-1 px-2 pt-1 pb-2">
        <a href="/cache-test" use:link class={footerClass}>
            <Archive class="size-4 shrink-0" aria-hidden="true" />
            {#if !collapsed}<span class="ml-1 truncate">Cache Repository</span>{/if}
        </a>
        <button type="button" class={footerClass} aria-label="Settings" title="Settings" onclick={() => (settingsOpen = true)}>
            <Settings class="size-4 shrink-0" />
            {#if !collapsed}<span class="ml-1 truncate">Settings</span>{/if}
        </button>
        <a
            href="https://buymeacoffee.com/openrune"
            target="_blank"
            rel="noopener noreferrer"
            class={footerClass}
            aria-label="Buy Me a Coffee"
        >
            <Coffee class="size-4 shrink-0" />
            {#if !collapsed}<span class="ml-1 truncate">Buy Me a Coffee</span>{/if}
        </a>
    </div>
</div>

<SettingsDialog bind:open={settingsOpen} />
