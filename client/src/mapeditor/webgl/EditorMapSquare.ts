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
import { SeqTypeLoader } from "../../rs/config/seqtype/SeqTypeLoader";
import { Scene, loadTileRenderFlagsTextureData } from "../../rs/scene/Scene";
import { EditorObjectMesh } from "./EditorObjectMesh";
import { applySceneLocData, type SceneLocData } from "./sceneLocData";
import { ObjectPickIndex } from "./sceneLocPicker";
import { getObjectChunkIdsAffectedByEdit } from "./objectChunk";
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
        readonly objectMesh: EditorObjectMesh,
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
        this.objectMesh.setHeightMapTexture(nextObjectHeightMapTexture);
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
        this.objectMesh.setTileRenderFlagsTexture(this.tileRenderFlagsTexture);
    }

    /** Replaces one chunk's geometry; the merged mesh is rebuilt lazily before the next draw. */
    updateObjectChunk(chunkData: EditorMapObjectChunkData): void {
        this.objectMesh.setChunk(chunkData);
    }

    markObjectChunksDirty(localMinX: number, localMinY: number, localMaxX: number, localMaxY: number): void {
        this.objectUpdated = true;
        for (const chunkId of getObjectChunkIdsAffectedByEdit(localMinX, localMinY, localMaxX, localMaxY)) {
            this.dirtyObjectChunks.add(chunkId);
        }
    }

    canRender(frameCount: number): boolean {
        return true;
    }

    delete(): void {
        this.terrainVertexBuffer.delete();
        this.terrainVertexArray.delete();
        this.objectMesh.delete();
        this.objectHeightMapTexture.delete();
        this.heightMapTexture.delete();
        this.tileRenderFlagsTexture.delete();
    }
}

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
    private objectMesh?: EditorObjectMesh;
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
        } else if (this.stage === 1) {
            this.buildObjectMesh();
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
                this.objectMesh!,
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
        this.objectMesh?.delete();
        this.objectMesh = undefined;
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

    private buildObjectMesh(): void {
        const mesh = new EditorObjectMesh(
            this.app,
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
        );
        for (const chunk of this.chunkDataById.values()) mesh.setChunk(chunk);
        mesh.rebuildIfDirty();
        this.objectMesh = mesh;
    }
}
