<script lang="ts">
    import { onDestroy, untrack } from "svelte";

    import {
        InterfaceManager,
        Interpreter,
        nudgeScrollY,
        setCs1InterfaceEntry,
        setCs1SimState,
        setCs1VarbitDefinitionLookup,
        setInterfaceMousePosition,
    } from "../../../lib/interface-renderer/interface-manager";
    import type { ComponentType, InterfaceEntry } from "../../../lib/interface-renderer/component-types";
    import type { Cs1SimState } from "../../../lib/interface-renderer/cs1-interpreter";
    import { applyCs2RuntimeFromSim, getCs2RuntimeContext } from "../../../lib/interface-renderer/cs2/runtime-context";
    import { WidgetEventDispatcher } from "../../../lib/interface-renderer/widget-event-dispatcher";
    import type { CacheIndex } from "../../../rs/cache/CacheIndex";
    import type { EnumTypeLoader } from "../../../rs/config/enumtype/EnumTypeLoader";
    import type { ObjTypeLoader } from "../../../rs/config/objtype/ObjTypeLoader";
    import type { VarbitDefinitionLookup } from "../../../rs/config/vartype/bit/VarBitTypeLoader";
    import type { Sprite } from "../../../rs/sprite/InterfaceCanvasSprite";
    import type { RsInterfaceMode } from "../../../interface/interface-editor-workbench-model";
    import { elementSize } from "../../lib/actions";

    const FIXED_CANVAS_WIDTH = 765;
    const FIXED_CANVAS_HEIGHT = 503;
    const FIXED_VIEWPORT_WIDTH = 512;
    const FIXED_VIEWPORT_HEIGHT = 334;
    const FIXED_VIEWPORT_OFFSET_X = 4;
    const FIXED_VIEWPORT_OFFSET_Y = 4;

    let {
        interfaceId,
        mode,
        isInterfaceLoaded = true,
        interfaceData,
        revision = "latest",
        cacheHeaders = {},
        spritesById = new Map<number, Sprite>(),
        clientScriptIndex = null,
        objTypeLoader = null,
        enumTypeLoader = null,
        class: className = "",
        viewportColor = "rgb(76,68,32)",
        showOverlays = true,
        showViewportBorder = false,
        showPixelGrid = false,
        selectedComponentId = null,
        selectedComponent = null,
        interactiveMode = false,
        cs1SimState = null,
        clientState = null,
        cs1VarbitDefinitionLookup = null,
        cs2RedrawNonce = 0,
    }: {
        interfaceId: number | null;
        mode: RsInterfaceMode;
        isInterfaceLoaded?: boolean;
        interfaceData?: InterfaceEntry | null;
        revision?: string | number;
        cacheHeaders?: HeadersInit;
        spritesById?: ReadonlyMap<number, Sprite>;
        clientScriptIndex?: CacheIndex | null;
        objTypeLoader?: ObjTypeLoader | null;
        enumTypeLoader?: EnumTypeLoader | null;
        class?: string;
        viewportColor?: string;
        showOverlays?: boolean;
        showViewportBorder?: boolean;
        showPixelGrid?: boolean;
        selectedComponentId?: number | null;
        selectedComponent?: ComponentType | null;
        interactiveMode?: boolean;
        cs1SimState?: Cs1SimState | null;
        /** Shared mock client state for CS2 simulation, including modern IF3 interfaces. */
        clientState?: Cs1SimState | null;
        cs1VarbitDefinitionLookup?: VarbitDefinitionLookup | null;
        cs2RedrawNonce?: number;
    } = $props();

    let container = $state<HTMLDivElement>();
    let canvas = $state<HTMLCanvasElement>();
    let containerWidth = $state(0);
    let containerHeight = $state(0);
    let manager: InterfaceManager | null = null;
    let hoverPick: ComponentType | null = null;
    let hoveredEventComponents = new Set<ComponentType>();
    let heldComponent: ComponentType | null = null;
    let pointerX = 0;
    let pointerY = 0;
    let pointerInside = false;
    let renderRaf = 0;
    let clientTickTimer = 0;
    let eventDispatcher: WidgetEventDispatcher | null = null;
    let latestClientState: Cs1SimState | null = null;

    const viewportWidth = $derived(mode === "fixed" ? FIXED_VIEWPORT_WIDTH : containerWidth);
    const viewportHeight = $derived(mode === "fixed" ? FIXED_VIEWPORT_HEIGHT : containerHeight);
    const viewportOffsetX = $derived(mode === "fixed" ? FIXED_VIEWPORT_OFFSET_X : 0);
    const viewportOffsetY = $derived(mode === "fixed" ? FIXED_VIEWPORT_OFFSET_Y : 0);
    const canvasWidth = $derived(mode === "fixed" ? FIXED_CANVAS_WIDTH : Math.max(1, containerWidth));
    const canvasHeight = $derived(mode === "fixed" ? FIXED_CANVAS_HEIGHT : Math.max(1, containerHeight));

    function componentRuntimeId(component: ComponentType): number {
        return typeof component.packedId === "number" ? component.packedId : component.id;
    }

    function collectAllComponents(data: InterfaceEntry): ComponentType[] {
        const result: ComponentType[] = [];
        const seen = new Set<ComponentType>();
        const visit = (component: ComponentType): void => {
            if (seen.has(component)) return;
            seen.add(component);
            result.push(component);
            for (const child of component.children ?? []) {
                if (child) visit(child);
            }
        };
        for (const component of Object.values(data.components)) visit(component);
        return result;
    }

    function localPosition(event: MouseEvent): { x: number; y: number } {
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * (canvas.width / rect.width || 1),
            y: (event.clientY - rect.top) * (canvas.height / rect.height || 1),
        };
    }

    function componentsAt(data: InterfaceEntry, x: number, y: number): ComponentType[] {
        const currentManager = manager;
        if (!currentManager) return [];
        const hits: ComponentType[] = [];
        for (const component of collectAllComponents(data)) {
            const bounds = currentManager.getComponentDrawBoundsFor(component);
            if (!bounds) continue;
            if (x < bounds.x || x >= bounds.x + bounds.width || y < bounds.y || y >= bounds.y + bounds.height) continue;
            hits.push(component);
        }
        return hits;
    }

    function relativeEventPosition(component: ComponentType, x: number, y: number): { x: number; y: number } {
        const bounds = manager?.getComponentDrawBoundsFor(component);
        return bounds ? { x: x - bounds.x, y: y - bounds.y } : { x, y };
    }

    function hasHoverListeners(component: ComponentType): boolean {
        return !!(component.onMouseOver || component.onMouseLeave || component.onMouseRepeat);
    }

    function hasPressListeners(component: ComponentType): boolean {
        return !!(component.onClick || component.onHold || component.onClickRepeat || component.onRelease);
    }

    function pickPressComponentAt(data: InterfaceEntry, x: number, y: number): ComponentType | null {
        const hits = componentsAt(data, x, y);
        for (let i = hits.length - 1; i >= 0; i--) {
            if (hasPressListeners(hits[i]!)) return hits[i]!;
        }
        return null;
    }

    function pickScrollListenerAt(data: InterfaceEntry, x: number, y: number): ComponentType | null {
        const hits = componentsAt(data, x, y);
        for (let i = hits.length - 1; i >= 0; i--) {
            if (hits[i]!.onScrollWheel) return hits[i]!;
        }
        return null;
    }

    function updateHoverEvents(data: InterfaceEntry, x: number, y: number): void {
        const nextHits = componentsAt(data, x, y).filter(hasHoverListeners);
        const next = new Set(nextHits);

        for (const previous of hoveredEventComponents) {
            if (next.has(previous)) continue;
            const position = relativeEventPosition(previous, x, y);
            void eventDispatcher?.dispatchPointer(previous, "mouseLeave", {
                mouseX: position.x,
                mouseY: position.y,
            });
        }

        for (const component of nextHits) {
            if (hoveredEventComponents.has(component)) continue;
            const position = relativeEventPosition(component, x, y);
            void eventDispatcher?.dispatchPointer(component, "mouseOver", {
                mouseX: position.x,
                mouseY: position.y,
            });
        }

        hoveredEventComponents = next;
        hoverPick = pickComponentAt(data, x, y);
        Interpreter.mousedOverWidgetIf1 = hoverPick;
    }

    function clearHoverEvents(): void {
        for (const component of hoveredEventComponents) {
            const position = relativeEventPosition(component, pointerX, pointerY);
            void eventDispatcher?.dispatchPointer(component, "mouseLeave", {
                mouseX: position.x,
                mouseY: position.y,
            });
        }
        hoveredEventComponents = new Set<ComponentType>();
        hoverPick = null;
        Interpreter.mousedOverWidgetIf1 = null;
    }

    function pickComponentAt(data: InterfaceEntry, x: number, y: number): ComponentType | null {
        const currentManager = manager;
        if (!currentManager) return null;
        let best: ComponentType | null = null;
        let bestArea = Infinity;
        for (const component of collectAllComponents(data)) {
            const bounds = currentManager.getComponentDrawBoundsFor(component);
            if (!bounds) continue;
            if (x < bounds.x || x >= bounds.x + bounds.width || y < bounds.y || y >= bounds.y + bounds.height) continue;
            const area = bounds.width * bounds.height;
            if (area < bestArea) {
                bestArea = area;
                best = component;
            }
        }
        return best;
    }

    function pickScrollableAt(
        data: InterfaceEntry,
        x: number,
        y: number,
    ): { runtimeId: number; scrollHeight: number; tempHeight: number } | null {
        const currentManager = manager;
        if (!currentManager) return null;
        let best: { runtimeId: number; scrollHeight: number; tempHeight: number } | null = null;
        let bestArea = Infinity;
        for (const component of collectAllComponents(data)) {
            if (component.type !== 0 && component.type !== 11) continue;
            if (component.scrollHeight <= component.tempHeight) continue;
            const bounds = currentManager.getComponentDrawBoundsFor(component);
            if (!bounds) continue;
            if (x < bounds.x || x >= bounds.x + bounds.width || y < bounds.y || y >= bounds.y + bounds.height) continue;
            const area = bounds.width * bounds.height;
            if (area < bestArea) {
                bestArea = area;
                best = {
                    runtimeId: componentRuntimeId(component),
                    scrollHeight: component.scrollHeight,
                    tempHeight: component.tempHeight,
                };
            }
        }
        return best;
    }

    function draw(
        context: CanvasRenderingContext2D,
        currentManager: InterfaceManager,
        data: InterfaceEntry,
        id: number,
    ): void {
        latestClientState = clientState ?? cs1SimState;
        setCs1SimState(cs1SimState ?? null);
        setCs1InterfaceEntry(data);
        setCs1VarbitDefinitionLookup(cs1VarbitDefinitionLookup ?? null);
        const { socialRuntime } = getCs2RuntimeContext();
        applyCs2RuntimeFromSim(
            latestClientState,
            revision,
            cacheHeaders,
            cs1VarbitDefinitionLookup ?? null,
            data,
            canvasWidth,
            canvasHeight,
            clientScriptIndex,
            objTypeLoader,
            enumTypeLoader,
            socialRuntime,
        );

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, canvasWidth, canvasHeight);
        currentManager.drawWidgets(
            data,
            id,
            viewportOffsetX,
            viewportOffsetY,
            viewportOffsetX + viewportWidth,
            viewportOffsetY + viewportHeight,
            viewportOffsetX,
            viewportOffsetY,
            -1,
        );

        if (selectedComponent != null || selectedComponentId != null) {
            const bounds =
                selectedComponent != null
                    ? currentManager.getComponentDrawBoundsFor(selectedComponent)
                    : currentManager.getComponentDrawBounds(selectedComponentId!);
            if (bounds) {
                context.save();
                context.globalAlpha = 1;
                context.strokeStyle = "#00e5ff";
                context.lineWidth = 1;
                context.setLineDash([3, 2]);
                context.strokeRect(bounds.x + 0.5, bounds.y + 0.5, bounds.width, bounds.height);
                context.fillStyle = "rgba(0,229,255,0.15)";
                context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
                context.restore();
            }
        }
    }

    $effect(() => {
        const target = canvas;
        const data = interfaceData;
        const id = interfaceId;
        const width = canvasWidth;
        const height = canvasHeight;
        const redraw = cs2RedrawNonce;
        const selectedId = selectedComponentId;
        const selected = selectedComponent;
        const simState = cs1SimState;
        const runtimeState = clientState;
        const lookup = cs1VarbitDefinitionLookup;
        const rev = revision;
        const headers = cacheHeaders;
        const sprites = spritesById;
        const scriptIndex = clientScriptIndex;
        const objects = objTypeLoader;
        const enums = enumTypeLoader;
        viewportOffsetX;
        viewportOffsetY;
        viewportWidth;
        viewportHeight;

        if (!target || !data || id == null || width <= 0 || height <= 0) return;
        void redraw;
        void selectedId;
        void selected;
        void simState;
        void runtimeState;
        void lookup;
        void rev;
        void headers;
        void scriptIndex;
        void objects;
        void enums;

        target.width = width;
        target.height = height;
        const context = target.getContext("2d");
        if (!context) return;

        const nextManager = new InterfaceManager(context, sprites);
        manager = nextManager;

        // Rendering mutates runtime widget layout fields (tempWidth/tempHeight/x1/y1).
        // Keep those client-runtime writes outside Svelte dependency tracking so this
        // effect does not subscribe to the same state it mutates and recurse forever.
        const renderFrame = (): void => untrack(() => draw(context, nextManager, data, id));
        const frame = (): void => {
            renderFrame();
            renderRaf = requestAnimationFrame(frame);
        };
        renderFrame();
        renderRaf = requestAnimationFrame(frame);

        return () => {
            cancelAnimationFrame(renderRaf);
            if (manager === nextManager) manager = null;
            setCs1SimState(null);
            setCs1InterfaceEntry(null);
            setCs1VarbitDefinitionLookup(null);
        };
    });

    $effect(() => {
        const data = interfaceData;
        const enabled = interactiveMode;

        eventDispatcher?.dispose();
        eventDispatcher = null;
        if (clientTickTimer !== 0) {
            window.clearTimeout(clientTickTimer);
            clientTickTimer = 0;
        }

        if (!enabled || !data) return;

        const dispatcher = new WidgetEventDispatcher();
        eventDispatcher = dispatcher;
        let cancelled = false;

        // Match the client activation sequence: onLoad first, then initial
        // trigger-backed var-transmit listeners, before ordinary changed-id ticks.
        void dispatcher.dispatchOnLoad(data, interfaceId ?? -1);
        void dispatcher.dispatchInitialVarTransmit(data);

        const runTick = async (): Promise<void> => {
            if (cancelled) return;
            const startedAt = performance.now();
            const state = latestClientState;

            if (state) {
                state.clientCycle = (state.clientCycle + 1) | 0;

                // Snapshot transmit changes first. Listener mutations are intentionally
                // retained for the next 20 ms client tick instead of recursively firing.
                void dispatcher.dispatchTransmits(data, state);
                void dispatcher.dispatchTimer(data);

                // Re-hit-test every client cycle. Runtime scripts can move/show/hide widgets
                // while the pointer is stationary, which can itself cause enter/leave events.
                if (pointerInside) updateHoverEvents(data, pointerX, pointerY);

                for (const hovered of hoveredEventComponents) {
                    const position = relativeEventPosition(hovered, pointerX, pointerY);
                    void dispatcher.dispatchPointer(hovered, "mouseRepeat", {
                        mouseX: position.x,
                        mouseY: position.y,
                    });
                }

                const clicked = Interpreter.clickedWidget;
                if (clicked) {
                    const position = relativeEventPosition(clicked, pointerX, pointerY);
                    void dispatcher.dispatchPointer(clicked, "hold", {
                        mouseX: position.x,
                        mouseY: position.y,
                    });
                    void dispatcher.dispatchPointer(clicked, "clickRepeat", {
                        mouseX: position.x,
                        mouseY: position.y,
                    });
                }
            }

            // Do not let a slow CS2 listener create overlapping client cycles. The
            // next cycle starts after the shared VM queue drains, preserving ordering.
            await dispatcher.flush();
            if (cancelled) return;
            const elapsed = performance.now() - startedAt;
            clientTickTimer = window.setTimeout(() => void runTick(), Math.max(0, 20 - elapsed));
        };

        clientTickTimer = window.setTimeout(() => void runTick(), 20);

        return () => {
            cancelled = true;
            dispatcher.dispose();
            if (eventDispatcher === dispatcher) eventDispatcher = null;
            if (clientTickTimer !== 0) {
                window.clearTimeout(clientTickTimer);
                clientTickTimer = 0;
            }
        };
    });

    $effect(() => {
        if (interactiveMode) return;
        Interpreter.mousedOverWidgetIf1 = null;
        Interpreter.clickedWidget = null;
        hoverPick = null;
        hoveredEventComponents = new Set<ComponentType>();
        heldComponent = null;
        pointerInside = false;
    });

    function onMouseMove(event: MouseEvent): void {
        const position = localPosition(event);
        pointerX = position.x;
        pointerY = position.y;
        pointerInside = true;
        setInterfaceMousePosition(position.x, position.y);
        if (!interactiveMode || !interfaceData) return;
        updateHoverEvents(interfaceData, position.x, position.y);
    }

    function onMouseLeave(): void {
        setInterfaceMousePosition(0, 0);
        pointerInside = false;
        clearHoverEvents();
    }

    function onWheel(event: WheelEvent): void {
        if (!interactiveMode || !interfaceData) return;
        event.preventDefault();
        const position = localPosition(event);
        pointerX = position.x;
        pointerY = position.y;

        const target = pickScrollListenerAt(interfaceData, position.x, position.y);
        if (target) {
            const relative = relativeEventPosition(target, position.x, position.y);
            void eventDispatcher?.dispatchPointer(target, "scrollWheel", {
                mouseX: relative.x,
                mouseY: event.deltaY > 0 ? 1 : -1,
            });
        }

        const picked = pickScrollableAt(interfaceData, position.x, position.y);
        if (!picked) return;
        nudgeScrollY(picked.runtimeId, event.deltaY, picked.scrollHeight, picked.tempHeight);
    }

    function onMouseDown(event: MouseEvent): void {
        if (!interactiveMode || !interfaceData || event.button !== 0) return;
        const position = localPosition(event);
        pointerX = position.x;
        pointerY = position.y;
        const picked = pickPressComponentAt(interfaceData, position.x, position.y);
        heldComponent = picked;
        Interpreter.clickedWidget = picked;
        if (picked) {
            const relative = relativeEventPosition(picked, position.x, position.y);
            void eventDispatcher?.dispatchPointer(picked, "click", {
                mouseX: relative.x,
                mouseY: relative.y,
            });
        }
    }

    function clearClicked(event?: MouseEvent): void {
        const released = heldComponent ?? Interpreter.clickedWidget;
        if (event) {
            const position = localPosition(event);
            pointerX = position.x;
            pointerY = position.y;
        }
        if (released) {
            const relative = relativeEventPosition(released, pointerX, pointerY);
            void eventDispatcher?.dispatchPointer(released, "release", {
                mouseX: relative.x,
                mouseY: relative.y,
            });
        }
        heldComponent = null;
        Interpreter.clickedWidget = null;
    }

    $effect(() => {
        if (!interactiveMode) return;
        window.addEventListener("mouseup", clearClicked);
        return () => window.removeEventListener("mouseup", clearClicked);
    });

    onDestroy(() => {
        cancelAnimationFrame(renderRaf);
        if (clientTickTimer !== 0) window.clearTimeout(clientTickTimer);
        clientTickTimer = 0;
        eventDispatcher?.dispose();
        eventDispatcher = null;
        hoveredEventComponents = new Set<ComponentType>();
        heldComponent = null;
        pointerInside = false;
        manager = null;
        Interpreter.mousedOverWidgetIf1 = null;
        Interpreter.clickedWidget = null;
        setCs1SimState(null);
        setCs1InterfaceEntry(null);
        setCs1VarbitDefinitionLookup(null);
    });
