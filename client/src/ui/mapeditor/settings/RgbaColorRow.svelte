<script lang="ts">
    import type { Rgba } from "../../../mapeditor/map-editor-gizmo-settings";
    import { Input } from "../../components/ui/input";
    import { Label } from "../../components/ui/label";

    let { label, value, onChange }: { label: string; value: Rgba; onChange: (next: Rgba) => void } = $props();

    const hex = $derived.by(() => {
        const toHex = (n: number): string => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0");
        return `#${toHex(value[0])}${toHex(value[1])}${toHex(value[2])}`;
    });
    const alpha = $derived(Math.round(value[3] * 100));

    function hexToRgb(text: string): readonly [number, number, number] {
        const raw = text.replace("#", "");
        if (raw.length !== 6) return [1, 1, 1];
        return [Number.parseInt(raw.slice(0, 2), 16) / 255, Number.parseInt(raw.slice(2, 4), 16) / 255, Number.parseInt(raw.slice(4, 6), 16) / 255];
    }
</script>

<div class="grid gap-1 rounded-md border p-2">
    <Label class="text-xs">{label}</Label>
    <div class="flex items-center gap-2">
        <Input
            type="color"
            value={hex}
            class="h-8 w-12 p-1"
            oninput={(event) => {
                const [r, g, b] = hexToRgb(event.currentTarget.value);
                onChange([r, g, b, value[3]]);
            }}
        />
        <span class="text-xs text-muted-foreground">Opacity</span>
        <input
            type="range"
            min="0"
            max="100"
            value={alpha}
            class="h-2 flex-1 accent-primary"
            oninput={(event) => onChange([value[0], value[1], value[2], Number(event.currentTarget.value) / 100])}
        />
        <span class="w-9 text-right text-xs tabular-nums text-muted-foreground">{alpha}%</span>
    </div>
</div>
