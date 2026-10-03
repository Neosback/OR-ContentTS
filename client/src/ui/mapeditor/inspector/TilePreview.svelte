<script lang="ts">
    import { getTileShapeTriangles } from "../../../rs/scene/SceneTileModel";
    import { HSL_RGB_MAP } from "../../../rs/util/ColorUtil";
    import type { IEditorPluginHost } from "../../../mapeditor/plugins/editor-plugin-host";
    import { getViewControl } from "../../../mapeditor/view-controls";
    import { TILE_ROTATION_NAMES, TILE_SHAPE_NAMES } from "../../../mapeditor/tile-shape-paint";
    import { cn } from "../../lib/utils";
    import { useEditorState } from "../editor-state.svelte";
    import { Rasterizer, type RasterTexture, type RasterVertex } from "./raster";
    import {
        loadTilePreviewSettings,
        projectTilePoint,
        saveTilePreviewSettings,
        type TilePreviewMode,
        type TilePreviewSettings,
    } from "./tile-preview-settings";

    /**
     * Two views of the selected tile (see tile-preview-settings.ts): "Raw" is the tile alone, flat, as its stored shape and
     * rotation define it; "In game" is the tile among its neighbours the way the map draws it, optionally tilted to show
     * the ground's relief. Always renders the same fixed-size frame, so the Inspector layout never jumps.
     */
    let { host, target }: { host: IEditorPluginHost; target?: { worldX: number; worldY: number; level: number } } = $props();

    const editor = useEditorState();

    const SIZE = 192;
    const DPR = Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    const PIXELS = SIZE * DPR;
    const raster = new Rasterizer(PIXELS, PIXELS);

    const OVERLAY_TINT: [number, number, number] = [70, 200, 100];
    const UNDERLAY_TINT: [number, number, number] = [210, 75, 75];

    let canvas = $state<HTMLCanvasElement>();
    let settings = $state<TilePreviewSettings>(loadTilePreviewSettings());
    $effect(() => saveTilePreviewSettings($state.snapshot(settings)));

    type Facts = { underlayFaces: number; overlayFaces: number; shape?: number; rotation?: number; heights?: [number, number, number, number] };
    let facts = $state<Facts | undefined>();

    const textures = new Map<number, RasterTexture | undefined>();
    function texture(id: number): RasterTexture | undefined {
        if (textures.has(id)) return textures.get(id);
        let result: RasterTexture | undefined;
        try {
            result = { size: 64, pixels: Int32Array.from(host.textureLoader.getPixelsArgb(id, 64, true, 1.0)) };
        } catch {
            result = undefined;
        }
        textures.set(id, result);
        return result;
    }

    const rgb = (value: number): [number, number, number] => [(value >> 16) & 255, (value >> 8) & 255, value & 255];

    function vertex(x: number, y: number, z: number, [r, g, b]: [number, number, number], u?: number, v?: number): RasterVertex {
        return { x, y, z, r, g, b, u, v };
    }

    function floorColors(info: { u?: number; o?: number } | undefined): { underlay: [number, number, number]; overlay: [number, number, number] | undefined } {
        const underlay = (info?.u ?? 0) > 0 ? host.underlayTypeLoader.load((info?.u ?? 0) - 1).getRgb() : 0x1c1c1c;
        const overlay = (info?.o ?? 0) > 0 ? host.overlayTypeLoader.load((info?.o ?? 0) - 1).getRgb() : undefined;
        return { underlay: rgb(underlay), overlay: overlay === undefined ? undefined : rgb(overlay) };
    }

    type Edge = [number, number, number, number];

    /** The tile alone, flat: its shape/rotation triangles in the floor's own colours. */
    function drawRaw(worldX: number, worldY: number, level: number): Edge[] {
        const info = host.getTileInfo(level, worldX, worldY);
        const { underlay, overlay } = floorColors(info);
        const hasOverlay = overlay !== undefined;
        const shape = hasOverlay ? (info?.s ?? 0) : undefined;
        const rotation = info?.r ?? 0;
        const triangles = getTileShapeTriangles(shape, rotation);
        const edges: Edge[] = [];
        const draw = (list: readonly (readonly number[])[], color: [number, number, number]): void => {
            for (const [x0, y0, x1, y1, x2, y2] of list) {
                const a = [x0! * PIXELS, (1 - y0!) * PIXELS] as const;
                const b = [x1! * PIXELS, (1 - y1!) * PIXELS] as const;
                const c = [x2! * PIXELS, (1 - y2!) * PIXELS] as const;
                raster.draw({ vertices: [vertex(a[0], a[1], 0, color), vertex(b[0], b[1], 0, color), vertex(c[0], c[1], 0, color)] });
                edges.push([a[0], a[1], b[0], b[1]], [b[0], b[1], c[0], c[1]], [c[0], c[1], a[0], a[1]]);
            }
        };
        draw(triangles.underlay, settings.tintFaces ? UNDERLAY_TINT : underlay);
        draw(triangles.overlay, settings.tintFaces ? OVERLAY_TINT : (overlay ?? underlay));
        facts = { underlayFaces: triangles.underlay.length, overlayFaces: triangles.overlay.length, shape, rotation: hasOverlay ? rotation : undefined };
        return edges;
    }

    /** The chosen tile as the map draws it (the colours and heights its mesh has among its neighbours), shown large. */
    function drawInGame(worldX: number, worldY: number, level: number): Edge[] {
        const tile = host.getTileModel(level, worldX, worldY);
        const info = host.getTileInfo(level, worldX, worldY);
        facts = undefined;
        if (!tile) return [];

        const scale = PIXELS * 0.94;
        const centre = projectTilePoint(0.5, 0.5, 0, settings.tilt);
        // Heights are measured from the tile's own corners, so tilting keeps it in the middle whatever its altitude.
        const around = cornerHeights(level, worldX, worldY);
        const base = around ? (around[0] + around[1] + around[2] + around[3]) / 4 / 128 : 0;
        const to = (lx: number, lz: number, height: number): { sx: number; sy: number; depth: number } => {
            const p = projectTilePoint(lx, lz, height - base, settings.tilt);
            return { sx: PIXELS / 2 + (p.x - 0.5) * scale, sy: PIXELS / 2 - (p.up - centre.up) * scale, depth: p.depth };
        };

        const originX = tile.sceneX * 128;
        const originZ = tile.sceneY * 128;
        const flat = settings.blend ? undefined : floorColors(info);
        const edges: Edge[] = [];
        let underlayFaces = 0;
        let overlayFaces = 0;
        for (const face of tile.model.faces) {
            if (face.overlay) overlayFaces++;
            else underlayFaces++;
            const textureId = face.vertices[0].textureId;
            const tex = settings.blend && textureId >= 0 ? texture(textureId) : undefined;
            const projected = face.vertices.map((v) => to((v.x - originX) / 128, (v.z - originZ) / 128, -v.y / 128));
            const verts = face.vertices.map((v, i): RasterVertex => {
                const p = projected[i]!;
                if (settings.tintFaces) return vertex(p.sx, p.sy, p.depth, face.overlay ? OVERLAY_TINT : UNDERLAY_TINT);
                if (!settings.blend) return vertex(p.sx, p.sy, p.depth, (face.overlay ? flat!.overlay : undefined) ?? flat!.underlay);
                if (tex) {
                    const shade = 255 * (0.35 + 0.65 * ((v.hsl & 127) / 127));
                    return vertex(p.sx, p.sy, p.depth, [shade, shade, shade], v.u, v.v);
                }
                return vertex(p.sx, p.sy, p.depth, rgb(HSL_RGB_MAP[v.hsl & 0xffff]));
            });
            raster.draw({ vertices: verts as [RasterVertex, RasterVertex, RasterVertex], texture: tex });
            const [a, b, c] = projected as [(typeof projected)[number], (typeof projected)[number], (typeof projected)[number]];
            edges.push([a.sx, a.sy, b.sx, b.sy], [b.sx, b.sy, c.sx, c.sy], [c.sx, c.sy, a.sx, a.sy]);
        }

        const hasOverlay = (info?.o ?? 0) > 0;
        facts = { underlayFaces, overlayFaces, shape: hasOverlay ? (info?.s ?? 0) : undefined, rotation: hasOverlay ? (info?.r ?? 0) : undefined, heights: around };
        return edges;
    }

    /** Corner heights (sw, se, ne, nw), world units up positive, from the stored tile heights. */
    function cornerHeights(level: number, worldX: number, worldY: number): [number, number, number, number] | undefined {
        const read = (x: number, y: number): number | undefined => host.getTileInfo(level, x, y)?.h;
        const sw = read(worldX, worldY);
        const se = read(worldX + 1, worldY);
        const ne = read(worldX + 1, worldY + 1);
        const nw = read(worldX, worldY + 1);
        return sw === undefined || se === undefined || ne === undefined || nw === undefined ? undefined : [-sw, -se, -ne, -nw];
    }

    function draw(): void {
        const ctx = canvas?.getContext("2d");
        if (!ctx) return;
        raster.clear();
        ctx.clearRect(0, 0, PIXELS, PIXELS);
        if (!target) {
            facts = undefined;
            return;
        }
        const { worldX, worldY, level } = target;
        const edges = settings.mode === "raw" ? drawRaw(worldX, worldY, level) : drawInGame(worldX, worldY, level);
        ctx.putImageData(new ImageData(raster.color, PIXELS, PIXELS), 0, 0);

        const stroke = (list: Edge[], style: string, width: number): void => {
            ctx.strokeStyle = style;
            ctx.lineWidth = width * DPR;
            ctx.beginPath();
            for (const [x0, y0, x1, y1] of list) {
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
            }
            ctx.stroke();
        };
        if (settings.wireframe) stroke(edges, "rgba(255,255,255,0.85)", 1);
    }

    $effect(() => {
        // Re-draw when the tile, any switch, or the map (edits) change.
        void target?.worldX;
        void target?.worldY;
        void target?.level;
        void settings.mode;
        void settings.wireframe;
        void settings.tintFaces;
        void host.terrainSmoothingEnabled;
        void settings.blend;
        void settings.tilt;
        void editor.snapshot.current;
        draw();
    });

    const modes: readonly { id: TilePreviewMode; label: string; hint: string }[] = [
        { id: "raw", label: "Raw", hint: "The tile alone and flat: its stored shape and rotation in the floor's own colours" },
        { id: "game", label: "In game", hint: "The tile among its neighbours the way the map draws it" },
    ];
    const check = "flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground";
    const smoothing = $derived(editor.read(() => host.terrainSmoothingEnabled));
    const heightText = $derived(facts?.heights ? facts.heights.map((h) => Math.round(h)).join(" / ") : undefined);
