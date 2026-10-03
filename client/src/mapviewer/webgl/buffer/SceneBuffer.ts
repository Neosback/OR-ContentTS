import { vec3 } from "gl-matrix";

import { Model, computeTextureCoords } from "../../../rs/model/Model";
import { Scene } from "../../../rs/scene/Scene";
import { SceneTile } from "../../../rs/scene/SceneTile";
import { TextureLoader } from "../../../rs/texture/TextureLoader";
import { clamp } from "../../../util/MathUtil";
import { DrawRange, newDrawRange } from "../DrawRange";
import { InteractType } from "../InteractType";
import { LocAnimatedData } from "../loc/LocAnimatedData";
import { LocAnimatedGroup } from "../loc/LocAnimatedGroup";
import { SceneLocEntity } from "../loc/SceneLocEntity";
import type { MeshPacker } from "../../../wasm/openrune-core/openrune_core";
import { packModel, packModelOffsets, runSlotJobs, type SlotJobOutput } from "../../../wasm/mesh-packer";
import { VertexBuffer } from "./VertexBuffer";

export enum ContourGroundType {
    CENTER_TILE = 0,
    VERTEX = 1,
    NONE = 2,
    /**
     * Vertices are already in scene space (merged models). The instance position is not added to
     * them; it only says where the model stands, for per-tile plane visibility and picking.
     */
    BAKED = 3,
}

export type ModelInfo = {
    sceneX: number;
    sceneZ: number;
    heightOffset: number;
    level: number;
    contourGround: ContourGroundType;
    priority: number;
    interactType: InteractType;
    interactId: number;
    /** Loc uses a roof shape (12–21); the editor can hide these when roofs are off. */
    roof?: boolean;
};

export type DrawCommand = {
    offset: number;
    elements: number;
    instances: ModelInfo[];
};

export type SceneModel = {
    model: Model;
    sceneHeight: number;
    lowDetail: boolean;
    forceMerge: boolean;
} & ModelInfo;

export type ModelMergeGroup = {
    transparent: boolean;
    lowDetail: boolean;
    level: number;
    priority: number;
    models: SceneModel[];
};

export class SceneBuffer {
    vertexBuf: VertexBuffer;
    indices: number[] = [];

    drawCommands: DrawCommand[] = [];
    drawCommandsAlpha: DrawCommand[] = [];

    drawCommandsLod: DrawCommand[] = [];
    drawCommandsLodAlpha: DrawCommand[] = [];

    drawCommandsInteract: DrawCommand[] = [];
    drawCommandsInteractAlpha: DrawCommand[] = [];

    drawCommandsInteractLod: DrawCommand[] = [];
    drawCommandsInteractLodAlpha: DrawCommand[] = [];

    usedTextureIds = new Set<number>();

    /**
     * When set, model faces are packed by the WebAssembly kernel instead of `addModel`. Only for buffers that hold
     * nothing but models (never terrain tiles): the packer owns the vertices and indices, so `vertexBuf`/`indices`
     * stay empty and consumers read `packedGeometry()` instead.
     */
    private packer?: MeshPacker;

    constructor(
        readonly textureLoader: TextureLoader,
        readonly textureIdIndexMap: Map<number, number>,
        initVertexCount: number,
    ) {
        this.vertexBuf = new VertexBuffer(initVertexCount);
    }

    /** Routes model packing through the wasm kernel; must be called before anything is added. */
    useMeshPacker(packer: MeshPacker): void {
        if (this.vertexBuf.offset !== 0 || this.indices.length !== 0) {
            throw new Error("useMeshPacker must be called on an empty SceneBuffer");
        }
        this.packer = packer;
    }

    vertexCount(): number {
        return this.packer ? this.packer.vertex_count() : this.vertexBuf.offset;
    }

    indexByteOffset(): number {
        return (this.packer ? this.packer.index_count() : this.indices.length) * 4;
    }

    /** The packed vertices (12 bytes each, little endian) and the index list, whichever packer built them. */
    packedGeometry(): { view: DataView; vertexCount: number; indices: ArrayLike<number> } {
        const packer = this.packer;
        if (!packer) {
            return { view: this.vertexBuf.view, vertexCount: this.vertexBuf.offset, indices: this.indices };
        }
        for (const id of packer.used_texture_ids()) this.usedTextureIds.add(id);
        const words = packer.vertices();
        return { view: new DataView(words.buffer, words.byteOffset, words.byteLength), vertexCount: packer.vertex_count(), indices: packer.indices() };
    }


