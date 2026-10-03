<script lang="ts">
    import HelpCircle from "@lucide/svelte/icons/help-circle";

    import { Cs1Interpreter } from "../../../lib/interface-renderer/cs1-interpreter";
    import { OSRS_WIKI_SKILL_ICON_FILES, osrsWikiSkillIconUrl } from "../../../interface/cs1-skill-icons";
    import type { Sprite } from "../../../rs/sprite/InterfaceCanvasSprite";
    import { Button } from "../../components/ui/button";
    import { Input } from "../../components/ui/input";
    import { cn } from "../../lib/utils";
    import type { InterfaceEditorState } from "../interface-editor-state.svelte";
    import InventorySimulator from "./InventorySimulator.svelte";

    const CS1_GENERAL_SPRITE_COMBAT = 881;
    const CS1_GENERAL_SPRITE_RUN = 1070;
    const CS1_GENERAL_SPRITE_WEIGHT = 649;

    const SKILL_NAMES: readonly string[] = [
        "Attack",
        "Defence",
        "Strength",
        "Hitpoints",
        "Ranged",
        "Prayer",
        "Magic",
        "Cooking",
        "Woodcutting",
        "Fletching",
        "Fishing",
        "Firemaking",
        "Crafting",
        "Smithing",
        "Mining",
        "Herblore",
        "Agility",
        "Thieving",
        "Slayer",
        "Farming",
        "Runecraft",
        "Hunter",
        "Construction",
        "Sailing",
    ];

    let { state: editor }: { state: InterfaceEditorState } = $props();
    let skillsOpen = $state(false);

    const hasAnyCs1Scripts = $derived(Cs1Interpreter.interfaceUsesCs1(editor.interfaceData));
    const generalUsed = $derived(
        Cs1Interpreter.interfaceScriptsUseOpcodes(editor.interfaceData, Cs1Interpreter.SIM_GENERAL_OPCODES),
    );
    const skillsUsed = $derived(
        Cs1Interpreter.interfaceScriptsUseOpcodes(editor.interfaceData, Cs1Interpreter.SIM_SKILL_OPCODES),
    );
    const variablesUsed = $derived(
        Cs1Interpreter.interfaceScriptsUseOpcodes(editor.interfaceData, Cs1Interpreter.SIM_VARIABLE_OPCODES),
    );
    const inventoryScriptsUsed = $derived(
        Cs1Interpreter.interfaceScriptsUseOpcodes(editor.interfaceData, Cs1Interpreter.SIM_INVENTORY_OPCODES),
    );
    const combatSpriteSrc = $derived(spriteToPngDataUrl(editor.viewer.spritesById.get(CS1_GENERAL_SPRITE_COMBAT)));
    const runSpriteSrc = $derived(spriteToPngDataUrl(editor.viewer.spritesById.get(CS1_GENERAL_SPRITE_RUN)));
    const weightSpriteSrc = $derived(spriteToPngDataUrl(editor.viewer.spritesById.get(CS1_GENERAL_SPRITE_WEIGHT)));

    $effect(() => {
        if (!skillsUsed) skillsOpen = false;
    });

    function spriteToPngDataUrl(sprite: Sprite | undefined | null): string {
        if (!sprite?.loaded || sprite.subWidth <= 0 || sprite.subHeight <= 0) return "";
        const canvas = document.createElement("canvas");
        canvas.width = sprite.subWidth;
        canvas.height = sprite.subHeight;
        const context = canvas.getContext("2d");
        if (!context) return "";
        context.putImageData(new ImageData(new Uint8ClampedArray(sprite.toRgba()), sprite.subWidth, sprite.subHeight), 0, 0);
        try {
            return canvas.toDataURL("image/png");
        } catch {
            return "";
        }
    }

    function patchGeneral(field: "combatLevel" | "runEnergy" | "weight", value: number): void {
        editor.setCs1SimState((previous) => ({ ...previous, [field]: value }));
    }

    function patchSkill(
        index: number,
        field: "currentLevels" | "maximumLevels" | "currentExp",
        value: number,
    ): void {
        editor.setCs1SimState((previous) => {
            const next = { ...previous, [field]: [...previous[field]] };
            next[field][index] = value;
            return next;
        });
    }

    function maxAll(): void {
        editor.setCs1SimState((previous) => {
            const maximumLevels = [...previous.maximumLevels];
            const currentLevels = [...previous.currentLevels];
            const currentExp = [...previous.currentExp];
            for (let index = 0; index < Cs1Interpreter.SKILL_COUNT; index++) {
                maximumLevels[index] = 99;
                currentLevels[index] = 99;
                currentExp[index] = Cs1Interpreter.XP_AT_99;
            }
            return { ...previous, maximumLevels, currentLevels, currentExp };
        });
    }

    function resetAll(): void {
        editor.setCs1SimState(Cs1Interpreter.defaultState());
    }

    function generalSprite(id: number): string {
        if (id === CS1_GENERAL_SPRITE_COMBAT) return combatSpriteSrc;
        if (id === CS1_GENERAL_SPRITE_RUN) return runSpriteSrc;
        return weightSpriteSrc;
    }
