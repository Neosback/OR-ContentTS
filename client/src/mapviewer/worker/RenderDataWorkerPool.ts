import { Pool, spawn } from "threads";
import type { ModuleThread, QueuedTask } from "threads";

import type { LiveMinimapWorkerResult } from "../../mapeditor/liveMinimapWorkerPayload";
import { getFaceDepthSource, type FaceDepthSource } from "../../rs/model/face-depth-source";
import { transferLiveMinimapWorkerRequest } from "../../mapeditor/liveMinimapWorkerPayload";
import { EditorMapData } from "../../mapeditor/webgl/loader/EditorMapData";
import { EditorMapTerrainData } from "../../mapeditor/webgl/loader/EditorMapTerrainData";
import { EditorMapObjectChunkData } from "../../mapeditor/webgl/loader/EditorMapObjectChunkData";
import type { SceneData } from "../../mapeditor/webgl/loader/EditorMapData";
import type { SceneLocData } from "../../mapeditor/webgl/sceneLocData";
import { LoadedCache } from "../Caches";
import type { NpcSpawn } from "../../world/world-source";
import type { ObjSpawn } from "../../world/world-source";
import { MinimapData } from "./MinimapData";
import { RenderDataLoader } from "./RenderDataLoader";
import { RenderDataWorker } from "./RenderDataWorker";

type RenderDataWorkerThread = ModuleThread<RenderDataWorker>;

type WorkerDescriptor<ThreadType> = {
    init: Promise<ThreadType>;
};

function spawnWorker(): Promise<RenderDataWorkerThread> {
    const worker = new Worker(new URL("./RenderDataWorker.ts", import.meta.url), { type: "module" });
    // A worker that dies while loading (for example a module it cannot import) otherwise fails silently.
    worker.addEventListener("error", (event) => console.error("[render worker error]", event.message, event.filename, event.lineno));
    worker.addEventListener("messageerror", () => console.error("[render worker] message could not be deserialized"));
    return spawn<RenderDataWorker>(worker);
}

export class RenderDataWorkerPool {
    static create(size: number): RenderDataWorkerPool {
        const pool = Pool(() => spawnWorker(), size);
        const workers = (pool as unknown as { workers: WorkerDescriptor<RenderDataWorkerThread>[] }).workers;
        return new RenderDataWorkerPool(pool, workers, size);
    }

    constructor(
        readonly pool: Pool<RenderDataWorkerThread>,
        readonly workers: WorkerDescriptor<RenderDataWorkerThread>[],
        readonly size: number,
    ) {}

    initCache(
        cache: LoadedCache,
        objSpawns: ObjSpawn[],
        npcSpawns: NpcSpawn[],
        faceDepth: FaceDepthSource = getFaceDepthSource(),
    ): Promise<void> {
        return this.runAll((w) => w.initCache(cache, objSpawns, npcSpawns, faceDepth));
    }

    setWasmEnabled(enabled: boolean): Promise<void> {
        return this.runAll((w) => w.setWasmEnabled(enabled));
    }

    async runAll(task: (w: RenderDataWorkerThread) => any): Promise<void> {
        await Promise.all(this.workers.map((desc) => desc.init.then(task)));
    }

    initLoader(loader: RenderDataLoader<any, any>): Promise<void> {
        return this.runAll((w) => w.initDataLoader(loader));
    }

    resetLoader(loader: RenderDataLoader<any, any>): Promise<void> {
        return this.runAll((w) => w.resetDataLoader(loader));
    }

    queueLoad<I, D, Loader extends RenderDataLoader<I, D>>(
        loader: Loader,
        input: I,
    ): QueuedTask<RenderDataWorkerThread, D> {
        return this.pool.queue<D>((w) => w.load(loader, input) as unknown as Promise<D>);
    }

    queueLoadEditorMapData(
        mapX: number,
        mapY: number,
        smoothUnderlays: boolean,
    ): QueuedTask<RenderDataWorkerThread, EditorMapData | undefined> {
        return this.pool.queue((w) => w.loadEditorMapData(mapX, mapY, smoothUnderlays));
    }

    queueLoadEditorMapTerrainData(
        mapX: number,
        mapY: number,
        heightMapTextureData: Float32Array,
        smoothUnderlays: boolean,
    ): QueuedTask<RenderDataWorkerThread, EditorMapTerrainData | undefined> {
        return this.pool.queue((w) =>
            w.loadEditorMapTerrainData(mapX, mapY, heightMapTextureData, smoothUnderlays),
        );
    }

    queueLoadEditorMapObjectData(
        mapX: number,
        mapY: number,
        borderSize: number,
        scene: SceneData,
        sceneLocData: SceneLocData,
        chunkIds: number[],
        smoothUnderlays: boolean,
    ): QueuedTask<RenderDataWorkerThread, EditorMapObjectChunkData[] | undefined> {
        return this.pool.queue((w) =>
            w.loadEditorMapObjectData(
                mapX,
                mapY,
                borderSize,
                scene,
                sceneLocData,
                chunkIds,
                smoothUnderlays,
            ),
        );
    }

    queueLoadTexture(
        id: number,
        size: number,
        flipH: boolean,
        brightness: number,
    ): QueuedTask<RenderDataWorkerThread, Int32Array> {
        return this.pool.queue((w) => w.loadTexture(id, size, flipH, brightness));
    }

    queueMapImage(
        mapX: number,
        mapY: number,
        level: number,
        drawMapFunctions: boolean,
        renderSd: boolean = false,
    ): QueuedTask<RenderDataWorkerThread, MinimapData | undefined> {
        return this.pool.queue((w) => w.loadMapImage(mapX, mapY, level, drawMapFunctions, renderSd));
    }

    queueEditorLiveMinimap(
        payload: ReturnType<typeof transferLiveMinimapWorkerRequest>,
    ): QueuedTask<RenderDataWorkerThread, LiveMinimapWorkerResult> {
        return this.pool.queue((w) => w.renderLiveEditorMinimap(payload));
    }

    setVars(vars: Int32Array): Promise<void> {
        return this.runAll((w) => w.setVars(vars));
    }

    exportSprites(): QueuedTask<RenderDataWorkerThread, Blob> {
        return this.pool.queue((w) => w.exportSpritesToZip());
    }

    exportTextures(): QueuedTask<RenderDataWorkerThread, Blob> {
        return this.pool.queue((w) => w.exportTexturesToZip());
    }

    terminate(): Promise<void> {
        return this.pool.terminate();
    }
}
