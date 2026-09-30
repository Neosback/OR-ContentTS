<script lang="ts">
    import Plus from "@lucide/svelte/icons/plus";
    import Trash2 from "@lucide/svelte/icons/trash-2";

    import type { ComponentType } from "../../../lib/interface-renderer/component-types";
    import { Cs1Interpreter, type Cs1SimInventory } from "../../../lib/interface-renderer/cs1-interpreter";
    import { GameValGroupType } from "../../../rs/config/gameval/GameValGroupType";
    import { Button } from "../../components/ui/button";
    import { Input } from "../../components/ui/input";
    import { Label } from "../../components/ui/label";
    import { clickOutside } from "../../lib/actions";
    import { cn } from "../../lib/utils";
    import type { InterfaceEditorState } from "../interface-editor-state.svelte";

    type ItemRowDraft = { itemIdText: string; qtyText: string };
    type GamevalEntry = { id: number; name: string; lowerName: string };

    let { state, inventoryScriptsUsed }: { state: InterfaceEditorState; inventoryScriptsUsed: boolean } = $props();

    let invOpen = $state(false);
    let targetIdText = $state("");
    let targetPanelOpen = $state(false);
    let targetActiveIndex = $state(0);
    let selectedComponentId = $state<number | null>(null);

    let fillAllItemText = $state("");
    let fillAllQtyText = $state("1");
    let fillSuggestOpen = $state(false);
    let fillSuggestActiveIndex = $state(0);

    let rows = $state<ItemRowDraft[]>([{ itemIdText: "", qtyText: "1" }]);
    let rowSuggestRow = $state<number | null>(null);
    let rowSuggestOpen = $state(false);
    let rowSuggestActiveIndex = $state(0);

    const invLocked = $derived(!inventoryScriptsUsed);

    const components = $derived.by(() => {
        const data = state.interfaceData;
        if (!data?.components) return [] as ComponentType[];
        return Object.values(data.components).sort((a, b) => a.id - b.id);
    });

    const itemEntries = $derived.by((): GamevalEntry[] => {
        const gameVals = state.viewer.gamevals;
        if (!gameVals) return [];
        try {
            return gameVals.get(GameValGroupType.OBJTYPES).map((entry) => ({
                id: entry.id,
                name: entry.name,
                lowerName: entry.name.toLowerCase(),
            }));
        } catch {
            return [];
        }
    });

    const targetSuggestions = $derived.by(() => {
        const query = targetIdText.trim().toLowerCase();
        if (!query) return components.slice(0, 40);
        return components
            .filter(
                (component) =>
                    String(component.id).includes(query) ||
                    String(component.type).includes(query) ||
                    (component.internalName?.toLowerCase().includes(query) ?? false),
            )
            .slice(0, 40);
    });

    const selectedComponent = $derived(
        selectedComponentId == null
            ? null
            : components.find((component) => component.id === selectedComponentId) ?? null,
    );

    const selectedInventory = $derived(
        selectedComponentId == null ? undefined : state.cs1SimState.simulatedInventories[selectedComponentId],
    );

    const slots = $derived(slotCountFor(selectedComponent, selectedInventory));

    const currentItemQuery = $derived(
        rowSuggestRow != null ? (rows[rowSuggestRow]?.itemIdText ?? "") : fillAllItemText,
    );

    const itemSuggestions = $derived(
        filterGamevalSuggestions(itemEntries, currentItemQuery),
    );

    $effect(() => {
        if (!inventoryScriptsUsed) invOpen = false;
    });

    $effect(() => {
        state.selectedId;
        selectedComponentId = null;
        targetIdText = "";
        targetPanelOpen = false;
        fillSuggestOpen = false;
        rowSuggestOpen = false;
        rowSuggestRow = null;
    });

    function getComponent(id: number): ComponentType | null {
        const data = state.interfaceData;
        if (!data?.components) return null;
        const direct = data.components[String(id)];
        return direct ?? Object.values(data.components).find((component) => component.id === id) ?? null;
    }

    function slotCountFor(component: ComponentType | null, sim: Cs1SimInventory | undefined): number {
        if (sim?.itemIds.length) return sim.itemIds.length;
        if (component?.itemIds?.length) return component.itemIds.length;
        return Cs1Interpreter.DEFAULT_INV_SLOTS;
    }

    function emptyInventory(slotCount: number): Cs1SimInventory {
        return {
            itemIds: Array.from({ length: slotCount }, () => 0),
            itemQuantities: Array.from({ length: slotCount }, () => 0),
        };
    }

    function filterGamevalSuggestions(entries: GamevalEntry[], rawQuery: string, limit = 30): GamevalEntry[] {
        const query = rawQuery.trim().toLowerCase();
        if (!query) return [];

        return entries
            .filter((entry) => entry.lowerName.includes(query) || String(entry.id).includes(query))
            .sort((a, b) => {
                const aScore = a.lowerName.startsWith(query) ? 0 : String(a.id).startsWith(query) ? 1 : 2;
                const bScore = b.lowerName.startsWith(query) ? 0 : String(b.id).startsWith(query) ? 1 : 2;
                return aScore !== bScore ? aScore - bScore : a.name.localeCompare(b.name);
            })
            .slice(0, limit);
    }

    function commitInventory(componentId: number, inventory: Cs1SimInventory): void {
        state.setCs1SimState((previous) => ({
            ...previous,
            simulatedInventories: {
                ...previous.simulatedInventories,
                [componentId]: inventory,
            },
        }));
    }

    function clearSelected(): void {
        if (selectedComponentId == null) return;
        const component = getComponent(selectedComponentId);
        const count = slotCountFor(component, state.cs1SimState.simulatedInventories[selectedComponentId]);
        commitInventory(selectedComponentId, emptyInventory(count));
    }

    function fillAllSlots(): void {
        if (selectedComponentId == null) return;
        const defId = Number.parseInt(fillAllItemText.trim(), 10);
        const quantity = Number.parseInt(fillAllQtyText.trim(), 10);
        if (!Number.isFinite(defId) || defId < 0 || !Number.isFinite(quantity) || quantity < 0) return;

        const component = getComponent(selectedComponentId);
        const count = slotCountFor(component, state.cs1SimState.simulatedInventories[selectedComponentId]);
        const wire = Cs1Interpreter.itemSlotEncoding(defId);
        commitInventory(selectedComponentId, {
            itemIds: Array.from({ length: count }, () => wire),
            itemQuantities: Array.from({ length: count }, () => quantity),
        });
    }

    function applyRows(): void {
        if (selectedComponentId == null) return;
        const component = getComponent(selectedComponentId);
        const count = slotCountFor(component, state.cs1SimState.simulatedInventories[selectedComponentId]);
        const itemIds = Array.from({ length: count }, () => 0);
        const itemQuantities = Array.from({ length: count }, () => 0);

        for (let slot = 0; slot < Math.min(count, rows.length); slot++) {
            const row = rows[slot]!;
            const defId = Number.parseInt(row.itemIdText.trim(), 10);
            const quantity = Number.parseInt(row.qtyText.trim(), 10);
            if (!Number.isFinite(defId) || defId < 0) continue;
            itemIds[slot] = Cs1Interpreter.itemSlotEncoding(defId);
            itemQuantities[slot] = Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
        }
        commitInventory(selectedComponentId, { itemIds, itemQuantities });
    }

    function pickTarget(component: ComponentType): void {
        selectedComponentId = component.id;
        targetIdText = String(component.id);
        targetPanelOpen = false;
    }

    function pickItem(entry: GamevalEntry, rowIndex: number | null): void {
        if (rowIndex == null) {
            fillAllItemText = String(entry.id);
            fillSuggestOpen = false;
            return;
        }
        const next = [...rows];
        next[rowIndex] = { ...next[rowIndex]!, itemIdText: String(entry.id) };
        rows = next;
        rowSuggestOpen = false;
    }

    function targetKeydown(event: KeyboardEvent): void {
        if (!targetPanelOpen || targetSuggestions.length === 0) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            targetActiveIndex = (targetActiveIndex + 1) % targetSuggestions.length;
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            targetActiveIndex = (targetActiveIndex - 1 + targetSuggestions.length) % targetSuggestions.length;
        } else if (event.key === "Enter") {
            event.preventDefault();
            pickTarget(targetSuggestions[targetActiveIndex]!);
        } else if (event.key === "Escape") {
            targetPanelOpen = false;
        }
    }

    function itemKeydown(event: KeyboardEvent, rowIndex: number | null): void {
        const open = rowIndex == null ? fillSuggestOpen : rowSuggestRow === rowIndex && rowSuggestOpen;
        if (!open || itemSuggestions.length === 0) return;
        const current = rowIndex == null ? fillSuggestActiveIndex : rowSuggestActiveIndex;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            const next = (current + 1) % itemSuggestions.length;
            if (rowIndex == null) fillSuggestActiveIndex = next;
            else rowSuggestActiveIndex = next;
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            const next = (current - 1 + itemSuggestions.length) % itemSuggestions.length;
            if (rowIndex == null) fillSuggestActiveIndex = next;
            else rowSuggestActiveIndex = next;
        } else if (event.key === "Enter") {
            event.preventDefault();
            pickItem(itemSuggestions[current]!, rowIndex);
        } else if (event.key === "Escape") {
            if (rowIndex == null) fillSuggestOpen = false;
            else rowSuggestOpen = false;
        }
    }
