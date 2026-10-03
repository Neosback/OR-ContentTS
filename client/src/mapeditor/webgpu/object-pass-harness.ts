import { loadTileRenderFlagsTextureData } from "../../rs/scene/Scene";
import type { MapEditor } from "../MapEditor";
import type { EditorMapSquare } from "../webgl/EditorMapSquare";
import type { WebGLMapEditorRenderer } from "../webgl/WebGLMapEditorRenderer";
import { mergeStaticObjectChunks } from "./object-mesh-merge";
import {
    WebGPUObjectPass,
    type ObjectIndexSource,
    type ObjectPassFrame,
    type ObjectPassTextures,
} from "./WebGPUObjectPass";
import type { PrioritySortValidation } from "./face-priority-validation";

/**
 * Dev-only A/B harness for the WebGPU object pass. It reads the data the WebGL2 editor already holds (object chunk
 * meshes, height maps, render flags, textures, camera) and draws the same objects on a canvas laid over the editor's.
 * Nothing here changes what the editor renders or stores; remove the overlay and the editor is as it was.
 *
 *   await __webgpuHarness()      // from the console; returns the controller (also at window.__webgpuObjectPass)
 *   harness.setMode("diff")      // overlay | only | diff | off
 *   harness.stats                // CPU, compute GPU and render GPU time when available
 *   harness.setIndexSource("priority") // draw compute-sorted indices; "original" is the default
 *   harness.setMode("diff")      // compare the selected WebGPU stream against WebGL2
 *   await harness.validatePriorities() // GPU priority sort vs CPU RuneLite reference for visible maps
 *   await harness.sampleTimings(120)    // median/p95 priority-compute and render GPU cost
 */
export type HarnessMode = "off" | "overlay" | "only" | "diff";

export interface PriorityValidationResult extends PrioritySortValidation {
    mapId: number;
}

export interface ObjectPassTimingSummary {
    samples: number;
    computeMedianMs: number;
    computeP95Ms: number;
    renderMedianMs: number;
    renderP95Ms: number;
    totalMedianMs: number;
    totalP95Ms: number;
}

export interface ObjectPassHarness {
    readonly pass: WebGPUObjectPass;
    readonly overlay: HTMLCanvasElement;
    readonly stats: WebGPUObjectPass["stats"];
    setMode(mode: HarnessMode): void;
    setIndexSource(source: ObjectIndexSource): void;
    getIndexSource(): ObjectIndexSource;
    /** Draws one frame now (the harness also draws every animation frame while the page is visible). */
    renderOnce(): void;
    /**
     * Runs one real WebGPU frame, reads back the compute-sorted indices and GPU-computed face depths, then compares
     * every visible map against the independent CPU RuneLite priority-order reference.
     */
    validatePriorities(): Promise<PriorityValidationResult[]>;
    /** Samples timestamp-query results over real animation frames. Requires an adapter with timestamp-query support. */
    sampleTimings(sampleCount?: number): Promise<ObjectPassTimingSummary>;
    stop(): void;
}

const TEXTURE_SIZE = 128;

function buildTextures(editor: MapEditor): ObjectPassTextures {
    const ids = (editor.renderer as WebGLMapEditorRenderer).textureIds;
    const layers = ids.length + 1;
    const pixelCount = TEXTURE_SIZE * TEXTURE_SIZE;
    const pixels = new Int32Array(layers * pixelCount);
    pixels.fill(0xffffffff, 0, pixelCount); // layer 0 is the white "no texture" layer
    const materials = new Int8Array(layers * 4);
    for (let i = 0; i < ids.length; i++) {
        try {
            pixels.set(editor.textureLoader.getPixelsArgb(ids[i], TEXTURE_SIZE, true, 1.0), (i + 1) * pixelCount);
            const material = editor.textureLoader.getMaterial(ids[i]);
            materials[(i + 1) * 4] = material.animU;
            materials[(i + 1) * 4 + 1] = material.animV;
            materials[(i + 1) * 4 + 2] = material.alphaCutOff * 255;
        } catch (error) {
            console.error("[webgpu harness] texture", ids[i], error);
        }
    }
    return { size: TEXTURE_SIZE, layers, pixelsBgra: new Uint8Array(pixels.buffer), materials };
}

