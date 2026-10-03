import PicoGL, {
    DrawCall,
    App as PicoApp,
    Program,
    Texture,
    UniformBuffer,
    VertexArray,
    VertexBuffer,
} from "picogl";

import { DrawRange, newDrawRange } from "../../mapviewer/webgl/DrawRange";
import { LocAnimated } from "../../mapviewer/webgl/loc/LocAnimated";
import { SeqFrameLoader } from "../../rs/model/seq/SeqFrameLoader";
import { SeqTypeLoader } from "../../rs/config/seqtype/SeqTypeLoader";
import type { EditorMapObjectChunkData } from "./loader/EditorMapObjectChunkData";
import { SLOT_INFO_STRIDE, SLOT_VERTEX_STRIDE } from "./loader/object-slot-mesh";
import { OBJECT_CHUNK_COUNT } from "./objectChunk";

interface AnimatedLoc {
    loc: LocAnimated;
    /** [element offset into `animStore`, element count] per frame. */
    frames: [number, number][];
    framesAlpha: [number, number][] | undefined;
    appliedFrame: number;
}

/**
 * All object geometry of one map square, merged from its 64 chunks into one vertex buffer, one index buffer and one
 * model-info texture, drawn with one range per pass (plus one dynamic range for animated locs).
 *
 * GPU memory under ANGLE-Metal grows by several MB per draw call regardless of its size, so the number of draw calls
 * is what has to stay small: ~4 per map square here, against ~3,000 when every placed model had its own range.
 * Chunks stay the unit of rebuilding (an edit re-meshes only its dirty chunks in the worker); this class re-merges
 * their CPU data and re-uploads, lazily, at most once per frame.
 */
export class EditorObjectMesh {
    private readonly chunks: (EditorMapObjectChunkData | undefined)[] = new Array(OBJECT_CHUNK_COUNT);
    private dirty = false;

    private vertexBuffer?: VertexBuffer;
    private indexBuffer?: VertexBuffer;
    private vertexArray?: VertexArray;
    private modelInfoTexture?: Texture;
    drawCall?: DrawCall;
    drawCallAlpha?: DrawCall;

    /** Draw ranges handed to `draw()`; index 1 (when present) is the animated-loc range whose length changes. */
    rangesOpaque: DrawRange[] = [];
    rangesAlpha: DrawRange[] = [];

    private animated: AnimatedLoc[] = [];
    private animStore = new Int32Array(0);
    private animBase = 0;
    private dynOpaqueBase = 0;
    private dynAlphaBase = 0;
    private dynOpaqueCap = 0;
    private dynAlphaCap = 0;
    private dynScratch = new Int32Array(0);

    private roofsHidden = false;

    constructor(
        private readonly app: PicoApp,
        private readonly sceneUniformBuffer: UniformBuffer,
        private readonly textures: Texture,
        private readonly materialsTexture: Texture,
        private readonly objectProgram: Program,
        private readonly objectAlphaProgram: Program,
        private heightMapTexture: Texture,
        private tileRenderFlagsTexture: Texture,
        private readonly mapX: number,
        private readonly mapY: number,
        private readonly seqTypeLoader: SeqTypeLoader,
        private readonly cycle: number,
    ) {}

    /** Stores a chunk's data; call {@link rebuildIfDirty} before drawing. */
    setChunk(data: EditorMapObjectChunkData): void {
        this.chunks[data.chunkId] = data;
        this.dirty = true;
    }

    setHeightMapTexture(texture: Texture): void {
        this.heightMapTexture = texture;
        this.drawCall?.texture("u_heightMap", texture);
        this.drawCallAlpha?.texture("u_heightMap", texture);
    }

    setTileRenderFlagsTexture(texture: Texture): void {
        this.tileRenderFlagsTexture = texture;
        this.drawCall?.texture("u_tileRenderFlags", texture);
        this.drawCallAlpha?.texture("u_tileRenderFlags", texture);
    }

