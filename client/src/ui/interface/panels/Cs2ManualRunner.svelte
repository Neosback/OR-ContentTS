<script lang="ts">
    import Check from "@lucide/svelte/icons/check";
    import Copy from "@lucide/svelte/icons/copy";
    import Minus from "@lucide/svelte/icons/minus";
    import Plus from "@lucide/svelte/icons/plus";
    import Trash2 from "@lucide/svelte/icons/trash-2";
    import { tick } from "svelte";

    import { makeCs2LogLine, type Cs2LogLevel } from "../../../lib/interface-renderer/cs2/cs2-console-sink";
    import { getCs2RuntimeContext } from "../../../lib/interface-renderer/cs2/runtime-context";
    import { runScript } from "../../../lib/interface-renderer/cs2/run-script";
    import { ScriptEvent } from "../../../lib/interface-renderer/cs2/script-event";
    import type { ComponentType, InterfaceEntry } from "../../../lib/interface-renderer/component-types";
    import { Button } from "../../components/ui/button";
    import { Input } from "../../components/ui/input";
    import { Label } from "../../components/ui/label";
    import { cn } from "../../lib/utils";
    import type { InterfaceEditorState } from "../interface-editor-state.svelte";

    let { state: editor }: { state: InterfaceEditorState } = $props();
    let scriptIdText = $state("");
    let argRows = $state<string[]>([]);
    let running = $state(false);
    let copied = $state(false);
    let scrollHost = $state<HTMLDivElement>();

    const disabled = $derived(editor.selectedId == null || !editor.interfaceData || running);

    $effect(() => {
        editor.cs2LogLines.length;
        void tick().then(() => {
            if (scrollHost) scrollHost.scrollTop = scrollHost.scrollHeight;
        });
    });

    function firstWidgetForInterface(entry: InterfaceEntry | null, interfaceRootId: number): ComponentType | null {
        if (!entry?.components) return null;
        const iface = interfaceRootId & 0xffff;
        const components = Object.values(entry.components).sort((a, b) => a.id - b.id);
        for (const component of components) {
            if (typeof component.packedId === "number" && ((component.packedId >>> 16) & 0xffff) !== iface) continue;
            return component;
        }
        return components[0] ?? null;
    }

    function parseArgCell(raw: string): string | number | boolean {
        const value = raw.trim();
        if (value === "") return "";
        if (value === "true") return true;
        if (value === "false") return false;
        if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
        if (/^-?\d*\.\d+(?:[eE][+-]?\d+)?$/.test(value) || /^-?\d+[eE][+-]?\d+$/.test(value)) {
            const parsed = Number.parseFloat(value);
            return Number.isFinite(parsed) ? parsed : value;
        }
        return value;
    }

    function buildArgs(rows: string[]): unknown[] {
        const values = rows.map((row) => row.trimEnd());
        while (values.length > 0 && values[values.length - 1]!.trim() === "") values.pop();
        return values.map(parseArgCell);
    }

    function levelBadgeClass(level: Cs2LogLevel): string {
        switch (level) {
            case "error":
                return "bg-red-500/15 text-red-300 ring-red-500/30";
            case "warn":
                return "bg-amber-500/15 text-amber-200 ring-amber-500/25";
            case "success":
                return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/25";
            case "load":
                return "bg-sky-500/15 text-sky-200 ring-sky-500/25";
            default:
                return "bg-zinc-500/15 text-zinc-300 ring-zinc-500/25";
        }
    }

    function log(level: Cs2LogLevel, body: string): void {
        editor.appendCs2LogLine(makeCs2LogLine(level, body));
    }

    async function send(): Promise<void> {
        const interfaceRootId = editor.selectedId;
        const interfaceData = editor.interfaceData;
        if (interfaceRootId == null || !interfaceData) return;

        const scriptId = Number.parseInt(scriptIdText.trim(), 10);
        if (!Number.isFinite(scriptId) || scriptId < 0) {
            log("warn", "[send] Invalid script id (need non-negative integer).");
            return;
        }

        const extra = buildArgs(argRows);
        const { clientScriptIndex } = getCs2RuntimeContext();
        if (!clientScriptIndex) {
            log("warn", "[send] No client script index in runtime (DAT2 index 12).");
            return;
        }

        running = true;
        log("info", `[send] Running script ${scriptId} with ${extra.length} extra arg(s)…`);

        const event = new ScriptEvent();
        event.args = [scriptId, ...extra];
        event.widget = firstWidgetForInterface(interfaceData, interfaceRootId);

        try {
            await runScript(event, 5_000_000, 0);
            log("success", `[send] Finished script ${scriptId}.`);
            editor.cs2RedrawNonce += 1;
        } catch (error) {
            log("error", `[send] Script ${scriptId} threw: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            running = false;
        }
    }

    async function copyAll(): Promise<void> {
        const text = editor.cs2LogLines.map((line) => `[${line.at}] [${line.level}] ${line.body}`).join("\n");
        await navigator.clipboard.writeText(text);
        copied = true;
        window.setTimeout(() => (copied = false), 1500);
    }
</script>

<div class="space-y-3 border-t border-border px-2 pb-3 pt-3 text-[11px] leading-snug">
    <div class="font-semibold text-foreground">Manual CS2</div>

    <div class="space-y-1.5">
        <Label for="cs2-manual-script-id">Script id</Label>
        <Input
            id="cs2-manual-script-id"
            class="h-8 font-mono text-xs"
            placeholder="e.g. 902"
            value={scriptIdText}
            {disabled}
            oninput={(event) => (scriptIdText = event.currentTarget.value)}
        />
    </div>

    <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-2">
            <Label>Script args (one field per value, after script id)</Label>
            <Button
                type="button"
                variant="outline"
                size="sm"
                class="h-7 gap-1 px-2 text-[10px]"
                {disabled}
                onclick={() => (argRows = [...argRows, ""])}
                title="Add argument"
            >
                <Plus class="size-3.5" />
                Add
            </Button>
        </div>

        {#if argRows.length === 0}
            <p class="rounded-md border border-dashed border-border/80 bg-muted/20 px-2 py-2 text-[10px] text-muted-foreground">
                No extra arguments. Click <span class="font-mono">Add</span> to append values after the script id.
            </p>
        {:else}
            <ul class="space-y-1.5">
                {#each argRows as row, index}
                    <li class="flex items-center gap-1.5">
                        <span class="w-5 shrink-0 text-right font-mono text-[10px] text-muted-foreground">{index + 1}</span>
                        <Input
                            class="h-8 min-w-0 flex-1 font-mono text-xs"
                            placeholder={`Arg ${index + 1}`}
                            value={row}
                            {disabled}
                            oninput={(event) => {
                                const next = [...argRows];
                                next[index] = event.currentTarget.value;
                                argRows = next;
                            }}
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            class="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                            {disabled}
                            title="Remove this argument"
                            onclick={() => (argRows = argRows.filter((_, rowIndex) => rowIndex !== index))}
                        >
                            <Minus class="size-4" />
                        </Button>
                    </li>
                {/each}
            </ul>
        {/if}
    </div>

    <Button type="button" size="sm" class="h-8 w-full text-[11px]" {disabled} onclick={() => void send()}>
        {running ? "Running…" : "Send"}
    </Button>

    <div class="flex min-h-[220px] max-h-[min(50vh,320px)] flex-col overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 shadow-inner">
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/80 px-2 py-1.5">
            <span class="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">CS2 console</span>
            <div class="flex items-center gap-1">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="h-7 gap-1 px-2 text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    disabled={editor.cs2LogLines.length === 0}
                    onclick={() => void copyAll()}
                >
                    {#if copied}<Check class="size-3.5 text-emerald-400" />{:else}<Copy class="size-3.5" />{/if}
                    {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="h-7 gap-1 px-2 text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    disabled={editor.cs2LogLines.length === 0}
                    onclick={editor.clearCs2Log}
                >
                    <Trash2 class="size-3.5" />
                    Clear
                </Button>
            </div>
        </div>

        <div bind:this={scrollHost} class="min-h-0 flex-1 overflow-auto px-2 py-2 font-mono text-[10px] leading-relaxed text-zinc-200" role="log" aria-live="polite">
            {#if editor.cs2LogLines.length === 0}
                <span class="text-zinc-500">No messages yet. On-load diagnostics and script runs appear here.</span>
            {:else}
                {#each editor.cs2LogLines as line (line.id)}
                    <div class="flex gap-2 border-b border-zinc-800/60 py-1 last:border-b-0">
                        <span class="shrink-0 text-zinc-500">{line.at}</span>
                        <span class={cn("shrink-0 rounded px-1 py-0 text-[9px] font-medium uppercase ring-1 ring-inset", levelBadgeClass(line.level))}>
                            {line.level}
                        </span>
                        <span class="min-w-0 flex-1 whitespace-pre-wrap break-words text-zinc-100">{line.body}</span>
                    </div>
                {/each}
            {/if}
        </div>
    </div>
</div>