    /**
     * Runs slot-mesh emit jobs in the wasm kernel against the packed geometry, without copying it out first.
     * Undefined when no packer is set: the caller then runs the TypeScript version over `packedGeometry()`.
     */
    emitSlotJobs(jobs: Uint32Array): SlotJobOutput | undefined {
        return this.packer ? runSlotJobs(this.packer, jobs) : undefined;
    }

    /**
     * Adds the faces of `model` for one pass (opaque or translucent), through the wasm kernel when one is set.
     * `faces` is the caller's already-partitioned face list for this pass, used by the TypeScript path to skip
     * recomputing it; the wasm kernel does its own filtering.
     */
    addModelPass(model: Model, transparent: boolean, offset?: vec3, faces?: ModelFace[]): void {
        if (this.packer) {
            packModel(this.packer, model, transparent, offset, true, this.faceDepth);
            return;
        }
        this.addModel(
            model,
            faces ?? getModelFaces(model, this.faceDepth).filter((face) => isModelFaceTransparent(this.textureLoader, face) === transparent),
            offset,
        );
    }

    addTerrainTile(tile: SceneTile, offsetX: number, offsetY: number): void {
        const tileModel = tile.tileModel;
        if (!tileModel) {
            return;
        }
        for (const face of tileModel.faces) {
            for (const vertex of face.vertices) {
                const textureIndex = this.textureIdIndexMap.get(vertex.textureId) ?? -1;

                if (textureIndex !== -1) {
                    this.usedTextureIds.add(vertex.textureId);
                }

                const index = this.vertexBuf.addVertex(
                    vertex.x + offsetX,
                    vertex.y,
                    vertex.z + offsetY,
                    vertex.hsl,
                    0xff,
                    vertex.u,
                    vertex.v,
                    textureIndex,
                    0,
                );

                this.indices.push(index);
            }
        }
    }

    addTerrain(scene: Scene, borderSize: number, maxLevel: number): number {
        const startX = borderSize;
        const startY = borderSize;
        const endX = borderSize + Scene.MAP_SQUARE_SIZE;
        const endY = borderSize + Scene.MAP_SQUARE_SIZE;

        const vertexOffset = borderSize * -128;

        const terrainStartVertexCount = this.vertexCount();
        for (let level = 0; level < scene.levels; level++) {
            const indexOffset = this.indexByteOffset();
            for (let x = startX; x < endX; x++) {
                for (let y = startY; y < endY; y++) {
                    const tile = scene.tiles[level][x][y];
                    if (!tile || tile.minLevel > maxLevel) {
                        continue;
                    }
                    this.addTerrainTile(tile, vertexOffset, vertexOffset);
                }
            }

            const levelVertexCount = (this.indexByteOffset() - indexOffset) / 4;

            if (levelVertexCount > 0) {
                const command: DrawCommand = {
                    offset: indexOffset,
                    elements: levelVertexCount,
                    instances: [
                        {
                            sceneX: 0,
                            sceneZ: 0,
                            heightOffset: 0,
                            level,
                            contourGround: ContourGroundType.NONE,
                            priority: 0,
                            interactType: InteractType.NONE,
                            interactId: 0xffff,
                        },
                    ],
                };

                this.drawCommands.push(command);
                this.drawCommandsLod.push(command);
                this.drawCommandsInteract.push(command);
                this.drawCommandsInteractLod.push(command);
            }
        }

        return this.vertexCount() - terrainStartVertexCount;
    }

    addModelAnimFrame(model: Model, transparent: boolean): DrawRange {
        const offset = this.indexByteOffset();
        this.addModelPass(model, transparent);
        const elements = (this.indexByteOffset() - offset) / 4;

        return newDrawRange(offset, elements, 1);
    }

    addLocAnimatedGroups(groups: Iterable<LocAnimatedGroup>): LocAnimatedData[] {
        const locsAnimated: LocAnimatedData[] = [];

        for (const group of groups) {
            for (const loc of group.locs) {
                locsAnimated.push(this.addLocAnimated(group, loc));
            }
        }

        return locsAnimated;
    }

