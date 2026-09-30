<script lang="ts">
    import Plus from "@lucide/svelte/icons/plus";
    import Trash2 from "@lucide/svelte/icons/trash-2";

    import type { ComponentScriptArg, ComponentType } from "../../../lib/interface-renderer/component-types";
    import { Button } from "../../components/ui/button";
    import { Input } from "../../components/ui/input";
    import { Label } from "../../components/ui/label";
    import type { InterfaceEditorState } from "../interface-editor-editor.svelte";

    let { state: editor }: { state: InterfaceEditorState } = $props();

    let tab = $state<"properties" | "scripts">("properties");
    let selectedHookKey = $state<keyof ComponentType>("onLoad");
    let hookRows = $state<string[]>([]);

    const COLOR_PACK_KEYS: (keyof ComponentType)[] = ["colour1", "colour2", "mouseOverColour1", "mouseOverColour2"];
    const PROPERTY_NUMBER_KEYS: (keyof ComponentType)[] = [
        "type",
        "buttonType",
        "clientCode",
        "x",
        "y",
        "width",
        "height",
        "trans1",
        "layer",
        "mouseOverRedirect",
        "scrollHeight",
        "textAlignH",
        "textAlignV",
        "textLineHeight",
        "textFont",
        "graphic",
        "secondaryGraphic",
        "modelKind",
        "model",
        "secondaryModelKind",
        "secondaryModel",
        "modelAnim",
        "secondaryModelAnim",
        "modelZoom",
        "modelAngleX",
        "modelAngleY",
        "modelAngleZ",
        "events",
        "widthMode",
        "heightMode",
        "xMode",
        "yMode",
        "scrollWidth",
        "angle2d",
        "outline",
        "graphicShadow",
        "modelX",
        "modelY",
        "modelObjWidth",
        "lineWid",
        "dragDeadZone",
        "dragDeadTime",
    ];
    const PROPERTY_BOOL_KEYS: (keyof ComponentType)[] = [
        "hide",
        "fill",
        "textShadow",
        "noClickThrough",
        "tiling",
        "vFlip",
        "hFlip",
        "modelOrthog",
        "lineDirection",
        "draggableBehavior",
    ];
    const PROPERTY_STRING_KEYS: (keyof ComponentType)[] = [
        "secondaryText",
        "text",
        "targetVerb",
        "targetBase",
        "buttonText",
        "opBase",
    ];
    const CS1_DECODE_JSON_KEYS: (keyof ComponentType)[] = ["cs1Comparisons", "cs1ComparisonValues"];
    const SCRIPT_HOOK_KEYS: (keyof ComponentType)[] = [
        "onLoad",
        "onMouseOver",
        "onMouseLeave",
        "onTargetLeave",
        "onTargetEnter",
        "onVarTransmit",
        "onInvTransmit",
        "onStatTransmit",
        "onTimer",
        "onOp",
        "onMouseRepeat",
        "onClick",
        "onClickRepeat",
        "onRelease",
        "onHold",
        "onDrag",
        "onDragComplete",
        "onScrollWheel",
        "onVarTransmitList",
        "onInvTransmitList",
        "onStatTransmitList",
    ];
    const HOOK_INT_LIST_KEYS = new Set<string>(["onVarTransmitList", "onInvTransmitList", "onStatTransmitList"]);

    const component = $derived(editor.selectedComponent);
    const storageKey = $derived(findComponentStorageKey(editor.interfaceData, component));
    const isLegacy = $derived(editor.rootWidgetV3 === false);

    $effect(() => {
        storageKey;
        selectedHookKey = SCRIPT_HOOK_KEYS[0]!;
    });

    $effect(() => {
        const current = component;
        const key = selectedHookKey;
        if (!current || HOOK_INT_LIST_KEYS.has(String(key))) {
            hookRows = [];
            return;
        }
        const value = current[key] as ComponentScriptArg[] | null | undefined;
        hookRows = Array.isArray(value) ? value.map((arg) => JSON.stringify(arg)) : [];
    });

    function findComponentStorageKey(
        data: { components: Record<string, ComponentType> } | null,
        selected: ComponentType | null,
    ): string | null {
        if (!data || !selected) return null;
        const byRef = Object.keys(data.components).find((key) => data.components[key] === selected);
        if (byRef) return byRef;
        return Object.keys(data.components).find((key) => data.components[key]!.id === selected.id) ?? null;
    }

    function parseIntSafe(value: string, fallback: number): number {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function rgbPackToHex6(packed: number): string {
        const value = packed >>> 0;
        const r = (value >> 16) & 0xff;
        const g = (value >> 8) & 0xff;
        const b = value & 0xff;
        return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
    }

    function hex6ToRgbPack(hex: string): number {
        const clean = hex.replace(/^#/, "");
        return /^[0-9a-f]{6}$/i.test(clean) ? Number.parseInt(clean, 16) >>> 0 : 0;
    }

    function parseCommaSeparatedInts(value: string): number[] {
        return value
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => Number.parseInt(part, 10))
            .filter(Number.isFinite);
    }

    function parseHookArgs(rows: string[]): ComponentScriptArg[] | null {
        const out: ComponentScriptArg[] = [];
        for (const line of rows) {
            const value = line.trim();
            if (value === "") {
                out.push(null);
                continue;
            }
            try {
                out.push(JSON.parse(value) as ComponentScriptArg);
            } catch {
                return null;
            }
        }
        return out;
    }

    function patch(partial: Partial<ComponentType>): void {
        const key = storageKey;
        if (key == null) return;
        editor.setInterfaceData((previous) => {
            if (!previous) return previous;
            const current = previous.components[key];
            if (!current) return previous;
            return {
                ...previous,
                components: {
                    ...previous.components,
                    [key]: { ...current, ...partial },
                },
            };
        });
        editor.cs2RedrawNonce += 1;
    }

    function numVal(key: keyof ComponentType): number {
        const value = component?.[key];
        return typeof value === "number" && Number.isFinite(value) ? value : 0;
    }

    function boolVal(key: keyof ComponentType): boolean {
        return Boolean(component?.[key]);
    }

    function strVal(key: keyof ComponentType): string {
        const value = component?.[key];
        return typeof value === "string" ? value : "";
    }

    function numberArray(key: keyof ComponentType): number[] {
        const value = component?.[key];
        return Array.isArray(value) ? [...(value as number[])] : [];
    }

    function patchNumberArray(key: keyof ComponentType, rows: number[]): void {
        patch({ [key]: rows.length > 0 ? rows : null } as Partial<ComponentType>);
    }

    function itemRows(): { id: number; qty: number }[] {
        const ids = Array.isArray(component?.itemIds) ? component.itemIds : [];
        const quantities = Array.isArray(component?.itemQuantities) ? component.itemQuantities : [];
        const length = Math.max(ids.length, quantities.length);
        return Array.from({ length }, (_, index) => ({
            id: ids[index] ?? 0,
            qty: quantities[index] ?? 0,
        }));
    }

    function patchItemRows(rows: { id: number; qty: number }[]): void {
        patch(
            rows.length === 0
                ? { itemIds: null, itemQuantities: null }
                : {
                      itemIds: rows.map((row) => row.id),
                      itemQuantities: rows.map((row) => row.qty),
                  },
        );
    }

    function patchHookRows(rows: string[]): void {
        hookRows = rows;
        const parsed = parseHookArgs(rows);
        if (parsed == null) return;
        patch({ [selectedHookKey]: parsed.length > 0 ? parsed : null } as Partial<ComponentType>);
    }
</script>

{#if editor.selectedId == null}
    <div class="flex h-full min-h-0 items-center justify-center bg-background px-3 text-xs text-muted-foreground">
        Select an interface first.
    </div>
{:else if !editor.isInterfaceLoaded || !editor.interfaceData}
    <div class="flex h-full min-h-0 items-center justify-center bg-background px-3 text-xs text-muted-foreground">
        Loading…
    </div>
{:else if !component || storageKey == null}
    <div class="flex h-full min-h-0 items-center justify-center bg-background px-3 text-center text-xs text-muted-foreground">
        Pick a component in <span class="px-1 font-medium text-foreground">Component view</span> to edit its fields.
    </div>
{:else}
    <div class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
        <div class="flex shrink-0 gap-0.5 border-b border-border/80 px-1.5 py-1">
            <Button type="button" size="sm" variant={tab === "properties" ? "default" : "outline"} class="h-6 flex-1 text-[10px]" onclick={() => (tab = "properties")}>
                Properties
            </Button>
            <Button
                type="button"
                size="sm"
                variant={tab === "scripts" ? "default" : "outline"}
                class="h-6 flex-1 text-[10px]"
                onclick={() => (tab = "scripts")}
                title={isLegacy ? "CS1 comparisons, values, and instruction opcodes" : "CS2-style hook payloads"}
            >
                {isLegacy ? "CS1 hooks" : "CS2 hooks"}
            </Button>
        </div>

        {#if tab === "properties"}
            <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-1.5">
                <section class="space-y-1">
                    <div class="text-[10px] font-medium text-muted-foreground">Identity and layout</div>
                    <div class="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                        {#each PROPERTY_NUMBER_KEYS as key (String(key))}
                            <div class="grid grid-cols-[minmax(0,6.5rem)_1fr] items-center gap-x-2 gap-y-0.5">
                                <Label for={`iface-ed-${String(key)}`} class="text-[10px] text-muted-foreground">{String(key)}</Label>
                                <Input
                                    id={`iface-ed-${String(key)}`}
                                    type="number"
                                    class="h-6 font-mono text-[11px]"
                                    value={String(numVal(key))}
                                    onchange={(event) => patch({ [key]: parseIntSafe(event.currentTarget.value, numVal(key)) } as Partial<ComponentType>)}
                                />
                            </div>
                        {/each}
                    </div>
                    <div class="space-y-0.5">
                        <Label for="iface-ed-internalName" class="text-[10px] text-muted-foreground">internalName</Label>
                        <Input
                            id="iface-ed-internalName"
                            class="h-6 font-mono text-[11px]"
                            value={component.internalName ?? ""}
                            onchange={(event) => {
                                const value = event.currentTarget.value;
                                patch({ internalName: value.trim() === "" ? null : value });
                            }}
                        />
                    </div>
                </section>

                <section class="space-y-1 border-t border-border/70 pt-2">
                    <div class="text-[10px] font-medium text-muted-foreground">Colours (0xRRGGBB)</div>
                    <div class="grid max-w-lg gap-1">
                        {#each COLOR_PACK_KEYS as key (String(key))}
                            <div class="grid grid-cols-[minmax(0,5.5rem)_auto_1fr] items-center gap-1">
                                <Label for={`iface-color-${String(key)}`} class="text-[10px] text-muted-foreground">{String(key)}</Label>
                                <input
                                    id={`iface-color-${String(key)}`}
                                    type="color"
                                    class="h-6 w-9 min-w-0 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0"
                                    value={rgbPackToHex6(numVal(key))}
                                    onchange={(event) => patch({ [key]: hex6ToRgbPack(event.currentTarget.value) } as Partial<ComponentType>)}
                                />
                                <Input
                                    type="number"
                                    class="h-6 min-w-0 font-mono text-[11px]"
                                    value={String(numVal(key))}
                                    onchange={(event) => patch({ [key]: parseIntSafe(event.currentTarget.value, numVal(key)) } as Partial<ComponentType>)}
                                />
                            </div>
                        {/each}
                    </div>
                </section>

                <section class="space-y-1 border-t border-border/70 pt-2">
                    <div class="text-[10px] font-medium text-muted-foreground">Flags</div>
                    <div class="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                        {#each PROPERTY_BOOL_KEYS as key (String(key))}
                            <label class="flex items-center gap-2 text-[10px]">
                                <input
                                    type="checkbox"
                                    class="size-3.5 rounded border border-input accent-primary"
                                    checked={boolVal(key)}
                                    onchange={(event) => patch({ [key]: event.currentTarget.checked } as Partial<ComponentType>)}
                                />
                                <span>{String(key)}</span>
                            </label>
                        {/each}
                    </div>
                </section>

                <section class="space-y-1 border-t border-border/70 pt-2">
                    <div class="text-[10px] font-medium text-muted-foreground">Strings</div>
                    <div class="space-y-1">
                        {#each PROPERTY_STRING_KEYS as key (String(key))}
                            <div class="space-y-0.5">
                                <Label class="text-[10px] text-muted-foreground">{String(key)}</Label>
                                <Input
                                    class="h-6 font-mono text-[11px]"
                                    value={strVal(key)}
                                    onchange={(event) => patch({ [key]: event.currentTarget.value } as Partial<ComponentType>)}
                                />
                            </div>
                        {/each}
                    </div>
                </section>

                <section class="space-y-1 border-t border-border/70 pt-2">
                    <div class="text-[10px] font-medium text-muted-foreground">op (target options)</div>
                    {#each component.op ?? [] as value, index}
                        <div class="flex items-center gap-1">
                            <Input
                                class="h-6 min-w-0 flex-1 font-mono text-[11px]"
                                value={value}
                                onchange={(event) => {
                                    const rows = [...(component.op ?? [])];
                                    rows[index] = event.currentTarget.value;
                                    patch({ op: rows });
                                }}
                            />
                            <Button type="button" size="sm" variant="ghost" class="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive" onclick={() => patch({ op: (component.op ?? []).filter((_, row) => row !== index) })}>
                                <Trash2 class="size-3" />
                            </Button>
                        </div>
                    {/each}
                    <Button type="button" size="sm" variant="outline" class="h-6 gap-0.5 px-2 text-[10px]" onclick={() => patch({ op: [...(component.op ?? []), ""] })}>
                        <Plus class="size-3" /> Add
                    </Button>
                </section>

                <section class="space-y-1 border-t border-border/70 pt-2">
                    <div class="text-[10px] font-medium text-muted-foreground">itemIds · itemQuantities</div>
                    {#each itemRows() as row, index}
                        <div class="flex items-center gap-1">
                            <Input
                                type="number"
                                class="h-6 min-w-0 flex-1 font-mono text-[11px]"
                                value={String(row.id)}
                                onchange={(event) => {
                                    const rows = itemRows();
                                    rows[index] = { ...rows[index]!, id: parseIntSafe(event.currentTarget.value, row.id) };
                                    patchItemRows(rows);
                                }}
                            />
                            <Input
                                type="number"
                                class="h-6 min-w-0 flex-1 font-mono text-[11px]"
                                value={String(row.qty)}
                                onchange={(event) => {
                                    const rows = itemRows();
                                    rows[index] = { ...rows[index]!, qty: parseIntSafe(event.currentTarget.value, row.qty) };
                                    patchItemRows(rows);
                                }}
                            />
                            <Button type="button" size="sm" variant="ghost" class="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive" onclick={() => patchItemRows(itemRows().filter((_, rowIndex) => rowIndex !== index))}>
                                <Trash2 class="size-3" />
                            </Button>
                        </div>
                    {/each}
                    <Button type="button" size="sm" variant="outline" class="h-6 gap-0.5 px-2 text-[10px]" onclick={() => patchItemRows([...itemRows(), { id: 0, qty: 0 }])}>
                        <Plus class="size-3" /> Add
                    </Button>
                </section>
            </div>
        {:else}
            <div class="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-1.5">
                {#if isLegacy}
                    <p class="text-[10px] leading-snug text-muted-foreground">Add rows as needed. Empty lists are stored as null.</p>
                    {#each CS1_DECODE_JSON_KEYS as key (String(key))}
                        <section class="space-y-1 border-t border-border/70 pt-2 first:border-t-0">
                            <div class="font-mono text-[10px] text-muted-foreground">{String(key)}</div>
                            {#each numberArray(key) as value, index}
                                <div class="flex items-center gap-1">
                                    <Input
                                        type="number"
                                        class="h-6 min-w-0 flex-1 font-mono text-[11px]"
                                        value={String(value)}
                                        onchange={(event) => {
                                            const rows = numberArray(key);
                                            rows[index] = parseIntSafe(event.currentTarget.value, value);
                                            patchNumberArray(key, rows);
                                        }}
                                    />
                                    <Button type="button" size="sm" variant="ghost" class="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive" onclick={() => patchNumberArray(key, numberArray(key).filter((_, row) => row !== index))}>
                                        <Trash2 class="size-3" />
                                    </Button>
                                </div>
                            {/each}
                            <Button type="button" size="sm" variant="outline" class="h-6 gap-0.5 px-2 text-[10px]" onclick={() => patchNumberArray(key, [...numberArray(key), 0])}>
                                <Plus class="size-3" /> Add
                            </Button>
                        </section>
                    {/each}

                    <section class="space-y-1 border-t border-border/70 pt-2">
                        <div class="font-mono text-[10px] text-muted-foreground">cs1Instructions</div>
                        {#each component.cs1Instructions ?? [] as row, index}
                            <div class="flex items-center gap-1">
                                <Input
                                    class="h-6 min-w-0 flex-1 font-mono text-[11px]"
                                    value={row.join(", ")}
                                    onchange={(event) => {
                                        const scripts = (component.cs1Instructions ?? []).map((script) => [...script]);
                                        scripts[index] = parseCommaSeparatedInts(event.currentTarget.value);
                                        patch({ cs1Instructions: scripts.length > 0 ? scripts : null });
                                    }}
                                />
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    class="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                                    onclick={() => {
                                        const scripts = (component.cs1Instructions ?? []).filter((_, rowIndex) => rowIndex !== index);
                                        patch({ cs1Instructions: scripts.length > 0 ? scripts : null });
                                    }}
                                >
                                    <Trash2 class="size-3" />
                                </Button>
                            </div>
                        {/each}
                        <Button type="button" size="sm" variant="outline" class="h-6 gap-0.5 px-2 text-[10px]" onclick={() => patch({ cs1Instructions: [...(component.cs1Instructions ?? []), []] })}>
                            <Plus class="size-3" /> Add script
                        </Button>
                    </section>
                {:else}
                    <div class="flex items-center gap-2">
                        <span class="shrink-0 text-[10px] text-muted-foreground">Hook</span>
                        <select
                            class="h-6 min-w-0 flex-1 rounded border border-input bg-background px-1.5 font-mono text-[11px]"
                            value={String(selectedHookKey)}
                            onchange={(event) => (selectedHookKey = event.currentTarget.value as keyof ComponentType)}
                        >
                            {#each SCRIPT_HOOK_KEYS as key (String(key))}
                                <option value={String(key)}>{String(key)}</option>
                            {/each}
                        </select>
                    </div>

                    <section class="space-y-1 border-t border-border/70 pt-2">
                        <div class="font-mono text-[10px] text-muted-foreground">{String(selectedHookKey)}</div>
                        {#if HOOK_INT_LIST_KEYS.has(String(selectedHookKey))}
                            {#each numberArray(selectedHookKey) as value, index}
                                <div class="flex items-center gap-1">
                                    <Input
                                        type="number"
                                        class="h-6 min-w-0 flex-1 font-mono text-[11px]"
                                        value={String(value)}
                                        onchange={(event) => {
                                            const rows = numberArray(selectedHookKey);
                                            rows[index] = parseIntSafe(event.currentTarget.value, value);
                                            patchNumberArray(selectedHookKey, rows);
                                        }}
                                    />
                                    <Button type="button" size="sm" variant="ghost" class="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive" onclick={() => patchNumberArray(selectedHookKey, numberArray(selectedHookKey).filter((_, row) => row !== index))}>
                                        <Trash2 class="size-3" />
                                    </Button>
                                </div>
                            {/each}
                            <Button type="button" size="sm" variant="outline" class="h-6 gap-0.5 px-2 text-[10px]" onclick={() => patchNumberArray(selectedHookKey, [...numberArray(selectedHookKey), 0])}>
                                <Plus class="size-3" /> Add
                            </Button>
                        {:else}
                            {#each hookRows as line, index}
                                <div class="flex items-start gap-1">
                                    <textarea
                                        class="min-h-[2.25rem] flex-1 resize-y rounded border border-input bg-background px-1.5 py-1 font-mono text-[11px] leading-snug"
                                        spellcheck="false"
                                        value={line}
                                        oninput={(event) => {
                                            const rows = [...hookRows];
                                            rows[index] = event.currentTarget.value;
                                            patchHookRows(rows);
                                        }}
                                    ></textarea>
                                    <Button type="button" size="sm" variant="ghost" class="mt-0.5 h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive" onclick={() => patchHookRows(hookRows.filter((_, row) => row !== index))}>
                                        <Trash2 class="size-3" />
                                    </Button>
                                </div>
                            {/each}
                            <Button type="button" size="sm" variant="outline" class="h-6 gap-0.5 px-2 text-[10px]" onclick={() => patchHookRows([...hookRows, "null"])}>
                                <Plus class="size-3" /> Add
                            </Button>
                        {/if}
                    </section>
                {/if}
            </div>
        {/if}
    </div>
{/if}
