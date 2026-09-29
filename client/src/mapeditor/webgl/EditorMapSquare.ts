import PicoGL, {
    DrawCall,
    App as PicoApp,
    Program,
    Texture,
    UniformBuffer,
    VertexArray,
    VertexBuffer,
} from "picogl";

import { MapSquare } from "../../mapviewer/MapManager";
import { DrawRange } from "../../mapviewer/webgl/DrawRange";
import { LocAnimated } from "../../mapviewer/webgl/loc/LocAnimated";
import { SeqTypeLoader } from "../../rs/config/seqtype/SeqTypeLoader";
import { Scene, loadTileRenderFlagsTextureData } from "../../rs/scene/Scene";
import { OBJECT_CHUNK_COUNT } from "./objectChunk";
import { applySceneLocData, type SceneLocData } from "./sceneLocData";
import { ObjectPickIndex } from "./sceneLocPicker";
import { EditorMapData } from "./loader/EditorMapData";
import { EditorMapObjectChunkData } from "./loader/EditorMapObjectChunkData";
import { createTileRenderFlagsTexture } from "../../mapviewer/webgl/TileRenderFlagsTexture";

export function createHeightMapTexture(
    app: PicoApp,
    borderSize: number,
    heightMapTextureData: Float32Array,
): Texture {
    const heightMapSize = Scene.MAP_SQUARE_SIZE + borderSize * 2;
    return app.createTextureArray(
        heightMapTextureData,
        heightMapSize,
        heightMapSize,
        Scene.MAX_LEVELS,
        {
            internalFormat: PicoGL.R32F,
            minFilter: PicoGL.LINEAR,
            magFilter: PicoGL.LINEAR,
            type: PicoGL.FLOAT,
            wrapS: PicoGL.CLAMP_TO_EDGE,
            wrapT: PicoGL.CLAMP_TO_EDGE,
        },
    );
}

function createObjectHeightMapTexture(
    app: PicoApp,
    borderSize: number,
    heightMapTextureData: Float32Array,
): Texture {
    const heightMapSize = Scene.MAP_SQUARE_SIZE + borderSize * 2;
    const intData = new Int16Array(heightMapTextureData.length);
    for (let i = 0; i < heightMapTextureData.length; i++) {
        intData[i] = heightMapTextureData[i] | 0;
    }
    return app.createTextureArray(intData, heightMapSize, heightMapSize, Scene.MAX_LEVELS, {
        internalFormat: PicoGL.R16I,
        minFilter: PicoGL.NEAREST,
        magFilter: PicoGL.NEAREST,
        type: PicoGL.SHORT,
        wrapS: PicoGL.CLAMP_TO_EDGE,
        wrapT: PicoGL.CLAMP_TO_EDGE,
    });
}

export class EditorObjectChunk {
    objectDrawRanges: DrawRange[] = [];
    objectDrawRangesAlpha: DrawRange[] = [];
    locsAnimated: LocAnimated[] = [];
    roofRangeIndices: number[] = [];
    roofRangeIndicesAlpha: number[] = [];
    /** Whether roof ranges currently have their element counts zeroed. */
    roofsHidden = false;

    constructor(
        readonly chunkId: number,
        readonly vertexBuffer: VertexBuffer,
        readonly indexBuffer: VertexBuffer,
        readonly vertexArray: VertexArray,
        readonly modelInfoTexture: Texture,
        readonly modelInfoTextureAlpha: Texture,
        readonly drawCall: DrawCall,
        readonly drawCallAlpha: DrawCall,
    ) {}

    /**
     * Hides or restores roof-shaped locs by zeroing their draw ranges' element counts (multi-draw
     * reads the draw call's arrays; the fallback path skips empty ranges), so no rebuild is needed.
     */
    setRoofsHidden(hidden: boolean): void {
        if (this.roofsHidden === hidden) {
            return;
        }
        this.roofsHidden = hidden;
        const apply = (drawCall: DrawCall, ranges: DrawRange[], indices: number[]) => {
            const numElements = (drawCall as unknown as { numElements?: Int32Array }).numElements;
            for (const index of indices) {
                const range = ranges[index];
                if (!range) {
                    continue;
                }
                const count = hidden ? 0 : range[1];
                if (numElements && index < numElements.length) {
                    numElements[index] = count;
                }
            }
        };
        apply(this.drawCall, this.objectDrawRanges, this.roofRangeIndices);
        apply(this.drawCallAlpha, this.objectDrawRangesAlpha, this.roofRangeIndicesAlpha);
    }

