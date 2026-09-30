<script lang="ts">
    import { sliderFromThickness, thicknessFromSlider } from "../../../mapeditor/map-editor-gizmo-settings";
    import { Label } from "../../components/ui/label";
    import { useEditorState } from "../editor-state.svelte";
    import RgbaColorRow from "./RgbaColorRow.svelte";

    const editor = useEditorState();
    const host = editor.host;
    const appearance = $derived(editor.read(() => host.getGizmoAppearance()));
    const thickness = $derived(sliderFromThickness(appearance.brushOutline.outlineThickness));
</script>

<div class="grid gap-3 rounded-md border p-3">
    <RgbaColorRow label="Map square grid" value={appearance.mapSquareGrid} onChange={(next) => host.setGizmoAppearance({ mapSquareGrid: next })} />
    <RgbaColorRow label="Chunk grid" value={appearance.chunkGrid} onChange={(next) => host.setGizmoAppearance({ chunkGrid: next })} />
    <RgbaColorRow label="Brush fill" value={appearance.brushOutline.fill} onChange={(next) => host.setGizmoAppearance({ brushOutline: { ...appearance.brushOutline, fill: next } })} />
    <RgbaColorRow label="Brush outline" value={appearance.brushOutline.outline} onChange={(next) => host.setGizmoAppearance({ brushOutline: { ...appearance.brushOutline, outline: next } })} />
    <div class="grid gap-1 rounded-md border p-2">
        <div class="flex items-center justify-between gap-2">
            <Label class="text-xs">Outline thickness</Label>
            <span class="text-xs tabular-nums text-muted-foreground">{thickness}</span>
        </div>
        <input
            type="range"
            min="1"
            max="100"
            value={thickness}
            class="h-2 w-full accent-primary"
            oninput={(event) =>
                host.setGizmoAppearance({ brushOutline: { ...appearance.brushOutline, outlineThickness: thicknessFromSlider(Number(event.currentTarget.value)) } })}
        />
    </div>
    <p class="text-xs font-medium text-muted-foreground">Object selector wireframe</p>
    <RgbaColorRow label="Hover" value={appearance.objectSelector.hover} onChange={(next) => host.setGizmoAppearance({ objectSelector: { ...appearance.objectSelector, hover: next } })} />
    <RgbaColorRow label="Selected" value={appearance.objectSelector.selected} onChange={(next) => host.setGizmoAppearance({ objectSelector: { ...appearance.objectSelector, selected: next } })} />
</div>
