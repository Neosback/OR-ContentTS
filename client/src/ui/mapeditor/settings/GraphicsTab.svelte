<script lang="ts">
    import { Label } from "../../components/ui/label";
    import { useEditorState } from "../editor-state.svelte";

    const editor = useEditorState();
    const host = editor.host;

    // These are plain fields on the host, so keep local copies the sliders can bind to.
    let renderDistance = $state(host.renderDistance);
    let unloadDistance = $state(host.unloadDistance);
    let lodDistance = $state(host.lodDistance);
    let fpsLimit = $state(host.renderer.fpsLimit);

    const sliders = [
        { label: "Render Distance", min: 16, max: 2000, step: 16, get: () => renderDistance, set: (v: number) => ((renderDistance = v), (host.renderDistance = v)) },
        { label: "Unload Distance", min: 1, max: 30, step: 1, get: () => unloadDistance, set: (v: number) => ((unloadDistance = v), (host.unloadDistance = v)) },
        { label: "LOD Distance", min: 0, max: 30, step: 1, get: () => lodDistance, set: (v: number) => ((lodDistance = v), (host.lodDistance = v)) },
        { label: "Max FPS", min: 15, max: 240, step: 1, get: () => fpsLimit, set: (v: number) => ((fpsLimit = v), (host.renderer.fpsLimit = v)) },
    ];
</script>

<div class="grid gap-4 rounded-md border p-3">
    {#each sliders as slider (slider.label)}
        <div class="grid gap-1">
            <Label class="text-xs">{slider.label} ({slider.get()})</Label>
            <input
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={slider.get()}
                class="h-2 w-full accent-primary"
                oninput={(event) => slider.set(Number(event.currentTarget.value))}
            />
        </div>
    {/each}
</div>
