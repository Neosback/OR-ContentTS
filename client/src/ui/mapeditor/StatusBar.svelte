<script lang="ts">
    import { formatCount, formatMegabytes } from "../../mapeditor/status-format";
    import { useEditorState } from "./editor-state.svelte";

    const editor = useEditorState();
    const hud = editor.hud;
</script>

<footer class="flex h-6 shrink-0 items-center gap-3 overflow-hidden border-t border-border bg-card px-3 font-mono text-[11px] text-muted-foreground" aria-label="Status bar">
    <div class="flex min-w-0 shrink items-center gap-3 overflow-hidden whitespace-nowrap" aria-live="off">
        {#each hud.tileSegments as segment (segment.label)}
            <span title={segment.title}>{segment.label} <span class="text-foreground">{segment.value}</span></span>
        {:else}
            <span>Move the cursor over the map</span>
        {/each}
    </div>
    <div class="min-w-0 flex-1 truncate text-center text-foreground/80">{hud.debugText}</div>
    <div class="flex shrink-0 items-center gap-3 whitespace-nowrap">
        <span title="Frames per second">{hud.fps} fps</span>
        <span title="Time between frames">{hud.frameMs} ms</span>
        <span title="Draw calls last frame">{formatCount(hud.drawCalls)} draws</span>
        <span title="Triangles drawn last frame">{formatCount(hud.triangles)} tris</span>
        <span title="Estimated GPU memory (buffers, textures, renderbuffers)">{formatMegabytes(hud.gpuBytes)}</span>
    </div>
</footer>