export async function startObjectPassHarness(editor: MapEditor): Promise<ObjectPassHarness> {
    const renderer = editor.renderer as WebGLMapEditorRenderer;
    const glCanvas = renderer.canvas;
    const parent = glCanvas.parentElement;
    if (!parent) {
        throw new Error("The editor canvas is not in the document yet");
    }

    const overlay = document.createElement("canvas");
    overlay.dataset.webgpuHarness = "true";
    Object.assign(overlay.style, {
        position: "absolute",
        pointerEvents: "none",
        zIndex: "5",
    } satisfies Partial<CSSStyleDeclaration>);
    parent.appendChild(overlay);

    const pass = await WebGPUObjectPass.create(overlay, "premultiplied");
    pass.setTextures(buildTextures(editor));

    // Which chunk data each map was last uploaded from, so edits (new chunk objects) re-upload.
    const uploaded = new Map<number, unknown[]>();
    let mode: HarnessMode = "overlay";
    let raf = 0;
    let stopped = false;

    const syncMaps = (): Set<number> => {
        const manager = renderer.mapManager;
        const visible = new Set<number>();
        for (let i = 0; i < manager.visibleMapCount; i++) {
            const map = manager.visibleMaps[i] as EditorMapSquare;
            const id = (map.mapX << 8) + map.mapY;
            visible.add(id);
            const chunks = map.objectMesh.chunkData;
            const previous = uploaded.get(id);
            if (previous && previous.length === chunks.length && previous.every((chunk, index) => chunk === chunks[index])) {
                continue;
            }
            uploaded.set(id, [...chunks]);
            pass.setMap(id, {
                mapX: map.mapX,
                mapY: map.mapY,
                borderSize: map.borderSize,
                mesh: mergeStaticObjectChunks(chunks),
                heightMapData: map.heightMapTextureData,
                tileRenderFlags: loadTileRenderFlagsTextureData(map.scene),
                levels: map.scene.levels,
            });
        }
        return visible;
    };

    const layout = (): void => {
        overlay.style.left = `${glCanvas.offsetLeft}px`;
        overlay.style.top = `${glCanvas.offsetTop}px`;
        overlay.style.width = `${glCanvas.clientWidth}px`;
        overlay.style.height = `${glCanvas.clientHeight}px`;
        if (overlay.width !== glCanvas.width) overlay.width = glCanvas.width;
        if (overlay.height !== glCanvas.height) overlay.height = glCanvas.height;
    };

    const frameFor = (timeSec: number): ObjectPassFrame => {
        const camera = editor.camera;
        const renderDistance = editor.renderDistance;
        return {
            viewProj: camera.viewProjMatrix,
            view: camera.viewMatrix,
            proj: camera.projectionMatrix,
            sky: [0, 0, 0, 1],
            cameraX: camera.getPosX(),
            cameraZ: camera.getPosZ(),
            renderDistance: renderDistance * 64,
            fogDepth: renderDistance * 64,
            time: timeSec,
            brightness: 1,
            colorBanding: 64,
            isNewTextureAnim: renderer.isNewTextureAnim,
            viewPlaneMax: editor.viewPlaneMax,
            hideBelowViewPlane: editor.hideBelowViewPlane,
            showRoofs: editor.showRoofs,
            bridgeLinkBelow: editor.bridgeLinkBelow,
            hideRoofs: !editor.showRoofs,
        };
    };

    const applyMode = (): void => {
        overlay.style.display = mode === "off" ? "none" : "block";
        overlay.style.mixBlendMode = mode === "diff" ? "difference" : "normal";
        glCanvas.style.visibility = mode === "only" ? "hidden" : "visible";
    };

    const renderOnce = (): void => {
        if (mode === "off") return;
        layout();
        const visible = syncMaps();
        pass.render(frameFor(performance.now() * 0.001), visible);
    };

    const validatePriorities = async (): Promise<PriorityValidationResult[]> => {
        layout();
        const visible = syncMaps();

        // Queue a fresh frame immediately before readback so the comparison uses the current camera, map edits and
        // contouring data. WebGPU queue ordering guarantees the following readback copies happen after this compute.
        pass.render(frameFor(performance.now() * 0.001), visible);

        const results: PriorityValidationResult[] = [];
        for (const mapId of visible) {
            const validation = await pass.validatePrioritySort(mapId);
            if (validation) {
                results.push({ mapId, ...validation });
            }
        }

        const mismatches = results.filter((result) => !result.matches);
        if (mismatches.length === 0) {
            console.info(
                `[webgpu harness] priority sort: GPU == RuneLite CPU reference for ${results.length} visible map(s)`,
            );
        } else {
            console.error(
                `[webgpu harness] priority sort mismatch in ${mismatches.length}/${results.length} visible map(s)`,
                mismatches,
            );
        }
        return results;
    };

    const percentile = (values: number[], fraction: number): number => {
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
        return sorted[Math.max(index, 0)];
    };

    const sampleTimings = async (sampleCount = 120): Promise<ObjectPassTimingSummary> => {
        if (!Number.isInteger(sampleCount) || sampleCount < 1) {
            throw new RangeError("sampleCount must be a positive integer");
        }

        const compute: number[] = [];
        const render: number[] = [];
        const total: number[] = [];
        let lastFrame = pass.stats.frames;

        while (compute.length < sampleCount) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            if (pass.stats.frames === lastFrame) continue;
            lastFrame = pass.stats.frames;

            const computeMs = pass.stats.computeGpuMs;
            const renderMs = pass.stats.renderGpuMs;
            const totalMs = pass.stats.gpuMs;
            if (computeMs === undefined || renderMs === undefined || totalMs === undefined) continue;
            compute.push(computeMs);
            render.push(renderMs);
            total.push(totalMs);
        }

        const summary: ObjectPassTimingSummary = {
            samples: compute.length,
            computeMedianMs: percentile(compute, 0.5),
            computeP95Ms: percentile(compute, 0.95),
            renderMedianMs: percentile(render, 0.5),
            renderP95Ms: percentile(render, 0.95),
            totalMedianMs: percentile(total, 0.5),
            totalP95Ms: percentile(total, 0.95),
        };
        console.table(summary);
        return summary;
    };

    const loop = (): void => {
        if (stopped) return;
        renderOnce();
        raf = requestAnimationFrame(loop);
    };
    applyMode();
    raf = requestAnimationFrame(loop);

    const harness: ObjectPassHarness = {
        pass,
        overlay,
        stats: pass.stats,
        setMode(next) {
            mode = next;
            applyMode();
        },
        setIndexSource(source) {
            pass.setIndexSource(source);
            console.info(`[webgpu harness] object indices: ${source}`);
        },
        getIndexSource() {
            return pass.getIndexSource();
        },
        renderOnce,
        validatePriorities,
        sampleTimings,
        stop() {
            stopped = true;
            cancelAnimationFrame(raf);
            glCanvas.style.visibility = "visible";
            overlay.remove();
            pass.destroy();
        },
    };
    (window as unknown as { __webgpuObjectPass?: ObjectPassHarness }).__webgpuObjectPass = harness;
    return harness;
}
