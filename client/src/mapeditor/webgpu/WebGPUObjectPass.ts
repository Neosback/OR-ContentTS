import { getFaceDepthSource, type FaceDepthSource } from "../../rs/model/face-depth-source";
import { buildPrioritySortGpuData, GPU_PRIORITY_GROUP_WORDS } from "./face-priority-gpu";
import prioritySortShaderSource from "./face-priority-sort.wgsl?raw";
import type { StaticObjectMesh } from "./object-mesh-merge";
import shaderSource from "./object-pass.wgsl?raw";
import { generateLayerMips, mipLevelCount } from "./texture-mips";

/**
 * Phase 0 of the WebGPU renderer (docs/WGPU_RENDERER_PLAN.md): the editor's object slot-mesh pass, drawing exactly the
 * data the WebGL2 editor draws. No editor state, no picking, no animation: it takes typed arrays and draws them.
 */

export interface ObjectPassTextures {
    /** Edge length of every layer (128). */
    size: number;
    layers: number;
    /** `layers * size * size * 4` bytes, one ARGB int per texel (so BGRA in memory). */
    pixelsBgra: Uint8Array;
    /** RGBA8I per layer: animU, animV, alpha cut-off * 255. */
    materials: Int8Array;
}

export interface ObjectPassMap {
    mapX: number;
    mapY: number;
    /** Scene border in tiles around the 64x64 map square (6). */
    borderSize: number;
    mesh: StaticObjectMesh;
    /** `levels * sizeX * sizeY` heights as `Scene.loadHeightMapTextureData` writes them. */
    heightMapData: Float32Array;
    /** `levels * sizeX * sizeY` render flag bytes. */
    tileRenderFlags: Uint8Array;
    /** Scene levels stored in the two arrays above (4). */
    levels: number;
}

export interface ObjectPassFrame {
    viewProj: ArrayLike<number>;
    view: ArrayLike<number>;
    proj: ArrayLike<number>;
    sky: [number, number, number, number];
    cameraX: number;
    cameraZ: number;
    renderDistance: number;
    fogDepth: number;
    /** Seconds. */
    time: number;
    brightness: number;
    colorBanding: number;
    isNewTextureAnim: boolean;
    viewPlaneMax: number;
    hideBelowViewPlane: boolean;
    showRoofs: boolean;
    bridgeLinkBelow: boolean;
    hideRoofs: boolean;
}

export interface ObjectPassStats {
    frames: number;
    /** CPU time spent recording and submitting the last frame, ms. */
    cpuMs: number;
    /** GPU time of the last resolved frame, ms; undefined when the adapter has no timestamp queries. */
    gpuMs?: number;
    drawCalls: number;
    indices: number;
}

interface GpuMap {
    data: ObjectPassMap;
    vertexBuffer: GPUBuffer;
    indexBuffer: GPUBuffer;
    sortedIndexBuffer: GPUBuffer;
    priorityBuffer: GPUBuffer;
    priorityGroupBuffer: GPUBuffer;
    priorityScratchBuffer: GPUBuffer;
    priorityGroupCount: number;
    priorityBindGroup: GPUBindGroup;
    slotBuffer: GPUBuffer;
    heightTexture: GPUTexture;
    flagsTexture: GPUTexture;
    uniformBuffer: GPUBuffer;
    uniformData: Float32Array<ArrayBuffer>;
    bindGroup: GPUBindGroup;
}

const SCENE_UNIFORM_FLOATS = 60;
const MAP_UNIFORM_FLOATS = 12;
const DEPTH_FORMAT: GPUTextureFormat = "depth32float";

const ALPHA_BLEND: GPUBlendState = {
    color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
    alpha: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
};

export class WebGPUObjectPass {
    readonly stats: ObjectPassStats = { frames: 0, cpuMs: 0, drawCalls: 0, indices: 0 };