    /** Roof-shaped locs are culled in the vertex shader (their slot record carries a roof flag). */
    setRoofsHidden(hidden: boolean): void {
        this.roofsHidden = hidden;
        const value = hidden ? 1 : 0;
        this.drawCall?.uniform("u_hideRoofs", value);
        this.drawCallAlpha?.uniform("u_hideRoofs", value);
    }

    /** The CPU-side chunk data this mesh was built from (read by the WebGPU harness; not copied). */
    get chunkData(): readonly (EditorMapObjectChunkData | undefined)[] {
        return this.chunks;
    }

    get hasGeometry(): boolean {
        return this.rangesOpaque.length > 0 || this.rangesAlpha.length > 0;
    }

    rebuildIfDirty(): void {
        if (!this.dirty) return;
        this.dirty = false;
        this.releaseGpu();

        let vertexTotal = 0;
        let slotTotal = 0;
        let opaqueTotal = 0;
        let alphaTotal = 0;
        let animTotal = 0;
        for (const chunk of this.chunks) {
            if (!chunk) continue;
            vertexTotal += chunk.vertices.length / SLOT_VERTEX_STRIDE;
            slotTotal += chunk.slotCount;
            opaqueTotal += chunk.staticOpaqueCount;
            alphaTotal += chunk.staticAlphaCount;
            animTotal += chunk.animIndices.length;
        }

        let dynOpaqueCap = 0;
        let dynAlphaCap = 0;
        for (const chunk of this.chunks) {
            for (const loc of chunk?.locsAnimated ?? []) {
                dynOpaqueCap += loc.frames.reduce((max, frame) => Math.max(max, frame[1]), 0);
                dynAlphaCap += (loc.framesAlpha ?? []).reduce((max, frame) => Math.max(max, frame[1]), 0);
            }
        }

        const alphaBase = opaqueTotal;
        const animBase = alphaBase + alphaTotal;
        const dynOpaqueBase = animBase + animTotal;
        const dynAlphaBase = dynOpaqueBase + dynOpaqueCap;
        const indices = new Int32Array(dynAlphaBase + dynAlphaCap);
        const words = new Uint32Array(vertexTotal * 4);
        const slotInfo = new Uint16Array(Math.max(slotTotal, 1) * SLOT_INFO_STRIDE);

        const animated: AnimatedLoc[] = [];
        let vertexBase = 0;
        let slotBase = 0;
        let opaqueCursor = 0;
        let alphaCursor = alphaBase;
        let animCursor = animBase;
        for (const chunk of this.chunks) {
            if (!chunk) continue;
            const vertexCount = chunk.vertices.length / SLOT_VERTEX_STRIDE;
            const source = new Uint32Array(chunk.vertices.buffer, chunk.vertices.byteOffset, vertexCount * 4);
            words.set(source, vertexBase * 4);
            for (let v = 0; v < vertexCount; v++) {
                words[(vertexBase + v) * 4 + 3] += slotBase;
            }

            const staticIndices = chunk.indices;
            for (let k = 0; k < chunk.staticOpaqueCount; k++) {
                indices[opaqueCursor + k] = staticIndices[k] + vertexBase;
            }
            opaqueCursor += chunk.staticOpaqueCount;
            for (let k = 0; k < chunk.staticAlphaCount; k++) {
                indices[alphaCursor + k] = staticIndices[chunk.staticOpaqueCount + k] + vertexBase;
            }
            alphaCursor += chunk.staticAlphaCount;

            for (let k = 0; k < chunk.animIndices.length; k++) {
                indices[animCursor + k] = chunk.animIndices[k] + vertexBase;
            }
            for (const loc of chunk.locsAnimated) {
                const shift = (frames: [number, number][]): [number, number][] =>
                    frames.map(([offset, count]) => [animCursor - animBase + offset, count]);
                const frames = shift(loc.frames);
                const framesAlpha = loc.framesAlpha ? shift(loc.framesAlpha) : undefined;
                const seqType = this.seqTypeLoader.load(loc.seqId);
                const locAnimated = new LocAnimated(
                    -1,
                    -1,
                    -1,
                    -1,
                    -1,
                    -1,
                    -1,
                    -1,
                    { frames: [], framesAlpha: undefined },
                    seqType,
                    this.cycle,
                    loc.randomStart,
                );
                animated.push({ loc: locAnimated, frames, framesAlpha, appliedFrame: 0 });
            }
            animCursor += chunk.animIndices.length;

            slotInfo.set(chunk.slotInfo.subarray(0, chunk.slotCount * SLOT_INFO_STRIDE), slotBase * SLOT_INFO_STRIDE);
            vertexBase += vertexCount;
            slotBase += chunk.slotCount;
        }

        this.animated = animated;
        this.animBase = animBase;
        this.animStore = indices.slice(animBase, animBase + animTotal);
        this.dynOpaqueBase = dynOpaqueBase;
        this.dynAlphaBase = dynAlphaBase;
        this.dynOpaqueCap = dynOpaqueCap;
        this.dynAlphaCap = dynAlphaCap;
        this.dynScratch = new Int32Array(dynOpaqueCap + dynAlphaCap);

        // Initial animation frame geometry goes into the index data before the one-time upload.
        const used = this.composeDynamic();
        indices.set(this.dynScratch.subarray(0, used.opaque), dynOpaqueBase);
        indices.set(this.dynScratch.subarray(dynOpaqueCap, dynOpaqueCap + used.alpha), dynAlphaBase);

        if (indices.length === 0) {
            this.rangesOpaque = [];
            this.rangesAlpha = [];
            return;
        }

        this.vertexBuffer = this.app.createInterleavedBuffer(SLOT_VERTEX_STRIDE, new Uint8Array(words.buffer));
        this.indexBuffer = this.app.createIndexBuffer(PicoGL.UNSIGNED_INT, indices);
        this.vertexArray = this.app
            .createVertexArray()
            .vertexAttributeBuffer(0, this.vertexBuffer, {
                type: PicoGL.UNSIGNED_INT,
                size: 4,
                stride: SLOT_VERTEX_STRIDE,
                integer: true as never,
            })
            .indexBuffer(this.indexBuffer);

        // Two RGBA16UI texels per slot, 16 texels per row.
        const texelCount = Math.max(slotTotal, 1) * 2;
        const rows = Math.max(Math.ceil(texelCount / 16), 1);
        const infoData = new Uint16Array(rows * 16 * 4);
        infoData.set(slotInfo);
        this.modelInfoTexture = this.app.createTexture2D(infoData, 16, rows, {
            internalFormat: PicoGL.RGBA16UI,
            minFilter: PicoGL.NEAREST,
            magFilter: PicoGL.NEAREST,
        });

        const createCall = (program: Program): DrawCall =>
            this.app
                .createDrawCall(program, this.vertexArray!)
                .uniformBlock("SceneUniforms", this.sceneUniformBuffer)
                .uniform("u_mapPos", [this.mapX, this.mapY])
                .uniform("u_timeLoaded", 0)
                .uniform("u_hideRoofs", this.roofsHidden ? 1 : 0)
                .texture("u_textures", this.textures)
                .texture("u_textureMaterials", this.materialsTexture)
                .texture("u_heightMap", this.heightMapTexture)
                .texture("u_tileRenderFlags", this.tileRenderFlagsTexture)
                .texture("u_modelInfoTexture", this.modelInfoTexture!);
        this.drawCall = createCall(this.objectProgram);
        this.drawCallAlpha = createCall(this.objectAlphaProgram);

        this.rangesOpaque = [];
        if (opaqueTotal > 0) this.rangesOpaque.push(newDrawRange(0, opaqueTotal, 1));
        this.rangesAlpha = [];
        if (alphaTotal > 0) this.rangesAlpha.push(newDrawRange(alphaBase * 4, alphaTotal, 1));
        // The dynamic (animated) range is always slot 1 of a pass so its count can be patched in place.
        if (this.animated.length > 0) {
            if (opaqueTotal === 0) this.rangesOpaque.push(newDrawRange(0, 0, 0));
            this.rangesOpaque.push(newDrawRange(dynOpaqueBase * 4, used.opaque, 1));
            if (alphaTotal === 0) this.rangesAlpha.push(newDrawRange(0, 0, 0));
            this.rangesAlpha.push(newDrawRange(dynAlphaBase * 4, used.alpha, 1));
        }
        if (this.rangesOpaque.length > 0) this.drawCall.drawRanges(...this.rangesOpaque);
        if (this.rangesAlpha.length > 0) this.drawCallAlpha.drawRanges(...this.rangesAlpha);
    }