    addLocAnimated(group: LocAnimatedGroup, loc: SceneLocEntity): LocAnimatedData {
        const anim = group.anim;

        // Normal (merged)
        const drawRangeIndex = this.drawCommands.length;
        this.drawCommands.push({
            offset: 0,
            elements: 0,
            instances: [loc],
        });
        const drawRangeAlphaIndex = this.drawCommandsAlpha.length;
        if (anim.framesAlpha) {
            this.drawCommandsAlpha.push({
                offset: 0,
                elements: 0,
                instances: [loc],
            });
        }
        // Lod (merged)
        let drawRangeLodIndex = -1;
        let drawRangeLodAlphaIndex = -1;
        if (!loc.lowDetail) {
            drawRangeLodIndex = this.drawCommandsLod.length;
            this.drawCommandsLod.push({
                offset: 0,
                elements: 0,
                instances: [loc],
            });
            if (anim.framesAlpha) {
                drawRangeLodAlphaIndex = this.drawCommandsLodAlpha.length;
                this.drawCommandsLodAlpha.push({
                    offset: 0,
                    elements: 0,
                    instances: [loc],
                });
            }
        }

        // Interact (non merged)
        const drawRangeInteractIndex = this.drawCommandsInteract.length;
        this.drawCommandsInteract.push({
            offset: 0,
            elements: 0,
            instances: [loc],
        });
        const drawRangeInteractAlphaIndex = this.drawCommandsInteractAlpha.length;
        if (anim.framesAlpha) {
            this.drawCommandsInteractAlpha.push({
                offset: 0,
                elements: 0,
                instances: [loc],
            });
        }

        // Interact Lod (non merged)
        let drawRangeInteractLodIndex = -1;
        let drawRangeInteractLodAlphaIndex = -1;
        if (!loc.lowDetail) {
            drawRangeInteractLodIndex = this.drawCommandsInteractLod.length;
            this.drawCommandsInteractLod.push({
                offset: 0,
                elements: 0,
                instances: [loc],
            });
            if (anim.framesAlpha) {
                drawRangeInteractLodAlphaIndex = this.drawCommandsInteractLodAlpha.length;
                this.drawCommandsInteractLodAlpha.push({
                    offset: 0,
                    elements: 0,
                    instances: [loc],
                });
            }
        }
        return {
            drawRangeIndex,
            drawRangeAlphaIndex,

            drawRangeLodIndex,
            drawRangeLodAlphaIndex,

            drawRangeInteractIndex,
            drawRangeInteractAlphaIndex,

            drawRangeInteractLodIndex,
            drawRangeInteractLodAlphaIndex,

            anim,
            seqId: loc.entity.seqId,
            randomStart: loc.entity.seqRandomStart,
        };
    }

