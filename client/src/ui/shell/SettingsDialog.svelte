<script lang="ts">
    import Check from "@lucide/svelte/icons/check";
    import SettingsIcon from "@lucide/svelte/icons/settings";

    import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
    import { THEME_PRESETS, settings } from "../lib/settings.svelte";
    import { cn } from "../lib/utils";

    let { open = $bindable(false) }: { open?: boolean } = $props();

    const dark = $derived(settings.value.themeMode === "dark");
</script>

<Dialog bind:open>
    <DialogContent class="max-w-lg bg-card p-6">
        <DialogHeader>
            <DialogTitle class="flex items-center gap-2">
                <SettingsIcon class="size-5" />
                Settings
            </DialogTitle>
        </DialogHeader>
        <div class="space-y-6">
            <section>
                <h3 class="mb-2 text-sm font-semibold">Appearance</h3>
                <div class="mb-3 flex items-center justify-between rounded-md border border-border bg-background p-3">
                    <div>
                        <p class="text-sm font-medium">Dark / light mode</p>
                        <p class="text-xs text-muted-foreground">Toggle color scheme</p>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={dark}
                        aria-label="Dark mode"
                        class={cn("h-6 w-11 rounded-full border-2 border-transparent transition-colors", dark ? "bg-primary" : "bg-input")}
                        onclick={() => settings.update({ themeMode: dark ? "light" : "dark" })}
                    >
                        <span class={cn("block h-5 w-5 rounded-full bg-background shadow transition-transform", dark ? "translate-x-5" : "translate-x-0")}></span>
                    </button>
                </div>
                <div class="flex items-center justify-between rounded-md border border-border bg-background p-3">
                    <div>
                        <p class="text-sm font-medium">Full width content</p>
                        <p class="text-xs text-muted-foreground">Expand content area to full width</p>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={settings.value.fullWidthContent}
                        aria-label="Full-width content"
                        class={cn("h-6 w-11 rounded-full border-2 border-transparent transition-colors", settings.value.fullWidthContent ? "bg-primary" : "bg-input")}
                        onclick={() => settings.update({ fullWidthContent: !settings.value.fullWidthContent })}
                    >
                        <span class={cn("block h-5 w-5 rounded-full bg-background shadow transition-transform", settings.value.fullWidthContent ? "translate-x-5" : "translate-x-0")}></span>
                    </button>
                </div>
            </section>
            <section>
                <h3 class="mb-2 text-sm font-semibold">Color themes</h3>
                <div class="space-y-2">
                    {#each THEME_PRESETS as theme (theme.value)}
                        <button
                            type="button"
                            class={cn(
                                "flex w-full items-center rounded-md border px-3 py-2 text-sm",
                                settings.value.themePreset === theme.value ? "border-primary bg-primary/15" : "border-border bg-background",
                            )}
                            onclick={() => settings.update({ themePreset: theme.value })}
                        >
                            <span class="flex-1 text-left">{theme.name}</span>
                            {#if settings.value.themePreset === theme.value}<Check class="size-4" />{/if}
                        </button>
                    {/each}
                </div>
            </section>
        </div>
    </DialogContent>
</Dialog>
