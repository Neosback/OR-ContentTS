<script lang="ts">
    import {
        clearMockClientChanges,
        setMockClientItemContainer,
        setMockClientSkill,
        setMockClientSocialState,
        setMockClientVarbit,
        setMockClientVarcInt,
        setMockClientVarcString,
        setMockClientVarp,
        snapshotMockClientChanges,
    } from "../../../lib/interface-renderer/mock-client-state";
    import type { Cs1SimState } from "../../../lib/interface-renderer/cs1-interpreter";
    import { Button } from "../../components/ui/button";
    import { Input } from "../../components/ui/input";
    import { Label } from "../../components/ui/label";
    import type { InterfaceEditorState } from "../interface-editor-state.svelte";

    let { state: editor }: { state: InterfaceEditorState } = $props();

    let varpIdText = $state("0");
    let varpValueText = $state("0");
    let varbitIdText = $state("0");
    let varbitValueText = $state("0");
    let varcIntIdText = $state("0");
    let varcIntValueText = $state("0");
    let varcStringIdText = $state("0");
    let varcStringValue = $state("");
    let skillIdText = $state("0");
    let skillCurrentText = $state("1");
    let skillBaseText = $state("1");
    let skillXpText = $state("0");
    let containerIdText = $state("93");
    let containerSlotText = $state("0");
    let containerItemText = $state("-1");
    let containerQtyText = $state("0");
    let containerCapacityText = $state("28");
    let localPlayerName = $state("");

    const pending = $derived(snapshotMockClientChanges(editor.cs1SimState));

    const currentVarp = $derived.by(() => {
        const id = parseInteger(varpIdText, -1);
        return id < 0 ? 0 : editor.cs1SimState.varps.getVarp(id);
    });

    const currentVarbit = $derived.by(() => {
        const id = parseInteger(varbitIdText, -1);
        return id < 0 ? 0 : editor.cs1SimState.varps.getVarbit(id, editor.varbitDefinitionLookup);
    });

    const currentVarcInt = $derived.by(() => {
        const id = parseInteger(varcIntIdText, -1);
        return id < 0 ? -1 : editor.cs1SimState.varcs.getInt(id);
    });

    const currentVarcString = $derived.by(() => {
        const id = parseInteger(varcStringIdText, -1);
        return id < 0 ? "" : editor.cs1SimState.varcs.getString(id);
    });

    function parseInteger(raw: string, fallback = 0): number {
        const parsed = Number.parseInt(raw.trim(), 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function mutate(mutator: (client: Cs1SimState) => void): void {
        editor.mutateMockClientState(mutator);
    }

    function setClientNumber(
        field:
            | "combatLevel"
            | "runEnergy"
            | "weight"
            | "localTileX"
            | "localTileY"
            | "localPlane"
            | "worldId"
            | "staffModLevel"
            | "rebootTimer"
            | "worldFlags",
        raw: string,
    ): void {
        const value = parseInteger(raw);
        mutate((client) => {
            client[field] = value;
        });
    }

    function applyVarp(): void {
        const id = parseInteger(varpIdText, -1);
        if (id < 0) return;
        mutate((client) => setMockClientVarp(client, id, parseInteger(varpValueText)));
    }

    function applyVarbit(): void {
        const id = parseInteger(varbitIdText, -1);
        if (id < 0) return;
        mutate((client) =>
            setMockClientVarbit(
                client,
                id,
                parseInteger(varbitValueText),
                editor.varbitDefinitionLookup,
            ),
        );
    }

    function applyVarcInt(): void {
        const id = parseInteger(varcIntIdText, -1);
        if (id < 0) return;
        mutate((client) => setMockClientVarcInt(client, id, parseInteger(varcIntValueText)));
    }

    function applyVarcString(): void {
        const id = parseInteger(varcStringIdText, -1);
        if (id < 0) return;
        mutate((client) => setMockClientVarcString(client, id, varcStringValue));
    }

    function applySkill(): void {
        const id = parseInteger(skillIdText, -1);
        if (id < 0) return;
        mutate((client) =>
            setMockClientSkill(client, id, {
                currentLevel: parseInteger(skillCurrentText, 1),
                maximumLevel: parseInteger(skillBaseText, 1),
                experience: parseInteger(skillXpText),
            }),
        );
    }

    function applyContainerSlot(): void {
        const containerId = parseInteger(containerIdText, -1);
        const slot = parseInteger(containerSlotText, -1);
        if (containerId < 0 || slot < 0) return;

        mutate((client) => {
            const previous = client.itemContainers[containerId];
            const capacity = Math.max(
                slot + 1,
                parseInteger(containerCapacityText),
                previous?.capacity ?? 0,
                previous?.itemIds.length ?? 0,
            );
            const itemIds = Array.from({ length: capacity }, (_, index) => previous?.itemIds[index] ?? -1);
            const itemQuantities = Array.from(
                { length: capacity },
                (_, index) => previous?.itemQuantities[index] ?? 0,
            );
            itemIds[slot] = parseInteger(containerItemText, -1);
            itemQuantities[slot] = Math.max(0, parseInteger(containerQtyText));
            setMockClientItemContainer(client, containerId, {
                itemIds,
                itemQuantities,
                capacity,
            });
        });
    }

    function applyLocalPlayerName(): void {
        mutate((client) =>
            setMockClientSocialState(client, {
                ...client.social,
                localPlayerName: localPlayerName.trim() || undefined,
            }),
        );
    }

    function clearPending(): void {
        mutate((client) => clearMockClientChanges(client));
    }
</script>

<div class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
    <div class="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <div>
            <div class="text-sm font-semibold">State debugger</div>
            <div class="text-[10px] text-muted-foreground">
                Script-visible mock client state
            </div>
        </div>
        <span
            class={`ml-auto rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                editor.runtimeMode === "simulate"
                    ? "border-emerald-500/50 text-emerald-400"
                    : "border-border text-muted-foreground"
            }`}
        >
            {editor.runtimeMode === "simulate" ? "Simulation" : "Edit"}
        </span>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-2 text-[11px]">
        {#if editor.runtimeMode === "edit"}
            <div class="rounded border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[10px] leading-snug text-amber-200">
                State changes are staged while Edit mode is active. Enter Simulation to run onLoad, timer,
                transmit and pointer hooks against these values.
            </div>
        {/if}

        <details class="overflow-hidden rounded border border-border bg-background" open>
            <summary class="cursor-pointer px-2.5 py-2 text-xs font-semibold hover:bg-muted/40">Runtime</summary>
            <div class="grid grid-cols-2 gap-2 border-t p-2">
                <label class="space-y-1">
                    <span class="text-muted-foreground">World</span>
                    <Input class="h-7 font-mono text-[10px]" type="number" value={String(editor.cs1SimState.worldId)} oninput={(event) => setClientNumber("worldId", event.currentTarget.value)} />
                </label>
                <label class="space-y-1">
                    <span class="text-muted-foreground">Cycle</span>
                    <Input class="h-7 font-mono text-[10px]" value={String(editor.cs1SimState.clientCycle)} disabled />
                </label>
                <label class="space-y-1">
                    <span class="text-muted-foreground">Combat</span>
                    <Input class="h-7 font-mono text-[10px]" type="number" value={String(editor.cs1SimState.combatLevel)} oninput={(event) => setClientNumber("combatLevel", event.currentTarget.value)} />
                </label>
                <label class="space-y-1">
                    <span class="text-muted-foreground">Run energy</span>
                    <Input class="h-7 font-mono text-[10px]" type="number" value={String(editor.cs1SimState.runEnergy)} oninput={(event) => setClientNumber("runEnergy", event.currentTarget.value)} />
                </label>
                <label class="space-y-1">
                    <span class="text-muted-foreground">Weight</span>
                    <Input class="h-7 font-mono text-[10px]" type="number" value={String(editor.cs1SimState.weight)} oninput={(event) => setClientNumber("weight", event.currentTarget.value)} />
                </label>
                <label class="flex items-end gap-2 pb-1">
                    <input
                        type="checkbox"
                        checked={editor.cs1SimState.isMembersWorld}
                        onchange={(event) =>
                            mutate((client) => {
                                client.isMembersWorld = event.currentTarget.checked;
                            })}
                    />
                    <span>Members world</span>
                </label>
                <label class="space-y-1">
                    <span class="text-muted-foreground">Tile X</span>
                    <Input class="h-7 font-mono text-[10px]" type="number" value={String(editor.cs1SimState.localTileX)} oninput={(event) => setClientNumber("localTileX", event.currentTarget.value)} />
                </label>
                <label class="space-y-1">
                    <span class="text-muted-foreground">Tile Y</span>
                    <Input class="h-7 font-mono text-[10px]" type="number" value={String(editor.cs1SimState.localTileY)} oninput={(event) => setClientNumber("localTileY", event.currentTarget.value)} />
                </label>
                <label class="space-y-1">
                    <span class="text-muted-foreground">Plane</span>
                    <Input class="h-7 font-mono text-[10px]" type="number" min="0" max="3" value={String(editor.cs1SimState.localPlane)} oninput={(event) => setClientNumber("localPlane", event.currentTarget.value)} />
                </label>
                <label class="space-y-1">
                    <span class="text-muted-foreground">Staff mod</span>
                    <Input class="h-7 font-mono text-[10px]" type="number" value={String(editor.cs1SimState.staffModLevel)} oninput={(event) => setClientNumber("staffModLevel", event.currentTarget.value)} />
                </label>
                <label class="space-y-1">
                    <span class="text-muted-foreground">Reboot timer</span>
                    <Input class="h-7 font-mono text-[10px]" type="number" value={String(editor.cs1SimState.rebootTimer)} oninput={(event) => setClientNumber("rebootTimer", event.currentTarget.value)} />
                </label>
                <label class="space-y-1">
                    <span class="text-muted-foreground">World flags</span>
                    <Input class="h-7 font-mono text-[10px]" type="number" value={String(editor.cs1SimState.worldFlags)} oninput={(event) => setClientNumber("worldFlags", event.currentTarget.value)} />
                </label>
            </div>
        </details>

        <details class="overflow-hidden rounded border border-border bg-background" open>
            <summary class="cursor-pointer px-2.5 py-2 text-xs font-semibold hover:bg-muted/40">Varps & varbits</summary>
            <div class="space-y-3 border-t p-2">
                <div class="space-y-1">
                    <Label>Varp</Label>
                    <div class="grid grid-cols-[1fr_1fr_auto] gap-1">
                        <Input class="h-7 font-mono text-[10px]" placeholder="id" value={varpIdText} oninput={(event) => (varpIdText = event.currentTarget.value)} />
                        <Input class="h-7 font-mono text-[10px]" placeholder="value" value={varpValueText} oninput={(event) => (varpValueText = event.currentTarget.value)} />
                        <Button type="button" size="sm" class="h-7 px-2 text-[10px]" onclick={applyVarp}>Set</Button>
                    </div>
                    <div class="font-mono text-[10px] text-muted-foreground">current: {currentVarp}</div>
                </div>
                <div class="space-y-1">
                    <Label>Varbit</Label>
                    <div class="grid grid-cols-[1fr_1fr_auto] gap-1">
                        <Input class="h-7 font-mono text-[10px]" placeholder="id" value={varbitIdText} oninput={(event) => (varbitIdText = event.currentTarget.value)} />
                        <Input class="h-7 font-mono text-[10px]" placeholder="value" value={varbitValueText} oninput={(event) => (varbitValueText = event.currentTarget.value)} />
                        <Button type="button" size="sm" class="h-7 px-2 text-[10px]" onclick={applyVarbit}>Set</Button>
                    </div>
                    <div class="font-mono text-[10px] text-muted-foreground">
                        current: {currentVarbit}{editor.varbitDefinitionLookup ? "" : " · no varbit definitions"}
                    </div>
                </div>
            </div>
        </details>

        <details class="overflow-hidden rounded border border-border bg-background">
            <summary class="cursor-pointer px-2.5 py-2 text-xs font-semibold hover:bg-muted/40">Varcs</summary>
            <div class="space-y-3 border-t p-2">
                <div class="space-y-1">
                    <Label>Integer Varc</Label>
                    <div class="grid grid-cols-[1fr_1fr_auto] gap-1">
                        <Input class="h-7 font-mono text-[10px]" placeholder="id" value={varcIntIdText} oninput={(event) => (varcIntIdText = event.currentTarget.value)} />
                        <Input class="h-7 font-mono text-[10px]" placeholder="value" value={varcIntValueText} oninput={(event) => (varcIntValueText = event.currentTarget.value)} />
                        <Button type="button" size="sm" class="h-7 px-2 text-[10px]" onclick={applyVarcInt}>Set</Button>
                    </div>
                    <div class="font-mono text-[10px] text-muted-foreground">current: {currentVarcInt}</div>
                </div>
                <div class="space-y-1">
                    <Label>String Varc</Label>
                    <div class="grid grid-cols-[1fr_1.5fr_auto] gap-1">
                        <Input class="h-7 font-mono text-[10px]" placeholder="id" value={varcStringIdText} oninput={(event) => (varcStringIdText = event.currentTarget.value)} />
                        <Input class="h-7 text-[10px]" placeholder="value" value={varcStringValue} oninput={(event) => (varcStringValue = event.currentTarget.value)} />
                        <Button type="button" size="sm" class="h-7 px-2 text-[10px]" onclick={applyVarcString}>Set</Button>
                    </div>
                    <div class="truncate font-mono text-[10px] text-muted-foreground" title={currentVarcString}>current: {currentVarcString || "∅"}</div>
                </div>
            </div>
        </details>

        <details class="overflow-hidden rounded border border-border bg-background">
            <summary class="cursor-pointer px-2.5 py-2 text-xs font-semibold hover:bg-muted/40">Skill</summary>
            <div class="space-y-2 border-t p-2">
                <div class="grid grid-cols-4 gap-1">
                    <Input class="h-7 font-mono text-[10px]" placeholder="skill id" value={skillIdText} oninput={(event) => (skillIdText = event.currentTarget.value)} />
                    <Input class="h-7 font-mono text-[10px]" placeholder="current" value={skillCurrentText} oninput={(event) => (skillCurrentText = event.currentTarget.value)} />
                    <Input class="h-7 font-mono text-[10px]" placeholder="base" value={skillBaseText} oninput={(event) => (skillBaseText = event.currentTarget.value)} />
                    <Input class="h-7 font-mono text-[10px]" placeholder="xp" value={skillXpText} oninput={(event) => (skillXpText = event.currentTarget.value)} />
                </div>
                <Button type="button" size="sm" class="h-7 w-full text-[10px]" onclick={applySkill}>Apply skill state</Button>
            </div>
        </details>

        <details class="overflow-hidden rounded border border-border bg-background">
            <summary class="cursor-pointer px-2.5 py-2 text-xs font-semibold hover:bg-muted/40">Item container</summary>
            <div class="space-y-2 border-t p-2">
                <div class="grid grid-cols-3 gap-1">
                    <Input class="h-7 font-mono text-[10px]" placeholder="container" value={containerIdText} oninput={(event) => (containerIdText = event.currentTarget.value)} />
                    <Input class="h-7 font-mono text-[10px]" placeholder="slot" value={containerSlotText} oninput={(event) => (containerSlotText = event.currentTarget.value)} />
                    <Input class="h-7 font-mono text-[10px]" placeholder="capacity" value={containerCapacityText} oninput={(event) => (containerCapacityText = event.currentTarget.value)} />
                    <Input class="h-7 font-mono text-[10px]" placeholder="item id" value={containerItemText} oninput={(event) => (containerItemText = event.currentTarget.value)} />
                    <Input class="h-7 font-mono text-[10px]" placeholder="quantity" value={containerQtyText} oninput={(event) => (containerQtyText = event.currentTarget.value)} />
                    <Button type="button" size="sm" class="h-7 px-2 text-[10px]" onclick={applyContainerSlot}>Inject</Button>
                </div>
                <div class="text-[10px] leading-snug text-muted-foreground">
                    Client item containers use definition ids directly. Use -1 for an empty slot.
                </div>
            </div>
        </details>

        <details class="overflow-hidden rounded border border-border bg-background">
            <summary class="cursor-pointer px-2.5 py-2 text-xs font-semibold hover:bg-muted/40">Social</summary>
            <div class="space-y-2 border-t p-2">
                <div class="grid grid-cols-[1fr_auto] gap-1">
                    <Input class="h-7 text-[10px]" placeholder="local player name" value={localPlayerName} oninput={(event) => (localPlayerName = event.currentTarget.value)} />
                    <Button type="button" size="sm" class="h-7 px-2 text-[10px]" onclick={applyLocalPlayerName}>Set</Button>
                </div>
                <div class="grid grid-cols-3 gap-1 text-center text-[10px] text-muted-foreground">
                    <div class="rounded bg-muted/30 p-1">friends {editor.cs1SimState.social.friends.length}</div>
                    <div class="rounded bg-muted/30 p-1">ignores {editor.cs1SimState.social.ignores.length}</div>
                    <div class="rounded bg-muted/30 p-1">chat {editor.cs1SimState.social.friendsChat?.members.length ?? 0}</div>
                </div>
            </div>
        </details>

        <details class="overflow-hidden rounded border border-border bg-background" open>
            <summary class="cursor-pointer px-2.5 py-2 text-xs font-semibold hover:bg-muted/40">Pending events</summary>
            <div class="space-y-2 border-t p-2">
                <div class="grid grid-cols-2 gap-1 font-mono text-[10px] text-muted-foreground">
                    <span>varps: {pending.varps.join(", ") || "∅"}</span>
                    <span>varbits: {pending.varbits.join(", ") || "∅"}</span>
                    <span>inventories: {pending.inventories.join(", ") || "∅"}</span>
                    <span>skills: {pending.skills.join(", ") || "∅"}</span>
                    <span>varc ints: {pending.varcInts.join(", ") || "∅"}</span>
                    <span>varc strings: {pending.varcStrings.join(", ") || "∅"}</span>
                </div>
                <div class="text-[10px] text-muted-foreground">
                    write counts · varp {pending.varpEventCount} · inv {pending.inventoryEventCount} · stat {pending.skillEventCount}
                </div>
                <div class="flex gap-2">
                    <Button type="button" variant="outline" size="sm" class="h-7 flex-1 text-[10px]" onclick={clearPending}>Clear pending</Button>
                    <Button type="button" variant="destructive" size="sm" class="h-7 flex-1 text-[10px]" onclick={editor.resetMockClientState}>Reset state</Button>
                </div>
            </div>
        </details>
    </div>
</div>