    /** Advances animated locs; re-uploads the dynamic index range only when some loc changed frame. */
    updateAnimation(seqFrameLoader: SeqFrameLoader, clientTick: number): void {
        if (this.animated.length === 0 || !this.indexBuffer) return;
        let changed = false;
        for (const animated of this.animated) {
            animated.loc.update(seqFrameLoader, clientTick);
            const frame = Math.min(animated.loc.frame | 0, animated.frames.length - 1);
            if (frame !== animated.appliedFrame) {
                animated.appliedFrame = frame;
                changed = true;
            }
        }
        if (!changed) return;

        const used = this.composeDynamic();
        if (used.opaque > 0) {
            this.indexBuffer.data(this.dynScratch.subarray(0, used.opaque), this.dynOpaqueBase * 4);
        }
        if (used.alpha > 0) {
            this.indexBuffer.data(
                this.dynScratch.subarray(this.dynOpaqueCap, this.dynOpaqueCap + used.alpha),
                this.dynAlphaBase * 4,
            );
        }
        this.setDynamicCount(this.rangesOpaque, this.drawCall, used.opaque);
        this.setDynamicCount(this.rangesAlpha, this.drawCallAlpha, used.alpha);
    }

    private setDynamicCount(ranges: DrawRange[], drawCall: DrawCall | undefined, count: number): void {
        if (ranges.length < 2 || !drawCall) return;
        ranges[1][1] = count;
        ranges[1][2] = count > 0 ? 1 : 0;
        const internal = drawCall as unknown as { numElements: Int32Array; numInstances: Int32Array };
        internal.numElements[1] = count;
        internal.numInstances[1] = count > 0 ? 1 : 0;
    }