    isRoofRange(index: number, alpha: boolean): boolean {
        return this.roofsHidden && (alpha ? this.roofRangeIndicesAlpha : this.roofRangeIndices).includes(index);
    }

    static create(
        app: PicoApp,
        chunkData: EditorMapObjectChunkData,
        sceneUniformBuffer: UniformBuffer,
        textures: Texture,
        materialsTexture: Texture,
        objectProgram: Program,
        objectAlphaProgram: Program,
        objectHeightMapTexture: Texture,
        tileRenderFlagsTexture: Texture,
        mapX: number,
        mapY: number,
        seqTypeLoader: SeqTypeLoader,
        cycle: number,
    ): EditorObjectChunk {
        const objectVertices = chunkData.objectVertices ?? new Uint8Array(0);
        const objectIndices = chunkData.objectIndices ?? new Int32Array(0);
        const objectModelTextureData = chunkData.objectModelTextureData ?? new Uint16Array(16 * 4);
        const objectModelTextureDataAlpha =
            chunkData.objectModelTextureDataAlpha ?? new Uint16Array(16 * 4);
        const objectDrawRanges = chunkData.objectDrawRanges ?? [];
        const objectDrawRangesAlpha = chunkData.objectDrawRangesAlpha ?? [];

        const vertexBuffer = app.createInterleavedBuffer(12, objectVertices);
        const indexBuffer = app.createIndexBuffer(PicoGL.UNSIGNED_INT, objectIndices);
        const vertexArray = app
            .createVertexArray()
            .vertexAttributeBuffer(0, vertexBuffer, {
                type: PicoGL.UNSIGNED_INT,
                size: 3,
                stride: 12,
                integer: true as any,
            })
            .indexBuffer(indexBuffer);
        const modelInfoTexture = app.createTexture2D(
            objectModelTextureData,
            16,
            Math.max(Math.ceil(objectModelTextureData.length / 16 / 4), 1),
            {
                internalFormat: PicoGL.RGBA16UI,
                minFilter: PicoGL.NEAREST,
                magFilter: PicoGL.NEAREST,
            },
        );
        const modelInfoTextureAlpha = app.createTexture2D(
            objectModelTextureDataAlpha,
            16,
            Math.max(Math.ceil(objectModelTextureDataAlpha.length / 16 / 4), 1),
            {
                internalFormat: PicoGL.RGBA16UI,
                minFilter: PicoGL.NEAREST,
                magFilter: PicoGL.NEAREST,
            },
        );
        const drawCall = app
            .createDrawCall(objectProgram, vertexArray)
            .uniformBlock("SceneUniforms", sceneUniformBuffer)
            .uniform("u_mapPos", [mapX, mapY])
            .uniform("u_timeLoaded", 0)
            .uniform("u_drawIdOffset", 0)
            .texture("u_textures", textures)
            .texture("u_textureMaterials", materialsTexture)
            .texture("u_heightMap", objectHeightMapTexture)
            .texture("u_tileRenderFlags", tileRenderFlagsTexture)
            .texture("u_modelInfoTexture", modelInfoTexture);
        if (objectDrawRanges.length > 0) {
            drawCall.drawRanges(...objectDrawRanges);
        }
        const drawCallAlpha = app
            .createDrawCall(objectAlphaProgram, vertexArray)
            .uniformBlock("SceneUniforms", sceneUniformBuffer)
            .uniform("u_mapPos", [mapX, mapY])
            .uniform("u_timeLoaded", 0)
            .uniform("u_drawIdOffset", 0)
            .texture("u_textures", textures)
            .texture("u_textureMaterials", materialsTexture)
            .texture("u_heightMap", objectHeightMapTexture)
            .texture("u_tileRenderFlags", tileRenderFlagsTexture)
            .texture("u_modelInfoTexture", modelInfoTextureAlpha);
        if (objectDrawRangesAlpha.length > 0) {
            drawCallAlpha.drawRanges(...objectDrawRangesAlpha);
        }

        const locsAnimated = (chunkData.locsAnimated ?? []).map(
            (loc) =>
                new LocAnimated(
                    loc.drawRangeIndex,
                    loc.drawRangeAlphaIndex,
                    loc.drawRangeLodIndex,
                    loc.drawRangeLodAlphaIndex,
                    loc.drawRangeInteractIndex,
                    loc.drawRangeInteractAlphaIndex,
                    loc.drawRangeInteractLodIndex,
                    loc.drawRangeInteractLodAlphaIndex,
                    loc.anim,
                    seqTypeLoader.load(loc.seqId),
                    cycle,
                    loc.randomStart,
                ),
        );

        const chunk = new EditorObjectChunk(
            chunkData.chunkId,
            vertexBuffer,
            indexBuffer,
            vertexArray,
            modelInfoTexture,
            modelInfoTextureAlpha,
            drawCall,
            drawCallAlpha,
        );
        chunk.objectDrawRanges = objectDrawRanges;
        chunk.objectDrawRangesAlpha = objectDrawRangesAlpha;
        chunk.roofRangeIndices = chunkData.roofRangeIndices ?? [];
        chunk.roofRangeIndicesAlpha = chunkData.roofRangeIndicesAlpha ?? [];
        chunk.locsAnimated = locsAnimated;
        return chunk;
    }