    addModelGroup(group: ModelMergeGroup): void {
        const groupOffset = this.indexByteOffset();

        const addInteractionCommand = (
            sceneModel: SceneModel,
            offset: number,
            elements: number,
        ): void => {
            const drawCommand: DrawCommand = {
                offset,
                elements,
                instances: [
                    {
                        sceneX: Math.max(0, sceneModel.sceneX),
                        sceneZ: Math.max(0, sceneModel.sceneZ),
                        heightOffset: 0,
                        level: group.level,
                        contourGround: ContourGroundType.BAKED,
                        priority: group.priority,
                        interactType: sceneModel.interactType,
                        interactId: sceneModel.interactId,
                        roof: sceneModel.roof,
                    },
                ],
            };
            if (group.transparent) {
                this.drawCommandsInteractAlpha.push(drawCommand);
                if (!group.lowDetail) {
                    this.drawCommandsInteractLodAlpha.push(drawCommand);
                }
            } else {
                this.drawCommandsInteract.push(drawCommand);
                if (!group.lowDetail) {
                    this.drawCommandsInteractLod.push(drawCommand);
                }
            }
        };

        let modelIndex = 0;
        while (modelIndex < group.models.length) {
            const sceneModel = group.models[modelIndex]!;
            const model = sceneModel.model;

            // Cached loc models are commonly reused for many placements. Keep consecutive
            // placements of the same Model in one WASM call so its arrays cross the
            // JS/WASM boundary once instead of once per placement.
            if (this.packer) {
                let runEnd = modelIndex + 1;
                while (
                    runEnd < group.models.length &&
                    group.models[runEnd]!.model === model
                ) {
                    runEnd++;
                }

                const runLength = runEnd - modelIndex;
                // Micro-benchmarks show batching is reliably useful for small cached models,
                // while larger models need enough repeated placements to amortize the
                // larger returned counts array and one bigger wasm call. Stay conservative
                // rather than regressing the common 2-4 placement case for heavy models.
                const shouldBatchPlacements =
                    runLength > 1 && (model.faceCount <= 64 || runLength >= 16);
                if (shouldBatchPlacements) {
                    const offsets = new Int32Array(runLength * 3);
                    for (let i = 0; i < runLength; i++) {
                        const item = group.models[modelIndex + i]!;
                        const base = i * 3;
                        offsets[base] = item.sceneX;
                        offsets[base + 1] =
                            item.heightOffset !== 0 ? -item.heightOffset : item.sceneHeight;
                        offsets[base + 2] = item.sceneZ;
                    }

                    const firstOffset = this.indexByteOffset();
                    const counts = packModelOffsets(
                        this.packer,
                        model,
                        group.transparent,
                        offsets,
                        true,
                        this.faceDepth,
                    );
                    let offset = firstOffset;
                    for (let i = 0; i < runLength; i++) {
                        const elements = counts[i]!;
                        addInteractionCommand(group.models[modelIndex + i]!, offset, elements);
                        offset += elements * 4;
                    }
                    modelIndex = runEnd;
                    continue;
                }
            }

            const vertexOffset: vec3 = [
                sceneModel.sceneX,
                sceneModel.sceneHeight,
                sceneModel.sceneZ,
            ];
            if (sceneModel.heightOffset !== 0) {
                vertexOffset[1] = -sceneModel.heightOffset;
            }
            const offset = this.indexByteOffset();
            this.addModelPass(model, group.transparent, vertexOffset);
            const elements = (this.indexByteOffset() - offset) / 4;
            addInteractionCommand(sceneModel, offset, elements);
            modelIndex++;
        }

        const groupElements = (this.indexByteOffset() - groupOffset) / 4;

        if (groupElements > 0) {
            const drawCommand: DrawCommand = {
                offset: groupOffset,
                elements: groupElements,
                instances: [
                    {
                        sceneX: 0,
                        sceneZ: 0,
                        heightOffset: 0,
                        level: group.level,
                        contourGround: ContourGroundType.NONE,
                        priority: group.priority,
                        interactType: InteractType.NONE,
                        interactId: 0xffff,
                    },
                ],
            };

            if (group.transparent) {
                this.drawCommandsAlpha.push(drawCommand);
                if (!group.lowDetail) {
                    this.drawCommandsLodAlpha.push(drawCommand);
                }
            } else {
                this.drawCommands.push(drawCommand);
                if (!group.lowDetail) {
                    this.drawCommandsLod.push(drawCommand);
                }
            }
        }
    }

    addModel(model: Model, faces: ModelFace[], offset?: vec3, reuseVertices: boolean = true): void {
        if (this.packer) {
            // The packer owns the vertices; writing to the TS buffers would silently drop this model.
            throw new Error("SceneBuffer.addModel is TypeScript-only: use addModelPass when a mesh packer is set");
        }
        if (faces.length === 0) {
            return;
        }

        const verticesX = model.verticesX;
        let verticesY = model.verticesY;
        const verticesZ = model.verticesZ;

        let sceneX = 0;
        let sceneZ = 0;
        let sceneHeight = 0;
        if (offset) {
            sceneX = offset[0];
            sceneHeight = offset[1];
            sceneZ = offset[2];
            if (model.contourVerticesY) {
                verticesY = model.contourVerticesY;
            }
        }

        const facesA = model.indices1;
        const facesB = model.indices2;
        const facesC = model.indices3;

        // const modelTexCoords = computeTextureCoords(model);
        const modelTexCoords = model.uvs;

        if (model.faceTextures && !modelTexCoords) {
            throw new Error("Model has face textures but no texture coordinates");
        }

        for (const face of faces) {
            const index = face.index;
            const alpha = face.alpha;
            const priority = face.priority;
            const textureId = face.textureId;
            const textureIndex = this.textureIdIndexMap.get(textureId) ?? -1;

            let hslA = model.faceColors1[index];
            let hslB = model.faceColors2[index];
            let hslC = model.faceColors3[index];

            if (hslC === -1) {
                hslC = hslB = hslA;
            }

            let u0: number = 0;
            let v0: number = 0;
            let u1: number = 0;
            let v1: number = 0;
            let u2: number = 0;
            let v2: number = 0;

            if (modelTexCoords) {
                const texCoordIdx = index * 6;
                u0 = modelTexCoords[texCoordIdx];
                v0 = modelTexCoords[texCoordIdx + 1];
                u1 = modelTexCoords[texCoordIdx + 2];
                v1 = modelTexCoords[texCoordIdx + 3];
                u2 = modelTexCoords[texCoordIdx + 4];
                v2 = modelTexCoords[texCoordIdx + 5];

                // emulate wrapS: PicoGL.CLAMP_TO_EDGE
                // u0 = clamp(u0, 0.00390625 * 3, 1 - 0.00390625 * 3);
                // u1 = clamp(u1, 0.00390625 * 3, 1 - 0.00390625 * 3);
                // u2 = clamp(u2, 0.00390625 * 3, 1 - 0.00390625 * 3);
            }

            const fa = facesA[index];
            const fb = facesB[index];
            const fc = facesC[index];

            const vxa = sceneX + verticesX[fa];
            const vxb = sceneX + verticesX[fb];
            const vxc = sceneX + verticesX[fc];

            const vya = sceneHeight + verticesY[fa];
            const vyb = sceneHeight + verticesY[fb];
            const vyc = sceneHeight + verticesY[fc];

            const vza = sceneZ + verticesZ[fa];
            const vzb = sceneZ + verticesZ[fb];
            const vzc = sceneZ + verticesZ[fc];

            if (textureIndex !== -1) {
                this.usedTextureIds.add(textureId);
            }

            const index0 = this.vertexBuf.addVertex(
                vxa,
                vya,
                vza,
                hslA,
                alpha,
                u0,
                v0,
                textureIndex,
                priority + 1,
                reuseVertices,
            );
            const index1 = this.vertexBuf.addVertex(
                vxb,
                vyb,
                vzb,
                hslB,
                alpha,
                u1,
                v1,
                textureIndex,
                priority + 1,
                reuseVertices,
            );
            const index2 = this.vertexBuf.addVertex(
                vxc,
                vyc,
                vzc,
                hslC,
                alpha,
                u2,
                v2,
                textureIndex,
                priority + 1,
                reuseVertices,
            );

            this.indices.push(index0, index1, index2);
        }
    }
}