</script>

<details
    class="overflow-hidden rounded-lg border border-border bg-background"
    open={inventoryScriptsUsed && invOpen}
    ontoggle={(event) => {
        if (!inventoryScriptsUsed) {
            event.currentTarget.open = false;
            return;
        }
        invOpen = event.currentTarget.open;
    }}
>
    <summary
        class={cn(
            "flex list-none items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold [&::-webkit-details-marker]:hidden",
            inventoryScriptsUsed ? "cursor-pointer hover:bg-muted/50" : "bg-muted/25 text-muted-foreground",
        )}
    >
        <span class="flex min-w-0 flex-1 items-center gap-2">
            <span>Inventory</span>
            {#if invLocked}
                <span class="rounded bg-secondary px-1.5 py-0 text-[9px] font-normal text-secondary-foreground">Not used</span>
            {/if}
        </span>
    </summary>

    {#if inventoryScriptsUsed}
        <div class="space-y-3 border-t border-border px-2 pb-2 pt-2 text-[11px] leading-snug">
            <p class="text-muted-foreground">Pick a component, then fill or clear its inventory slots.</p>

            <div
                class="relative z-[50] space-y-1"
                use:clickOutside={() => (targetPanelOpen = false)}
            >
                <Label for="inv-target-comp">Target component</Label>
                <Input
                    id="inv-target-comp"
                    class="h-8 font-mono text-xs"
                    placeholder="Component id (suggestions)…"
                    value={targetIdText}
                    autocomplete="off"
                    oninput={(event) => {
                        targetIdText = event.currentTarget.value;
                        targetPanelOpen = true;
                        targetActiveIndex = 0;
                    }}
                    onfocus={() => (targetPanelOpen = true)}
                    onkeydown={targetKeydown}
                />

                {#if targetPanelOpen && targetSuggestions.length > 0}
                    <ul class="absolute left-0 right-0 top-full z-[100] mt-1 max-h-48 overflow-auto rounded-md border bg-popover py-1 text-xs shadow-md" role="listbox">
                        {#each targetSuggestions as component, index (component.id)}
                            <li>
                                <button
                                    type="button"
                                    class={cn("flex w-full gap-2 px-2 py-1 text-left hover:bg-muted/60", index === targetActiveIndex && "bg-muted/80")}
                                    onmouseenter={() => (targetActiveIndex = index)}
                                    onmousedown={(event) => event.preventDefault()}
                                    onclick={() => pickTarget(component)}
                                >
                                    <span class="font-mono text-muted-foreground">{component.id}</span>
                                    <span class="truncate">type {component.type}{component.internalName ? ` · ${component.internalName}` : ""}</span>
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>

            {#if selectedComponentId != null}
                <p class="text-[10px] text-muted-foreground">
                    {slots} slot{slots === 1 ? "" : "s"}
                    {selectedComponent ? ` · widget type ${selectedComponent.type}` : ""}
                </p>
            {:else}
                <p class="text-[10px] text-muted-foreground">Select a component to edit its inventory.</p>
            {/if}

            <Button type="button" variant="outline" size="sm" class="h-8 w-full text-[11px]" disabled={selectedComponentId == null} onclick={clearSelected}>
                Clear all
            </Button>

            <div
                class="relative z-[45] space-y-1"
                use:clickOutside={() => (fillSuggestOpen = false)}
            >
                <Label>Fill all slots</Label>
                <div class="flex gap-1">
                    <div class="relative min-w-0 flex-1">
                        <Input
                            class="h-8 font-mono text-xs"
                            placeholder="Item id or gameval…"
                            value={fillAllItemText}
                            autocomplete="off"
                            disabled={selectedComponentId == null}
                            oninput={(event) => {
                                fillAllItemText = event.currentTarget.value;
                                fillSuggestOpen = true;
                                rowSuggestRow = null;
                                fillSuggestActiveIndex = 0;
                            }}
                            onfocus={() => {
                                fillSuggestOpen = true;
                                rowSuggestRow = null;
                            }}
                            onkeydown={(event) => itemKeydown(event, null)}
                        />

                        {#if fillSuggestOpen && fillAllItemText.trim() !== ""}
                            <ul class="absolute left-0 right-0 top-full z-[100] mt-1 max-h-64 overflow-auto rounded-md border bg-popover py-1 shadow-md" role="listbox">
                                {#if itemSuggestions.length > 0}
                                    {#each itemSuggestions as entry, index (`${entry.id}-${entry.name}`)}
                                        <li>
                                            <button
                                                type="button"
                                                class={cn("flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm", index === fillSuggestActiveIndex && "bg-muted")}
                                                onmouseenter={() => (fillSuggestActiveIndex = index)}
                                                onmousedown={(event) => event.preventDefault()}
                                                onclick={() => pickItem(entry, null)}
                                            >
                                                <span class="truncate font-mono text-xs">{entry.name}</span>
                                                <span class="shrink-0 font-mono text-xs text-muted-foreground">id: {entry.id}</span>
                                            </button>
                                        </li>
                                    {/each}
                                {:else}
                                    <li class="px-3 py-1.5 text-xs text-muted-foreground">No matching gamevals</li>
                                {/if}
                            </ul>
                        {/if}
                    </div>

                    <Input
                        class="h-8 w-20 shrink-0 font-mono text-xs"
                        type="number"
                        min="0"
                        placeholder="Amt"
                        value={fillAllQtyText}
                        disabled={selectedComponentId == null}
                        oninput={(event) => (fillAllQtyText = event.currentTarget.value)}
                    />
                    <Button type="button" size="sm" class="h-8 shrink-0 text-[11px]" disabled={selectedComponentId == null} onclick={fillAllSlots}>
                        Apply
                    </Button>
                </div>
            </div>

            <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                    <Label>Slot rows (def id + qty → slots 0…)</Label>
                    <Button type="button" variant="ghost" size="sm" class="h-7 gap-1 px-1.5 text-[10px]" onclick={() => (rows = [...rows, { itemIdText: "", qtyText: "1" }])}>
                        <Plus class="size-3" />
                        Row
                    </Button>
                </div>

                {#each rows as row, index}
                    <div
                        class="relative z-[40] flex gap-1"
                        use:clickOutside={() => {
                            if (rowSuggestRow === index) rowSuggestOpen = false;
                        }}
                    >
                        <div class="relative min-w-0 flex-1">
                            <Input
                                class="h-8 font-mono text-xs"
                                placeholder="Item id or gameval…"
                                value={row.itemIdText}
                                autocomplete="off"
                                disabled={selectedComponentId == null}
                                oninput={(event) => {
                                    const next = [...rows];
                                    next[index] = { ...next[index]!, itemIdText: event.currentTarget.value };
                                    rows = next;
                                    rowSuggestRow = index;
                                    rowSuggestOpen = true;
                                    rowSuggestActiveIndex = 0;
                                    fillSuggestOpen = false;
                                }}
                                onfocus={() => {
                                    rowSuggestRow = index;
                                    rowSuggestOpen = true;
                                    fillSuggestOpen = false;
                                }}
                                onkeydown={(event) => itemKeydown(event, index)}
                            />

                            {#if rowSuggestRow === index && rowSuggestOpen && row.itemIdText.trim() !== ""}
                                <ul class="absolute left-0 right-0 top-full z-[100] mt-1 max-h-64 overflow-auto rounded-md border bg-popover py-1 shadow-md" role="listbox">
                                    {#if itemSuggestions.length > 0}
                                        {#each itemSuggestions as entry, suggestionIndex (`${entry.id}-${entry.name}`)}
                                            <li>
                                                <button
                                                    type="button"
                                                    class={cn("flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm", suggestionIndex === rowSuggestActiveIndex && "bg-muted")}
                                                    onmouseenter={() => (rowSuggestActiveIndex = suggestionIndex)}
                                                    onmousedown={(event) => event.preventDefault()}
                                                    onclick={() => pickItem(entry, index)}
                                                >
                                                    <span class="truncate font-mono text-xs">{entry.name}</span>
                                                    <span class="shrink-0 font-mono text-xs text-muted-foreground">id: {entry.id}</span>
                                                </button>
                                            </li>
                                        {/each}
                                    {:else}
                                        <li class="px-3 py-1.5 text-xs text-muted-foreground">No matching gamevals</li>
                                    {/if}
                                </ul>
                            {/if}
                        </div>

                        <Input
                            class="h-8 w-20 shrink-0 font-mono text-xs"
                            type="number"
                            min="0"
                            value={row.qtyText}
                            disabled={selectedComponentId == null}
                            oninput={(event) => {
                                const next = [...rows];
                                next[index] = { ...next[index]!, qtyText: event.currentTarget.value };
                                rows = next;
                            }}
                        />

                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            class="size-8 shrink-0"
                            disabled={rows.length <= 1}
                            onclick={() => (rows = rows.filter((_, rowIndex) => rowIndex !== index))}
                        >
                            <Trash2 class="size-3.5" />
                        </Button>
                    </div>
                {/each}

                <Button type="button" size="sm" class="h-8 w-full text-[11px]" disabled={selectedComponentId == null} onclick={applyRows}>
                    Apply rows to slots
                </Button>
            </div>
        </div>
    {/if}
</details>