    deleteGpuResources(): void {
        this.vertexBuffer.delete();
        this.indexBuffer.delete();
        this.vertexArray.delete();
        this.modelInfoTexture.delete();
        this.modelInfoTextureAlpha.delete();
    }

    delete(): void {
        this.deleteGpuResources();
    }
}

export class EditorMapSquare implements MapSquare {
    heightUpdated: boolean = false;
    /** Lowest scene level touched by a height edit (for mesh rebuild after undo/redo). */
    heightRebuildMinLevel: number | undefined = undefined;
    underlayUpdated: boolean = false;
    overlayUpdated: boolean = false;
    tileRenderFlagsUpdated: boolean = false;
    objectUpdated: boolean = false;
    dirtyObjectChunks: Set<number> = new Set();

    constructor(
        readonly mapX: number,
        readonly mapY: number,
        readonly borderSize: number,
        readonly scene: Scene,
        public sceneLocData: SceneLocData,
        public objectPickIndex: ObjectPickIndex,
        readonly terrainVertexBuffer: VertexBuffer,
        readonly terrainVertexArray: VertexArray,
        readonly terrainDrawCall: DrawCall,
        readonly terrainDrawRanges: DrawRange[],
        readonly objectChunks: EditorObjectChunk[],
        public objectHeightMapTexture: Texture,
        public heightMapTexture: Texture,
        public tileRenderFlagsTexture: Texture,
        public heightMapTextureData: Float32Array,
    ) {}

    /** Builds the whole square in one go. Prefer {@link EditorMapSquareBuilder} on the render thread. */
    static create(
        app: PicoApp,
        mapData: EditorMapData,
        sceneUniformBuffer: UniformBuffer,
        textures: Texture,
        materialsTexture: Texture,
        terrainProgram: Program,
        objectProgram: Program,
        objectAlphaProgram: Program,
        seqTypeLoader: SeqTypeLoader,
        cycle: number,
    ): EditorMapSquare {
        const builder = new EditorMapSquareBuilder(
            app,
            mapData,
            sceneUniformBuffer,
            textures,
            materialsTexture,
            terrainProgram,
            objectProgram,
            objectAlphaProgram,
            seqTypeLoader,
            cycle,
        );
        while (!builder.step()) {
            // Run every stage now.
        }
        return builder.result();
    }

    getHeightMapIndex(x: number, y: number): number {
        const heightMapSize = Scene.MAP_SQUARE_SIZE + this.borderSize * 2;
        return x + heightMapSize * y;
    }

    getHeightMapHeight(x: number, y: number): number {
        return this.heightMapTextureData[this.getHeightMapIndex(x, y)];
    }

    setHeightMapHeight(x: number, y: number, height: number): void {
        this.heightMapTextureData[this.getHeightMapIndex(x, y)] = height;
    }

    updateHeightMapTexture(app: PicoApp): void {
        this.heightMapTexture.delete();

        this.heightMapTexture = createHeightMapTexture(
            app,
            this.borderSize,
            this.heightMapTextureData,
        );
        this.objectHeightMapTexture.delete();
        const nextObjectHeightMapTexture = createObjectHeightMapTexture(
            app,
            this.borderSize,
            this.heightMapTextureData,
        );
        this.terrainDrawCall.texture("u_heightMap", this.heightMapTexture);
        for (const chunk of this.objectChunks) {
            chunk.drawCall.texture("u_heightMap", nextObjectHeightMapTexture);
            chunk.drawCallAlpha.texture("u_heightMap", nextObjectHeightMapTexture);
        }
        this.objectHeightMapTexture = nextObjectHeightMapTexture;
    }