</script>

<div
    bind:this={container}
    use:elementSize={(size) => {
        containerWidth = Math.floor(size.width);
        containerHeight = Math.floor(size.height);
    }}
    class={`relative overflow-hidden bg-black ${className}`}
    class:shrink-0={mode === "fixed"}
    style:min-width={mode === "fixed" ? `${FIXED_CANVAS_WIDTH}px` : undefined}
    style:min-height={mode === "fixed" ? `${FIXED_CANVAS_HEIGHT}px` : undefined}
    style:width={mode === "fixed" ? `${FIXED_CANVAS_WIDTH}px` : undefined}
    style:height={mode === "fixed" ? `${FIXED_CANVAS_HEIGHT}px` : undefined}
>
    <div
        class="absolute z-0"
        style:left="{viewportOffsetX}px"
        style:top="{viewportOffsetY}px"
        style:width="{viewportWidth}px"
        style:height="{viewportHeight}px"
        style:background-color={viewportColor}
        style:background-image={showPixelGrid
            ? "linear-gradient(to right, rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.16) 1px, transparent 1px)"
            : "none"}
        style:background-size={showPixelGrid ? "4px 4px" : undefined}
        style:border={showViewportBorder ? "1px solid rgba(255,255,255,0.45)" : "none"}
    ></div>

    <canvas
        bind:this={canvas}
        class="absolute left-0 top-0 z-10"
        class:pointer-events-none={!interactiveMode}
        style="image-rendering: pixelated; width: {canvasWidth}px; height: {canvasHeight}px; min-width: {canvasWidth}px; min-height: {canvasHeight}px; max-width: none; max-height: none; flex-shrink: 0;"
        onmousemove={onMouseMove}
        onmouseleave={onMouseLeave}
        onwheel={onWheel}
        onmousedown={onMouseDown}
        onmouseup={clearClicked}
    ></canvas>

    {#if showOverlays && mode === "fixed"}
        <img
            src="/ui/fixed_ui.png"
            alt="Fixed UI overlay"
            width={FIXED_CANVAS_WIDTH}
            height={FIXED_CANVAS_HEIGHT}
            class="pointer-events-none absolute left-0 top-0 z-20"
        />
    {:else if showOverlays}
        <img src="/ui/resized_chat.png" alt="Chat overlay" class="pointer-events-none absolute bottom-0 left-0 z-20 object-contain" width="519" height="142" />
        <img src="/ui/resized_map.png" alt="Map overlay" class="pointer-events-none absolute right-0 top-0 z-20 object-contain" width="211" height="194" />
        <img src="/ui/resized_tab.png" alt="Tab overlay" class="pointer-events-none absolute bottom-0 right-0 z-20 object-contain" width="249" height="336" />
    {/if}

    {#if !isInterfaceLoaded}
        <div class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <div class="flex items-center gap-2 rounded bg-black/40 px-2 py-1 text-xs text-white">
                <div class="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                <span>Loading interface...</span>
            </div>
        </div>
    {/if}
</div>