    /** Copies each animated loc's current frame indices into the scratch dynamic ranges; returns the used lengths. */
    private composeDynamic(): { opaque: number; alpha: number } {
        let opaque = 0;
        let alpha = 0;
        for (const animated of this.animated) {
            const frame = Math.min(animated.appliedFrame, animated.frames.length - 1);
            const range = animated.frames[frame];
            if (range && range[1] > 0) {
                this.dynScratch.set(this.animStore.subarray(range[0], range[0] + range[1]), opaque);
                opaque += range[1];
            }
            const rangeAlpha = animated.framesAlpha?.[Math.min(frame, animated.framesAlpha.length - 1)];
            if (rangeAlpha && rangeAlpha[1] > 0) {
                this.dynScratch.set(
                    this.animStore.subarray(rangeAlpha[0], rangeAlpha[0] + rangeAlpha[1]),
                    this.dynOpaqueCap + alpha,
                );
                alpha += rangeAlpha[1];
            }
        }
        return { opaque, alpha };
    }

    private releaseGpu(): void {
        this.vertexBuffer?.delete();
        this.indexBuffer?.delete();
        this.vertexArray?.delete();
        this.modelInfoTexture?.delete();
        this.vertexBuffer = undefined;
        this.indexBuffer = undefined;
        this.vertexArray = undefined;
        this.modelInfoTexture = undefined;
        this.drawCall = undefined;
        this.drawCallAlpha = undefined;
        this.rangesOpaque = [];
        this.rangesAlpha = [];
    }

    delete(): void {
        this.releaseGpu();
        this.chunks.fill(undefined);
        this.animated = [];
        this.animStore = new Int32Array(0);
    }
}