    updateTileRenderFlagsTexture(app: PicoApp): void {
        this.tileRenderFlagsTexture.delete();
        this.tileRenderFlagsTexture = createTileRenderFlagsTexture(
            app,
            this.borderSize,
            loadTileRenderFlagsTextureData(this.scene),
        );
        this.terrainDrawCall.texture("u_tileRenderFlags", this.tileRenderFlagsTexture);
        for (const chunk of this.objectChunks) {
            chunk.drawCall.texture("u_tileRenderFlags", this.tileRenderFlagsTexture);
            chunk.drawCallAlpha.texture("u_tileRenderFlags", this.tileRenderFlagsTexture);
        }
    }

    updateObjectChunk(
        app: PicoApp,
        chunkData: EditorMapObjectChunkData,
        sceneUniformBuffer: UniformBuffer,
        textures: Texture,
        materialsTexture: Texture,
        objectProgram: Program,
        objectAlphaProgram: Program,
        seqTypeLoader: SeqTypeLoader,
        cycle: number,
    ): void {
        const chunkId = chunkData.chunkId;
        this.objectChunks[chunkId]?.delete();
        this.objectChunks[chunkId] = EditorObjectChunk.create(
            app,
            chunkData,
            sceneUniformBuffer,
            textures,
            materialsTexture,
            objectProgram,
            objectAlphaProgram,
            this.objectHeightMapTexture,
            this.tileRenderFlagsTexture,
            this.mapX,
            this.mapY,
            seqTypeLoader,
            cycle,
        );
    }

    markObjectChunksDirty(localMinX: number, localMinY: number, localMaxX: number, localMaxY: number): void {
        this.objectUpdated = true;
        const chunkMinX = Math.max(0, localMinX >> 3);
        const chunkMinY = Math.max(0, localMinY >> 3);
        const chunkMaxX = Math.min(7, localMaxX >> 3);
        const chunkMaxY = Math.min(7, localMaxY >> 3);
        for (let cy = chunkMinY; cy <= chunkMaxY; cy++) {
            for (let cx = chunkMinX; cx <= chunkMaxX; cx++) {
                this.dirtyObjectChunks.add(cy * 8 + cx);
            }
        }
    }

    canRender(frameCount: number): boolean {
        return true;
    }

    delete(): void {
        this.terrainVertexBuffer.delete();
        this.terrainVertexArray.delete();
        for (const chunk of this.objectChunks) {
            chunk.delete();
        }
        this.objectHeightMapTexture.delete();
        this.heightMapTexture.delete();
        this.tileRenderFlagsTexture.delete();
    }
}

const EMPTY_CHUNK_DATA = (chunkId: number): EditorMapObjectChunkData => ({
    chunkId,
    objectVertices: new Uint8Array(0),
    objectIndices: new Int32Array(0),
    objectModelTextureData: new Uint16Array(16 * 4),
    objectModelTextureDataAlpha: new Uint16Array(16 * 4),
    objectDrawRanges: [],
    objectDrawRangesAlpha: [],
    locsAnimated: [],
});

/**
 * Builds an {@link EditorMapSquare} in small stages so its GPU uploads can be
 * spread over several frames: first the scene, terrain buffer and textures,
 * then one object chunk per step, then an optional CPU finalize callback.
 * Uploading a whole square at once blocked the main thread for hundreds of
 * milliseconds per square while the camera moved.
 */
export class EditorMapSquareBuilder {
    private stage = 0;
    private scene?: Scene;
    private objectPickIndex?: ObjectPickIndex;
    private terrainVertexBuffer?: VertexBuffer;
    private terrainVertexArray?: VertexArray;
    private terrainDrawCall?: DrawCall;
    private heightMapTexture?: Texture;
    private objectHeightMapTexture?: Texture;
    private tileRenderFlagsTexture?: Texture;
    private readonly objectChunks: EditorObjectChunk[] = [];
    private readonly chunkDataById = new Map<number, EditorMapObjectChunkData>();
    private square?: EditorMapSquare;

    constructor(
        private readonly app: PicoApp,
        private readonly mapData: EditorMapData,
        private readonly sceneUniformBuffer: UniformBuffer,
        private readonly textures: Texture,
        private readonly materialsTexture: Texture,
        private readonly terrainProgram: Program,
        private readonly objectProgram: Program,
        private readonly objectAlphaProgram: Program,
        private readonly seqTypeLoader: SeqTypeLoader,
        private readonly cycle: number,
        /** CPU work that needs the finished scene (tile meshes); runs as the last stage. */
        private readonly finalize?: (square: EditorMapSquare) => void,
    ) {
        for (const chunk of mapData.objectChunks ?? []) this.chunkDataById.set(chunk.chunkId, chunk);
    }

    get mapX(): number {
        return this.mapData.mapX;
    }

    get mapY(): number {
        return this.mapData.mapY;
    }