export type ModelFace = {
    index: number;
    alpha: number;
    priority: number;
    textureId: number;
};

export function isModelFaceTransparent(textureLoader: TextureLoader, face: ModelFace): boolean {
    return (
        face.alpha < 0xff || (face.textureId !== -1 && textureLoader.isTransparent(face.textureId))
    );
}

export function getModelFaces(model: Model, depthSource?: FaceDepthSource): ModelFace[] {
    const faces: ModelFace[] = [];

    const faceTransparencies = model.faceAlphas;

    const priorities = faceDepthValues(model, depthSource);

    for (let index = 0; index < model.faceCount; index++) {
        let hslC = model.faceColors3[index];

        if (hslC === -2) {
            continue;
        }

        let textureId = -1;
        if (model.faceTextures) {
            textureId = model.faceTextures[index];
        }

        let alpha = 0xff;
        if (faceTransparencies && textureId === -1) {
            alpha = 0xff - (faceTransparencies[index] & 0xff);
        }
        // if (faceTransparencies) {
        //     alpha = 0xff - (faceTransparencies[index] & 0xff);
        // }

        if (alpha === 0 || alpha === 0x1) {
            continue;
        }

        let priority = 0;
        if (priorities) {
            priority = priorities[index];
        }

        faces.push({
            index,
            alpha,
            priority,
            textureId,
        });
    }

    return faces;
}

export function createModelInfoTextureData(drawCommands: DrawCommand[]): Uint16Array {
    const instances: ModelInfo[] = [];
    for (const cmd of drawCommands) {
        instances.push(...cmd.instances);
    }
    const instanceCount = instances.length;

    const dataLength = Math.ceil((drawCommands.length * 4 + instanceCount) / 16) * 16;
    const textureData = new Uint16Array(Math.max(dataLength, 16) * 4);
    let dataOffset = 0;
    drawCommands.forEach((cmd, index) => {
        textureData[index * 4] = drawCommands.length + dataOffset;

        dataOffset += cmd.instances.length;
    });

    instances.forEach((data, index) => {
        let offset = drawCommands.length * 4 + index * 4;

        const contourGround = data.contourGround;

        const height = data.heightOffset;

        textureData[offset++] = data.sceneX | (data.level << 14);
        textureData[offset++] = data.sceneZ | (contourGround << 14);
        textureData[offset++] =
            (data.priority & 0x7) |
            ((data.interactId >> 16) << 3) |
            (data.interactType << 4) |
            (Math.round(height / 8) << 6);
        textureData[offset++] = data.interactId;
    });

    return textureData;
}