    private readonly maps = new Map<number, GpuMap>();
    private readonly sceneBuffer: GPUBuffer;
    private readonly sceneData = new Float32Array(new ArrayBuffer(SCENE_UNIFORM_FLOATS * 4));
    private readonly sampler: GPUSampler;
    private sceneBindGroup?: GPUBindGroup;
    private textureArray?: GPUTexture;
    private materialsTexture?: GPUTexture;
    private depthTexture?: GPUTexture;
    private depthSize = "";

    private readonly timestamps?: {
        querySet: GPUQuerySet;
        resolveBuffer: GPUBuffer;
        readBuffer: GPUBuffer;
        reading: boolean;
    };

    private constructor(
        readonly device: GPUDevice,
        private readonly canvas: HTMLCanvasElement,
        private readonly context: GPUCanvasContext,
        private readonly format: GPUTextureFormat,
        private readonly sceneLayout: GPUBindGroupLayout,
        private readonly mapLayout: GPUBindGroupLayout,
        private readonly priorityLayout: GPUBindGroupLayout,
        private readonly priorityPipeline: GPUComputePipeline,
        private readonly opaquePipeline: GPURenderPipeline,
        private readonly alphaPipeline: GPURenderPipeline,
        hasTimestamps: boolean,
    ) {
        this.sceneBuffer = device.createBuffer({
            label: "object pass scene uniforms",
            size: SCENE_UNIFORM_FLOATS * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.sampler = device.createSampler({
            addressModeU: "repeat",
            addressModeV: "repeat",
            magFilter: "linear",
            minFilter: "linear",
            mipmapFilter: "linear",
            maxAnisotropy: 16,
        });
        if (hasTimestamps) {
            this.timestamps = {
                querySet: device.createQuerySet({ type: "timestamp", count: 2 }),
                resolveBuffer: device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }),
                readBuffer: device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }),
                reading: false,
            };
        }
    }

    static isSupported(): boolean {
        return typeof navigator !== "undefined" && "gpu" in navigator;
    }

    /**
     * @param alphaMode "premultiplied" lets the canvas sit on top of another one (the harness does this to compare
     * against WebGL2); "opaque" is what a standalone renderer would use.
     */
    static async create(
        canvas: HTMLCanvasElement,
        alphaMode: GPUCanvasAlphaMode = "premultiplied",
        faceDepth: FaceDepthSource = getFaceDepthSource(),
    ): Promise<WebGPUObjectPass> {
        if (!WebGPUObjectPass.isSupported()) {
            throw new Error("WebGPU is not available in this browser");
        }
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter) {
            throw new Error("No WebGPU adapter");
        }
        const hasTimestamps = adapter.features.has("timestamp-query");
        const device = await adapter.requestDevice({
            requiredFeatures: hasTimestamps ? ["timestamp-query"] : [],
        });
        device.addEventListener("uncapturederror", (event) => {
            console.error("[webgpu] uncaptured error", (event as GPUUncapturedErrorEvent).error.message);
        });

        const context = canvas.getContext("webgpu");
        if (!context) {
            throw new Error("Canvas has no webgpu context (it may already have another context type)");
        }
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ device, format, alphaMode });

        const module = device.createShaderModule({ label: "object pass", code: shaderSource });
        const priorityModule = device.createShaderModule({
            label: "object face priority sort",
            code: prioritySortShaderSource,
        });
        const reportCompilation = async (shader: GPUShaderModule, name: string): Promise<void> => {
            const info = await shader.getCompilationInfo();
            for (const message of info.messages) {
                const text = `[${name} ${message.type}] ${message.lineNum}:${message.linePos} ${message.message}`;
                if (message.type === "error") console.error(text);
                else console.warn(text);
            }
            if (info.messages.some((message) => message.type === "error")) {
                throw new Error(`${name} failed to compile`);
            }
        };
        await reportCompilation(module, "object-pass.wgsl");
        await reportCompilation(priorityModule, "face-priority-sort.wgsl");

        const sceneLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d-array" } },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
                { binding: 3, visibility: GPUShaderStage.VERTEX, texture: { sampleType: "sint", viewDimension: "2d" } },
            ],
        });
        const mapLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
                    texture: { sampleType: "sint", viewDimension: "2d-array" },
                },
                { binding: 3, visibility: GPUShaderStage.VERTEX, texture: { sampleType: "uint", viewDimension: "2d-array" } },
            ],
        });
        const priorityLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
            ],
        });
        const layout = device.createPipelineLayout({ bindGroupLayouts: [sceneLayout, mapLayout] });
        const priorityPipeline = device.createComputePipeline({
            label: "object face priority sort",
            layout: device.createPipelineLayout({
                bindGroupLayouts: [sceneLayout, mapLayout, priorityLayout],
            }),
            compute: { module: priorityModule, entryPoint: "sortPriorityGroup" },
        });

        const createPipeline = (fragmentEntry: string): GPURenderPipeline =>
            device.createRenderPipeline({
                label: `object pass ${fragmentEntry}`,
                layout,
                vertex: {
                    module,
                    entryPoint: "vs_main",
                    constants: { FACE_DEPTH_MODE: faceDepth === "bias" ? 1 : 0 },
                    // Four packed uint32 per vertex: three vertex words and the model's slot.
                    buffers: [{ arrayStride: 16, attributes: [{ shaderLocation: 0, offset: 0, format: "uint32x4" }] }],
                },
                fragment: { module, entryPoint: fragmentEntry, targets: [{ format, blend: ALPHA_BLEND }] },
                // Models are double sided in the WebGL2 editor (no face culling is enabled there).
                primitive: { topology: "triangle-list", cullMode: "none" },
                depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: "less-equal" },
            });

        return new WebGPUObjectPass(
            device,
            canvas,
            context,
            format,
            sceneLayout,
            mapLayout,
            priorityLayout,
            priorityPipeline,
            createPipeline("fs_opaque"),
            createPipeline("fs_alpha"),
            hasTimestamps,
        );
    }

    setTextures(textures: ObjectPassTextures): void {
        this.textureArray?.destroy();
        this.materialsTexture?.destroy();

        const { size, layers } = textures;
        const mips = generateLayerMips(textures.pixelsBgra, size, layers);
        const textureArray = this.device.createTexture({
            label: "object textures",
            size: { width: size, height: size, depthOrArrayLayers: layers },
            format: "bgra8unorm",
            mipLevelCount: mipLevelCount(size),
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        mips.forEach((data, level) => {
            const levelSize = Math.max(size >> level, 1);
            this.device.queue.writeTexture(
                { texture: textureArray, mipLevel: level },
                data as Uint8Array<ArrayBuffer>,
                { bytesPerRow: levelSize * 4, rowsPerImage: levelSize },
                { width: levelSize, height: levelSize, depthOrArrayLayers: layers },
            );
        });

        const materialsTexture = this.device.createTexture({
            label: "object texture materials",
            size: { width: layers, height: 1 },
            format: "rgba8sint",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this.device.queue.writeTexture(
            { texture: materialsTexture },
            textures.materials as Int8Array<ArrayBuffer>,
            { bytesPerRow: layers * 4 },
            { width: layers, height: 1 },
        );

        this.textureArray = textureArray;
        this.materialsTexture = materialsTexture;
        this.sceneBindGroup = this.device.createBindGroup({
            layout: this.sceneLayout,
            entries: [
                { binding: 0, resource: { buffer: this.sceneBuffer } },
                { binding: 1, resource: textureArray.createView({ dimension: "2d-array" }) },
                { binding: 2, resource: this.sampler },
                { binding: 3, resource: materialsTexture.createView() },
            ],
        });
    }

    /** Uploads (or replaces) one map square's object mesh and the height / render-flag data its shader samples. */
    setMap(id: number, data: ObjectPassMap): void {
        this.deleteMap(id);
        const { mesh } = data;
        if (mesh.indices.length === 0) {
            return;
        }
        const device = this.device;
        const vertexBuffer = device.createBuffer({
            label: `map ${id} vertices`,
            size: mesh.words.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(vertexBuffer, 0, mesh.words as Uint32Array<ArrayBuffer>);
        const indexBuffer = device.createBuffer({
            label: `map ${id} indices`,
            size: mesh.indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(indexBuffer, 0, mesh.indices as Uint32Array<ArrayBuffer>);

        const priorityData = buildPrioritySortGpuData(mesh);
        const sortedIndexBuffer = device.createBuffer({
            label: `map ${id} priority-sorted indices`,
            size: mesh.indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        // The compute pass only rewrites explicit-priority model ranges. Everything else stays byte-for-byte
        // identical to the reference index stream.
        device.queue.writeBuffer(sortedIndexBuffer, 0, mesh.indices as Uint32Array<ArrayBuffer>);

        const priorityBuffer = device.createBuffer({
            label: `map ${id} face priorities`,
            size: Math.max(priorityData.priorities.byteLength, 4),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        if (priorityData.priorities.byteLength > 0) {
            device.queue.writeBuffer(priorityBuffer, 0, priorityData.priorities as Uint32Array<ArrayBuffer>);
        }
        const priorityGroupBuffer = device.createBuffer({
            label: `map ${id} face priority groups`,
            size: Math.max(priorityData.groups.byteLength, 4),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        if (priorityData.groups.byteLength > 0) {
            device.queue.writeBuffer(priorityGroupBuffer, 0, priorityData.groups as Uint32Array<ArrayBuffer>);
        }
        const priorityScratchBuffer = device.createBuffer({
            label: `map ${id} face priority scratch`,
            // ScratchFace is { triangle: u32, depth: i32 } = 8 bytes.
            size: Math.max(priorityData.scratchFaces * 8, 8),
            usage: GPUBufferUsage.STORAGE,
        });
        const slotBuffer = device.createBuffer({
            label: `map ${id} slots`,
            size: Math.max(mesh.slotInfo.byteLength, 16),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(slotBuffer, 0, mesh.slotInfo as Uint16Array<ArrayBuffer>);

        const sceneSize = 64 + data.borderSize * 2;
        const heights = new Int16Array(data.heightMapData.length);
        for (let i = 0; i < heights.length; i++) {
            heights[i] = data.heightMapData[i] | 0;
        }
        const heightTexture = device.createTexture({
            label: `map ${id} heights`,
            size: { width: sceneSize, height: sceneSize, depthOrArrayLayers: data.levels },
            format: "r16sint",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture(
            { texture: heightTexture },
            heights,
            { bytesPerRow: sceneSize * 2, rowsPerImage: sceneSize },
            { width: sceneSize, height: sceneSize, depthOrArrayLayers: data.levels },
        );
        const flagsTexture = device.createTexture({
            label: `map ${id} render flags`,
            size: { width: sceneSize, height: sceneSize, depthOrArrayLayers: data.levels },
            format: "r8uint",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture(
            { texture: flagsTexture },
            data.tileRenderFlags as Uint8Array<ArrayBuffer>,
            { bytesPerRow: sceneSize, rowsPerImage: sceneSize },
            { width: sceneSize, height: sceneSize, depthOrArrayLayers: data.levels },
        );

        const uniformBuffer = device.createBuffer({
            label: `map ${id} uniforms`,
            size: MAP_UNIFORM_FLOATS * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const bindGroup = device.createBindGroup({
            layout: this.mapLayout,
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: slotBuffer } },
                { binding: 2, resource: heightTexture.createView({ dimension: "2d-array" }) },
                { binding: 3, resource: flagsTexture.createView({ dimension: "2d-array" }) },
            ],
        });
        const priorityBindGroup = device.createBindGroup({
            layout: this.priorityLayout,
            entries: [
                { binding: 0, resource: { buffer: indexBuffer } },
                { binding: 1, resource: { buffer: sortedIndexBuffer } },
                { binding: 2, resource: { buffer: priorityBuffer } },
                { binding: 3, resource: { buffer: priorityGroupBuffer } },
                { binding: 4, resource: { buffer: vertexBuffer } },
                { binding: 5, resource: { buffer: priorityScratchBuffer } },
            ],
        });
        this.maps.set(id, {
            data,
            vertexBuffer,
            indexBuffer,
            sortedIndexBuffer,
            priorityBuffer,
            priorityGroupBuffer,
            priorityScratchBuffer,
            priorityGroupCount: priorityData.groups.length / GPU_PRIORITY_GROUP_WORDS,
            priorityBindGroup,
            slotBuffer,
            heightTexture,
            flagsTexture,
            uniformBuffer,
            uniformData: new Float32Array(new ArrayBuffer(MAP_UNIFORM_FLOATS * 4)),
            bindGroup,
        });
    }

    deleteMap(id: number): void {
        const map = this.maps.get(id);
        if (!map) return;
        map.vertexBuffer.destroy();
        map.indexBuffer.destroy();
        map.sortedIndexBuffer.destroy();
        map.priorityBuffer.destroy();
        map.priorityGroupBuffer.destroy();
        map.priorityScratchBuffer.destroy();
        map.slotBuffer.destroy();
        map.heightTexture.destroy();
        map.flagsTexture.destroy();
        map.uniformBuffer.destroy();
        this.maps.delete(id);
    }

    get mapCount(): number {
        return this.maps.size;
    }

    private ensureDepth(width: number, height: number): GPUTextureView {
        const key = `${width}x${height}`;
        if (!this.depthTexture || this.depthSize !== key) {
            this.depthTexture?.destroy();
            this.depthTexture = this.device.createTexture({
                label: "object pass depth",
                size: { width, height },
                format: DEPTH_FORMAT,
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
            this.depthSize = key;
        }
        return this.depthTexture.createView();
    }

    /** Draws every uploaded map (or only `visibleIds`): all opaque ranges first, then the transparent ones back to front like WebGL2 does. */
    render(frame: ObjectPassFrame, visibleIds?: ReadonlySet<number>): void {
        if (!this.sceneBindGroup) return;
        const start = performance.now();
        const device = this.device;
        const width = Math.max(this.canvas.width, 1);
        const height = Math.max(this.canvas.height, 1);

        const scene = this.sceneData;
        scene.set(frame.viewProj as ArrayLike<number>, 0);
        scene.set(frame.view as ArrayLike<number>, 16);
        scene.set(frame.proj as ArrayLike<number>, 32);
        scene.set(frame.sky, 48);
        scene[52] = frame.cameraX;
        scene[53] = frame.cameraZ;
        scene[54] = frame.renderDistance;
        scene[55] = frame.fogDepth;
        scene[56] = frame.time;
        scene[57] = frame.brightness;
        scene[58] = frame.colorBanding;
        scene[59] = frame.isNewTextureAnim ? 1 : 0;
        device.queue.writeBuffer(this.sceneBuffer, 0, scene);

        for (const [id, map] of this.maps) {
            if (visibleIds && !visibleIds.has(id)) continue;
            const u = map.uniformData;
            u[0] = map.data.mapX;
            u[1] = map.data.mapY;
            u[2] = 0; // timeLoaded
            u[3] = frame.hideRoofs ? 1 : 0;
            u[4] = frame.viewPlaneMax;
            u[5] = frame.hideBelowViewPlane ? 1 : 0;
            u[6] = 1; // planeClipEnabled
            u[7] = frame.showRoofs ? 1 : 0;
            u[8] = frame.bridgeLinkBelow ? 1 : 0;
            device.queue.writeBuffer(map.uniformBuffer, 0, u);
        }

        const encoder = device.createCommandEncoder();

        // Validation stage: execute the priority sorter every frame, but keep the render pass on indexBuffer until
        // the computed stream is compared against the CPU reference and representative WebGL2 captures.
        const priorityPass = encoder.beginComputePass({ label: "object face priority sort" });
        priorityPass.setPipeline(this.priorityPipeline);
        priorityPass.setBindGroup(0, this.sceneBindGroup);
        for (const map of this.maps.values()) {
            if (visibleIds && !visibleIds.has(
                [...this.maps.entries()].find(([, candidate]) => candidate === map)?.[0] ?? -1
            )) {
                continue;
            }
            if (map.priorityGroupCount === 0) continue;
            priorityPass.setBindGroup(1, map.bindGroup);
            priorityPass.setBindGroup(2, map.priorityBindGroup);
            priorityPass.dispatchWorkgroups(map.priorityGroupCount);
        }
        priorityPass.end();

        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.context.getCurrentTexture().createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.ensureDepth(width, height),
                depthClearValue: 1,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
            timestampWrites: this.timestamps
                ? { querySet: this.timestamps.querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 }
                : undefined,
        });

        let drawCalls = 0;
        let indices = 0;
        const maps = [...this.maps.entries()].filter(([id]) => !visibleIds || visibleIds.has(id)).map(([, map]) => map);
        pass.setPipeline(this.opaquePipeline);
        pass.setBindGroup(0, this.sceneBindGroup);
        for (const map of maps) {
            if (map.data.mesh.opaqueCount === 0) continue;
            pass.setBindGroup(1, map.bindGroup);
            pass.setVertexBuffer(0, map.vertexBuffer);
            pass.setIndexBuffer(map.indexBuffer, "uint32");
            pass.drawIndexed(map.data.mesh.opaqueCount, 1, 0, 0, 0);
            drawCalls++;
            indices += map.data.mesh.opaqueCount;
        }
        pass.setPipeline(this.alphaPipeline);
        pass.setBindGroup(0, this.sceneBindGroup);
        for (let i = maps.length - 1; i >= 0; i--) {
            const map = maps[i];
            if (map.data.mesh.alphaCount === 0) continue;
            pass.setBindGroup(1, map.bindGroup);
            pass.setVertexBuffer(0, map.vertexBuffer);
            pass.setIndexBuffer(map.indexBuffer, "uint32");
            pass.drawIndexed(map.data.mesh.alphaCount, 1, map.data.mesh.opaqueCount, 0, 0);
            drawCalls++;
            indices += map.data.mesh.alphaCount;
        }
        pass.end();

        const timestamps = this.timestamps;
        let resolveGpu = false;
        if (timestamps && !timestamps.reading) {
            encoder.resolveQuerySet(timestamps.querySet, 0, 2, timestamps.resolveBuffer, 0);
            encoder.copyBufferToBuffer(timestamps.resolveBuffer, 0, timestamps.readBuffer, 0, 16);
            resolveGpu = true;
        }
        device.queue.submit([encoder.finish()]);

        if (timestamps && resolveGpu) {
            timestamps.reading = true;
            void timestamps.readBuffer
                .mapAsync(GPUMapMode.READ)
                .then(() => {
                    const times = new BigUint64Array(timestamps.readBuffer.getMappedRange().slice(0));
                    timestamps.readBuffer.unmap();
                    this.stats.gpuMs = Number(times[1] - times[0]) / 1e6;
                })
                .catch(() => undefined)
                .finally(() => {
                    timestamps.reading = false;
                });
        }

        this.stats.frames++;
        this.stats.cpuMs = performance.now() - start;
        this.stats.drawCalls = drawCalls;
        this.stats.indices = indices;
    }

    destroy(): void {
        for (const id of [...this.maps.keys()]) this.deleteMap(id);
        this.textureArray?.destroy();
        this.materialsTexture?.destroy();
        this.depthTexture?.destroy();
        this.sceneBuffer.destroy();
        this.context.unconfigure();
        this.device.destroy();
    }
}