</script>

<div class="flex flex-col items-center gap-1.5">
    <div class="inline-flex overflow-hidden rounded-md border border-border text-[11px]" role="tablist" aria-label="Tile preview mode">
        {#each modes as mode (mode.id)}
            <button
                type="button"
                role="tab"
                aria-selected={settings.mode === mode.id}
                title={mode.hint}
                class={cn("px-3 py-1", settings.mode === mode.id ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted")}
                onclick={() => (settings.mode = mode.id)}
            >
                {mode.label}
            </button>
        {/each}
    </div>

    <div class="relative" style="width: {SIZE}px; height: {SIZE}px">
        <canvas
            bind:this={canvas}
            width={PIXELS}
            height={PIXELS}
            style="width: {SIZE}px; height: {SIZE}px"
            class="rounded-md border bg-muted/30"
            aria-label="Preview of the tile"
        ></canvas>
        {#if !target}
            <p class="pointer-events-none absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] text-muted-foreground">Hover or click a tile</p>
        {/if}
    </div>

    {#if facts}
        <p class="text-center font-mono text-[10px] text-muted-foreground tabular-nums">
            {facts.shape !== undefined ? `shape ${facts.shape} ${TILE_SHAPE_NAMES[facts.shape] ?? ""} · ${TILE_ROTATION_NAMES[(facts.rotation ?? 0) & 3] ?? ""}` : "plain tile"}
            · {facts.underlayFaces} underlay + {facts.overlayFaces} overlay faces
            {#if settings.mode === "game" && heightText}<br />corner heights SW/SE/NE/NW {heightText}{/if}
        </p>
    {/if}

    <div class="flex flex-wrap justify-center gap-x-3 gap-y-1">
        <label class={check}><input type="checkbox" bind:checked={settings.wireframe} class="size-3.5 accent-blue-500" /> Wireframe</label>
        <label class={check} title="Overlay faces green, underlay faces red"><input type="checkbox" bind:checked={settings.tintFaces} class="size-3.5 accent-blue-500" /> Tint faces</label>
        {#if settings.mode === "game"}
            <label class={check} title="On: the colours the map shows (underlay blended into neighbours). Off: this tile's own flat floor colours"
                ><input type="checkbox" bind:checked={settings.blend} class="size-3.5 accent-blue-500" /> Blend colours</label
            >
            <label class={check} title="The editor-wide Terrain smoothing switch: on, underlay colours blend across tile corners like the game; off, each tile is one flat colour. It changes every tile, this one included"
                ><input type="checkbox" checked={smoothing} onchange={(event) => getViewControl("smoothing")?.set(host, event.currentTarget.checked)} class="size-3.5 accent-blue-500" /> Terrain smoothing</label
            >
        {/if}
    </div>

    {#if settings.mode === "game"}
        <div class="flex w-full max-w-[14rem] flex-col gap-1.5 text-[11px] text-muted-foreground">
            <label class="flex items-center justify-between gap-2" title="Camera angle above the ground; 90° looks straight down, lower shows the relief">
                <span>View angle {settings.tilt}°</span>
                <input type="range" min="20" max="90" step="1" bind:value={settings.tilt} class="w-28 accent-blue-500" />
            </label>
        </div>
    {/if}
</div>