    /** Runs the next stage; returns true once the square is complete. */
    step(): boolean {
        if (this.square) return true;
        if (this.stage === 0) {
            this.buildTerrain();
        } else if (this.stage <= OBJECT_CHUNK_COUNT) {
            this.buildChunk(this.stage - 1);
        } else {
            this.square = new EditorMapSquare(
                this.mapData.mapX,
                this.mapData.mapY,
                this.mapData.borderSize,
                this.scene!,
                this.mapData.sceneLocData,
                this.objectPickIndex!,
                this.terrainVertexBuffer!,
                this.terrainVertexArray!,
                this.terrainDrawCall!,
                this.mapData.terrainDrawRanges,
                this.objectChunks,
                this.objectHeightMapTexture!,
                this.heightMapTexture!,
                this.tileRenderFlagsTexture!,
                this.mapData.heightMapTextureData,
            );
            this.finalize?.(this.square);
            return true;
        }
        this.stage++;
        return false;
    }

    result(): EditorMapSquare {
        if (!this.square) throw new Error("EditorMapSquareBuilder.result() before the build finished");
        return this.square;
    }

    /** Frees everything built so far; the builder must not be used afterwards. */
    cancel(): void {
        if (this.square) {
            this.square.delete();
            return;
        }
        this.terrainVertexBuffer?.delete();
        this.terrainVertexArray?.delete();
        this.heightMapTexture?.delete();
        this.objectHeightMapTexture?.delete();
        this.tileRenderFlagsTexture?.delete();
        for (const chunk of this.objectChunks) chunk.delete();
        this.objectChunks.length = 0;
    }

    private buildTerrain(): void {
        const { mapData, app } = this;
        const { mapX, mapY, borderSize } = mapData;

        const scene = new Scene(mapData.scene.levels, mapData.scene.sizeX, mapData.scene.sizeY);
        scene.tileHeights = mapData.scene.tileHeights;
        scene.tileRenderFlags = mapData.scene.tileRenderFlags;
        scene.tileUnderlays = mapData.scene.tileUnderlays;
        scene.tileOverlays = mapData.scene.tileOverlays;
        scene.tileShapes = mapData.scene.tileShapes;
        scene.tileRotations = mapData.scene.tileRotations;
        scene.tileLightOcclusions = mapData.scene.tileLightOcclusions;
        scene.tileLights = mapData.scene.tileLights;
        scene.tileBlendedColors = mapData.scene.tileBlendedColors;
        applySceneLocData(scene, mapData.sceneLocData);
        this.scene = scene;

        const mapId = (mapX << 8) + mapY;
        this.objectPickIndex = ObjectPickIndex.fromSceneLocData(mapX, mapY, mapId, mapData.sceneLocData);

        this.terrainVertexBuffer = app.createInterleavedBuffer(8, mapData.terrainVertices);
        this.terrainVertexArray = app.createVertexArray().vertexAttributeBuffer(0, this.terrainVertexBuffer, {
            type: PicoGL.UNSIGNED_SHORT,
            size: 4,
            stride: 8,
            integer: true as any,
        });

        this.heightMapTexture = createHeightMapTexture(app, borderSize, mapData.heightMapTextureData);
        this.objectHeightMapTexture = createObjectHeightMapTexture(app, borderSize, mapData.heightMapTextureData);
        this.tileRenderFlagsTexture = createTileRenderFlagsTexture(
            app,
            borderSize,
            loadTileRenderFlagsTextureData(scene),
        );

        this.terrainDrawCall = app
            .createDrawCall(this.terrainProgram, this.terrainVertexArray)
            .uniformBlock("SceneUniforms", this.sceneUniformBuffer)
            .uniform("u_mapX", mapX)
            .uniform("u_mapY", mapY)
            .texture("u_textures", this.textures)
            .texture("u_materials", this.materialsTexture)
            .texture("u_heightMap", this.heightMapTexture)
            .texture("u_tileRenderFlags", this.tileRenderFlagsTexture);
    }

    private buildChunk(chunkId: number): void {
        this.objectChunks.push(
            EditorObjectChunk.create(
                this.app,
                this.chunkDataById.get(chunkId) ?? EMPTY_CHUNK_DATA(chunkId),
                this.sceneUniformBuffer,
                this.textures,
                this.materialsTexture,
                this.objectProgram,
                this.objectAlphaProgram,
                this.objectHeightMapTexture!,
                this.tileRenderFlagsTexture!,
                this.mapData.mapX,
                this.mapData.mapY,
                this.seqTypeLoader,
                this.cycle,
            ),
        );
    }
}
