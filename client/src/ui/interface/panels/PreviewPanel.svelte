<script lang="ts">
    import { cacheProxyHeaders } from "../../../lib/cache-proxy-client";
    import { Button } from "../../components/ui/button";
    import RsInterface from "../../components/rs/RsInterface.svelte";
    import type { InterfaceEditorState } from "../interface-editor-state.svelte";

    let { state }: { state: InterfaceEditorState } = $props();
    const proxyHeaders = cacheProxyHeaders(state.selectedCacheType);
</script>

<div class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
    <div class="flex shrink-0 items-center gap-3 border-b px-4 py-2 text-xs text-muted-foreground">
        {#if state.selectedId != null}
            <span class="font-mono font-semibold text-foreground">{state.selectedId}</span>
            <span>{state.selectedName}</span>
            {#if state.rootWidgetV3 != null}
                <span
                    class="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    title={state.rootWidgetV3 ? "IF3 interface (not legacy)" : "Legacy interface (pre-IF3)"}
                >
                    {state.rootWidgetV3 ? "Not legacy" : "Legacy"}
                </span>
            {/if}
            <span class="ml-auto">{state.mode === "fixed" ? "Fixed 512 × 334" : "Resizable"}</span>
            {#if state.interfaceLoadError}
                <span class="ml-2 text-destructive">{state.interfaceLoadError}</span>
            {/if}
            {#if state.selectedComponentId != null}
                <span class="ml-2 text-cyan-400">selected component {state.selectedComponentId}</span>
            {/if}
            <div class="ml-2 flex overflow-hidden rounded-md border border-border">
                <Button
                    type="button"
                    variant={state.runtimeMode === "edit" ? "default" : "ghost"}
                    size="sm"
                    class="h-7 rounded-none border-0 px-2 text-xs"
                    title="Edit cache-backed widget definitions with runtime CS2 hooks paused"
                    onclick={() => state.setRuntimeMode("edit")}
                >
                    Edit
                </Button>
                <Button
                    type="button"
                    variant={state.runtimeMode === "simulate" ? "default" : "ghost"}
                    size="sm"
                    class="h-7 rounded-none border-0 border-l px-2 text-xs"
                    title="Run onLoad, timer, transmit and pointer hooks against an isolated runtime copy"
                    onclick={() => state.setRuntimeMode("simulate")}
                >
                    Simulation
                </Button>
            </div>
        {:else}
            <span>Select an interface from the list</span>
        {/if}
    </div>

    <div class="flex min-h-0 flex-1 items-center justify-center bg-black/80 p-4">
        {#if state.selectedId != null}
            <RsInterface
                interfaceId={state.selectedId}
                mode={state.mode}
                isInterfaceLoaded={state.isInterfaceLoaded}
                interfaceData={state.previewInterfaceData}
                revision={state.revision}
                cacheHeaders={proxyHeaders}
                spritesById={state.viewer.spritesById}
                clientScriptIndex={state.viewer.clientScriptIndex}
                objTypeLoader={state.viewer.objTypeLoader}
                enumTypeLoader={state.viewer.enumTypeLoader}
                itemIcons={state.viewer.itemIcons}
                viewportColor={state.viewportColor}
                showOverlays={state.showOverlays}
                showViewportBorder={state.showViewportBorder}
                showPixelGrid={state.showPixelGrid}
                selectedComponentId={state.selectedComponentId}
                selectedComponent={state.selectedComponent}
                interactiveMode={state.interactiveMode}
                cs1SimState={state.cs1ForCanvas}
                clientState={state.cs1SimState}
                cs1VarbitDefinitionLookup={state.varbitDefinitionLookup}
                cs2RedrawNonce={state.cs2RedrawNonce}
                class={state.mode === "resizable" ? "h-full w-full" : "shrink-0"}
            />
        {:else}
            <p class="text-sm text-muted-foreground">Select an interface to preview it here.</p>
        {/if}
    </div>
</div>
