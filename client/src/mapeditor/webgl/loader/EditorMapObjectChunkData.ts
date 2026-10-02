import type { SlotMesh } from "./object-slot-mesh";
import type { SceneData } from "./EditorMapData";
import type { SceneLocData } from "../sceneLocData";

/** One chunk's object geometry in slot form (see `object-slot-mesh.ts`). */
export interface EditorMapObjectChunkData extends SlotMesh {
    chunkId: number;
}

export interface EditorMapObjectRebuildInput {
    mapX: number;
    mapY: number;
    borderSize: number;
    scene: SceneData;
    sceneLocData: SceneLocData;
    chunkIds: number[];
}