</script>

<div class="space-y-3 px-2 py-2 text-[11px]">
    <p class="px-1 leading-snug text-muted-foreground">
        Skill icons from the
        <a class="text-primary underline-offset-2 hover:underline" href="https://oldschool.runescape.wiki/" target="_blank" rel="noreferrer">
            OSRS Wiki
        </a>.
    </p>

    {#if !hasAnyCs1Scripts}
        <p class="px-1 text-[10px] leading-snug text-muted-foreground">
            This interface has no client scripts on any component. Simulator inputs are shown for reference only.
        </p>
    {/if}

    <details class="overflow-hidden rounded-lg border border-border bg-background" open>
        <summary class="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
            <span class="flex min-w-0 flex-1 items-center gap-2">
                <span>General</span>
                {#if !generalUsed}
                    <span class="rounded bg-secondary px-1.5 py-0 text-[9px] font-normal text-secondary-foreground">Not used</span>
                {/if}
            </span>
        </summary>
        <div class="space-y-3 border-t border-border px-2 pb-2 pt-2" class:opacity-70={!generalUsed}>
            <div class="grid gap-2">
                {#each [
                    { field: "combatLevel", sprite: CS1_GENERAL_SPRITE_COMBAT, label: "Combat level", placeholder: Cs1Interpreter.DEFAULT_COMBAT_LEVEL },
                    { field: "runEnergy", sprite: CS1_GENERAL_SPRITE_RUN, label: "Run energy", placeholder: Cs1Interpreter.DEFAULT_RUN_ENERGY },
                    { field: "weight", sprite: CS1_GENERAL_SPRITE_WEIGHT, label: "Weight", placeholder: Cs1Interpreter.DEFAULT_WEIGHT },
                ] as item (item.field)}
                    <div class="flex items-center gap-2">
                        <button
                            type="button"
                            class="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border/80 bg-muted/30 p-0.5"
                            disabled={!generalUsed}
                            title={item.label}
                            aria-label={item.label}
                        >
                            {#if generalSprite(item.sprite)}
                                <img src={generalSprite(item.sprite)} alt="" width="24" height="24" class="pointer-events-none max-h-full max-w-full rounded object-contain" />
                            {:else}
                                <HelpCircle class="size-4 text-muted-foreground" />
                            {/if}
                        </button>
                        <Input
                            type="number"
                            class="h-8 min-w-0 flex-1 font-mono text-xs"
                            placeholder={String(item.placeholder)}
                            value={String(editor.cs1SimState[item.field as "combatLevel" | "runEnergy" | "weight"])}
                            disabled={!generalUsed}
                            oninput={(event) =>
                                patchGeneral(
                                    item.field as "combatLevel" | "runEnergy" | "weight",
                                    Number(event.currentTarget.value) || 0,
                                )}
                            aria-label={item.label}
                        />
                    </div>
                {/each}
            </div>
        </div>
    </details>

    <details
        class="overflow-hidden rounded-lg border border-border bg-background"
        open={skillsUsed && skillsOpen}
        ontoggle={(event) => {
            if (!skillsUsed) {
                event.currentTarget.open = false;
                return;
            }
            skillsOpen = event.currentTarget.open;
        }}
    >
        <summary
            class={cn(
                "flex list-none items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold [&::-webkit-details-marker]:hidden",
                skillsUsed ? "cursor-pointer hover:bg-muted/50" : "bg-muted/25 text-muted-foreground",
            )}
        >
            <span class="flex min-w-0 flex-1 items-center gap-2">
                <span>Skills</span>
                {#if !skillsUsed}
                    <span class="rounded bg-secondary px-1.5 py-0 text-[9px] font-normal text-secondary-foreground">Not used</span>
                {/if}
            </span>
        </summary>

        {#if skillsUsed}
            <div class="border-t border-border px-1.5 pb-2 pt-1.5">
                <div class="mb-2 flex gap-2">
                    <Button type="button" variant="secondary" size="sm" class="h-8 flex-1 text-[11px]" onclick={maxAll}>Max all</Button>
                    <Button type="button" variant="outline" size="sm" class="h-8 flex-1 text-[11px]" onclick={resetAll}>Reset all</Button>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    {#each Array.from({ length: Cs1Interpreter.VISIBLE_SKILL_COUNT }) as _, index}
                        {@const name = SKILL_NAMES[index] ?? `Skill ${index}`}
                        {@const iconFile = OSRS_WIKI_SKILL_ICON_FILES[index] ?? null}
                        <div class="flex min-w-0 flex-col gap-1 rounded-md border border-border/80 bg-muted/15 p-1.5 shadow-sm">
                            <div class="flex min-w-0 items-center gap-1.5">
                                {#if iconFile}
                                    <img
                                        src={osrsWikiSkillIconUrl(iconFile)}
                                        alt=""
                                        width="20"
                                        height="20"
                                        class="size-5 shrink-0 rounded-sm bg-muted object-contain"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                {:else}
                                    <div class="flex size-5 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] text-muted-foreground">—</div>
                                {/if}
                                <span class="min-w-0 truncate font-medium leading-tight text-foreground" title={name}>{name}</span>
                            </div>

                            <div class="grid grid-cols-3 gap-1">
                                {#each [
                                    { field: "maximumLevels", label: "Max", value: editor.cs1SimState.maximumLevels[index] ?? 0 },
                                    { field: "currentLevels", label: "Cur", value: editor.cs1SimState.currentLevels[index] ?? 0 },
                                    { field: "currentExp", label: "XP", value: editor.cs1SimState.currentExp[index] ?? 0 },
                                ] as field (field.field)}
                                    <div class="min-w-0 space-y-0.5">
                                        <div class="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{field.label}</div>
                                        <Input
                                            type="number"
                                            class="h-7 min-w-0 px-1 font-mono text-[10px] tabular-nums"
                                            value={String(field.value)}
                                            oninput={(event) =>
                                                patchSkill(
                                                    index,
                                                    field.field as "currentLevels" | "maximumLevels" | "currentExp",
                                                    Number(event.currentTarget.value) || 0,
                                                )}
                                        />
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </details>

    <InventorySimulator state={editor} {inventoryScriptsUsed} />

    <div class={cn("rounded-md border border-dashed border-border p-2 text-[11px] text-muted-foreground", !variablesUsed && "bg-muted/15")}>
        <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium text-foreground">Variables</span>
            {#if !variablesUsed}
                <span class="rounded bg-secondary px-1.5 py-0 text-[9px] font-normal text-secondary-foreground">Not used</span>
            {/if}
        </div>
        <p class="mt-1 leading-snug">Editor coming soon.</p>
    </div>
</div>
